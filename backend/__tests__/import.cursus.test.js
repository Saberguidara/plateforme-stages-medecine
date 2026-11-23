const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { stagesDuCursus, periodeDesDates } = require('../services/import/cursus');
const { lireClasseur } = require('../services/import/excel');
const { analyserClasseur } = require('../services/import/registres');
const { enregistrerAnalyse } = require('../services/import/enregistrer');

// Colonnes d'un trimestre, telles que lues dans l'entête « Du … au … »
const TRIMESTRES = {
    T1: ['01/01', '31/03'], T2: ['01/04', '30/06'], T3: ['01/07', '30/09'], T4: ['01/10', '31/12']
};
const T = (periode, annee) => ({ periode, debut: TRIMESTRES[periode][0], fin: TRIMESTRES[periode][1], annee });

const resume = (stages) => stages.map((s) => `${s.periode} ${s.annee} ${s.service} @ ${s.hopital}`).sort();

describe('Registre complet - découpage en fiches', () => {
    it('reconnaît les périodes à partir des dates exactes', () => {
        expect(periodeDesDates('01/10', '15/11')).toBe('T4A');
        expect(periodeDesDates('16/11', '31/12')).toBe('T4B');
        expect(periodeDesDates('01/07', '31/12')).toBe('S2');
        expect(periodeDesDates('01/07', '30/09')).toBe('T3');
        expect(periodeDesDates('01/07', '20/08')).toBeNull();
    });

    it('fusionne un même stage sur les deux trimestres d\'un semestre, sinon un stage par trimestre', () => {
        const { stages } = stagesDuCursus([
            { trimestre: T('T1', 2026), service: 'Médecine d’Urgence', hopital: 'Mohamed Ben Sassi - Gabès' },
            { trimestre: T('T2', 2026), service: 'Médecine d’Urgence', hopital: 'Mohamed Ben Sassi - Gabès' },
            { trimestre: T('T3', 2026), service: 'Psychiatrie', hopital: 'Mongi Slim - La Marsa' },
            { trimestre: T('T4', 2026), service: 'Cardiologie', hopital: 'Hédi Chaker - Sfax' }
        ]);
        expect(resume(stages)).toEqual([
            'S1 2026 Médecine d’Urgence @ Mohamed Ben Sassi - Gabès',
            'T3 2026 Psychiatrie @ Mongi Slim - La Marsa',
            'T4 2026 Cardiologie @ Hédi Chaker - Sfax'
        ]);
    });

    it('sépare les stages de 45 jours en deux fiches, avec un hôpital commun ou un par ligne', () => {
        const commun = stagesDuCursus([{
            trimestre: T('T2', 2026),
            service: 'Oto-Rhino-Laryngologie (01/04–15/05)\nDermatologie (16/05–30/06)',
            hopital: 'Habib Thameur - Tunis'
        }]);
        expect(resume(commun.stages)).toEqual([
            'T2A 2026 Oto-Rhino-Laryngologie @ Habib Thameur - Tunis',
            'T2B 2026 Dermatologie @ Habib Thameur - Tunis'
        ]);
        const separes = stagesDuCursus([{
            trimestre: T('T4', 2026),
            service: 'Dermatologie (01/10–15/11)\nOto-Rhino-Laryngologie (16/11–31/12)',
            hopital: 'Habib Thameur - Tunis\nTaher Maamouri - Nabeul'
        }]);
        expect(resume(separes.stages)).toEqual([
            'T4A 2026 Dermatologie @ Habib Thameur - Tunis',
            'T4B 2026 Oto-Rhino-Laryngologie @ Taher Maamouri - Nabeul'
        ]);
    });

    it('garde les stages en parallèle et ne double pas un semestre répété dans le trimestre suivant', () => {
        const { stages } = stagesDuCursus([
            { trimestre: T('T3', 2025), service: 'Psychiatrie B (01/07–30/09)\nORL (01/07–31/12)', hopital: 'Hédi Chaker - Sfax\nHabib Bourguiba - Sfax' },
            { trimestre: T('T4', 2025), service: 'ORL', hopital: 'Habib Bourguiba - Sfax' }
        ]);
        expect(resume(stages)).toEqual([
            'S2 2025 ORL @ Habib Bourguiba - Sfax',
            'T3 2025 Psychiatrie B @ Hédi Chaker - Sfax'
        ]);

        const csb = stagesDuCursus([
            { trimestre: T('T3', 2025), service: 'CSB Hencha (01/07–31/12)\nCSB Amra (01/07–30/09)', hopital: 'DRS Sfax\nDRS Sfax' },
            { trimestre: T('T4', 2025), service: 'CSB Hencha (01/07–31/12)\nCSB Amra (01/10–31/12)', hopital: 'DRS Sfax\nDRS Sfax' }
        ]);
        expect(resume(csb.stages)).toEqual(['S2 2025 CSB Hencha @ DRS Sfax', 'T3 2025 CSB Amra @ DRS Sfax', 'T4 2025 CSB Amra @ DRS Sfax']);
    });

    it('ne crée pas de fiche pour une cellule sans hôpital (mobilité, mutation, report…)', () => {
        const r = stagesDuCursus([
            { trimestre: T('T1', 2026), service: 'Mutation à Tunis', hopital: '' },
            { trimestre: T('T2', 2026), service: 'Stage reporté', hopital: null }
        ]);
        expect(r.stages).toEqual([]);
        expect(r.situations).toEqual(['Mutation à Tunis', 'Stage reporté']);
    });

    it('signale des dates qui ne correspondent à aucune période', () => {
        const r = stagesDuCursus([{ trimestre: T('T3', 2026), service: 'Pédiatrie (01/07–20/08)', hopital: 'Hôpital A' }]);
        expect(r.anomalies).toHaveLength(1);
        expect(resume(r.stages)).toEqual(['T3 2026 Pédiatrie @ Hôpital A']);
    });
});

describe('Registre complet - lecture du classeur', () => {
    let dossier;
    beforeAll(() => { dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'cursus-')); });
    afterAll(() => fs.rmSync(dossier, { recursive: true, force: true }));

    // Classeur au format du registre, avec un commentaire rangé comme le font openpyxl et les scripts
    // de mise à jour (xl/comments/comment1.xml, lien absolu) : exceljs seul plante sur ce fichier.
    async function registre() {
        const classeur = new ExcelJS.Workbook();
        const f = classeur.addWorksheet('Jan 2026 - RMF');
        const plages = ['Du 01/01/2026 au 31/03/2026', 'Du 01/04/2026 au 30/06/2026', 'Du 01/07/2026 au 30/09/2026', 'Du 01/10/2026 au 31/12/2026'];
        f.addRow(Array(14).fill('Médecine de Famille — Résidents (RMF) — Promotion Janvier 2026'));
        f.addRow(['N°', 'NOM & PRÉNOM', 'IDENTIFIANT', 'CLASSEMENT', 'FACULTÉ', 'REMARQUES', ...plages.flatMap((p) => [p, p])]);
        f.addRow(['', '', '', '', '', '', ...plages.flatMap(() => ['Service', 'CHU / Structure'])]);
        f.addRow([1, 'RESIDENT UN', '11141105', 726, 'SFAX', '',
            'Médecine d’Urgence', 'Mohamed Ben Sassi - Gabès', 'Médecine d’Urgence', 'Mohamed Ben Sassi - Gabès',
            'Psychiatrie', 'Mongi Slim - La Marsa',
            'Dermatologie (01/10–15/11)\nORL (16/11–31/12)', 'Habib Thameur - Tunis']);
        f.addRow([2, 'RESIDENT DEUX', '13438007', 900, 'TUNIS', '', 'Mutation à Tunis', '', 'Mutation à Tunis', '']);
        f.getCell('K4').note = 'Source : choix juin 2026';
        const chemin = path.join(dossier, 'registre.xlsx');
        await classeur.xlsx.writeFile(chemin);

        const zip = await JSZip.loadAsync(fs.readFileSync(chemin));
        const commentaires = Object.keys(zip.files).find((n) => /^xl\/comments\d*\.xml$/.test(n));
        zip.file('xl/comments/comment1.xml', await zip.file(commentaires).async('string'));
        zip.remove(commentaires);
        const rels = 'xl/worksheets/_rels/sheet1.xml.rels';
        zip.file(rels, (await zip.file(rels).async('string')).replace(/Target="[^"]*comments\d*\.xml"/, 'Target="/xl/comments/comment1.xml"'));
        fs.writeFileSync(chemin, await zip.generateAsync({ type: 'nodebuffer' }));
        return chemin;
    }

    it('lit un classeur dont les commentaires sont rangés ailleurs et en tire les fiches', async () => {
        const feuilles = await lireClasseur(await registre());
        const { residents, rapport, bilan } = analyserClasseur(feuilles, 'Base_Plateforme_Stages.xlsx', 'medecine-famille');

        expect(rapport[0]).toMatchObject({ format: 'registre complet', promotion: 2026, annee: 2026, semestre: 'S2', retenues: 2, fiches: 4 });
        // Résidents d'autres facultés gardés (choix de l'administration)
        expect(residents.map((r) => [r.cin, r.faculte, r.niveau])).toEqual([['11141105', 'FMSfax', 1], ['13438007', 'FMTunis', 1]]);
        expect(resume(residents[0].stages)).toEqual([
            'S1 2026 Médecine d’Urgence @ Mohamed Ben Sassi - Gabès',
            'T3 2026 Psychiatrie @ Mongi Slim - La Marsa',
            'T4A 2026 Dermatologie @ Habib Thameur - Tunis',
            'T4B 2026 ORL @ Habib Thameur - Tunis'
        ]);
        expect(bilan.situations).toEqual({ 'Mutation à Tunis': 2 });
        expect(bilan.sansStage).toBe(1);
    });
});

describe('Registre complet - enregistrement', () => {
    // Connexion de transaction simulée : répond selon la requête SQL.
    function connexion(fichesEnBase) {
        const appels = [];
        const query = jest.fn(async (sql, params) => {
            appels.push({ sql, params });
            if (/^SELECT id, cin, email FROM residents/.test(sql)) return [[{ id: 7, cin: '11141105', email: 'a@b.tn' }]];
            if (/FROM formulaires_stage WHERE resident_id IN/.test(sql)) return [fichesEnBase];
            if (/^INSERT IGNORE INTO formulaires_stage/.test(sql)) return [{ affectedRows: params[0].length }];
            return [{ affectedRows: 1 }];
        });
        return { query, appels };
    }

    const analyse = {
        emails: [],
        residents: [{
            cin: '11141105', nomPrenom: 'RESIDENT UN', email: null, faculte: 'FMSfax', niveau: 1, annee: 2026,
            stages: [
                { periode: 'S1', annee: 2026, service: 'Médecine d’Urgence', hopital: 'Mohamed Ben Sassi - Gabès' },
                { periode: 'T3', annee: 2026, service: 'Psychiatrie', hopital: 'Mongi Slim - La Marsa' },
                { periode: 'T4A', annee: 2026, service: 'Dermatologie', hopital: 'Habib Thameur - Tunis' },
                { periode: 'S2', annee: 2025, service: 'CSB Hencha', hopital: 'DRS Sfax' }
            ]
        }]
    };

    it('ajoute les nouveaux stages, corrige les fiches non retouchées et garde les fiches retouchées', async () => {
        const c = connexion([
            // identique (accents et apostrophe près) : rien ne change
            { id: 1, resident_id: 7, periode: 'S1', annee: 2026, service: "Medecine d'urgence", hopital: 'Mohamed Ben Sassi - Gabès', modifie_le: null },
            // différente, jamais retouchée : corrigée
            { id: 2, resident_id: 7, periode: 'T3', annee: 2026, service: 'PSYCHIATRIE', hopital: 'HOP MONGI SLIM', modifie_le: null },
            // différente mais retouchée à la main : gardée, signalée
            { id: 3, resident_id: 7, periode: 'S2', annee: 2025, service: 'CSB HENCHA', hopital: 'DIR REG SFAX', modifie_le: new Date() },
            // absente du fichier : gardée
            { id: 4, resident_id: 7, periode: 'R2', annee: 2026, service: 'Urgences', hopital: 'Habib Bourguiba - Sfax', modifie_le: null }
        ]);
        const r = await enregistrerAnalyse(c, JSON.parse(JSON.stringify(analyse)), { specialite: { libelle: 'Médecine de famille' }, importId: 42 });

        const correction = c.appels.find((a) => /^UPDATE formulaires_stage/.test(a.sql));
        expect(correction.sql).toContain('modifie_le = modifie_le');
        expect(correction.params).toEqual(['Psychiatrie', 'Mongi Slim - La Marsa', 2]);
        const insertion = c.appels.find((a) => /^INSERT IGNORE INTO formulaires_stage/.test(a.sql));
        expect(insertion.params[0]).toEqual([[7, 'T4A', 2026, 'Dermatologie', 'Habib Thameur - Tunis', 42]]);

        expect(r.corrections).toEqual([{ id: 2, service: 'PSYCHIATRIE', hopital: 'HOP MONGI SLIM' }]);
        expect(r.conflits).toEqual([expect.objectContaining({ periode: 'S2', annee: 2025, base: { service: 'CSB HENCHA', hopital: 'DIR REG SFAX' } })]);
        expect(r.resume).toMatchObject({ fichesCreees: 1, fichesExistantes: 1, fichesCorrigees: 1, fichesConservees: 1, fichesHorsFichier: 1 });
    });

    it('crée une fiche par stage en parallèle sur une même période', async () => {
        const c = connexion([
            { id: 9, resident_id: 7, periode: 'S2', annee: 2025, service: 'CSB Hencha', hopital: 'DRS Sfax', modifie_le: null }
        ]);
        const parallele = JSON.parse(JSON.stringify(analyse));
        parallele.residents[0].stages = [
            { periode: 'S2', annee: 2025, service: 'CSB Hencha', hopital: 'DRS Sfax' },
            { periode: 'S2', annee: 2025, service: 'CSB Amra', hopital: 'DRS Sfax' }
        ];
        const r = await enregistrerAnalyse(c, parallele, { specialite: { libelle: 'Médecine de famille' }, importId: 43 });
        expect(c.appels.some((a) => /^UPDATE formulaires_stage/.test(a.sql))).toBe(false);
        expect(c.appels.find((a) => /^INSERT IGNORE INTO formulaires_stage/.test(a.sql)).params[0])
            .toEqual([[7, 'S2', 2025, 'CSB Amra', 'DRS Sfax', 43]]);
        expect(r.resume).toMatchObject({ fichesCreees: 1, fichesExistantes: 1, fichesCorrigees: 0 });
    });
});
