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

// --- 1. ЗАПУСК ПОРТА (СРАЗУ ДЛЯ RENDER) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> [OK] СЕРВЕР ЖИВОЙ НА ПОРТУ ${PORT}`);
});

// --- 2. НАСТРОЙКИ ---
const TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const MY_ID = '6846149935'; 
const APP_URL = 'https://logist-x-server.onrender.com';
const MASTER_KEY = 'LX-BOSS-777';
const KEYS_FILE = path.join(__dirname, 'keys.json');

if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }));

// --- 3. БОТ (БЕЗ ОШИБОК) ---
const bot = new TelegramBot(TOKEN, { polling: true });
bot.on('polling_error', (err) => console.log("Ошибка бота:", err.message));

bot.onText(/\/start/, (msg) => {
    if (msg.chat.id.toString() === MY_ID) {
        bot.sendMessage(MY_ID, "Евгений, система готова! Выбирай:", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📊 АДМИНКА", web_app: { url: `${APP_URL}/admin-panel` } }],
                    [{ text: "📂 МОЙ ДИСК", url: "https://drive.google.com/drive/my-drive" }]
                ]
            }
        });
    }
});

// --- 4. API ДЛЯ АДМИНКИ (ЧТОБЫ КЛЮЧИ СОЗДАВАЛИСЬ) ---
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
            limit: parseInt(limit) || 1
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

// ПРОВЕРКА ДЛЯ ПРИЛОЖЕНИЯ (Чтобы зайти в него)
app.post('/check-license', (req, res) => {
    const { licenseKey } = req.body;
    if (licenseKey === MASTER_KEY || licenseKey === "DEV-MASTER-999") {
        return res.json({ status: "active", expiry: Date.now() + 315360000000 });
    }
    const data = JSON.parse(fs.readFileSync(KEYS_FILE));
    const found = data.keys.find(k => k.key === licenseKey);
    if (found && new Date(found.expiry) > new Date()) {
        return res.json({ status: "active", expiry: new Date(found.expiry).getTime() });
    }
    res.json({ status: "error", message: "Ключ не подходит" });
});

// --- 5. GOOGLE И ЗАГРУЗКА ---
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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',
    'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

async function getOrCreateFolder(name, parentId = null) {
    let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) q += ` and '${parentId}' in parents`;
    const res = await drive.files.list({ q, fields: 'files(id)' });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({
        resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : [] },
        fields: 'id'
    });
    return folder.data.id;
}

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, house, entrance, client, image, workType, price, latitude, longitude } = req.body;
        const f1 = await getOrCreateFolder("Евгений_БОСС");
        const f2 = await getOrCreateFolder(worker || "Воркер", f1);
        const f3 = await getOrCreateFolder(city || "Город", f2);
        const f4 = await getOrCreateFolder(client || "Объект", f3);

        const buffer = Buffer.from(image, 'base64');
        const file = await drive.files.create({
            resource: { name: `${address}_${Date.now()}.jpg`, parents: [f4] },
            media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
            fields: 'id, webViewLink'
        });

        res.json({ success: true });
        bot.sendMessage(MY_ID, `✅ Отчет: ${worker}\n🛠 ${workType}\n📍 ${address}\n💰 ${price}₽`);
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("SERVER LIVE"));
