const { faculteLogo } = require('../utils/logos');

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getPeriodeInfos(periode, annee, niveau) {
    if (!annee) annee = new Date().getFullYear();
    if (!niveau) niveau = 1;

    let absSemestre = 0;
    if (!isNaN(niveau)) {
        absSemestre = (niveau - 1) * 2;
    }
    let dateRange = '';
    let semestreLabel = '';

    switch (periode) {
        case 'S1':
            dateRange = `Du 1er Janvier ${annee} au 30 Juin ${annee}`;
            semestreLabel = `${absSemestre + 1}`;
            break;
        case 'S2':
            dateRange = `Du 1er Juillet ${annee} au 31 Décembre ${annee}`;
            semestreLabel = `${absSemestre + 2}`;
            break;
        case 'T1':
            dateRange = `Du 1er Janvier ${annee} au 31 Mars ${annee}`;
            semestreLabel = `${absSemestre + 1} Trimestre 1`;
            break;
        case 'T2':
            dateRange = `Du 1er Avril ${annee} au 30 Juin ${annee}`;
            semestreLabel = `${absSemestre + 1} Trimestre 2`;
            break;
        case 'T3':
            dateRange = `Du 1er Juillet ${annee} au 30 Septembre ${annee}`;
            semestreLabel = `${absSemestre + 2} Trimestre 3`;
            break;
        case 'T4':
            dateRange = `Du 1er Octobre ${annee} au 31 Décembre ${annee}`;
            semestreLabel = `${absSemestre + 2} Trimestre 4`;
            break;
        default:
            dateRange = periode || 'Non spécifiée';
            semestreLabel = '';
            break;
    }
    return { dateRange, semestreLabel };
}

function generateFicheHtml(resident, fiche) {
    // Calcul dynamique du niveau d'étude selon l'année de la fiche et la promotion du résident
    let niveau = resident.niveau || 1;
    if (resident.promotion && fiche.annee) {
        const annee = parseInt(fiche.annee);
        const promotion = parseInt(resident.promotion);
        if (!isNaN(annee) && !isNaN(promotion) && promotion > 0) {
            const calculated = annee - promotion + 1;
            if (calculated > 0) niveau = calculated;
        }
    }

    const infos = getPeriodeInfos(fiche.periode, fiche.annee, niveau);

    let anneeTexte = '';
    if (niveau === 'Rattrapage') {
        anneeTexte = 'Stage de rattrapage';
    } else if (niveau === 'Revalidation') {
        anneeTexte = 'Stage de revalidation';
    } else {
        anneeTexte = niveau == 1 ? '1ère Année' : niveau + 'ème Année';
    }

    // Échappement des valeurs dynamiques
    const safeNom = escapeHtml(resident.nom_prenom);
    const safeSpec = escapeHtml(resident.specialite);
    const safeHopital = escapeHtml(fiche.hopital);
    const safeService = escapeHtml(fiche.service);
    const safeDateRange = escapeHtml(infos.dateRange);
    const safeSemLabel = escapeHtml(infos.semestreLabel);
    const safeAnnee = escapeHtml(anneeTexte);

    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: 'Calibri', sans-serif; padding: 5px 20px; color: #000; font-size: 15px; }
            .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0px; margin-top: -10px; opacity: 0.65; }
            .header-left, .header-right { width: 33%; font-size: 14px; line-height: 1.35; text-align: center; }
            .logo-wrapper { width: 33%; text-align: center; }
            .logo { height: 108px; object-fit: contain; }
            
            .title-section { text-align: center; margin: 15px 0 10px 0; }
            .title-section h3 { font-size: 23px; margin: 0 0 5px 0; font-weight: bold; }
            .title-section h2 { font-size: 23px; letter-spacing: 5px; margin: 0; padding-bottom: 10px; }
            .title-hr { display: flex; align-items: center; justify-content: center; margin: 0 auto; width: 220px; }
            .title-hr::before, .title-hr::after { content: ""; flex: 1; border-top: 2px solid black; }
            .title-hr::before { margin-right: 5px; }
            .title-hr::after { margin-left: 5px; }
            .title-hr .diamond { font-size: 26px; color: #444; line-height: 0; }

            .hopital-service { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 20px; line-height: 1.5; }

            .info-table { width: 100%; margin-bottom: 10px; font-size: 16px; border-spacing: 0 10px; }
            .info-table td { vertical-align: bottom; }

            .table-eval { width: 100%; border-collapse: collapse; margin-bottom: 5px; font-size: 14px; }
            .table-eval th, .table-eval td { border: 1px solid #000; padding: 2px; }
            .table-eval th { text-align: center; }
            .table-eval thead th { font-weight: bold; }
            
            .cat-title { font-weight: bold; text-align: left; vertical-align: middle; width: 22%; text-transform: uppercase; }
            .sub-cat { text-align: left; padding-left: 5px; font-size: 15px; width: 33%; }
            .check-col { width: 7.5%; text-align: center; }

            .recommandation { border: 1px solid black; padding: 5px 15px; font-size: 15px; font-weight: bold; margin-bottom: 5px; width: 100%; box-sizing: border-box; }
            .rec-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
            .rec-right { display: flex; align-items: center; gap: 40px; justify-content: flex-end; }
            .rec-right > span { display: flex; align-items: center; gap: 10px; }
            .rec-bottom { display: flex; align-items: flex-end; width: 100%; }
            .rec-dots { flex-grow: 1; border-bottom: 1px dotted black; margin-left: 10px; position: relative; top: -4px; height: 10px;}
            .box { display: inline-block; width: 25px; height: 18px; border: 1px solid black; vertical-align: middle; }

            .footer-sig { font-size: 15px; margin-top: 15px; position: relative; }
            .sig-date { position: absolute; left: 0; top: 30px; }
            .sig-nom { position: absolute; right: 0; top: 0; text-align: center; }
            .sig-cachet { position: absolute; right: 80px; top: 30px; text-align: center; }
            .footer-note { font-size: 14px; text-align: center; position: absolute; bottom: 10px; left: 0; right: 0; font-weight: bold; opacity: 0.65; text-decoration: underline; }
        </style>
    </head>
    <body>
        <div class="header-container">
            <div class="header-left">
                <strong>République Tunisienne</strong><br>
                Ministère de l'Enseignement Supérieur<br>
                et de la Recherche Scientifique<br>
                Université de Sfax<br>
                <strong>Faculté de Médecine</strong>
            </div>
            <div class="logo-wrapper">
                <img src="${faculteLogo}" class="logo" alt="Logo">
            </div>
            <div class="header-right" dir="rtl">
                <strong>الجمهورية التونسية</strong><br>
                وزارة التعليم العالي<br>
                و البحث العلمي<br>
                جامعة صفاقس<br>
                <strong>كلية الطب</strong>
            </div>
        </div>

        <div class="title-section">
            <h3>FICHE DE VALIDATION</h3>
            <h2>RESIDANAT</h2>
            <div class="title-hr">
                <span class="diamond">♦</span>
            </div>
        </div>

        <div class="hopital-service">
            Hôpital : <span style="text-transform: uppercase;">${safeHopital}</span><br>
            Service : <span style="text-transform: uppercase;">${safeService}</span>
        </div>

        <table class="info-table" style="table-layout: fixed; width: 100%;">
            <tr>
                <td style="width: 19%; white-space: nowrap;"><strong>Nom et Prénom :</strong></td>
                <td style="width: 44%;"><strong>${safeNom}</strong></td>
                <td style="width: 11%; white-space: nowrap;"><strong>Spécialité :</strong></td>
                <td style="width: 26%;"><strong>${safeSpec}</strong></td>
            </tr>
            <tr>
                <td style="white-space: nowrap;"><strong>Année :</strong></td>
                <td><strong>${safeAnnee}</strong></td>
                <td></td>
                <td></td>
            </tr>
            <tr>
                <td style="white-space: nowrap;"><strong>Période :</strong></td>
                <td><strong>${safeDateRange}</strong></td>
                <td style="white-space: nowrap;"><strong>Semestre :</strong></td>
                <td><strong>${safeSemLabel}</strong></td>
            </tr>
        </table>

        <table class="table-eval">
            <thead>
                <tr>
                    <th colspan="2" rowspan="2" style="font-size: 19px; letter-spacing: 3px; padding: 6px;">C R I T E R E S</th>
                    <th colspan="6" style="letter-spacing: 2px; font-size: 14px; padding: 5px;">COCHEZ LA CASE APPROPRIEE</th>
                </tr>
                <tr style="font-size: 14px;">
                    <th>Excellent</th>
                    <th>Très bon</th>
                    <th>Bon</th>
                    <th>Satisfaction</th>
                    <th>Insuffisant</th>
                    <th>Pas d'opinion</th>
                </tr>
            </thead>
            <tbody>
                <!-- CONNAISSANCE -->
                <tr>
                    <td rowspan="3" class="cat-title">CONNAISSANCE</td>
                    <td class="sub-cat">Sciences Cliniques</td>
                    <td class="check-col"></td><td class="check-col"></td><td class="check-col"></td><td class="check-col"></td><td class="check-col"></td><td class="check-col"></td>
                </tr>
                <tr>
                    <td class="sub-cat">Sciences Fondamentales</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                <tr>
                    <td class="sub-cat">Sciences Humaines</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                
                <!-- COMPETENCE -->
                <tr>
                    <td rowspan="7" class="cat-title">COMPETENCE</td>
                    <td class="sub-cat">Ethique professionnelles</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                <tr>
                    <td class="sub-cat">Recueils des données</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                <tr>
                    <td class="sub-cat">Leur interprétation</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                <tr>
                    <td class="sub-cat">La décision appropriée</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                <tr>
                    <td class="sub-cat">Efficacité</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                <tr>
                    <td class="sub-cat">Habilité technique</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                <tr>
                    <td class="sub-cat">Curiosité scientifique</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                
                <!-- COMPORTEMENT -->
                <tr>
                    <td rowspan="4" class="cat-title">COMPORTEMENT</td>
                    <td class="sub-cat">Sens des responsabilités</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                <tr>
                    <td class="sub-cat">Discipline, ponctualité</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                <tr>
                    <td class="sub-cat">Relations professionnelles</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                <tr>
                    <td class="sub-cat">Relations avec les patients</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
                
                <!-- EVALUATION -->
                <tr>
                    <td class="cat-title">EVALUATION</td>
                    <td colspan="7" style="text-align: left; padding: 6px; font-size: 14px;">
                        <strong>CET(E) ETUDIANT (E) PROGRESSE :</strong> Lentement, Rapidement, Pas d'opinion.<br>
                        <strong>CET(E) ETUDIANT (E) TRAVAILLE :</strong> Peu, Normalement, Beaucoup.
                    </td>
                </tr>
            </tbody>
        </table>

        <!-- Recommandation -->
        <div class="recommandation">
            <div class="rec-top">
                <span>RECOMMANDATION DU CHEF DE SERVICE</span>
                <div class="rec-right">
                    <span>VALIDE <div class="box"></div></span>
                    <span>NON VALIDE <div class="box"></div></span>
                </div>
            </div>
            <div class="rec-bottom">
                <span>Durée requise pour la revalidation <span style="font-weight: normal;">........................................................................................</span></span>
            </div>
        </div>

        <!-- Signatures -->
        <div class="footer-sig">
            <div class="sig-nom">
                Nom et prénom ........................................................................
            </div>
            <div class="sig-date">
                Date ............................................
            </div>
            <div class="sig-cachet">
                Cachet et Signature
            </div>
        </div>

        <div class="footer-note">
            NB : La présente fiche doit être remise au service des stages dans un délai ne dépassant pas les 15 jours.
        </div>
    </body>
    </html>
    `;
}

module.exports = {
    generateFicheHtml
};
