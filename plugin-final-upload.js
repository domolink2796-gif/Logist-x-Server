const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

module.exports = function(app, ctx) {
    const { drive, readDatabase, getOrCreateFolder, appendToReport, MY_ROOT_ID, MERCH_ROOT_ID } = ctx;

    app.post('/upload', async (req, res) => {
        try {
            const { licenseKey, workerName, image, address, entrance, client, city, workType, price, lat, lon } = req.body;
            let keys = await readDatabase();
            let kData = keys.find(k => k.key === licenseKey || (k.workers && k.workers.includes(workerName)));

            if (!kData) return res.status(403).json({ success: false, error: "Ключ не найден" });

            const projR = (kData.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
            const rootName = (kData.type === 'merch') ? 'МЕРЧ' : 'ЛОГИСТ';

            // 1. ПОЛУЧАЕМ ID ИЗ GOOGLE (Создаем структуру)
            const oId = kData.folderId || await getOrCreateFolder(kData.name, projR);
            const wId = await getOrCreateFolder(workerName, oId);
            const clientName = client || "Общее";
            const cId = await getOrCreateFolder(clientName, wId);
            const dateStr = new Date().toISOString().split('T')[0];
            const dId = await getOrCreateFolder(dateStr, cId);

            if (image) {
                const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                const fileName = `${address} под ${entrance}.jpg`;

                // А) Сохраняем в Google Диск
                await drive.files.create({
                    resource: { name: fileName, parents: [dId] },
                    media: { mimeType: 'image/jpeg', body: Readable.from(buf) }
                });

                // Б) ЗЕРКАЛИМ НА СЕРВЕР (Папки с ID для точности)
                const relPath = path.join(
                    `${rootName}_${projR}`,
                    `${kData.name}_${oId}`,
                    `${workerName}_${wId}`,
                    `${clientName}_${cId}`,
                    `${dateStr}_${dId}`
                );
                
                const absPath = path.join(__dirname, 'storage', relPath);
                if (!fs.existsSync(absPath)) fs.mkdirSync(absPath, { recursive: true });
                fs.writeFileSync(path.join(absPath, fileName), buf);
            }

            await appendToReport(wId, workerName, city, dateStr, address, entrance, clientName, workType, price, lat, lon);
            res.json({ success: true });
        } catch (e) {
            console.error("Ошибка X-Upload:", e.message);
            res.status(500).send(e.message);
        }
    });
    console.log("✅ ШАГ 1: ФИНАЛ (ЗАГРУЗКА) ОБНОВЛЕН");
};
