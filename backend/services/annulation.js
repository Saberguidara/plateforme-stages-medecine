// Annulation des actions enregistrées dans le journal (journal_actions).
//
// Chaque annulation vérifie d'abord que l'état actuel correspond toujours à ce que l'action a laissé :
// si la fiche ou le dossier a été modifié depuis, l'annulation est refusée plutôt que d'écraser
// une modification plus récente. Tout se fait dans la transaction de l'appelant.
const { journaliser } = require('../utils/journal');

class ErreurAnnulation extends Error {
    constructor(statut, message) {
        super(message);
        this.statut = statut;
    }
}

const refus = (message) => new ErreurAnnulation(409, message);

const CHAMPS_RESIDENT = ['cin', 'nom_prenom', 'email', 'specialite', 'faculte_origine', 'promotion', 'niveau'];
const CHAMPS_FICHE = ['periode', 'annee', 'service', 'hopital'];
const CHAMPS_COMPTE = ['nom', 'role', 'actif'];

const lireJson = (valeur) => {
    if (valeur === null || valeur === undefined) return null;
    if (typeof valeur === 'object') return valeur;
    try { return JSON.parse(valeur); } catch { return null; }
};

const normal = (v) => (v === null || v === undefined || v === '' ? '' : String(v).trim());
// Les champs enregistrés dans le journal ont-ils toujours la même valeur en base ?
const inchange = (ligne, attendu, champs) => champs
    .filter((c) => attendu && attendu[c] !== undefined)
    .every((c) => normal(ligne[c]) === normal(attendu[c]));

// Actions qui ne s'annulent pas, avec la raison montrée à l'administrateur.
const NON_ANNULABLES = {
    annulation: "Une annulation ne s'annule pas : refaites l'action si besoin.",
    notification: 'Les e-mails sont déjà partis.',
    signalement: "C'est une action du résident.",
    connexion: 'Une connexion ne s\'annule pas.'
};

/** Indique si une ligne du journal peut être annulée (sans interroger la base). */
function annulabilite(entree) {
    if (entree.annule_le) return { annulable: false, raison: 'Déjà annulée.' };
    if (NON_ANNULABLES[entree.action]) return { annulable: false, raison: NON_ANNULABLES[entree.action] };
    const avant = lireJson(entree.avant) || {};
    const apres = lireJson(entree.apres) || {};
    switch (`${entree.entite}:${entree.action}`) {
        case 'resident:creation':
        case 'resident:modification':
        case 'resident:suppression':
        case 'fiche:creation':
        case 'fiche:modification':
        case 'fiche:suppression':
        case 'fiche:traitement':
        case 'referentiel:separation':
        case 'administrateur:creation':
        case 'administrateur:modification':
            return { annulable: true };
        case 'referentiel:fusion':
            return Array.isArray(avant.fiches)
                ? { annulable: true }
                : { annulable: false, raison: 'Fusion antérieure au journal détaillé : les fiches concernées ne sont pas connues.' };
        case 'import:import':
            return apres.rechargementComplet
                ? { annulable: false, raison: 'Le rechargement complet des fiches ne s\'annule pas depuis la plateforme.' }
                : { annulable: true };
        default:
            return { annulable: false, raison: "Ce type d'action ne s'annule pas." };
    }
}

// ----- Import -----

/**
 * Supprime les fiches d'un import et les résidents qu'il a créés (sans autre fiche),
 * rétablit les fiches qu'il avait corrigées. Ne journalise pas : l'appelant s'en charge.
 */
async function annulerImport(connection, importId) {
    const [rows] = await connection.query('SELECT filename, undo_data, undone FROM historique_imports WHERE id = ? FOR UPDATE', [importId]);
    if (rows.length === 0) throw new ErreurAnnulation(404, 'Import introuvable.');
    if (rows[0].undone) throw refus('Cet import a déjà été annulé.');
    const donnees = lireJson(rows[0].undo_data) || {};
    if (donnees.rechargement) throw refus('Le rechargement complet des fiches ne s\'annule pas depuis la plateforme.');

    // Une fiche modifiée depuis l'import (correction manuelle, fusion d'hôpitaux…) ne doit pas être perdue.
    const [modifiees] = await connection.query(
        'SELECT COUNT(*) AS n FROM formulaires_stage WHERE import_id = ? AND modifie_le IS NOT NULL',
        [importId]
    );
    if (modifiees[0].n > 0) {
        const erreur = refus(`Annulation impossible : ${modifiees[0].n} fiche(s) de cet import ont été modifiées depuis.`);
        erreur.fichesModifiees = modifiees[0].n;
        throw erreur;
    }

    const { residentIds = [], corrections = [] } = donnees;
    const [fiches] = await connection.query('DELETE FROM formulaires_stage WHERE import_id = ?', [importId]);
    // Fiches corrigées par l'import : ancienne valeur rétablie, sauf si la fiche a été retouchée depuis.
    let fichesRetablies = 0;
    for (const c of corrections) {
        const [retour] = await connection.query(
            'UPDATE formulaires_stage SET service = ?, hopital = ?, modifie_le = modifie_le WHERE id = ? AND modifie_le IS NULL',
            [c.service, c.hopital, c.id]
        );
        fichesRetablies += retour.affectedRows;
    }
    let residentsSupprimes = 0;
    if (residentIds.length > 0) {
        const [resultat] = await connection.query(
            `DELETE FROM residents WHERE id IN (?)
             AND NOT EXISTS (SELECT 1 FROM formulaires_stage f WHERE f.resident_id = residents.id)`,
            [residentIds]
        );
        residentsSupprimes = resultat.affectedRows;
    }
    await connection.query('UPDATE historique_imports SET undone = 1 WHERE id = ?', [importId]);

    return {
        fichier: rows[0].filename,
        fichesSupprimees: fiches.affectedRows,
        fichesRetablies,
        residentsSupprimes,
        message: `Import annulé : ${fiches.affectedRows} fiches et ${residentsSupprimes} résidents supprimés`
            + `${fichesRetablies ? `, ${fichesRetablies} fiches rétablies` : ''}.`
    };
}

// ----- Une action du journal -----

async function ligneOuRefus(connection, sql, params, message) {
    const [rows] = await connection.query(sql, params);
    if (rows.length === 0) throw refus(message);
    return rows[0];
}

const ANNULATIONS = {
    async 'resident:creation'(c, e) {
        const r = await ligneOuRefus(c, 'SELECT id FROM residents WHERE id = ? FOR UPDATE', [e.entite_id], 'Ce dossier a déjà été supprimé.');
        const [[{ n }]] = await c.query('SELECT COUNT(*) AS n FROM formulaires_stage WHERE resident_id = ?', [r.id]);
        if (n > 0) throw refus(`Ce dossier a reçu ${n} fiche(s) depuis sa création : supprimez-les d'abord ou supprimez le résident.`);
        await c.query('DELETE FROM residents WHERE id = ?', [r.id]);
        return 'Création annulée : le dossier a été supprimé.';
    },

    async 'resident:modification'(c, e, avant, apres) {
        const r = await ligneOuRefus(c, 'SELECT * FROM residents WHERE id = ? FOR UPDATE', [e.entite_id], "Ce dossier n'existe plus.");
        if (!inchange(r, apres, CHAMPS_RESIDENT)) throw refus('Le dossier a été modifié depuis : annulez d\'abord les modifications plus récentes.');
        const [doublon] = await c.query('SELECT id FROM residents WHERE cin = ? AND id <> ?', [avant.cin, r.id]);
        if (doublon.length) throw refus(`Le CIN ${avant.cin} appartient maintenant à un autre résident.`);
        const champs = CHAMPS_RESIDENT.filter((k) => avant[k] !== undefined);
        await c.query(`UPDATE residents SET ${champs.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...champs.map((k) => avant[k]), r.id]);
        return 'Modification annulée : le dossier a retrouvé ses valeurs précédentes.';
    },

    async 'resident:suppression'(c, e, avant) {
        const [existe] = await c.query('SELECT id, nom_prenom FROM residents WHERE id = ? OR cin = ?', [e.entite_id, avant.cin]);
        if (existe.length) throw refus(`Un dossier avec le CIN ${avant.cin} existe de nouveau (${existe[0].nom_prenom}).`);
        await c.query(
            'INSERT INTO residents (id, cin, nom_prenom, email, specialite, faculte_origine, promotion, niveau) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [e.entite_id, avant.cin, avant.nom_prenom, avant.email ?? null, avant.specialite || 'Médecine de famille',
                avant.faculte_origine ?? null, avant.promotion ?? null, avant.niveau ?? null]
        );
        let fiches = 0;
        for (const f of avant.fiches || []) {
            const [libre] = f.id ? await c.query('SELECT id FROM formulaires_stage WHERE id = ?', [f.id]) : [[1]];
            const [r] = await c.query(
                `INSERT IGNORE INTO formulaires_stage (id, resident_id, periode, annee, service, hopital, url_pdf, import_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [libre.length ? null : f.id, e.entite_id, f.periode, f.annee, f.service ?? null, f.hopital ?? null,
                    f.url_pdf ?? null, f.import_id ?? null]
            );
            fiches += r.affectedRows;
        }
        return `Suppression annulée : ${avant.nom_prenom} et ${fiches} fiche(s) rétablis. Les téléchargements et signalements passés ne reviennent pas.`;
    },

    async 'fiche:creation'(c, e, avant, apres) {
        const f = await ligneOuRefus(c, 'SELECT * FROM formulaires_stage WHERE id = ? FOR UPDATE', [e.entite_id], 'Cette fiche a déjà été supprimée.');
        if (!inchange(f, apres, CHAMPS_FICHE)) throw refus('La fiche a été modifiée depuis : annulez d\'abord les modifications plus récentes.');
        await c.query('DELETE FROM formulaires_stage WHERE id = ?', [f.id]);
        return `Ajout annulé : le stage ${f.periode} ${f.annee} a été supprimé.`;
    },

    async 'fiche:modification'(c, e, avant, apres) {
        const f = await ligneOuRefus(c, 'SELECT * FROM formulaires_stage WHERE id = ? FOR UPDATE', [e.entite_id], "Cette fiche n'existe plus.");
        if (!inchange(f, apres, CHAMPS_FICHE)) throw refus('La fiche a été modifiée depuis : annulez d\'abord les modifications plus récentes.');
        try {
            await c.query('UPDATE formulaires_stage SET periode = ?, annee = ?, service = ?, hopital = ? WHERE id = ?',
                [avant.periode, avant.annee, avant.service ?? null, avant.hopital ?? null, f.id]);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') throw refus('Une fiche identique existe déjà pour cette période.');
            throw error;
        }
        return `Modification annulée : le stage ${avant.periode} ${avant.annee} a retrouvé ses valeurs précédentes.`;
    },

    async 'fiche:suppression'(c, e, avant) {
        await ligneOuRefus(c, 'SELECT id FROM residents WHERE id = ?', [e.resident_id], "Le dossier du résident n'existe plus : annulez d'abord sa suppression.");
        const [occupe] = await c.query('SELECT id FROM formulaires_stage WHERE id = ?', [e.entite_id]);
        try {
            await c.query(
                `INSERT INTO formulaires_stage (id, resident_id, periode, annee, service, hopital, url_pdf, import_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [occupe.length ? null : e.entite_id, e.resident_id, avant.periode, avant.annee, avant.service ?? null,
                    avant.hopital ?? null, avant.url_pdf ?? null, avant.import_id ?? null]
            );
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') throw refus('Une fiche identique existe déjà pour cette période.');
            throw error;
        }
        return `Suppression annulée : le stage ${avant.periode} ${avant.annee} a été rétabli.`;
    },

    async 'fiche:traitement'(c, e, avant, apres) {
        const s = await ligneOuRefus(c,
            apres.signalementId
                ? 'SELECT id FROM signalements WHERE id = ? AND traite_le IS NOT NULL FOR UPDATE'
                : 'SELECT id FROM signalements WHERE fiche_id = ? AND motif = ? AND traite_le IS NOT NULL ORDER BY traite_le DESC LIMIT 1 FOR UPDATE',
            apres.signalementId ? [apres.signalementId] : [e.entite_id, apres.motif],
            'Ce signalement est déjà rouvert ou a été supprimé avec sa fiche.');
        await c.query('UPDATE signalements SET traite_le = NULL, traite_par = NULL, reponse = NULL WHERE id = ?', [s.id]);
        return 'Traitement annulé : le signalement est de nouveau à traiter. Le résident a pu recevoir la réponse par e-mail.';
    },

    async 'referentiel:fusion'(c, e, avant, apres) {
        const colonne = apres.type === 'service' ? 'service' : 'hopital';
        let retablies = 0;
        for (const f of avant.fiches) {
            const [r] = await c.query(`UPDATE formulaires_stage SET ${colonne} = ? WHERE id = ? AND ${colonne} = ?`, [f.valeur, f.id, apres.valeur]);
            retablies += r.affectedRows;
        }
        const ignorees = avant.fiches.length - retablies;
        return `Fusion annulée : ${retablies} fiche(s) ont retrouvé leur écriture d'origine`
            + `${ignorees ? ` (${ignorees} modifiée(s) ou supprimée(s) depuis, laissée(s) telles quelles)` : ''}.`;
    },

    async 'referentiel:separation'(c, e, avant, apres) {
        const { clePaire } = require('../controllers/referentiels.controller');
        const valeurs = apres.valeurs || [];
        let n = 0;
        for (let i = 0; i < valeurs.length; i++) {
            for (let j = i + 1; j < valeurs.length; j++) {
                const [a, b] = clePaire(valeurs[i], valeurs[j]).split('\u0000');
                const [r] = await c.query('DELETE FROM variantes_ignorees WHERE type = ? AND valeur_a = ? AND valeur_b = ?', [apres.type, a, b]);
                n += r.affectedRows;
            }
        }
        return `« Ne pas fusionner » annulé : ces écritures seront de nouveau proposées à la fusion (${n} paire(s)).`;
    },

    async 'administrateur:creation'(c, e, avant, apres, req) {
        const compte = await ligneOuRefus(c, 'SELECT id, login, actif FROM administrateurs WHERE id = ? FOR UPDATE', [e.entite_id], "Ce compte n'existe plus.");
        if (req.admin && compte.id === req.admin.id) throw refus('Vous ne pouvez pas désactiver votre propre compte.');
        if (!compte.actif) throw refus('Ce compte est déjà désactivé.');
        await c.query('UPDATE administrateurs SET actif = 0 WHERE id = ?', [compte.id]);
        return `Création annulée : le compte « ${compte.login} » est désactivé (il reste dans la liste pour l'historique).`;
    },

    async 'administrateur:modification'(c, e, avant, apres, req) {
        const compte = await ligneOuRefus(c, 'SELECT id, login, nom, role, actif FROM administrateurs WHERE id = ? FOR UPDATE', [e.entite_id], "Ce compte n'existe plus.");
        if (!inchange({ ...compte, actif: Boolean(compte.actif) }, apres, CHAMPS_COMPTE)) {
            throw refus('Le compte a été modifié depuis : annulez d\'abord les modifications plus récentes.');
        }
        if (req.admin && compte.id === req.admin.id && (!avant.actif || avant.role !== 'admin')) {
            throw refus('Vous ne pouvez ni désactiver votre propre compte, ni lui retirer le rôle administrateur.');
        }
        if (compte.role === 'admin' && compte.actif && (!avant.actif || avant.role !== 'admin')) {
            const [[{ n }]] = await c.query("SELECT COUNT(*) AS n FROM administrateurs WHERE role = 'admin' AND actif = 1 AND id <> ?", [compte.id]);
            if (n === 0) throw refus('Il doit rester au moins un administrateur actif.');
        }
        await c.query('UPDATE administrateurs SET nom = ?, role = ?, actif = ? WHERE id = ?', [avant.nom ?? null, avant.role, avant.actif ? 1 : 0, compte.id]);
        require('./comptes').invalider(compte.id);
        return `Modification annulée : le compte « ${compte.login} » a retrouvé son nom, son rôle et son état`
            + `${apres.motDePasse ? ' (le mot de passe changé reste le nouveau)' : ''}.`;
    }
};

/**
 * Annule l'action `journalId` et journalise l'annulation, dans la transaction de `connection`.
 * @returns {Promise<{ message: string }>}
 */
async function annulerAction(connection, journalId, req) {
    const [rows] = await connection.query('SELECT * FROM journal_actions WHERE id = ? FOR UPDATE', [journalId]);
    if (rows.length === 0) throw new ErreurAnnulation(404, 'Action introuvable dans le journal.');
    const entree = rows[0];
    const { annulable, raison } = annulabilite(entree);
    if (!annulable) throw refus(raison);

    const avant = lireJson(entree.avant) || {};
    const apres = lireJson(entree.apres) || {};
    let message;
    let details = null;
    if (entree.entite === 'import') {
        details = await annulerImport(connection, entree.entite_id);
        message = details.message;
    } else {
        message = await ANNULATIONS[`${entree.entite}:${entree.action}`](connection, entree, avant, apres, req);
    }

    const login = (req && req.admin && req.admin.login) || null;
    await connection.query('UPDATE journal_actions SET annule_le = NOW(), annule_par = ? WHERE id = ?', [login, entree.id]);
    await journaliser(connection, req, {
        action: 'annulation', entite: entree.entite, entiteId: entree.entite_id, residentId: entree.resident_id,
        annulationDe: entree.id,
        avant: entree.entite === 'import' ? { fichier: details.fichier, fichesSupprimees: details.fichesSupprimees,
            fichesRetablies: details.fichesRetablies, residentsSupprimes: details.residentsSupprimes } : null,
        apres: { actionAnnulee: entree.action, message }
    });
    return { message };
}

module.exports = { ErreurAnnulation, annulabilite, annulerAction, annulerImport };
