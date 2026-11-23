// Comportements du navigateur, API simulée : aucune requête d'écriture n'atteint le serveur.
const { test, expect } = require('@playwright/test');

async function demanderCode(page) {
    await page.goto('/login');
    await page.getByLabel('Numéro de CIN / Passeport').fill('ZZ000000');
    await page.getByLabel('Adresse E-mail').fill('test@example.com');
    await page.getByRole('button', { name: /recevoir mon code/i }).click();
}

test.describe('Connexion et réveil du serveur (API simulée)', () => {
    test('le bandeau de réveil apparaît si le serveur tarde, puis le code est demandé', async ({ page }) => {
        await page.route('**/api/auth/login/request-otp', async (route) => {
            await new Promise((r) => setTimeout(r, 6500));
            await route.fulfill({ json: { success: true, message: 'Code envoyé' } });
        });

        await demanderCode(page);

        const bandeau = page.getByText('Démarrage du serveur…');
        await expect(bandeau).toBeVisible();
        await expect(page.getByLabel(/Code de sécurité/)).toBeVisible({ timeout: 15000 });
        await expect(bandeau).toBeHidden();
    });

    test('un code faux affiche une erreur sans quitter la page', async ({ page }) => {
        await page.route('**/api/auth/login/request-otp', (route) => route.fulfill({ json: { success: true, message: 'Code envoyé' } }));
        await page.route('**/api/auth/login/verify-otp', (route) => route.fulfill({ status: 400, json: { success: false, message: 'Code incorrect' } }));

        await demanderCode(page);

        const code = page.getByLabel(/Code de sécurité/);
        await code.fill('000000');
        await code.press('Enter');
        await expect(page.getByText('Code incorrect').first()).toBeVisible();
        await expect(page).toHaveURL(/\/login/);
    });

    test("une lecture est retentée quand l'hébergeur répond 503 pendant le réveil", async ({ page }) => {
        let appels = 0;
        await page.route('**/api/contact', (route) => {
            appels += 1;
            return appels === 1
                ? route.fulfill({ status: 503, body: '' })
                : route.fulfill({ json: { email: 'reveil@exemple.tn', telephone: null, adresse: null, horaires: null } });
        });

        await page.goto('/aide');
        await expect(page.getByText('reveil@exemple.tn').first()).toBeVisible({ timeout: 15000 });
        expect(appels).toBe(2);
    });
});
