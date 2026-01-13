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
            
            // 1. Ищем ключ или воркера
            let kIdx = keys.findIndex(k => k.key === licenseKey);
            if (kIdx === -1) kIdx = keys.findIndex(k => k.workers && k.workers.includes(curW));
            
            if (kIdx === -1) return res.status(403).json({ success: false, error: "Доступ запрещен" });

            let kData = keys[kIdx];
            const projR = (kData.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;

            // 2. Определяем путь в иерархии
            const oId = kData.folderId || await getOrCreateFolder(kData.name, projR);
            const wId = await getOrCreateFolder(curW, oId);
            const folderName = (client && client.trim() !== "") ? client.trim() : "Общее";
            const finalId = await getOrCreateFolder(folderName, wId);
            const dateStr = new Date().toISOString().split('T')[0];
            const dId = await getOrCreateFolder(dateStr, finalId);

            // 3. ЗАГРУЗКА ФОТО (Двойное сохранение)
            if (image) {
                const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                const fileName = `${address} под ${entrance}.jpg`;

                // А) Сохранение в Google Диск
                await drive.files.create({
                    resource: { name: fileName, parents: [dId] },
                    media: { mimeType: 'image/jpeg', body: Readable.from(buf) }
                });

                // Б) Сохранение локально для X-Drive (X-Platform)
                // Мы берем путь, который нам подготовил getOrCreateFolder (он прокидывается через контекст)
                // Но для надежности сохраним в структуру: storage/ЛОГИСТ(или МЕРЧ)/Объект/Воркер/Клиент/Дата/
                const relPath = path.join((kData.type === 'merch' ? 'МЕРЧ' : 'ЛОГИСТ'), kData.name, curW, folderName, dateStr);
                const absPath = path.join(__dirname, 'storage', relPath);
                
                if (!fs.existsSync(absPath)) fs.mkdirSync(absPath, { recursive: true });
                fs.writeFileSync(path.join(absPath, fileName), buf);
            }

            // 4. Запись в таблицы
            await appendToReport(wId, curW, city, dateStr, address, entrance, client, workType, price, lat, lon);

            res.json({ success: true });
        } catch (e) {
            console.error("Ошибка X-Upload:", e.message);
            res.status(500).json({ success: false });
        }
    });

    console.log("✅ ПЛАГИН X-UPLOAD (ФИНАЛ) СИНХРОНИЗИРОВАН С X-DRIVE");
};
