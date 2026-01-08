const { Readable } = require('stream');

module.exports = (app, ctx) => {
    const { drive, getOrCreateFolder, readDatabase } = ctx;

    // 1. Получение планограммы (вызывается при выборе магазина)
    app.get('/get-planogram', async (req, res) => {
        try {
            const { addr, key, city } = req.query; 
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            if (!kData || !kData.folderId) return res.json({ exists: false });

            // Ищем или создаем папку PLANOGRAMS внутри папки клиента
            const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
            
            // Название файла: "Город Адрес.jpg" или просто "Адрес.jpg"
            const fileName = addr.trim() + ".jpg";

            const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id, webViewLink, webContentLink)' });
            
            if (search.data.files.length > 0) {
                res.json({ 
                    exists: true, 
                    url: search.data.files[0].webViewLink 
                });
            } else {
                res.json({ exists: false });
            }
        } catch (e) {
            console.error("Planogram GET Error:", e.message);
            res.status(500).json({ error: e.message });
        }
    });

    // 2. Загрузка новой планограммы (когда мерч делает фото)
    app.post('/upload-planogram', async (req, res) => {
        try {
            const { addr, image, key } = req.body;
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            if (!kData || !kData.folderId) return res.status(403).json({ error: "No access" });

            const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
            const fileName = addr.trim() + ".jpg";
            
            // Превращаем base64 в файл
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const buf = Buffer.from(base64Data, 'base64');

            const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
            const existing = await drive.files.list({ q });
            
            const media = { mimeType: 'image/jpeg', body: Readable.from(buf) };

            if (existing.data.files.length > 0) {
                // Если файл уже есть — обновляем
                await drive.files.update({ fileId: existing.data.files[0].id, media });
            } else {
                // Если нет — создаем новый
                const f = await drive.files.create({ 
                    resource: { name: fileName, parents: [planFolderId] }, 
                    media, 
                    fields: 'id' 
                });
                await drive.permissions.create({ 
                    fileId: f.data.id, 
                    resource: { role: 'reader', type: 'anyone' } 
                });
            }
            res.json({ success: true });
        } catch (e) {
            console.error("Planogram POST Error:", e.message);
            res.status(500).json({ error: e.message });
        }
    });
};
