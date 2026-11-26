// @local : espaces connectés sur la base locale, avec des jetons de test. Ces tests ne modifient aucune donnée :
// le PDF du résident est simulé (la route réelle enregistre le téléchargement) et l'aperçu admin n'écrit rien.
const { test, expect } = require('@playwright/test');
const { donneesLocales, connecterAdmin, connecterResident, lecteurPdf } = require('./outils');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

async function boutonApercuAdmin(page) {
    const { resident } = await donneesLocales();
    await page.goto('/admin/residents/' + resident.id);
    return page.getByRole('button', { name: /^Aperçu de la fiche/ }).first();
}

test.describe('Espace administration @local', () => {
    for (const adresse of ['tableau-de-bord', 'residents', 'imports', 'historique', 'referentiels', 'exports', 'comptes']) {
        test(`la page ${adresse} s'affiche sans erreur`, async ({ page }) => {
            const erreurs = [];
            page.on('pageerror', (e) => erreurs.push(e.message));
            page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) erreurs.push(r.status() + ' ' + r.url()); });
            await connecterAdmin(page);

            await page.goto('/admin/' + adresse);
            await expect(page).toHaveURL(new RegExp(adresse));
            await expect(page.getByRole('heading').first()).toBeVisible();
            await page.waitForLoadState('networkidle');
            expect(erreurs).toEqual([]);

            const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(debordement).toBeLessThanOrEqual(0);
        });
    }

    test("avec lecteur PDF, l'aperçu réel s'affiche dans la page", async ({ page }) => {
        await lecteurPdf(page, true);
        await connecterAdmin(page);

        const apercu = await boutonApercuAdmin(page);
        const [reponse] = await Promise.all([page.waitForResponse('**/api/admin/apercu-pdf'), apercu.click()]);
        expect(reponse.status()).toBe(200);
        expect((await reponse.body()).subarray(0, 4).toString()).toBe('%PDF');
        await expect(page.locator('iframe.pdf-cadre')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Télécharger', exact: true })).toBeVisible();
    });

    test('sans lecteur PDF (Chrome Android), la fiche se télécharge', async ({ page }) => {
        await lecteurPdf(page, false);
        await connecterAdmin(page);

        const apercu = await boutonApercuAdmin(page);
        await apercu.click();
        await expect(page.getByText('Ce navigateur ne peut pas afficher la fiche dans la page.')).toBeVisible();
        await expect(page.locator('iframe.pdf-cadre')).toHaveCount(0);

        const [telechargement] = await Promise.all([
            page.waitForEvent('download'),
            page.getByRole('button', { name: 'Télécharger la fiche', exact: true }).click()
        ]);
        expect(telechargement.suggestedFilename()).toMatch(/\.pdf$/i);
    });
});

test.describe('Espace résident @local', () => {
    test('le résident voit son dossier et ses fiches, sans défilement horizontal', async ({ page }) => {
        const resident = await connecterResident(page);
        await page.goto('/mes-stages');
        await expect(page.getByRole('heading', { name: resident.nom_prenom })).toBeVisible();
        await expect(page.getByRole('button', { name: /Aperçu/ }).first()).toBeVisible();

        const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(debordement).toBeLessThanOrEqual(0);
    });

    test("l'aperçu sans lecteur PDF propose le téléchargement", async ({ page }) => {
        await page.route('**/api/generate-pdf', (route) => route.fulfill({ contentType: 'application/pdf', body: PDF }));
        await lecteurPdf(page, false);
        await connecterResident(page);

        await page.goto('/mes-stages');
        await page.getByRole('button', { name: /Aperçu/ }).first().click();
        await expect(page.getByRole('button', { name: 'Télécharger la fiche', exact: true })).toBeVisible();

        await page.getByRole('button', { name: "Fermer l'aperçu" }).click();
        await expect(page.getByRole('button', { name: 'Télécharger la fiche', exact: true })).toBeHidden();
    });

    test("le formulaire de signalement s'ouvre et s'annule", async ({ page }) => {
        await connecterResident(page);
        await page.goto('/mes-stages');
        await page.getByRole('button', { name: /Signaler une erreur sur la fiche/ }).first().click();
        const fenetre = page.getByRole('dialog');
        await expect(fenetre).toBeVisible();
        await fenetre.getByRole('button', { name: 'Annuler' }).click();
        await expect(fenetre).toBeHidden();
    });
});
