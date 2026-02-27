const fs = require('fs');
const path = require('path');
const logoPath = 'C:\\Users\\saber\\.gemini\\antigravity\\brain\\83007e4c-3afe-4e85-8aa6-3ab7f72ecb03\\media__1772142654725.png';
const base64Image = fs.readFileSync(logoPath, { encoding: 'base64' });
const dir = path.join(__dirname, 'utils');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'logos.js'), 'module.exports = { faculteLogo: "data:image/png;base64,' + base64Image + '" };');
console.log('Logo encoded');
