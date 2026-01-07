module.exports = (app, ctx) => {
    // Вытаскиваем только самые базовые инструменты
    const { drive, google } = ctx;

    // Внутренняя функция поиска папки (чтобы не зависеть от основы)
    async function getFolder(name, parentId) {
        try {
            const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
            const res = await drive.files.list({ q, fields: 'files(id)' });
            if (res.data.files.length > 0) return res.data.files[0].id;
            const file = await drive.files.create({
                resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
                fields: 'id'
            });
            await drive.permissions.create({ fileId: file.data.id, resource: { role: 'writer', type: 'anyone' } });
            return file.data.id;
        } catch (e) { return parentId; }
    }

    app.get('/get-planogram', async (req, res) => {
        try {
            const { addr, key } = req.query;
            const keys = await ctx.readDatabase();
            const kData = keys.find(k => k.key === key);
            if (!kData || !kData.folderId) return res.json({ exists: false });

            const planFolderId = await getFolder("PLANOGRAMS", kData.folderId);
            const fileName = addr.trim() + ".jpg";

            const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id, webViewLink, webContentLink)' });
            
            if (search.data.files.length > 0) {
                res.json({ exists: true, url: search.data.files[0].webContentLink || search.data.files[0].webViewLink });
            } else {
                res.json({ exists: false });
            }
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/upload-planogram', async (req, res) => {
        try {
            const { addr, image, key } = req.body;
            const keys = await ctx.readDatabase();
            const kData = keys.find(k => k.key === key);
            if (!kData || !kData.folderId) return res.status(403).json({ error: "Доступ запрещен" });

            const planFolderId = await getFolder("PLANOGRAMS", kData.folderId);
            const fileName = addr.trim() + ".jpg";
            const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');

            const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
            const existing = await drive.files.list({ q });
            
            if (existing.data.files.length > 0) {
                await drive.files.update({ 
                    fileId: existing.data.files[0].id, 
                    media: { mimeType: 'image/jpeg', body: require('stream').Readable.from(buf) } 
                });
            } else {
                const f = await drive.files.create({ 
                    resource: { name: fileName, parents: [planFolderId] }, 
                    media: { mimeType: 'image/jpeg', body: require('stream').Readable.from(buf) }, 
                    fields: 'id' 
                });
                await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
            }
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
};
