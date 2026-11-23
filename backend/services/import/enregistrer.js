// Enregistrement en base d'un classeur analysé (registres.analyserClasseur), dans une transaction ouverte.
// Partagé par l'import depuis l'interface et par le script de rechargement complet des fiches.
//
// Règles pour les fiches, créneau par créneau (résident, année, période) :
// - stage déjà présent à l'identique : rien ne change ;
// - stage différent sur un créneau déjà occupé : la fiche est corrigée depuis le fichier, sauf si elle a été
//   retouchée sur la plateforme (modifie_le renseigné) ; elle est alors gardée et signalée en conflit ;
// - stage nouveau : une fiche est créée ;
// - fiche en base absente du fichier : gardée, et signalée.

function cle(valeur) {
    return String(valeur ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'")
        .replace(/\s+/g, ' ').trim().toUpperCase();
}

const memeStage = (a, b) => cle(a.service) === cle(b.service) && cle(a.hopital) === cle(b.hopital);
const LIMITE_LISTES = 50;

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ residents: Array, emails: Array }} analyse
 * @param {{ specialite: { libelle: string }, importId: number }} options
 */
async function enregistrerAnalyse(connection, { residents: duFichier, emails }, { specialite, importId }) {
    const cins = [...new Set([...duFichier.map((r) => r.cin), ...emails.map((e) => e.cin)])];
    const existants = new Map();
    if (cins.length > 0) {
        const [rows] = await connection.query('SELECT id, cin, email FROM residents WHERE cin IN (?) FOR UPDATE', [cins]);
        for (const r of rows) existants.set(String(r.cin).toUpperCase(), r);
    }

    // Un résident absent de la base n'est pas recréé s'il a été supprimé à la main sur la plateforme
    // (mobilité totale hors Sfax, démission…), ni s'il n'a aucun stage dans le fichier.
    const absents = duFichier.filter((r) => !existants.has(r.cin)).map((r) => r.cin);
    const supprimes = new Set();
    if (absents.length > 0) {
        const [rows] = await connection.query(
            `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(avant, '$.cin')) AS cin FROM journal_actions
             WHERE action = 'suppression' AND entite = 'resident' AND JSON_UNQUOTE(JSON_EXTRACT(avant, '$.cin')) IN (?)`,
            [absents]
        );
        for (const r of rows) supprimes.add(String(r.cin).toUpperCase());
    }
    const residentsIgnores = { supprimes: 0, sansStage: 0 };
    const residents = duFichier.filter((r) => {
        if (existants.has(r.cin)) return true;
        if (supprimes.has(r.cin)) { residentsIgnores.supprimes++; return false; }
        if (r.stages.length === 0) { residentsIgnores.sansStage++; return false; }
        return true;
    });

    const nouveaux = residents.filter((r) => !existants.has(r.cin));
    let residentIdsCrees = [];
    if (nouveaux.length > 0) {
        await connection.query(
            'INSERT INTO residents (cin, nom_prenom, email, specialite, faculte_origine, promotion, niveau) VALUES ?',
            [nouveaux.map((r) => [
                r.cin, r.nomPrenom, r.email, specialite.libelle, r.faculte,
                r.niveau ? r.annee - r.niveau + 1 : null, r.niveau
            ])]
        );
        const [crees] = await connection.query('SELECT id, cin FROM residents WHERE cin IN (?)', [nouveaux.map((r) => r.cin)]);
        for (const r of crees) existants.set(String(r.cin).toUpperCase(), { id: r.id, email: null, cree: true });
        residentIdsCrees = crees.map((r) => r.id);
    }

    // Registres : un e-mail n'est ajouté qu'aux résidents qui n'en ont pas.
    // Liste d'e-mails : choix explicite de l'administration, l'adresse est remplacée.
    let emailsAjoutes = 0;
    for (const r of residents) {
        const existant = existants.get(r.cin);
        if (existant && !existant.cree && !existant.email && r.email) {
            await connection.query('UPDATE residents SET email = ? WHERE id = ? AND email IS NULL', [r.email, existant.id]);
            existant.email = r.email;
            emailsAjoutes++;
        }
    }
    let emailsInconnus = 0;
    for (const e of emails) {
        const existant = existants.get(e.cin);
        if (!existant) { emailsInconnus++; continue; }
        if (existant.email !== e.email) {
            await connection.query('UPDATE residents SET email = ? WHERE id = ?', [e.email, existant.id]);
            existant.email = e.email;
            emailsAjoutes++;
        }
    }

    // ----- Fiches -----
    const residentIdsVus = [...new Set(residents.map((r) => existants.get(r.cin).id))];
    const enBase = new Map();
    if (residentIdsVus.length > 0) {
        const [rows] = await connection.query(
            'SELECT id, resident_id, periode, annee, service, hopital, modifie_le FROM formulaires_stage WHERE resident_id IN (?) FOR UPDATE',
            [residentIdsVus]
        );
        for (const f of rows) {
            const creneau = `${f.resident_id}|${f.annee}|${f.periode}`;
            if (!enBase.has(creneau)) enBase.set(creneau, []);
            enBase.get(creneau).push(f);
        }
    }

    const aCreer = [];
    const corrections = [];
    const conflits = [];
    let fichesConservees = 0;
    const vues = new Set();
    for (const r of residents) {
        const id = existants.get(r.cin).id;
        const parCreneau = new Map();
        for (const s of r.stages) {
            const creneau = `${id}|${s.annee}|${s.periode}`;
            if (!parCreneau.has(creneau)) parCreneau.set(creneau, []);
            parCreneau.get(creneau).push(s);
        }
        for (const [creneau, stages] of parCreneau) {
            const fiches = enBase.get(creneau) || [];
            const restantes = fiches.filter((f) => {
                const identique = stages.findIndex((s) => !s.place && memeStage(s, f));
                if (identique < 0) return true;
                stages[identique].place = true;
                vues.add(f.id);
                return false;
            });
            for (const s of stages.filter((x) => !x.place)) {
                const fiche = restantes.shift();
                if (!fiche) {
                    aCreer.push([id, s.periode, s.annee, s.service, s.hopital, importId]);
                    continue;
                }
                vues.add(fiche.id);
                if (fiche.modifie_le) {
                    fichesConservees++;
                    if (conflits.length < LIMITE_LISTES) {
                        conflits.push({ cin: r.cin, nomPrenom: r.nomPrenom, periode: s.periode, annee: s.annee,
                            fichier: { service: s.service, hopital: s.hopital },
                            base: { service: fiche.service, hopital: fiche.hopital } });
                    }
                    continue;
                }
                // modifie_le = modifie_le : la correction venue du fichier ne compte pas comme une retouche manuelle.
                await connection.query(
                    'UPDATE formulaires_stage SET service = ?, hopital = ?, modifie_le = modifie_le WHERE id = ?',
                    [s.service, s.hopital, fiche.id]
                );
                corrections.push({ id: fiche.id, service: fiche.service, hopital: fiche.hopital });
            }
        }
    }

    let fichesCreees = 0;
    if (aCreer.length > 0) {
        const [resultat] = await connection.query(
            'INSERT IGNORE INTO formulaires_stage (resident_id, periode, annee, service, hopital, import_id) VALUES ?',
            [aCreer]
        );
        fichesCreees = resultat.affectedRows;
    }

    // Fiches en base des résidents du fichier qui n'y figurent pas (stage ajouté à la main, ancien découpage…)
    const horsFichier = [...enBase.values()].flat().filter((f) => !vues.has(f.id));

    const niveaux = [...new Set(residents.map((r) => r.niveau).filter(Boolean))].sort();
    return {
        residentIdsCrees,
        residentIdsVus,
        niveaux,
        corrections,
        resume: {
            residentsCrees: residentIdsCrees.length,
            residentsExistants: residents.length - nouveaux.length,
            fichesCreees,
            fichesExistantes: aCreer.length - fichesCreees + vues.size - corrections.length - fichesConservees,
            fichesCorrigees: corrections.length,
            fichesConservees,
            fichesHorsFichier: horsFichier.length,
            emailsAjoutes,
            emailsInconnus,
            residentsSupprimesIgnores: residentsIgnores.supprimes,
            residentsSansStageIgnores: residentsIgnores.sansStage
        },
        conflits
    };
}

module.exports = { enregistrerAnalyse };
