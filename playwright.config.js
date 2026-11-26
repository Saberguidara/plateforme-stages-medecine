// Tests de bout en bout. Par défaut : serveur local sur la base locale.
// BASE_URL=https://… : site déployé, seulement les tests sans jeton (ceux qui n'ont pas @local).
const { defineConfig, devices } = require('@playwright/test');

const PORT = 3210;
const distant = process.env.BASE_URL;

module.exports = defineConfig({
    testDir: './e2e',
    timeout: distant ? 120000 : 45000,
    expect: { timeout: 10000 },
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    grepInvert: distant ? /@local/ : undefined,
    use: {
        baseURL: distant || `http://localhost:${PORT}`,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure'
    },
    projects: [
        { name: 'ordinateur', use: { ...devices['Desktop Chrome'] } },
        { name: 'telephone', use: { ...devices['Pixel 7'] } }
    ],
    webServer: distant ? undefined : {
        command: 'npm run build --prefix frontend-stages && npm start',
        url: `http://localhost:${PORT}/api/contact`,
        env: { PORT: String(PORT) },
        timeout: 240000,
        reuseExistingServer: false
    }
});
