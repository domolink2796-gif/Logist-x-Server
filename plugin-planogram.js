module.exports = (app, ctx) => {
    // Используем инструменты из основного сервера через ctx
    const { drive, getOrCreateFolder, readDatabase, readPlanogramDb, savePlanogramDb } = ctx;

    // РОУТ 1: ПОЛУЧЕНИЕ ПЛАНОГРАММЫ
    app.get('/get-planogram', async (req, res) => {
        try {
            const { addr, key } = req.query;
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            
            // Если ключа нет или нет папки - выходим
            if (!kData || !kData.folderId) return res.json({ exists: false });

            // Ищем или создаем папку PLANOGRAMS внутри папки клиента
            const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
            
            // Имя файла как в старом рабочем сервере
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
        } catch (e) {
            console.error("Ошибка плагина (get):", e.message);
            res.status(500).json({ error: e.message });
        }
    });

    // РОУТ 2: ЗАГРУЗКА ПЛАНОГРАММЫ
    app.post('/upload-planogram', async (req, res) => {
        try {
            const { addr, image, key } = req.body;
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            
            if (!kData || !kData.folderId) return res.status(403).json({ error: "Доступ запрещен" });

            const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
            const fileName = addr.trim() + ".jpg";
            
            const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
            const existing = await drive.files.list({ q });
            
            if (existing.data.files.length > 0) {
                // Если файл уже есть - обновляем его
                await drive.files.update({ 
                    fileId: existing.data.files[0].id, 
                    media: { mimeType: 'image/jpeg', body: require('stream').Readable.from(buf) } 
                });
            } else {
                // Если нет - создаем новый
                const f = await drive.files.create({ 
                    resource: { name: fileName, parents: [planFolderId] }, 
                    media: { mimeType: 'image/jpeg', body: require('stream').Readable.from(buf) }, 
                    fields: 'id' 
                });
                await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
            }

            // Отмечаем в базе данных планограмм клиента
            const planDb = await readPlanogramDb(kData.folderId);
            planDb[addr.trim()] = true;
            await savePlanogramDb(kData.folderId, planDb);

            res.json({ success: true });
        } catch (e) {
            console.error("Ошибка плагина (upload):", e.message);
            res.status(500).json({ error: e.message });
        }
    });
};
