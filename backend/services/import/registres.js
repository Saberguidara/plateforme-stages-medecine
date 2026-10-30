// Analyse des registres de choix de stages de la médecine de famille.
// Formats reconnus automatiquement, feuille par feuille :
// - « registre » : registre de la faculté (N°, CLASS, IDENTIFIANT, NOM_PRENOM, FAC, SERVICE 1, HOPITAL 1,
//   SERVICE 2, HOPITAL 2, REMARQUES, ANNEE = 1A/2A/3A). Un service 2 vide = stage semestriel.
// - « national » : export du choix national du ministère (Année admissible, CIN, Email, Choix (poste),
//   Détails référence lot, Hôpital, Service, Type de session, Faculté d'origine…).
// - « emails » : simple liste CIN + e-mail, pour compléter les adresses de connexion.
// Le choix national couvre tous les résidents du pays : seuls ceux de la faculté de Sfax sont retenus.
const { normaliserEntete } = require('./excel');
const { specialiteDe } = require('../../config/specialites');

const FACULTE_LOCALE = 'FMSfax';
// Au-delà de cette part de résidents d'autres facultés, un registre est un choix national
// (registres faculté réels : ~7 % de mobilités entrantes ; choix national : ~73 %).
const SEUIL_CHOIX_NATIONAL = 0.5;

const FACULTES = [
    [/SFAX/, 'FMSfax'],
    [/SOUSSE/, 'FMSousse'],
    [/MONASTIR|^FMM$/, 'FMMonastir'],
    [/TUNIS/, 'FMTunis']
];

function texte(valeur) {
    if (valeur instanceof Date) {
        return `${String(valeur.getDate()).padStart(2, '0')}/${String(valeur.getMonth() + 1).padStart(2, '0')}/${valeur.getFullYear()}`;
    }
    return String(valeur ?? '').replace(/\s+/g, ' ').trim();
}

function faculteDe(brut) {
    const t = normaliserEntete(brut);
    if (!t) return null;
    const trouvee = FACULTES.find(([motif]) => motif.test(t));
    return trouvee ? trouvee[1] : 'Autre';
}

// Les CIN tunisiens ont 8 chiffres : une cellule numérique perd le zéro initial.
function normaliserCin(brut, nationalite) {
    let cin = texte(brut).replace(/\s/g, '').toUpperCase();
    const tunisien = !nationalite || /TUNIS/.test(normaliserEntete(nationalite));
    if (/^\d{7}$/.test(cin) && typeof brut === 'number' && tunisien) cin = cin.padStart(8, '0');
    return cin;
}

function niveauDe(brut) {
    const n = parseInt(texte(brut).replace(/[^0-9]/g, ''), 10);
    return n >= 1 && n <= 5 ? n : null;
}

function colonne(feuille, motif) {
    const entete = feuille.entetes.find((e) => motif.test(normaliserEntete(e)));
    return entete ? normaliserEntete(entete) : null;
}

// ----- Période (année + semestre) -----

function semestreDuMois(mois) {
    return mois <= 6 ? 'S1' : 'S2';
}

function periodeDansTexte(contenu) {
    const date = String(contenu).match(/(\d{1,2})[/-](\d{1,2})[/-](20\d{2})/);
    if (!date) return null;
    return { annee: parseInt(date[3], 10), semestre: semestreDuMois(parseInt(date[2], 10)) };
}

// Le nom du fichier porte le mois du choix : « juin 2026 » prépare le semestre de juillet.
function periodeDansNomFichier(nomFichier) {
    const t = normaliserEntete(nomFichier);
    const an = t.match(/20\d{2}/);
    if (!an) return null;
    const annee = parseInt(an[0], 10);
    if (/JANV|FEVR/.test(t)) return { annee, semestre: 'S1' };
    if (/JUIL|AOUT|JUIN|MAI/.test(t)) return { annee, semestre: 'S2' };
    if (/NOV|DEC/.test(t)) return { annee: annee + 1, semestre: 'S1' };
    return null;
}

function periodeDeFeuille(feuille, nomFichier) {
    for (const entete of feuille.entetes) {
        const p = periodeDansTexte(entete);
        if (p) return { ...p, source: `entête « ${entete} »` };
    }
    const p = periodeDansTexte(feuille.nom);
    if (p) return { ...p, source: `nom de la feuille « ${feuille.nom} »` };
    const f = periodeDansNomFichier(nomFichier);
    if (f) return { ...f, source: `nom du fichier « ${nomFichier} »` };
    return null;
}

// ----- Stages -----

const TRIMESTRES = { S1: ['T1', 'T2'], S2: ['T3', 'T4'] };
const RATTRAPAGE = { S1: 'R1', S2: 'R2' };

function reunir(affectations) {
    const services = affectations.map((a) => a.service).filter(Boolean);
    const hopitaux = [...new Set(affectations.map((a) => a.hopital).filter(Boolean))];
    return { service: services.join(' / '), hopital: hopitaux.join(' / ') };
}

// Registre faculté : service 2 vide = stage semestriel, sinon deux trimestres.
function stagesDeLigne(data, semestre) {
    const stage1 = { service: texte(data.service1), hopital: texte(data.hopital1) };
    const stage2 = { service: texte(data.service2), hopital: texte(data.hopital2) };

    if (!stage1.service && !stage1.hopital) return [];
    if (!stage2.service && !stage2.hopital) return [{ periode: semestre, ...stage1 }];
    return [
        { periode: TRIMESTRES[semestre][0], ...stage1 },
        { periode: TRIMESTRES[semestre][1], ...stage2 }
    ];
}

// « Détails référence lot » du choix national, par exemple :
//   Période 1 - Lot lot 44 / Hôpital X - Cardiologie / Hôpital X - Psychiatrie
//   Période 1 - Lot 133.1 / Hôpital A - Dermatologie / Hôpital B - ORL / (vide) / Période 2 - Lot 133.2 / Hôpital C - Psychiatrie
function blocsDuLot(details) {
    const blocs = [];
    for (const brute of String(details || '').split(/\r?\n/)) {
        const ligne = brute.trim();
        if (!ligne) continue;
        if (/^P[ée]riode\s*\d+/i.test(ligne)) {
            blocs.push([]);
            continue;
        }
        if (blocs.length === 0) blocs.push([]);
        const separateur = ligne.indexOf(' - ');
        blocs[blocs.length - 1].push(separateur > 0
            ? { hopital: ligne.slice(0, separateur).trim(), service: ligne.slice(separateur + 3).trim() }
            : { hopital: '', service: ligne });
    }
    return blocs.filter((bloc) => bloc.length > 0);
}

function stagesNationaux(valeurs, cols, semestre) {
    const premier = { service: texte(valeurs[cols.service]), hopital: texte(valeurs[cols.hopital]) };
    const blocs = blocsDuLot(valeurs[cols.details]);
    const rattrapage = /RATTRAPAGE/.test(normaliserEntete(valeurs[cols.session]));

    if (blocs.length === 0) {
        if (!premier.service && !premier.hopital) return [];
        return [{ periode: rattrapage ? RATTRAPAGE[semestre] : semestre, ...premier }];
    }
    if (rattrapage) return [{ periode: RATTRAPAGE[semestre], ...reunir(blocs.flat()) }];

    // Un seul bloc de deux services : un service par trimestre.
    // Deux blocs (Période 1, Période 2) : un bloc par trimestre, ses services réunis.
    const parTrimestre = blocs.length === 1 ? blocs[0].map((a) => [a]) : blocs;
    if (parTrimestre.length === 1) return [{ periode: semestre, ...reunir(parTrimestre[0]) }];
    return parTrimestre.slice(0, 2).map((affectations, i) => ({ periode: TRIMESTRES[semestre][i], ...reunir(affectations) }));
}

// ----- Détection et lecture des feuilles -----

function formatDeFeuille(feuille) {
    const a = (motif) => Boolean(colonne(feuille, motif));
    if (a(/^ANNEE ADMISSIBLE/) && (a(/^DETAILS REFERENCE LOT/) || a(/^CHOIX \(POSTE\)/))) return 'national';
    if (a(/^(IDENTIFIANT|CIN)\b/) && a(/^SERVICE 1\b/) && a(/^HOPITAL 1\b/)) return 'registre';
    if (a(/^(IDENTIFIANT|CIN)\b/) && a(/MAIL/) && !a(/^SERVICE/)) return 'emails';
    return null;
}

function lireRegistre(feuille, periode) {
    const c = {
        cin: colonne(feuille, /^(IDENTIFIANT|CIN)\b/),
        nom: colonne(feuille, /^NOM[ _]?(ET )?P?PRENOM|^NOM COMPLET|^NOM$/),
        nationalite: colonne(feuille, /^NATIONALITE/),
        fac: colonne(feuille, /^FAC/),
        specialite: colonne(feuille, /^SPECIALITE/),
        service1: colonne(feuille, /^SERVICE 1\b/),
        hopital1: colonne(feuille, /^HOPITAL 1\b/),
        service2: colonne(feuille, /^SERVICE 2\b/),
        hopital2: colonne(feuille, /^HOPITAL 2\b/),
        annee: colonne(feuille, /^ANNEE\b/),
        email: colonne(feuille, /MAIL/)
    };
    return feuille.lignes.map(({ numero, valeurs }) => ({
        numero,
        cin: normaliserCin(valeurs[c.cin], valeurs[c.nationalite]),
        nomPrenom: texte(valeurs[c.nom]),
        email: texte(valeurs[c.email]).toLowerCase(),
        faculte: faculteDe(valeurs[c.fac]),
        specialite: texte(valeurs[c.specialite]),
        niveau: niveauDe(valeurs[c.annee]),
        stages: stagesDeLigne({
            service1: valeurs[c.service1], hopital1: valeurs[c.hopital1],
            service2: valeurs[c.service2], hopital2: valeurs[c.hopital2]
        }, periode.semestre)
    }));
}

function lireNational(feuille, periode) {
    const c = {
        cin: colonne(feuille, /^CIN\b/),
        email: colonne(feuille, /^E-?MAIL/),
        nomComplet: colonne(feuille, /^NOM COMPLET/),
        nom: colonne(feuille, /^NOM$/),
        prenom: colonne(feuille, /^PRENOM$/),
        niveau: colonne(feuille, /^ANNEE ADMISSIBLE/),
        specialite: colonne(feuille, /^SPECIALITE \(NOM\)|^SPECIALITE$/),
        fac: colonne(feuille, /^FACULTE/),
        session: colonne(feuille, /^TYPE DE SESSION/),
        details: colonne(feuille, /^DETAILS REFERENCE LOT/),
        hopital: colonne(feuille, /^HOPITAL$/),
        service: colonne(feuille, /^SERVICE$/)
    };
    return feuille.lignes.map(({ numero, valeurs }) => ({
        numero,
        cin: normaliserCin(valeurs[c.cin]),
        nomPrenom: texte(valeurs[c.nomComplet]) || `${texte(valeurs[c.nom])} ${texte(valeurs[c.prenom])}`.trim(),
        email: texte(valeurs[c.email]).toLowerCase(),
        faculte: faculteDe(valeurs[c.fac]),
        specialite: texte(valeurs[c.specialite]),
        niveau: niveauDe(valeurs[c.niveau]),
        stages: stagesNationaux(valeurs, c, periode.semestre)
    }));
}

function lireEmails(feuille) {
    const cin = colonne(feuille, /^(IDENTIFIANT|CIN)\b/);
    const email = colonne(feuille, /MAIL/);
    return feuille.lignes
        .map(({ valeurs }) => ({ cin: normaliserCin(valeurs[cin]), email: texte(valeurs[email]).toLowerCase() }))
        .filter((l) => l.cin && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email));
}

/**
 * Analyse toutes les feuilles d'un classeur, sans toucher à la base.
 * @param {ReturnType<import('./excel').lireClasseur>} feuilles
 * @param {string} nomFichier
 * @param {string} codeSpecialite  ex. 'medecine-famille'
 */
function analyserClasseur(feuilles, nomFichier, codeSpecialite) {
    const residents = new Map();
    const emails = [];
    const rapport = [];
    const bilan = { lignes: 0, autresFacultes: 0, autresSpecialites: 0, sansCin: 0, sansStage: 0, doublons: 0, emailsInvalides: 0 };

    for (const feuille of feuilles) {
        const format = formatDeFeuille(feuille);
        if (!format) {
            rapport.push({ feuille: feuille.nom, format: 'ignorée', detail: 'colonnes non reconnues' });
            continue;
        }
        if (format === 'emails') {
            const liste = lireEmails(feuille);
            emails.push(...liste);
            rapport.push({ feuille: feuille.nom, format, lignes: liste.length });
            continue;
        }

        const periode = periodeDeFeuille(feuille, nomFichier);
        if (!periode) {
            throw new Error(`Feuille « ${feuille.nom} » : impossible de déterminer le semestre (ni dates dans les entêtes ou le nom de la feuille, ni mois dans le nom du fichier).`);
        }

        const lignes = format === 'national' ? lireNational(feuille, periode) : lireRegistre(feuille, periode);
        const avecCin = lignes.filter((l) => l.cin);
        const externes = avecCin.filter((l) => l.faculte && l.faculte !== FACULTE_LOCALE).length;
        const choixNational = format === 'national' || (avecCin.length > 0 && externes / avecCin.length > SEUIL_CHOIX_NATIONAL);

        let retenues = 0;
        for (const ligne of lignes) {
            bilan.lignes++;
            if (!ligne.cin) { bilan.sansCin++; continue; }
            if (ligne.specialite) {
                const spec = specialiteDe(ligne.specialite);
                if (!spec || spec.code !== codeSpecialite) { bilan.autresSpecialites++; continue; }
            }
            if (choixNational && ligne.faculte !== FACULTE_LOCALE) { bilan.autresFacultes++; continue; }
            if (ligne.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ligne.email)) { bilan.emailsInvalides++; ligne.email = ''; }

            const stages = ligne.stages.map((s) => ({ ...s, annee: periode.annee }));
            const deja = residents.get(ligne.cin);
            if (deja) {
                // Même résident dans deux feuilles (ex. liste globale + liste FMSf) : on garde la première.
                bilan.doublons++;
                if (deja.stages.length === 0 && stages.length > 0) deja.stages = stages;
                if (!deja.email && ligne.email) deja.email = ligne.email;
                continue;
            }
            if (stages.length === 0) bilan.sansStage++;
            residents.set(ligne.cin, {
                cin: ligne.cin,
                nomPrenom: ligne.nomPrenom || 'Non renseigné',
                email: ligne.email || null,
                faculte: ligne.faculte || 'Autre',
                niveau: ligne.niveau,
                annee: periode.annee,
                stages
            });
            retenues++;
        }

        rapport.push({
            feuille: feuille.nom,
            format: choixNational ? 'choix national' : 'registre faculté',
            annee: periode.annee,
            semestre: periode.semestre,
            source: periode.source,
            lignes: lignes.length,
            retenues
        });
    }

    return { residents: [...residents.values()], emails, rapport, bilan };
}

module.exports = { analyserClasseur, stagesDeLigne, blocsDuLot, stagesNationaux, periodeDeFeuille, normaliserCin, faculteDe };
