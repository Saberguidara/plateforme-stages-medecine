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
        filename: (req, file, cb) => cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
});

module.exports = upload;
