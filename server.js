const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '150mb' }));

// --- НАСТРОЙКИ ---
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const MAX_DISTANCE_METERS = 500; // Максимальное расстояние от точки для начала визита

// Функция расчета расстояния между координатами (формула Гаверсинуса)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Радиус Земли в метрах
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // в метрах
}

// ... (функции getOrCreateFolder, readDatabase, saveDatabase остаются прежними) ...

app.post('/merch-upload', async (req, res) => {
    try {
        const { 
            worker, net, address, pdf, city, 
            startTime, endTime, 
            lat, lon,           // Текущие координаты сотрудника
            targetLat, targetLon // Координаты магазина из плана
        } = req.body;

        // 1. ПРИВЯЗКА К GPS (Геозабор)
        if (lat && lon && targetLat && targetLon) {
            const distance = getDistance(lat, lon, targetLat, targetLon);
            if (distance > MAX_DISTANCE_METERS) {
                return res.status(403).json({ 
                    success: false, 
                    error: `Ошибка GPS: Вы находитесь в ${Math.round(distance)}м от точки. Начать визит можно только в пределах ${MAX_DISTANCE_METERS}м.` 
                });
            }
        } else if (!lat || !lon) {
            return res.status(400).json({ success: false, error: "Ошибка: Не удалось определить ваше местоположение. Включите GPS." });
        }

        // 2. Если проверка пройдена — создаем папки и сохраняем отчет
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const ownerName = keyData ? keyData.name : "Мерч_Общий";
        
        const ownerId = await getOrCreateFolder(ownerName, MERCH_ROOT_ID);
        const workerId = await getOrCreateFolder(worker, ownerId);
        const cityId = await getOrCreateFolder(city || "Орёл", workerId);
        const todayStr = new Date().toISOString().split('T')[0];
        const dateId = await getOrCreateFolder(todayStr, cityId);
        const netId = await getOrCreateFolder(net, dateId);

        let pdfUrl = "Нет файла";
        if (pdf) {
            const buffer = Buffer.from(pdf.split(',')[1], 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            const fileName = `ОТЧЕТ_${address.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;
            const file = await drive.files.create({
                resource: { name: fileName, parents: [netId] },
                media: { mimeType: 'application/pdf', body: bufferStream },
                fields: 'id, webViewLink'
            });
            await drive.permissions.create({ fileId: file.data.id, resource: { role: 'reader', type: 'anyone' } });
            pdfUrl = file.data.webViewLink;
        }

        // 3. Запись в таблицу (включая GPS координаты для контроля)
        await appendMerchToReport(workerId, worker, net, address, ..., pdfUrl, startTime, endTime, lat, lon);
        
        res.json({ success: true, url: pdfUrl, message: "Визит успешно завершен" });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ... (остальной код сервера) ...
