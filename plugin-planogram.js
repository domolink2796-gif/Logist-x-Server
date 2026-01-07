const { Readable } = require('stream');

module.exports = (app, ctx) => {
    const { drive, getOrCreateFolder, readDatabase, readPlanogramDb } = ctx;

    app.get('/get-planogram', async (req, res) => {
        try {
            const { addr, key } = req.query;
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            if (!kData || !kData.folderId) return res.json({ exists: false });

            const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
            const cleanAddr = addr.trim();
            const fileName = cleanAddr + ".jpg";

            // 1. Сначала ищем в новой папке по прямому имени
            const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id, webViewLink, webContent
