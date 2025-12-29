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
const MASTER_KEY_VAL = 'LX-BOSS-777';
const KEYS_FILE = path.join(__dirname, 'keys.json');

// Инициализация файла ключей
if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }));

const bot = new TelegramBot(TOKEN, { polling: false });

// Защита от 409: запуск с паузой
setTimeout(() => {
    bot.startPolling();
    console.log("БОТ АКТИВИРОВАН");
}, 15000);

bot.on('polling_error', (e) => { if(!e.message.includes('409')) console.log(e.message); });

// Google Auth
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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',
    'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// --- API ДЛЯ АДМИНКИ (ЧТОБЫ КЛЮЧИ СОЗДАВАЛИСЬ) ---

app.get('/api/list_keys', (req, res) => {
    const data = JSON.parse(fs.readFileSync(KEYS_FILE));
    res.json(data);
});

app.post('/api/add_key', (req, res) => {
    try {
        const { name, days, limit } = req.body;
        const data = JSON.parse(fs.readFileSync(KEYS_FILE));
        const newKey = {
            key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            name: name,
            expiry: new Date(Date.now() + days * 86400000).toISOString(),
            limit: parseInt(limit) || 1,
            workers: []
        };
        data.keys.push(newKey);
        fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
        res.json({ success: true, key: newKey });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/delete_key', (req, res) => {
    const { key } = req.body;
    let data = JSON.parse(fs.readFileSync(KEYS_FILE));
    data.keys = data.keys.filter(k => k.key !== key);
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
});

app.post('/api/check_key', (req, res) => {
    const { licenseKey } = req.body;
    if (licenseKey === MASTER_KEY_VAL) return res.json({ success: true });
    const data = JSON.parse(fs.readFileSync(KEYS_FILE));
    const found = data.keys.find(k => k.key === licenseKey);
    if (found && new Date(found.expiry) > new Date()) return res.json({ success: true });
    res.status(403).json({ success: false });
});

// --- ЛОГИКА ПАПОК И ЗАГРУЗКИ ---

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
    } catch (err) { return null; }
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
            resource: { values: [['Дата', 'Город', 'Адрес', 'Объект', 'Карта GPS', 'Ссылка на фото']] }
        });
        return fileId;
    } catch (err) { return null; }
}

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, house, entrance, client, image, licenseKey, latitude, longitude } = req.body;
        let clientFolderName = "Евгений_БОСС";
        const data = JSON.parse(fs.readFileSync(KEYS_FILE));
        const keyData = data.keys.find(k => k.key === licenseKey);
        if (keyData) clientFolderName = keyData.name;

        // Иерархия: Клиент -> Воркер -> Город -> Объект
        const f1 = await getOrCreateFolder(clientFolderName);
        const f2 = await getOrCreateFolder(worker || "Воркер", f1);
        const f3 = await getOrCreateFolder(city || "Город", f2);
        const f4 = await getOrCreateFolder(client || "Объект", f3);

        const photoName = `${address}_${house}_${entrance}.jpg`.replace(/\s+/g, '_');
        const buffer = Buffer.from(image, 'base64');
        const file = await drive.files.create({
            resource: { name: photoName, parents: [f4] },
            media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
            fields: 'id, webViewLink'
        });

        const sheetId = await getOrCreateSheet(`Отчет_${worker}`, f2);
        if (sheetId) {
            const gps = (latitude && longitude) ? `https://www.google.com/maps?q=${latitude},${longitude}` : "Нет GPS";
            await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId, range: 'Sheet1!A2', valueInputOption: 'RAW',
                resource: { values: [[new Date().toLocaleString('ru-RU'), city, `${address}, д.${house}`, client, gps, file.data.webViewLink]] }
            });
        }
        res.json({ success: true });
        bot.sendMessage(MY_TELEGRAM_ID, `✅ Фото для ${clientFolderName} принято!`, {
            reply_markup: { inline_keyboard: [[{ text: "📂 ОТКРЫТЬ ДИСК", url: "https://drive.google.com/drive/my-drive" }]] }
        });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Обработка /start и кнопок
bot.onText(/\/start/, (msg) => {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 ОТКРЫТЬ АДМИНКУ", web_app: { url: "https://logist-x-server.onrender.com/admin-panel" } }],
                [{ text: "📂 ПЕРЕЙТИ НА ДИСК", url: "https://drive.google.com/drive/my-drive" }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, "Евгений, система Logist-X готова:", opts);
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("SERVER LIVE"));
app.listen(process.env.PORT || 3000);
