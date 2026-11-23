// Rechargement complet des fiches de stage depuis le registre complet du résidanat.
//
//   node scripts/recharger-fiches.js <registre.xlsx>              simulation : rien n'est écrit
//   node scripts/recharger-fiches.js <registre.xlsx> --appliquer  vide les fiches et les recrée
//
// Base visée : celle du fichier .env (DB_HOST, DB_NAME…). Vérifier la cible avant d'appliquer.
//
// Ce qui est conservé : les résidents (e-mails, accès), y compris ceux absents du registre,
// et les rattrapages (R1, R2), que le registre ne contient pas.
// Un résident du registre dont l'identifiant a changé (même nom, ancien identifiant absent du registre)
// garde son dossier : son identifiant est mis à jour.
// Les téléchargements, e-mails « nouvelle fiche » et signalements sont rattachés à la nouvelle fiche
// de même période (même service si possible) ; sans correspondance, ils sont perdus et listés.
// Les corrections manuelles des fiches sont remplacées par le registre : elles sont listées avant.
require('dotenv').config({ quiet: true, path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const db = require('../config/db');
const { SPECIALITES, SPECIALITE_PAR_DEFAUT } = require('../config/specialites');
const { lireClasseur } = require('../services/import/excel');
const { analyserClasseur } = require('../services/import/registres');
const { enregistrerAnalyse } = require('../services/import/enregistrer');
const { journaliser } = require('../utils/journal');

const RATTRAPAGES = ['R1', 'R2'];
const cleNom =(v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
const cleTexte = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

// Période plus courte contenue dans une ancienne période (ancienne fiche T4 « Dermato / ORL » → T4A, T4B)
const CONTENUES = {
    S1: ['T1', 'T2', 'T1A', 'T1B', 'T2A', 'T2B'], S2: ['T3', 'T4', 'T3A', 'T3B', 'T4A', 'T4B'],
    T1: ['T1A', 'T1B'], T2: ['T2A', 'T2B'], T3: ['T3A', 'T3B'], T4: ['T4A', 'T4B'],
    R1: ['S1'], R2: ['S2']
};

// Nouvelle fiche qui reprend l'historique d'une ancienne : même période et même stage,
// sinon même période, sinon une période contenue dans l'ancienne.
function correspondance(ancienne, nouvelles) {
    const memeCreneau = nouvelles.filter((n) => n.annee === ancienne.annee && n.periode === ancienne.periode);
    const memeStage = (n) => cleTexte(n.service) === cleTexte(ancienne.service) && cleTexte(n.hopital) === cleTexte(ancienne.hopital);
    return memeCreneau.find(memeStage)
        || memeCreneau[0]
        || nouvelles.find((n) => n.annee === ancienne.annee && (CONTENUES[ancienne.periode] || []).includes(n.periode))
        || null;
}

async function main() {
    const [fichier, option] = process.argv.slice(2);
    if (!fichier) throw new Error('Usage : node scripts/recharger-fiches.js <registre.xlsx> [--appliquer]');
    const appliquer = option === '--appliquer';
    const specialite = SPECIALITES[SPECIALITE_PAR_DEFAUT];

    console.log(`Base : ${process.env.DB_NAME || 'gestion_stages'} sur ${process.env.DB_HOST || 'localhost'}`);
    const analyse = analyserClasseur(await lireClasseur(fichier), path.basename(fichier), SPECIALITE_PAR_DEFAUT);
    if (!analyse.rapport.some((f) => f.format === 'registre complet')) {
        throw new Error("Ce fichier n'est pas un registre complet du résidanat (une feuille par promotion, une colonne par trimestre).");
    }
    const fichesFichier = analyse.residents.reduce((n, r) => n + r.stages.length, 0);
    console.log(`Registre : ${analyse.residents.length} résidents, ${fichesFichier} stages.`);
    for (const f of analyse.rapport) console.log(`  - ${f.feuille} : ${f.retenues} résidents, ${f.fiches ?? '?'} stages (${f.source || f.format})`);
    if (analyse.bilan.anomalies.length) console.log('Anomalies :\n  ' + analyse.bilan.anomalies.join('\n  '));

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // ----- État actuel -----
        const [residents] = await connection.query('SELECT id, cin, nom_prenom FROM residents FOR UPDATE');
        const [anciennes] = await connection.query(
            `SELECT f.id, f.resident_id, f.periode, f.annee, f.service, f.hopital, f.url_pdf, f.modifie_le, r.cin, r.nom_prenom
             FROM formulaires_stage f JOIN residents r ON r.id = f.resident_id
             WHERE f.periode NOT IN (?) FOR UPDATE`,
            [RATTRAPAGES]
        );
        const [[{ rattrapages }]] = await connection.query('SELECT COUNT(*) AS rattrapages FROM formulaires_stage WHERE periode IN (?)', [RATTRAPAGES]);
        const ids = anciennes.length > 0 ? anciennes.map((f) => f.id) : [0];
        const [telechargements] = await connection.query('SELECT fiche_id, resident_id, telecharge_le FROM telechargements WHERE fiche_id IN (?)', [ids]);
        const [notifications] = await connection.query('SELECT fiche_id, resident_id, envoye_le FROM notifications_fiches WHERE fiche_id IN (?)', [ids]);
        const [signalements] = await connection.query(
            'SELECT fiche_id, resident_id, motif, message, cree_le, traite_le, traite_par, reponse FROM signalements WHERE fiche_id IN (?)',
            [ids]
        );

        // ----- Identifiants changés : même nom, ancien identifiant absent du registre -----
        const cinsRegistre = new Set(analyse.residents.map((r) => r.cin));
        const parCin = new Map(residents.map((r) => [String(r.cin).toUpperCase(), r]));
        const orphelins = residents.filter((r) => !cinsRegistre.has(String(r.cin).toUpperCase()));
        const changements = [];
        for (const r of analyse.residents.filter((x) => !parCin.has(x.cin))) {
            const memes = orphelins.filter((o) => cleNom(o.nom_prenom) === cleNom(r.nomPrenom));
            if (memes.length === 1) changements.push({ id: memes[0].id, nom: memes[0].nom_prenom, ancien: memes[0].cin, nouveau: r.cin });
        }

        const modifiees = anciennes.filter((f) => f.modifie_le);
        console.log(`\nBase actuelle : ${residents.length} résidents, ${anciennes.length} fiches hors rattrapages`
            + ` (${rattrapages} rattrapages conservés tels quels)`
            + ` (${modifiees.length} retouchées à la main, ${anciennes.filter((f) => f.url_pdf).length} avec lien PDF),`
            + ` ${telechargements.length} téléchargements, ${notifications.length} e-mails envoyés, ${signalements.length} signalements.`);
        console.log(`Identifiants mis à jour : ${changements.length}`);
        for (const c of changements) console.log(`  - ${c.nom} : ${c.ancien} → ${c.nouveau}`);
        const absents = orphelins.filter((o) => !changements.some((c) => c.id === o.id));
        console.log(`Résidents absents du registre, conservés sans fiches : ${absents.length}`);
        for (const a of absents) console.log(`  - ${a.cin} ${a.nom_prenom}`);
        if (modifiees.length) {
            console.log('Fiches retouchées à la main, remplacées par le registre :');
            for (const f of modifiees) console.log(`  - ${f.cin} ${f.nom_prenom} ${f.periode} ${f.annee} : ${f.service || '—'} / ${f.hopital || '—'}`);
        }

        // ----- Rechargement -----
        for (const c of changements) {
            await connection.query('UPDATE residents SET cin = ? WHERE id = ?', [c.nouveau, c.id]);
        }
        // Les téléchargements, notifications et signalements suivent la suppression (ON DELETE CASCADE) :
        // ils ont été lus plus haut et sont rattachés aux nouvelles fiches plus bas.
        await connection.query('DELETE FROM formulaires_stage WHERE periode NOT IN (?)', [RATTRAPAGES]);

        const { semestre, annee } = analyse.rapport.find((f) => f.semestre) || {};
        const [historique] = await connection.query(
            'INSERT INTO historique_imports (filename, admin_login, semestre, annee, undo_data) VALUES (?, ?, ?, ?, ?)',
            [path.basename(fichier), 'rechargement', semestre || null, annee || null, '{}']
        );
        const importId = historique.insertId;
        const enregistrement = await enregistrerAnalyse(connection, analyse, { specialite, importId });

        const [nouvelles] = await connection.query(
            'SELECT id, resident_id, periode, annee, service, hopital FROM formulaires_stage WHERE import_id = ?',
            [importId]
        );
        const parResident = new Map();
        for (const n of nouvelles) {
            if (!parResident.has(n.resident_id)) parResident.set(n.resident_id, []);
            parResident.get(n.resident_id).push(n);
        }
        const nouvelleDe = new Map();
        const sansSuite = [];
        for (const a of anciennes) {
            const n = correspondance(a, parResident.get(a.resident_id) || []);
            if (n) nouvelleDe.set(a.id, n.id);
            else sansSuite.push(a);
        }

        const repris = { telechargements: 0, notifications: 0, signalements: 0 };
        const perdus = [];
        for (const t of telechargements) {
            const id = nouvelleDe.get(t.fiche_id);
            if (!id) { perdus.push(`téléchargement du ${t.telecharge_le.toISOString?.() ?? t.telecharge_le}`); continue; }
            await connection.query('INSERT INTO telechargements (fiche_id, resident_id, telecharge_le) VALUES (?, ?, ?)', [id, t.resident_id, t.telecharge_le]);
            repris.telechargements++;
        }
        for (const n of notifications) {
            const id = nouvelleDe.get(n.fiche_id);
            if (!id) { perdus.push('e-mail « nouvelle fiche »'); continue; }
            const [r] = await connection.query('INSERT IGNORE INTO notifications_fiches (fiche_id, resident_id, envoye_le) VALUES (?, ?, ?)', [id, n.resident_id, n.envoye_le]);
            repris.notifications += r.affectedRows;
        }
        for (const s of signalements) {
            const id = nouvelleDe.get(s.fiche_id);
            if (!id) { perdus.push(`signalement « ${s.motif} »`); continue; }
            await connection.query(
                `INSERT INTO signalements (fiche_id, resident_id, motif, message, cree_le, traite_le, traite_par, reponse)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, s.resident_id, s.motif, s.message, s.cree_le, s.traite_le, s.traite_par, s.reponse]
            );
            repris.signalements++;
        }

        const { residentIdsCrees, residentIdsVus, niveaux, resume } = enregistrement;
        await connection.query(
            'UPDATE historique_imports SET residents_created = ?, fiches_created = ?, residents_vus = ?, undo_data = ? WHERE id = ?',
            [residentIdsCrees.length, resume.fichesCreees, residentIdsVus.length,
                JSON.stringify({ residentIds: residentIdsCrees, residentIdsVus, niveaux, rechargement: true }), importId]
        );
        await journaliser(connection, { admin: { login: 'rechargement' } }, {
            action: 'import', entite: 'import', entiteId: importId,
            avant: { fiches: anciennes.length, fichesRetouchees: modifiees.length },
            apres: {
                fichier: path.basename(fichier), rechargementComplet: true, semestre, annee,
                residentsCrees: residentIdsCrees.length, fichesCreees: resume.fichesCreees,
                identifiantsMisAJour: changements.map((c) => ({ ancien: c.ancien, nouveau: c.nouveau })), repris
            }
        });

        console.log(`\nRésultat : ${resume.fichesCreees} fiches créées, ${residentIdsCrees.length} résidents créés.`);
        console.log(`Historique repris : ${repris.telechargements} téléchargements, ${repris.notifications} e-mails, ${repris.signalements} signalements.`);
        if (sansSuite.length) console.log(`Anciennes fiches sans équivalent dans le registre : ${sansSuite.length}`);
        if (perdus.length) console.log(`Historique sans fiche correspondante, perdu : ${perdus.length} (${[...new Set(perdus)].join(', ')})`);

        if (appliquer) {
            await connection.commit();
            console.log('\n✅ Rechargement appliqué.');
        } else {
            await connection.rollback();
            console.log('\nSimulation seulement : rien n\'a été écrit. Relancer avec --appliquer pour enregistrer.');
        }
    } catch (error) {
        await connection.rollback().catch(() => { });
        throw error;
    } finally {
        connection.release();
    }
}

main()
    .then(() => db.end())
    .catch((error) => {
        console.error('❌ ' + error.message);
        db.end().finally(() => process.exit(1));
    });
