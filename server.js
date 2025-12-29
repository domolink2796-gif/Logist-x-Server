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
const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';
const MY_TELEGRAM_ID = '6846149935';
const MASTER_KEY_VAL = 'LX-BOSS-777';
const KEYS_FILE = path.join(__dirname, 'keys.json');

// Инициализация файла ключей, если его нет
if (!fs.existsSync(KEYS_FILE)) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }));
}

const bot = new TelegramBot(TOKEN, { polling: true });
const mainMenu = {
    reply_markup: {
        keyboard: [[{ text: "📊 Админ-панель" }, { text: "📂 Google Drive" }]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// --- API ДЛЯ АДМИН-ПАНЕЛИ (ЧТОБЫ СОХРАНЯЛО В ФАЙЛ) ---

app.get('/api/list_keys', (req, res) => {
    const data = JSON.parse(fs.readFileSync(KEYS_FILE));
    res.json(data);
});

app.post('/api/add_key', (req, res) => {
    const { name, days, limit } = req.body;
    const data = JSON.parse(fs.readFileSync(KEYS_FILE));
    const newKey = {
        key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        name: name,
        expiry: new Date(Date.now() + days * 86400000).toISOString(),
        limit: parseInt(limit),
        workers: []
    };
    data.keys.push(newKey);
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true, key: newKey });
});

app.post('/api/delete_key', (req, res) => {
    const { key } = req.body;
    let data = JSON.parse(fs.readFileSync(KEYS_FILE));
    data.keys = data.keys.filter(k => k.key !== key);
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
});

// --- ПРОВЕРКА КЛЮЧА И ЗАГРУЗКА ---

app.post('/api/check_key', (req, res) => {
    const { licenseKey } = req.body;
    if (licenseKey === MASTER_KEY_VAL) return res.json({ success: true });
    const data = JSON.parse(fs.readFileSync(KEYS_FILE));
    const found = data.keys.find(k => k.key === licenseKey);
    if (found && new Date(found.expiry) > new Date()) return res.json({ success: true });
    res.status(403).json({ success: false });
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, house, entrance, client, image, licenseKey } = req.body;
        
        let clientFolder = "Евгений_Admin";
        const data = JSON.parse(fs.readFileSync(KEYS_FILE));
        const found = data.keys.find(k => k.key === licenseKey);
        if (found) clientFolder = found.name;

        // Логика создания папок
        const f1 = await getOrCreateFolder(clientFolder);
        const f2 = await getOrCreateFolder(worker || "Воркер", f1);
        const f3 = await getOrCreateFolder(city || "Город", f2);
        const f4 = await getOrCreateFolder(client || "Объект", f3);

        const buffer = Buffer.from(image, 'base64');
        await drive.files.create({
            resource: { name: `${address}_${house}.jpg`, parents: [f4] },
            media: { mimeType: 'image/jpeg', body: Readable.from(buffer) }
        });

        res.json({ success: true });
        bot.sendMessage(MY_TELEGRAM_ID, `✅ Фото для [${clientFolder}] принято!`, mainMenu);
    } catch (e) { res.status(500).json({ success: false }); }
});

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

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "Система запущена!", mainMenu));

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("SERVER ONLINE"));
app.listen(process.env.PORT || 3000, () => console.log("SERVER START"));
