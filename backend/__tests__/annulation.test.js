const { annulabilite, annulerAction, ErreurAnnulation } = require('../services/annulation');

// Connexion de transaction simulée : chaque requête est routée selon son texte SQL.
function connexion(routes) {
    const appels = [];
    const query = jest.fn(async (sql, params) => {
        appels.push({ sql, params });
        for (const [motif, reponse] of routes) {
            if (motif.test(sql)) return typeof reponse === 'function' ? reponse(sql, params) : reponse;
        }
        return [{ affectedRows: 1 }];
    });
    return { query, appels, sql: (motif) => appels.filter((a) => motif.test(a.sql)) };
}

const REQ = { admin: { id: 1, login: 'admin_sfax' } };
const entree = (champs) => ({ id: 10, admin_login: 'admin_sfax', resident_id: 7, entite_id: 5, annule_le: null, avant: null, apres: null, ...champs });

describe('Annulation depuis le journal', () => {
    it('dit ce qui peut être annulé, et pourquoi pas sinon', () => {
        expect(annulabilite(entree({ action: 'modification', entite: 'fiche' })).annulable).toBe(true);
        expect(annulabilite(entree({ action: 'notification', entite: 'notification' }))).toEqual({ annulable: false, raison: 'Les e-mails sont déjà partis.' });
        expect(annulabilite(entree({ action: 'modification', entite: 'fiche', annule_le: new Date() })).raison).toBe('Déjà annulée.');
        expect(annulabilite(entree({ action: 'import', entite: 'import', apres: { rechargementComplet: true } })).annulable).toBe(false);
        // Fusion d'avant le journal détaillé : fiches concernées inconnues
        expect(annulabilite(entree({ action: 'fusion', entite: 'referentiel', avant: { variantes: ['A'] } })).annulable).toBe(false);
    });

    it('rétablit une fiche modifiée, marque l\'action annulée et journalise l\'annulation', async () => {
        const c = connexion([
            [/^SELECT \* FROM journal_actions/, [[entree({
                action: 'modification', entite: 'fiche',
                avant: { periode: 'S1', annee: 2026, service: 'Cardio', hopital: 'CHU' },
                apres: JSON.stringify({ periode: 'T1', annee: 2026, service: 'Onco', hopital: 'CHU' })
            })]]],
            [/^SELECT \* FROM formulaires_stage/, [[{ id: 5, periode: 'T1', annee: 2026, service: 'Onco', hopital: 'CHU' }]]]
        ]);
        const r = await annulerAction(c, 10, REQ);

        expect(r.message).toContain('S1 2026');
        expect(c.sql(/^UPDATE formulaires_stage/)[0].params).toEqual(['S1', 2026, 'Cardio', 'CHU', 5]);
        expect(c.sql(/SET annule_le = NOW\(\)/)[0].params).toEqual(['admin_sfax', 10]);
        const journal = c.sql(/INSERT INTO journal_actions/)[0].params;
        expect(journal).toEqual(expect.arrayContaining(['annulation', 'fiche', 5, 7, 10]));
    });

    it('refuse d\'écraser une fiche modifiée depuis', async () => {
        const c = connexion([
            [/^SELECT \* FROM journal_actions/, [[entree({
                action: 'modification', entite: 'fiche',
                avant: { periode: 'S1', annee: 2026, service: 'Cardio', hopital: 'CHU' },
                apres: { periode: 'T1', annee: 2026, service: 'Onco', hopital: 'CHU' }
            })]]],
            [/^SELECT \* FROM formulaires_stage/, [[{ id: 5, periode: 'T1', annee: 2026, service: 'Pneumo', hopital: 'CHU' }]]]
        ]);
        await expect(annulerAction(c, 10, REQ)).rejects.toMatchObject({ statut: 409 });
        expect(c.sql(/^UPDATE/)).toHaveLength(0);
    });

    it('rétablit un résident supprimé avec ses fiches', async () => {
        const c = connexion([
            [/^SELECT \* FROM journal_actions/, [[entree({
                action: 'suppression', entite: 'resident', entite_id: 7,
                avant: { cin: '11107076', nom_prenom: 'ABID ASMA', email: 'a@b.tn', specialite: 'Médecine de famille', promotion: 2025,
                    fiches: [{ id: 90, periode: 'S1', annee: 2025, service: 'Urgences', hopital: 'Hôpital A', url_pdf: null, import_id: 3 }] }
            })]]],
            [/^SELECT id, nom_prenom FROM residents/, [[]]],
            [/^SELECT id FROM formulaires_stage WHERE id/, [[]]]
        ]);
        const r = await annulerAction(c, 10, REQ);
        expect(c.sql(/^INSERT INTO residents/)[0].params.slice(0, 3)).toEqual([7, '11107076', 'ABID ASMA']);
        expect(c.sql(/INSERT IGNORE INTO formulaires_stage/)[0].params).toEqual([90, 7, 'S1', 2025, 'Urgences', 'Hôpital A', null, 3]);
        expect(r.message).toContain('ABID ASMA et 1 fiche(s) rétablis');
    });

    it('refuse de rétablir un résident dont le CIN est de nouveau inscrit', async () => {
        const c = connexion([
            [/^SELECT \* FROM journal_actions/, [[entree({ action: 'suppression', entite: 'resident', avant: { cin: '11107076', nom_prenom: 'ABID ASMA' } })]]],
            [/^SELECT id, nom_prenom FROM residents/, [[{ id: 99, nom_prenom: 'ABID ASMA' }]]]
        ]);
        await expect(annulerAction(c, 10, REQ)).rejects.toBeInstanceOf(ErreurAnnulation);
    });

    it("annule une fusion fiche par fiche, sans toucher aux fiches modifiées depuis", async () => {
        const c = connexion([
            [/^SELECT \* FROM journal_actions/, [[entree({
                action: 'fusion', entite: 'referentiel', resident_id: null, entite_id: null,
                avant: { type: 'hopital', variantes: ['HEDI CHAKER'], fiches: [{ id: 1, valeur: 'HEDI CHAKER' }, { id: 2, valeur: 'HEDI CHAKER' }] },
                apres: { type: 'hopital', valeur: 'Hédi Chaker - Sfax', fichesModifiees: 2 }
            })]]],
            [/^UPDATE formulaires_stage SET hopital/, (sql, params) => [{ affectedRows: params[1] === 1 ? 1 : 0 }]]
        ]);
        const r = await annulerAction(c, 10, REQ);
        expect(c.sql(/^UPDATE formulaires_stage SET hopital/)[0].params).toEqual(['HEDI CHAKER', 1, 'Hédi Chaker - Sfax']);
        expect(r.message).toContain('1 fiche(s) ont retrouvé leur écriture');
        expect(r.message).toContain('1 modifiée(s) ou supprimée(s) depuis');
    });

    it("n'annule pas deux fois la même action", async () => {
        const c = connexion([[/^SELECT \* FROM journal_actions/, [[entree({ action: 'creation', entite: 'fiche', annule_le: new Date() })]]]]);
        await expect(annulerAction(c, 10, REQ)).rejects.toMatchObject({ statut: 409, message: 'Déjà annulée.' });
    });
});
