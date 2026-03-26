const puppeteer = require('puppeteer');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const purify = DOMPurify(window);
const { generateFicheHtml } = require('../services/pdf.service');

let browserInstance;
async function getBrowser() {
    if (!browserInstance || !browserInstance.connected) {
        browserInstance = await puppeteer.launch({ headless: true });
    }
    return browserInstance;
}

class Semaphore {
    constructor(max) {
        this.max = max;
        this.count = 0;
        this.queue = [];
    }

    async acquire() {
        if (this.count < this.max) {
            this.count++;
            return;
        }
        return new Promise(resolve => this.queue.push(resolve));
    }

    release() {
        if (this.queue.length > 0) {
            const resolve = this.queue.shift();
            resolve();
        } else {
            this.count--;
        }
    }
}
const pdfSemaphore = new Semaphore(3); // Limit to 3 concurrent pdf generations

function sanitizeObj(obj) {
    if (typeof obj === 'string') return purify.sanitize(obj);
    if (typeof obj === 'object' && obj !== null) {
        let newObj = Array.isArray(obj) ? [] : {};
        for (let key in obj) {
            newObj[key] = sanitizeObj(obj[key]);
        }
        return newObj;
    }
    return obj;
}

exports.generatePdf = async (req, res) => {
    let { resident, fiche } = req.body;
    resident = sanitizeObj(resident);
    fiche = sanitizeObj(fiche);
    let page;

    await pdfSemaphore.acquire();
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        const htmlContent = generateFicheHtml(resident, fiche);
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });

        await page.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);

    } catch (error) {
        if (page) await page.close().catch(() => { });
        console.error("Erreur Puppeteer :", error);
        res.status(500).json({ message: "Erreur lors de la génération du PDF" });
    } finally {
        pdfSemaphore.release();
    }
};
