const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- ТВОИ НАСТРОЙКИ ---
const ADMIN_ID = 6846149935;
const BOT_TOKEN = '7908672389:AAFqJsmCmlJHSckewNPue_XVa_WTxKY7-Aw';
const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

// --- БАЗА КЛЮЧЕЙ ---
const DB_FILE = 'db.json';
let DB = { keys: [] };
if (fs.existsSync(DB_FILE)) DB = JSON.parse(fs.readFileSync(DB_FILE));
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(DB));

// --- GOOGLE API SETUP ---
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// --- ТЕЛЕГРАМ БОТ ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/\/start|\/admin/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return bot.sendMessage(msg.chat.id, "Доступ закрыт.");
    bot.sendMessage(msg.chat.id, "Евгений, добро пожаловать в Logist Master HQ!", {
        reply_markup: {
            inline_keyboard: [[{ text: "Открыть Панель Управления", web_app: { url: `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/admin-panel` } }]]
        }
    });
});

// --- ЛОГИКА ПАПОК ---
async function getOrCreateFolder(folderName, parentId = null) {
    let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) query += ` and '${parentId}' in parents`;
    const res = await drive.files.list({ q: query, fields: 'files(id)' });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({
        resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : [] },
        fields: 'id'
    });
    return folder.data.id;
}

// --- ЗАПИСЬ В ТАБЛИЦУ ---
async function logToSheet(data) {
    const spreadsheetName = "БАЗА_ОТЧЕТОВ_LOGIST";
    let res = await drive.files.list({ q: `name = '${spreadsheetName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false` });
    let ssId = res.data.files.length > 0 ? res.data.files[0].id : (await sheets.spreadsheets.create({ resource: { properties: { title: spreadsheetName } } })).data.spreadsheetId;
    
    const row = [new Date().toLocaleString('ru-RU'), data.worker, data.city, data.address, data.client, data.workType, data.price, data.coords || "Нет GPS"];
    await sheets.spreadsheets.values.append({
        spreadsheetId: ssId, range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED',
        resource: { values: [row] }
    });
}

// --- API ЭНДПОИНТЫ ---

// 1. Прием отчета из приложения
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, client, image, fileName, workType, price, coords } = req.body;
        
        // Создаем дерево папок: Заказчик -> Исполнитель -> Клиент -> Город -> Дата
        const dateStr = new Date().toLocaleDateString('ru-RU');
        const f1 = await getOrCreateFolder(client || "ОБЩИЙ");
        const f2 = await getOrCreateFolder(worker || "Воркер", f1);
        const f3 = await getOrCreateFolder(city || "Город", f2);
        const f4 = await getOrCreateFolder(dateStr, f3);

        const buffer = Buffer.from(image, 'base64');
        await drive.files.create({
            resource: { name: `${fileName}.jpg`, parents: [f4] },
            media: { mimeType: 'image/jpeg', body: require('stream').Readable.from(buffer) }
        });

        await logToSheet(req.body);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 2. Проверка лицензии
app.post('/check-license', (req, res) => {
    const { licenseKey, workerName } = req.body;
    const keyData = DB.keys.find(k => k.key === licenseKey);
    if (!keyData) return res.json({ status: "error", message: "Ключ не найден" });
    if (new Date(keyData.expiry) < new Date()) return res.json({ status: "error", message: "Срок истек" });
    if (!keyData.workers.includes(workerName)) {
        if (keyData.workers.length >= keyData.limit) return res.json({ status: "error", message: "Лимит воркеров исчерпан" });
        keyData.workers.push(workerName);
        saveDB();
    }
    res.json({ status: "active", expiry: new Date(keyData.expiry).getTime() });
});

// 3. Админка (API для Master HQ)
app.get('/api/list_keys', (req, res) => res.json({ keys: DB.keys }));
app.post('/api/add_key', (req, res) => {
    const { name, days, limit } = req.body;
    const key = { key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(), name, expiry: new Date(Date.now() + days * 86400000).toISOString(), limit, workers: [] };
    DB.keys.push(key); saveDB(); res.json({ success: true });
});
app.post('/api/delete_key', (req, res) => {
    DB.keys = DB.keys.filter(k => k.key !== req.body.key); saveDB(); res.json({ success: true });
});

// Раздача панели
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LOGIST_X MASTER SERVER RUNNING ON PORT ${PORT}`));
