const { Readable } = require('stream');

module.exports = (app, ctx) => {
    const { drive, getOrCreateFolder, readDatabase } = ctx;

    app.get('/get-planogram', async (req, res) => {
        try {
            const { addr, key } = req.query;
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            if (!kData || !kData.folderId) return res.json({ exists: false });

            const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
            const fileName = addr.trim() + ".jpg";

            const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id, webViewLink, webContentLink)' });
            
            if (search.data.files.length > 0) {
                res.json({ 
                    exists: true, 
                    url: search.data.files[0].webContentLink || search.data.files[0].webViewLink 
                });
            } else {
                res.json({ exists: false });
            }
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/upload-planogram', async (req, res) => {
        try {
            const { addr, image, key } = req.body;
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            if (!kData || !kData.folderId) return res.status(403).json({ error: "No access" });

            const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
            const fileName = addr.trim() + ".jpg";
            const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');

            const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
            const existing = await drive.files.list({ q });
            
            if (existing.data.files.length > 0) {
                await drive.files.update({ 
                    fileId: existing.data.files[0].id, 
                    media: { mimeType: 'image/jpeg', body: Readable.from(buf) } 
                });
            } else {
                const f = await drive.files.create({ 
                    resource: { name: fileName, parents: [planFolderId] }, 
                    media: { mimeType: 'image/jpeg', body: Readable.from(buf) }, 
                    fields: 'id' 
                });
                await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
            }
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
};
