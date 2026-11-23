// Registre complet du résidanat (format « cursus ») : une feuille par promotion, une ligne par résident,
// deux colonnes (Service, CHU / Structure) par trimestre, de l'entrée en 1re année à la fin du résidanat.
//
//   ligne 1 : titre (« … Promotion Janvier 2024 »)
//   ligne 2 : N° | NOM & PRÉNOM | IDENTIFIANT | CLASSEMENT | FACULTÉ | REMARQUES | Du 01/01/2024 au 31/03/2024 (×2) | …
//   ligne 3 : … | Service | CHU / Structure | …
//
// Règles de découpage en fiches :
// - même service dans le même hôpital sur les deux trimestres d'un semestre : un stage semestriel (S1, S2),
//   par exemple les urgences ou un CSB ;
// - sinon un stage trimestriel (T1 à T4) ;
// - une cellule peut porter plusieurs stages, un par ligne, avec leurs dates : « Dermatologie (01/10–15/11) »
//   donne un stage de 45 jours (T4A), « Psychiatrie A (01/07–31/12) » un stage semestriel en parallèle ;
// - une cellule sans hôpital (Mobilité, Mutation, Stage reporté, Démission…) ne donne pas de fiche.
const { normaliserEntete } = require('./excel');
const { SPECIALITES, SPECIALITE_PAR_DEFAUT } = require('../../config/specialites');

const DATES = Object.fromEntries(Object.entries(SPECIALITES[SPECIALITE_PAR_DEFAUT].datesPeriodes)
    .filter(([code]) => !code.startsWith('R')));
const SEMESTRE_DU_TRIMESTRE = { T1: 'S1', T2: 'S1', T3: 'S2', T4: 'S2' };

const PLAGE_ENTETE = /DU\s+(\d{1,2})\/(\d{1,2})\/(20\d{2})\s+AU\s+(\d{1,2})\/(\d{1,2})\/(20\d{2})/;
const DATES_STAGE = /\s*\((\d{1,2})\/(\d{1,2})\s*[–—-]\s*(\d{1,2})\/(\d{1,2})\)\s*$/;

function texte(valeur) {
    return String(valeur ?? '').replace(/[ \t ]+/g, ' ').trim();
}

function lignesDe(valeur) {
    return String(valeur ?? '').split(/\r?\n/).map(texte).filter(Boolean);
}

const deuxChiffres = (n) => String(n).padStart(2, '0');

// Période dont les dates sont exactement « jj/mm → jj/mm », ou null.
function periodeDesDates(debut, fin) {
    const cible = [debut, fin].join('-');
    const trouvee = Object.entries(DATES).find(([, [d, f]]) => `${d}-${f}` === cible);
    return trouvee ? trouvee[0] : null;
}

// Clé de comparaison d'un service ou d'un hôpital (casse, accents et espaces ignorés).
function cleTexte(valeur) {
    return normaliserEntete(valeur).replace(/[’']/g, "'");
}

/** Ligne d'entête (IDENTIFIANT + colonnes « Du … au … ») dans les premières lignes, ou null. */
function enteteCursus(feuille) {
    const grille = feuille.grille || [];
    for (let numero = 1; numero <= Math.min(6, grille.length - 1); numero++) {
        const cellules = grille[numero] || [];
        const normalisees = cellules.map((c) => normaliserEntete(c));
        const identifiant = normalisees.findIndex((c) => /^(IDENTIFIANT|CIN)\b/.test(c));
        if (identifiant < 0 || !normalisees.some((c) => PLAGE_ENTETE.test(c))) continue;
        return { numero, normalisees };
    }
    return null;
}

function estCursus(feuille) {
    return Boolean(enteteCursus(feuille));
}

// Colonnes des trimestres : chaque plage « Du … au … » couvre une colonne Service et une colonne Hôpital.
function colonnesTrimestres(feuille, entete) {
    const sousEntete = (feuille.grille[entete.numero + 1] || []).map((c) => normaliserEntete(c));
    const plages = new Map();
    entete.normalisees.forEach((cellule, colonne) => {
        const m = cellule && cellule.match(PLAGE_ENTETE);
        if (!m) return;
        const cle = m[0];
        if (!plages.has(cle)) {
            plages.set(cle, {
                debut: `${deuxChiffres(m[1])}/${deuxChiffres(m[2])}`,
                fin: `${deuxChiffres(m[4])}/${deuxChiffres(m[5])}`,
                annee: parseInt(m[3], 10),
                colonnes: []
            });
        }
        plages.get(cle).colonnes.push(colonne);
    });

    return [...plages.values()].map((p) => {
        const service = p.colonnes.find((c) => /^SERVICE/.test(sousEntete[c] || '')) ?? p.colonnes[0];
        const hopital = p.colonnes.find((c) => c !== service && /CHU|STRUCTURE|HOPITAL|ETABLISSEMENT/.test(sousEntete[c] || ''))
            ?? p.colonnes.find((c) => c !== service);
        return { ...p, periode: periodeDesDates(p.debut, p.fin), service, hopital };
    });
}

function promotionDe(feuille, entete, trimestres) {
    for (let numero = 1; numero < entete.numero; numero++) {
        for (const cellule of feuille.grille[numero] || []) {
            const m = normaliserEntete(cellule).match(/PROMOTION\D*(20\d{2})/);
            if (m) return parseInt(m[1], 10);
        }
    }
    const nom = String(feuille.nom).match(/20\d{2}/);
    if (nom) return parseInt(nom[0], 10);
    return trimestres.length > 0 ? Math.min(...trimestres.map((t) => t.annee)) : null;
}

/**
 * Stages d'un résident à partir de ses cellules trimestre par trimestre.
 * @returns {{ stages: Array<{periode, annee, service, hopital}>, situations: string[], anomalies: string[] }}
 */
function stagesDuCursus(cellules) {
    const situations = [];
    const anomalies = [];
    const dates = [];      // stages datés dans la cellule : période connue
    const trimestriels = []; // stages sans dates : trimestre de la colonne, regroupés plus bas en semestres

    for (const { trimestre, service: brutService, hopital: brutHopital } of cellules) {
        const services = lignesDe(brutService);
        const hopitaux = lignesDe(brutHopital);
        services.forEach((ligne, i) => {
            const hopital = hopitaux[i] ?? (hopitaux.length === 1 ? hopitaux[0] : '');
            const d = ligne.match(DATES_STAGE);
            const service = d ? texte(ligne.slice(0, d.index)) : ligne;
            if (!hopital) {
                situations.push(service);
                return;
            }
            if (!trimestre.periode) {
                anomalies.push(`colonne « Du ${trimestre.debut} au ${trimestre.fin}/${trimestre.annee} » : période non reconnue`);
                return;
            }
            if (d) {
                const debut = `${deuxChiffres(d[1])}/${deuxChiffres(d[2])}`;
                const fin = `${deuxChiffres(d[3])}/${deuxChiffres(d[4])}`;
                const periode = periodeDesDates(debut, fin);
                if (periode) {
                    dates.push({ periode, annee: trimestre.annee, service, hopital });
                    return;
                }
                anomalies.push(`${service} (${debut}–${fin}) : dates hors trimestre, rattaché à ${trimestre.periode} ${trimestre.annee}`);
            }
            trimestriels.push({ periode: trimestre.periode, annee: trimestre.annee, service, hopital });
        });
    }

    // Même stage sur les deux trimestres d'un semestre : une seule fiche semestrielle.
    // Un trimestre déjà couvert par le même stage daté sur le semestre (« ORL (01/07–31/12) » puis « ORL ») est ignoré.
    const stages = [...dates];
    const pris = new Set();
    const couvert = (s) => dates.some((d) => d.annee === s.annee && d.periode === SEMESTRE_DU_TRIMESTRE[s.periode]
        && cleTexte(d.service) === cleTexte(s.service) && cleTexte(d.hopital) === cleTexte(s.hopital));
    trimestriels.forEach((s, i) => {
        if (pris.has(i)) return;
        if (couvert(s)) { pris.add(i); return; }
        const semestre = SEMESTRE_DU_TRIMESTRE[s.periode];
        const jumeau = semestre && trimestriels.findIndex((o, j) => j !== i && !pris.has(j)
            && o.annee === s.annee && o.periode !== s.periode && SEMESTRE_DU_TRIMESTRE[o.periode] === semestre
            && cleTexte(o.service) === cleTexte(s.service) && cleTexte(o.hopital) === cleTexte(s.hopital));
        if (semestre && jumeau >= 0) {
            pris.add(jumeau);
            stages.push({ ...s, periode: semestre });
        } else {
            stages.push(s);
        }
        pris.add(i);
    });

    // Un stage semestriel daté répété dans ses deux trimestres ne compte qu'une fois.
    const vus = new Set();
    const uniques = stages.filter((s) => {
        const cle = [s.periode, s.annee, cleTexte(s.service), cleTexte(s.hopital)].join('|');
        if (vus.has(cle)) return false;
        vus.add(cle);
        return true;
    });
    return { stages: uniques, situations, anomalies };
}

/**
 * Lit une feuille au format cursus.
 * @returns {{ promotion: number|null, trimestres: Array, lignes: Array<{ numero, cin, nomPrenom, faculte, stages, situations, anomalies }> }}
 */
function lireCursus(feuille, { normaliserCin, faculteDe }) {
    const entete = enteteCursus(feuille);
    const trimestres = colonnesTrimestres(feuille, entete);
    const promotion = promotionDe(feuille, entete, trimestres);
    const colonne = (motif) => entete.normalisees.findIndex((c) => motif.test(c || ''));
    const c = {
        cin: colonne(/^(IDENTIFIANT|CIN)\b/),
        nom: colonne(/^NOM\b/),
        fac: colonne(/^FACULTE/)
    };

    const lignes = [];
    for (let numero = entete.numero + 1; numero < feuille.grille.length; numero++) {
        const cellules = feuille.grille[numero];
        if (!cellules) continue;
        const cin = normaliserCin(cellules[c.cin]);
        // Sous-entête (Service / CHU) et lignes vides
        if (!cin || /^(SERVICE|IDENTIFIANT)$/.test(normaliserEntete(cin))) continue;
        const { stages, situations, anomalies } = stagesDuCursus(trimestres.map((t) => ({
            trimestre: t, service: cellules[t.service], hopital: cellules[t.hopital]
        })));
        lignes.push({
            numero,
            cin,
            nomPrenom: texte(cellules[c.nom]),
            faculte: c.fac >= 0 ? faculteDe(cellules[c.fac]) : null,
            stages,
            situations,
            anomalies
        });
    }
    return { promotion, trimestres, lignes };
}

module.exports = { estCursus, lireCursus, stagesDuCursus, periodeDesDates };
