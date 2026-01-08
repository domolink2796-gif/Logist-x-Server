const { Readable } = require('stream');

module.exports = (app, ctx) => {
    // Инструменты от сервера
    const { drive, getOrCreateFolder, readDatabase } = ctx;

    app.get('/get-planogram', async (req, res) => {
        try {
            const { addr, key } = req.query;
            const keys = await readDatabase();
            // Ищем клиента по ключу
            const kData = keys.find(k => k.key === key);
            
            // Если клиент не найден или у него нет папки - от ворот поворот
            if (!kData || !kData.folderId) return res.json({ exists: false });

            // Ищем папку PLANOGRAMS строго ВНУТРИ папки этого клиента
            const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
            const fileName = addr.trim() + ".jpg";

            const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id, webViewLink, webContentLink)' });
            
            if (search.data.files && search.data.files.length > 0) {
                res.json({ 
                    exists: true, 
                    url: search.data.files[0].webViewLink,
                    webContentLink: search.data.files[0].webContentLink 
                });
            } else {
                res.json({ exists: false });
            }
        } catch (e) {
            res.json({ exists: false });
        }
    });

    app.post('/upload-planogram', async (req, res) => {
        try {
            const { addr, image, key } = req.body;
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            
            if (!kData || !kData.folderId) return res.status(403).json({ error: "Нет доступа к папке клиента" });

            // Создаем/ищем папку PLANOGRAMS в папке КЛИЕНТА
            const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
            const fileName = addr.trim() + ".jpg";
            const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');

            const media = { mimeType: 'image/jpeg', body: Readable.from(buf) };
            const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
            const existing = await drive.files.list({ q });

            if (existing.data.files && existing.data.files.length > 0) {
                await drive.files.update({ fileId: existing.data.files[0].id, media });
            } else {
                const f = await drive.files.create({ 
                    resource: { name: fileName, parents: [planFolderId] }, 
                    media, 
                    fields: 'id' 
                });
                await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
};
