const multer = require('multer');
const path = require('path');
const fs = require('fs');

const tempDir = path.join(__dirname, '../temp_uploads');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, tempDir),
        filename: (req, file, cb) => cb(null, file.fieldname + '-' + Date.now() + '.xlsx')
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = path.extname(file.originalname).toLowerCase() === '.xlsx';
        cb(ok ? null : new Error('Format refusé : envoyez un fichier Excel .xlsx.'), ok);
    }
});

module.exports = upload;
