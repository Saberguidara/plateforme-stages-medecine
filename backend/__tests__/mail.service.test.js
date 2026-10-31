// Envoi par l'API HTTP de Brevo : seule voie possible sur l'hébergement gratuit qui bloque les ports SMTP.
describe('Service e-mail', () => {
    const envInitial = { ...process.env };

    afterEach(() => {
        process.env = { ...envInitial };
        jest.resetModules();
        jest.restoreAllMocks();
    });

    it("passe par l'API HTTP de Brevo quand BREVO_API_KEY est définie", async () => {
        Object.assign(process.env, {
            BREVO_API_KEY: 'xkeysib-test', BREVO_USER: 'smtp@brevo', EMAIL_FROM: 'stages@fac.tn', EMAIL_FROM_NAME: 'Stages'
        });
        const appel = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
        const { envoyerMail } = require('../services/mail');

        await envoyerMail({ to: 'resident@exemple.tn', subject: 'Code', html: '<p>123456</p>' });

        const [url, options] = appel.mock.calls[0];
        expect(url).toBe('https://api.brevo.com/v3/smtp/email');
        expect(options.headers['api-key']).toBe('xkeysib-test');
        expect(JSON.parse(options.body)).toEqual({
            sender: { name: 'Stages', email: 'stages@fac.tn' },
            to: [{ email: 'resident@exemple.tn' }],
            subject: 'Code',
            htmlContent: '<p>123456</p>'
        });
    });

    it("signale un refus de l'API Brevo", async () => {
        process.env.BREVO_API_KEY = 'xkeysib-test';
        jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, text: async () => 'Key not found' });
        const { envoyerMail } = require('../services/mail');

        await expect(envoyerMail({ to: 'a@b.tn', subject: 's', html: 'h' })).rejects.toThrow('Brevo API 401 : Key not found');
    });
});
