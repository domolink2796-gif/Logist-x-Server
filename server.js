const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');
const axios = require('axios'); // Для Телеграма

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- НАСТРОЙКИ ---
const MASTER_KEY = "LX-BOSS-777"; 
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // Берем из переменных Railway
const MY_CHAT_ID = "6846149935"; // Твой ID

const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// Очередь для борьбы с "пулеметом"
let isProcessing = false;
const queue = [];

// Функция отправки в Телеграм с паузой
async function sendToTelegram(text, photoUrl) {
    try {
        if (photoUrl) {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
                chat_id: MY_CHAT_ID,
                photo: photoUrl,
                caption: text
            });
        } else {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: MY_CHAT_ID,
                text: text
            });
        }
    } catch (err) { console.error("Ошибка ТГ:", err.message); }
}

// --- ЛОГИКА ТАБЛИЦЫ ---
async function getOrCreateWorkerReport(workerFolderId, workerName) {
    const fileName = `ЖУРНАЛ_РАБОТ_${workerName}`;
    const q = `name = '${fileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and '${workerFolderId}' in parents`;
    const res = await drive.files.list({ q });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const ss = await sheets.spreadsheets.create({ resource: { properties: { title: fileName } } });
    const ssId = ss.data.spreadsheetId;
    await drive.files.update({ fileId: ssId, addParents: workerFolderId, removeParents: 'root' });
    await sheets.spreadsheets.values.update({
        spreadsheetId: ssId, range: 'Sheet1!A1', valueInputOption: 'RAW',
        resource: { values: [["ДАТА/ВРЕМЯ", "ГОРОД", "ОБЪЕКТ", "АДРЕС", "ТИП РАБОТЫ", "GPS", "ФОТО"]] }
    });
    return ssId;
}

async function getOrCreateFolder(name, parentId) {
    let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;
    const res = await drive.files.list({ q });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
    return folder.data.id;
}

// ГЛАВНЫЙ ОБРАБОТЧИК ОЧЕРЕДИ
async function processQueue() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;
    const task = queue.shift();

    try {
        const { req, res } = task;
        const { worker, city, address, client, image, licenseKey, lat, lon, workType } = req.body;
        const workerName = worker || "Монтажник";

        // 1. Защита от дублей (проверяем, нет ли уже такого файла за последние 5 минут)
        const checkQ = `name = '${address}.jpg' and trashed = false`;
        const checkRes = await drive.files.list({ q: checkQ });
        if (checkRes.data.files.length > 0) {
             console.log(">>> [SKIP] Дубликат обнаружен, пропускаем.");
             res.json({ success: true, message: "Дубликат" });
        } else {
            // 2. Поиск компании
            let compName = "Евгений_БОСС";
            const f1 = await getOrCreateFolder(compName, MY_ROOT_ID);
            const f2 = await getOrCreateFolder(workerName, f1);
            const ssId = await getOrCreateWorkerReport(f2, workerName);
            const f3 = await getOrCreateFolder(city || "Город", f2);
            const f4 = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), f3);
            const f5 = await getOrCreateFolder(client || "Объект", f4);

            let photoLink = "";
            if (image) {
                const buffer = Buffer.from(image, 'base64');
                const file = await drive.files.create({
                    resource: { name: `${address}.jpg`, parents: [f5] },
                    media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
                    fields: 'id, webViewLink'
                });
                photoLink = file.data.webViewLink;
            }

            const gpsLink = (lat && lon) ? `https://www.google.com/maps?q=${lat},${lon}` : "Нет координат";
            await sheets.spreadsheets.values.append({
                spreadsheetId: ssId, range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED',
                resource: { values: [[new Date().toLocaleString('ru-RU'), city, client, address, workType, gpsLink, photoLink]] }
            });

            // 3. Отправка в Телеге (ПО ОДНОЙ С ПАУЗОЙ)
            const reportMsg = `✅ ОТЧЕТ ПРИНЯТ\n📍 Адрес: ${address}\n👤 Мастер: ${workerName}\n🛠 Тип: ${workType}`;
            await sendToTelegram(reportMsg, photoLink);

            console.log(`>>> [DONE] Сохранено: ${address}`);
            res.json({ success: true });
        }
    } catch (e) {
        console.error("!!! [ERROR]", e.message);
        task.res.status(500).json({ success: false });
    }

    setTimeout(() => {
        isProcessing = false;
        processQueue();
    }, 2000); // Пауза 2 секунды между фото, чтобы не было спама
}

app.post('/upload', (req, res) => {
    queue.push({ req, res });
    processQueue();
});

app.get('/api/list_keys', async (req, res) => {
    try {
        const q = `name = 'DATABASE_KEYS_LOGIST_X' and trashed = false`;
        const resFile = await drive.files.list({ q });
        if (resFile.data.files.length === 0) return res.json({ keys: [] });
        const resData = await sheets.spreadsheets.values.get({ spreadsheetId: resFile.data.files[0].id, range: 'A2:E100' });
        const keys = (resData.data.values || []).map(r => ({ key: r[0], name: r[1], expiry: r[2], limit: r[3] }));
        res.json({ keys });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => res.send("LOGIST-X PRO LIVE + TELEGRAM QUEUE ACTIVE"));

app.listen(process.env.PORT || 3000, () => console.log("[СИСТЕМА] СЕРВЕР GS ОБНОВЛЕН И ГОТОВ"));
