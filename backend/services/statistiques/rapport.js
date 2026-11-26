// Rapport semestriel en PDF : chiffres clés, hôpitaux, parcours, diffusion des fiches et qualité des données,
// avec quelques faits marquants rédigés à partir des écarts. Polices standard du PDF (Helvetica).
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { calculerSynthese } = require('./synthese');
const { calculerAffectations } = require('./affectations');
const { calculerParcours } = require('./parcours');
const { calculerDiffusion } = require('./diffusion');
const { calculerQualite } = require('./qualite');
const { delaiTexte } = require('./textes');

const A4 = [595.28, 841.89];
const MARGE = 48;
const COULEURS = {
    noir: rgb(0.1, 0.1, 0.1), gris: rgb(0.42, 0.4, 0.38), clair: rgb(0.93, 0.91, 0.87), beige: rgb(0.96, 0.94, 0.9),
    orange: rgb(0.957, 0.482, 0.271), orangeFonce: rgb(0.71, 0.32, 0.12), rattrapage: rgb(0.85, 0.71, 0.62),
    vert: rgb(0.12, 0.48, 0.3), rouge: rgb(0.71, 0.14, 0.09)
};

// Caractères hors de l'encodage des polices standard (WinAnsi) : remplacés ou retirés.
const REMPLACEMENTS = { ' ': ' ', ' ': ' ', '−': '-', '→': '->', '≤': '<=', '≥': '>=', '×': 'x' };
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
function winAnsi(texte) {
    return String(texte ?? '').normalize('NFC').split('')
        .map((c) => REMPLACEMENTS[c] ?? ((c.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.has(c)) ? c : '?'))
        .join('');
}

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const fmt = (n) => nombre.format(n).replace(/ | /g, ' ');

/** Phrases « faits marquants » tirées des chiffres. */
function faitsMarquants({ synthese, affectations, parcours, diffusion, qualite }) {
    const faits = [];
    const { fiches, tauxRecuperation } = synthese.indicateurs;
    const ref = synthese.comparaison.libelle;
    if (fiches.precedent > 0) {
        const ecart = ((fiches.valeur - fiches.precedent) / fiches.precedent) * 100;
        faits.push(Math.abs(ecart) < 0.5
            ? `Autant de fiches qu'en ${ref} (${fiches.valeur}).`
            : `${ecart > 0 ? 'Hausse' : 'Baisse'} de ${fmt(Math.abs(ecart))} % des fiches par rapport à ${ref} (${fiches.precedent} -> ${fiches.valeur}).`);
    }
    const premier = affectations.parHopital[0];
    if (premier && affectations.totaux.fiches > 0) {
        faits.push(`${premier.hopital} accueille ${fmt((premier.fiches / affectations.totaux.fiches) * 100)} % des fiches du semestre (${premier.fiches}).`);
    }
    if (tauxRecuperation.valeur !== null && diffusion.totaux.annoncees > 0) {
        faits.push(`${tauxRecuperation.valeur} % des fiches ont été récupérées${diffusion.delaiMedianHeures !== null ? `, en ${delaiTexte(diffusion.delaiMedianHeures)} en médiane après l'e-mail` : ''}.`);
    }
    const incomplets = parcours.promotions.reduce((n, p) => n + p.incomplets, 0);
    if (incomplets > 0) faits.push(`${incomplets} résident(s) en cours ont au moins un semestre passé sans stage complet.`);
    const sig = synthese.indicateurs.signalements;
    if (sig.recus > 0) faits.push(`${sig.recus} signalement(s) reçu(s)${sig.delaiMedianHeures !== null ? `, traités en ${delaiTexte(sig.delaiMedianHeures)} en médiane` : ''}.`);
    faits.push(`Score de qualité des données : ${qualite.score}/100.`);
    return faits;
}

async function collecter(s, maintenant) {
    const [synthese, affectations, parcours, diffusion, qualite] = await Promise.all([
        calculerSynthese(s, maintenant),
        calculerAffectations({ annee: s.annee, semestre: s.semestre, promotion: null, faculte: '', hopital: '' }, maintenant),
        calculerParcours({}, maintenant),
        calculerDiffusion(s, maintenant),
        calculerQualite(maintenant)
    ]);
    return { synthese, affectations, parcours, diffusion, qualite };
}

async function genererRapport(s, maintenant = new Date()) {
    const donnees = await collecter(s, maintenant);
    const { synthese, affectations, parcours, diffusion, qualite } = donnees;

    const pdf = await PDFDocument.create();
    pdf.setTitle(`Rapport des stages ${s.semestre} ${s.annee}`);
    pdf.setAuthor('Faculté de médecine de Sfax');
    pdf.setCreator('Plateforme des stages');
    const normal = await pdf.embedFont(StandardFonts.Helvetica);
    const gras = await pdf.embedFont(StandardFonts.HelveticaBold);

    let page;
    let y;
    const largeur = A4[0] - 2 * MARGE;

    const texte = (t, x, yy, { taille = 9.5, police = normal, couleur = COULEURS.noir } = {}) =>
        page.drawText(winAnsi(t), { x, y: yy, size: taille, font: police, color: couleur });
    const largeurTexte = (t, taille, police = normal) => police.widthOfTextAtSize(winAnsi(t), taille);
    const tronquer = (t, taille, max, police = normal) => {
        let v = winAnsi(t);
        if (police.widthOfTextAtSize(v, taille) <= max) return v;
        while (v.length > 1 && police.widthOfTextAtSize(`${v}…`, taille) > max) v = v.slice(0, -1);
        return `${v}…`;
    };
    const nouvellePage = () => {
        page = pdf.addPage(A4);
        y = A4[1] - MARGE;
    };
    const place = (hauteur) => { if (y - hauteur < MARGE + 20) nouvellePage(); };
    const titreSection = (t) => {
        place(40);
        y -= 22;
        texte(t, MARGE, y, { taille: 12, police: gras });
        y -= 6;
        page.drawLine({ start: { x: MARGE, y }, end: { x: MARGE + largeur, y }, thickness: 0.6, color: COULEURS.clair });
        y -= 14;
    };

    nouvellePage();
    // En-tête
    texte('FACULTÉ DE MÉDECINE DE SFAX · SERVICE DES STAGES', MARGE, y, { taille: 8, police: gras, couleur: COULEURS.orangeFonce });
    y -= 24;
    texte(`Rapport des stages · ${synthese.semestre.libelle}`, MARGE, y, { taille: 20, police: gras });
    const edition = `Édité le ${maintenant.toLocaleDateString('fr-FR')}`;
    texte(edition, MARGE + largeur - largeurTexte(edition, 8.5), y + 2, { taille: 8.5, couleur: COULEURS.gris });
    y -= 10;
    page.drawRectangle({ x: MARGE, y, width: largeur, height: 2, color: COULEURS.orange });
    y -= 18;

    // Chiffres clés
    const ind = synthese.indicateurs;
    const ecart = (i, unite = '') => (i.precedent === null || i.valeur === null ? `pas de comparaison`
        : `${i.valeur - i.precedent >= 0 ? '+' : ''}${fmt(i.valeur - i.precedent)}${unite} vs ${synthese.comparaison.libelle}`);
    const cles = [
        ['Résidents en stage', `${ind.residents.valeur}`, ecart(ind.residents)],
        ['Fiches du semestre', `${ind.fiches.valeur}`, ecart(ind.fiches)],
        ['Fiches récupérées', ind.tauxRecuperation.valeur === null ? '–' : `${ind.tauxRecuperation.valeur} %`, ecart(ind.tauxRecuperation, ' pt')],
        ['Qualité des données', `${qualite.score}/100`, `${qualite.anomalies} élément(s) à revoir`]
    ];
    const lCase = (largeur - 3 * 8) / 4;
    cles.forEach(([lib, val, det], i) => {
        const x = MARGE + i * (lCase + 8);
        page.drawRectangle({ x, y: y - 58, width: lCase, height: 58, color: COULEURS.beige });
        texte(lib, x + 8, y - 15, { taille: 8, couleur: COULEURS.gris });
        texte(val, x + 8, y - 35, { taille: 17, police: gras });
        texte(tronquer(det, 7.5, lCase - 16), x + 8, y - 49, { taille: 7.5, couleur: COULEURS.gris });
    });
    y -= 70;

    // Faits marquants
    titreSection('Faits marquants');
    for (const fait of faitsMarquants(donnees)) {
        place(14);
        page.drawCircle({ x: MARGE + 3, y: y + 3, size: 1.6, color: COULEURS.orange });
        texte(tronquer(fait, 9.5, largeur - 12), MARGE + 10, y);
        y -= 14;
    }

    // Hôpitaux
    titreSection(`Répartition des fiches par hôpital · ${synthese.semestre.libelle}`);
    const hopitaux = affectations.parHopital.slice(0, 10);
    const max = Math.max(1, ...hopitaux.map((h) => h.fiches));
    const lLibelle = 190;
    const lBarre = largeur - lLibelle - 40;
    for (const h of hopitaux) {
        place(15);
        texte(tronquer(h.hopital, 8.5, lLibelle - 8), MARGE, y, { taille: 8.5 });
        let x = MARGE + lLibelle;
        for (const [valeur, couleur] of [[h.trimestres, COULEURS.orange], [h.semestres, COULEURS.noir], [h.rattrapages, COULEURS.rattrapage]]) {
            const w = (valeur / max) * lBarre;
            if (w > 0) page.drawRectangle({ x, y: y - 1, width: w, height: 8, color: couleur });
            x += w;
        }
        texte(String(h.fiches), MARGE + lLibelle + lBarre + 8, y, { taille: 8.5, police: gras });
        y -= 15;
    }
    if (affectations.parHopital.length > hopitaux.length) {
        texte(`… et ${affectations.parHopital.length - hopitaux.length} autre(s) hôpital(aux). Orange : trimestres et 45 jours ; noir : semestres ; beige : rattrapages.`,
            MARGE, y, { taille: 7.5, couleur: COULEURS.gris });
        y -= 12;
    }

    // Parcours
    titreSection(`Parcours des résidents en cours · état au ${maintenant.toLocaleDateString('fr-FR')}`);
    const colonnes = [['Promotion', 0], ['Année', 90], ['Effectif', 190], ['À jour', 260], ['Incomplets', 330], ['Sans fiche ce semestre', 410]];
    colonnes.forEach(([t, x]) => texte(t, MARGE + x, y, { taille: 8, police: gras, couleur: COULEURS.gris }));
    y -= 14;
    for (const p of parcours.promotions) {
        place(14);
        const valeurs = [`${p.promotion}`, `${p.niveau}e année`.replace('1e', '1re'), `${p.residents}`, `${p.aJour}`, `${p.incomplets}`, `${p.sansFicheCourant}`];
        valeurs.forEach((v, i) => texte(v, MARGE + colonnes[i][1], y, {
            taille: 9, couleur: (i === 4 && p.incomplets > 0) ? COULEURS.rouge : COULEURS.noir
        }));
        y -= 14;
    }

    // Diffusion
    titreSection(`Diffusion des fiches · ${synthese.semestre.libelle}`);
    const t = diffusion.totaux;
    const lignesDiffusion = [
        ['Fiches annoncées par e-mail', `${t.annoncees} / ${t.fiches}`],
        ['Fiches téléchargées au moins une fois', `${t.telechargees}`],
        ["Délai médian entre l'e-mail et le téléchargement", diffusion.delaiMedianHeures === null ? '–' : delaiTexte(diffusion.delaiMedianHeures)],
        ['Fiches jamais téléchargées', `${t.jamaisTelechargees}${t.jamaisSansEmail ? ` (dont ${t.jamaisSansEmail} résident(s) sans e-mail)` : ''}`]
    ];
    for (const [lib, val] of lignesDiffusion) {
        place(14);
        texte(lib, MARGE, y);
        texte(val, MARGE + 260, y, { police: gras });
        y -= 14;
    }

    // Qualité
    titreSection(`Qualité des données · ${qualite.score}/100`);
    // Deux colonnes pour tenir sur la page
    const moitie = Math.ceil(qualite.controles.length / 2);
    const lColonne = largeur / 2;
    place(moitie * 14);
    const haut = y;
    qualite.controles.forEach((c, i) => {
        const x = MARGE + (i < moitie ? 0 : lColonne);
        const yy = haut - (i % moitie) * 14;
        texte(tronquer(c.titre, 9, lColonne - 50), x, yy, { taille: 9 });
        texte(String(c.nombre), x + lColonne - 36, yy, { taille: 9, police: gras, couleur: c.nombre > 0 ? COULEURS.orangeFonce : COULEURS.vert });
    });
    y = haut - moitie * 14;

    // Pieds de page
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
        const pied = `Plateforme des stages · page ${i + 1}/${pages.length}`;
        p.drawText(winAnsi(pied), { x: A4[0] - MARGE - normal.widthOfTextAtSize(pied, 7.5), y: 26, size: 7.5, font: normal, color: COULEURS.gris });
    });

    return Buffer.from(await pdf.save());
}

module.exports = { genererRapport, faitsMarquants, winAnsi };
