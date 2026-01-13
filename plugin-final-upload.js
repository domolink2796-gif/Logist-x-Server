const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

module.exports = function(app, ctx) {
    const { drive, readDatabase, saveDatabase, getOrCreateFolder, appendToReport, MY_ROOT_ID, MERCH_ROOT_ID } = ctx;

    app.post('/upload', async (req, res) => {
        try {
            const { licenseKey, workerName, worker, city, address, entrance, client, image, lat, lon, workType, price } = req.body;
            
            let keys = await readDatabase();
            const curW = worker || workerName;
            
            // 1. Ищем ключ
            let kIdx = keys.findIndex(k => k.key === licenseKey);
            if (kIdx === -1) kIdx = keys.findIndex(k => k.workers && k.workers.includes(curW));
            
            if (kIdx === -1) return res.status(403).json({ success: false, error: "Ключ не найден" });

            let kData = keys[kIdx];
            const projR = (kData.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;

            // 2. Получаем ID папки объекта
            let oId = kData.folderId;
            if (!oId) {
                oId = await getOrCreateFolder(kData.name, projR);
                keys[kIdx].folderId = oId;
                await saveDatabase(keys); 
            }

            // 3. Создаем структуру: Сотрудник -> Клиент -> Дата
            const wId = await getOrCreateFolder(curW, oId);
            const folderName = (client && client.trim() !== "") ? client.trim() : "Общее";
            const finalId = await getOrCreateFolder(folderName, wId);
            const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], finalId);

            // 4. Загрузка фото
            if (image) {
                const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                const fileName = `${address} под ${entrance}.jpg`;
                
                // В Google Диск
                await drive.files.create({
                    resource: { name: fileName, parents: [dId] },
                    media: { mimeType: 'image/jpeg', body: Readable.from(buf) }
                });
            }

            // 5. Запись в таблицу
            await appendToReport(wId, curW, city, new Date().toISOString().split('T')[0], address, entrance, client, workType, price, lat, lon);

            res.json({ success: true });
        } catch (e) {
            console.error("Ошибка загрузки:", e.message);
            res.status(500).json({ success: false, error: "Ошибка сервера" });
        }
    });

    console.log("✅ ПЛАГИН ЗАГРУЗКИ ПО КЛЮЧАМ ПОДКЛЮЧЕН");
};
