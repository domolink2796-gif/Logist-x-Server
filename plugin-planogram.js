const { Readable } = require('stream');

module.exports = (app, ctx) => {
    // Проверяем, всё ли пришло из сервера
    const drive = ctx.drive;
    const getOrCreateFolder = ctx.getOrCreateFolder;
    const readDatabase = ctx.readDatabase;
    const readPlanogramDb = ctx.readPlanogramDb;
    const savePlanogramDb = ctx.savePlanogramDb;

    app.get('/get-planogram', async (req, res) => {
        try {
            const { addr, key } = req.query;
            if (!drive || !readDatabase) return res.status(500).json({ error: "Система не готова" });

            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            if (!kData || !kData.folderId) return res.json({ exists: false });

            const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
            const fileName = addr.trim() + ".jpg";

            const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id, webViewLink, webContentLink)' });
            
            res.json({ 
                exists: search.data.files.length > 0, 
                url: search.data.files.length > 0 ? (search.data.files[0].webContentLink || search.data.files[0].webViewLink) : null 
            });
        } catch (e) { 
            console.error("Ошибка GET планограммы:", e.message);
            res.status(500).json({ error: e.message }); 
        }
    });

    app.post('/upload-planogram', async (req, res) => {
        try {
            const { addr, image, key } = req.body;
            if (!drive || !getOrCreateFolder) return res.status(500).json({ error: "Система загрузки не готова" });

            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            if (!kData || !kData.folderId) return res.status(403).json({ error: "Нет доступа" });

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
            
            // Пытаемся обновить базу планограмм, если функции доступны
            if (readPlanogramDb && savePlanogramDb) {
                const db = await readPlanogramDb(kData.folderId);
                db[addr.trim()] = true;
                await savePlanogramDb(kData.folderId, db);
            }
            
            res.json({ success: true });
        } catch (e) { 
            console.error("Ошибка POST планограммы:", e.message);
            res.status(500).json({ error: e.message }); 
        }
    });
};
