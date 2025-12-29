const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- НАСТРОЙКИ ---
const TOKEN = '7908672389:AAF63DoOmlrCXTRoIlmFVg71I1SgC55kHUc';
const MY_TELEGRAM_ID = '6846149935';
const MASTER_KEY_VAL = 'LX-BOSS-777'; // Твой основной ключ
const APP_URL = 'https://logist-x-server.onrender.com';
const KEYS_FILE = path.join(__dirname, 'keys.json');

if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }));

// --- ТЕЛЕГРАМ БОТ С КНОПКАМИ ---
const bot = new TelegramBot(TOKEN, { polling: false });

// Тихий запуск бота
setTimeout(() => {
    bot.deleteWebhook({ drop_pending_updates: true }).then(() => {
        bot.startPolling().catch(() => {});
        console.log(">>> БОТ АКТИВИРОВАН");
    });
}, 15000);

// Команда /start с двумя кнопками
bot.onText(/\/start/, (msg) => {
    if (msg.chat.id.toString() !== MY_TELEGRAM_ID) return;

    const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "📊 ОТКРЫТЬ АДМИНКУ", web_app: { url: `${APP_URL}/admin-panel` } }
                ],
                [
                    { text: "📂 ПЕРЕЙТИ НА ДИСК", url: "https://drive.google.com/drive/my-drive" }
                ]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, "Привет, Евгений! Система LOGIST_X на связи.\n\nВыбери нужное действие:", opts);
});

// Google Auth
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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',
    'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// --- ПРОВЕРКА ЛИЦЕНЗИИ (ПОД ТВОЁ ПРИЛОЖЕНИЕ) ---
app.post('/check-license', (req, res) => {
    const { licenseKey, workerName } = req.body;
    console.log(`>>> [APP] Вход: ${workerName} (${licenseKey})`);

    if (licenseKey === "DEV-MASTER-999" || licenseKey === MASTER_KEY_VAL) {
        return res.json({ status: "active", expiry: Date.now() + 315360000000 });
    }

    try {
        const data = JSON.parse(fs.readFileSync(KEYS_FILE));
        const found = data.keys.find(k => k.key === licenseKey);
        if (found && new Date(found.expiry) > new Date()) {
            return res.json({ status: "active", expiry: new Date(found.expiry).getTime() });
        }
    } catch (e) {}

    res.json({ status: "error", message: "Ключ не найден" });
});

// --- GOOGLE DRIVE ЛОГИКА ---
async function getOrCreateFolder(name, parentId = null) {
    try {
        let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        if (parentId) q += ` and '${parentId}' in parents`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const folder = await drive.files.create({
            resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : [] },
            fields: 'id'
        });
        return folder.data.id;
    } catch (e) { return null; }
}

async function getOrCreateSheet(name, parentId) {
    try {
        let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and '${parentId}' in parents`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const ss = await sheets.spreadsheets.create({ resource: { properties: { title: name } }, fields: 'spreadsheetId' });
        const fileId = ss.data.spreadsheetId;
        await drive.files.update({ fileId, addParents: parentId, removeParents: 'root' });
        await sheets.spreadsheets.values.append({
            spreadsheetId: fileId, range: 'Sheet1!A1', valueInputOption: 'RAW',
            resource: { values: [['Дата', 'Город', 'Адрес', 'Объект', 'Тип работ', 'Цена', 'GPS', 'Ссылка']] }
        });
        return fileId;
    } catch (e) { return null; }
}

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, pod, client, image, licenseKey, coords, workType, price, fileName } = req.body;
        
        let clientName = "Евгений_БОСС";
        const data = JSON.parse(fs.readFileSync(KEYS_FILE));
        const keyData = data.keys.find(k => k.key === licenseKey);
        if (keyData) clientName = keyData.name;

        // ИЕРАРХИЯ
        const f1 = await getOrCreateFolder(clientName);
        const f2 = await getOrCreateFolder(worker || "Воркер", f1);
        const sheetId = await getOrCreateSheet(`Отчет_${worker}`, f2);
        const f3 = await getOrCreateFolder(city || "Город", f2);
        const f4 = await getOrCreateFolder(client || "Объект", f3);

        const buffer = Buffer.from(image, 'base64');
        const file = await drive.files.create({
            resource: { name: `${fileName}.jpg`, parents: [f4] },
            media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
            fields: 'id, webViewLink'
        });

        if (sheetId) {
            const gpsLink = coords && coords.includes(',') ? `https://www.google.com/maps?q=${coords.replace(/\s/g, '')}` : coords;
            await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId, range: 'Sheet1!A2', valueInputOption: 'USER_ENTERED',
                resource: { values: [[new Date().toLocaleString('ru-RU'), city, `${address}, п.${pod}`, client, workType, price, gpsLink, file.data.webViewLink]] }
            });
        }
        
        res.json({ success: true });
        bot.sendMessage(MY_TELEGRAM_ID, `✅ Принято от ${worker}\n📍 ${address} (п.${pod})\n💰 ${price}₽`);
    } catch (e) { res.status(500).json({ success: false }); }
});

// Админка
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/api/list_keys', (req, res) => res.json(JSON.parse(fs.readFileSync(KEYS_FILE))));
app.post('/api/add_key', (req, res) => {
    const { name, days, limit } = req.body;
    let data = JSON.parse(fs.readFileSync(KEYS_FILE));
    const newKey = { key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(), name, expiry: new Date(Date.now() + days * 86400000).toISOString(), limit, workers: [] };
    data.keys.push(newKey);
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true, key: newKey });
});

app.get('/', (req, res) => res.send("SERVER LIVE"));
app.listen(process.env.PORT || 3000);
