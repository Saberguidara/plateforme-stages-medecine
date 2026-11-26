// Pages publiques, en lecture seule : ces tests tournent aussi sur le site déployé.
const { test, expect } = require('@playwright/test');

test.describe('Pages publiques', () => {
    test("la page de connexion s'affiche sans erreur, formulaire visible et sans défilement horizontal", async ({ page }) => {
        const erreurs = [];
        page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
        page.on('pageerror', (e) => erreurs.push(e.message));

        await page.goto('/login');
        const cin = page.getByLabel('Numéro de CIN / Passeport');
        await expect(cin).toBeVisible();
        await expect(page.getByLabel('Adresse E-mail')).toBeVisible();
        await expect(page.getByRole('button', { name: /recevoir mon code/i })).toBeVisible();

        // L'audit relevait un premier champ sous la ligne de flottaison sur téléphone.
        const boite = await cin.boundingBox();
        expect(boite.y + boite.height).toBeLessThanOrEqual(page.viewportSize().height);

        const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(debordement).toBeLessThanOrEqual(0);
        expect(erreurs).toEqual([]);
    });

    test("une adresse profonde charge l'application, une adresse inconnue renvoie à la connexion", async ({ page }) => {
        await page.goto('/admin/connexion');
        await expect(page.getByLabel('Identifiant')).toBeVisible();

        await page.goto('/page-qui-nexiste-pas');
        await expect(page).toHaveURL(/\/login$/);
    });

    test('les espaces protégés renvoient à la connexion', async ({ page }) => {
        await page.goto('/mes-stages');
        await expect(page).toHaveURL(/\/login/);

        await page.goto('/admin/residents');
        await expect(page).toHaveURL(/\/admin\/connexion/);
    });

    test("la page d'aide est accessible sans connexion", async ({ page }) => {
        await page.goto('/aide');
        await expect(page.getByRole('heading').first()).toBeVisible();
        await expect(page).toHaveURL(/\/aide$/);
    });

    test("l'API refuse sans jeton et répond en JSON sur une route inconnue", async ({ request }) => {
        expect((await request.get('/api/contact')).status()).toBe(200);
        expect((await request.get('/api/admin/residents')).status()).toBe(401);
        expect((await request.post('/api/generate-pdf', { data: { ficheId: 1 } })).status()).toBe(401);

        const inconnue = await request.get('/api/nexiste-pas');
        expect(inconnue.status()).toBe(404);
        expect(inconnue.headers()['content-type']).toContain('application/json');
    });

    test('les en-têtes de sécurité et de cache sont en place', async ({ request }) => {
        const page = await request.get('/login');
        const entetes = page.headers();
        expect(entetes['content-security-policy']).toContain("frame-src 'self' blob:");
        expect(entetes['x-content-type-options']).toBe('nosniff');
        expect(entetes['cache-control']).toContain('no-cache');

        const script = (await page.text()).match(/src="(main-[A-Z0-9]+\.js)"/)[1];
        const fichier = await request.get('/' + script);
        expect(fichier.headers()['cache-control']).toContain('immutable');
    });
});
