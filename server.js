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
const TOKEN = '7908672389:AAFqJsmCmlJHSckewNPue_XVa_WTxKY7-Aw';
const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

const bot = new TelegramBot(TOKEN, { polling: true });
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// База данных
const DB_FILE = 'db.json';
let DB = { keys: [] };
if (fs.existsSync(DB_FILE)) {
    try { DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { console.error("Ошибка БД:", e); }
}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));

// --- ФУНКЦИИ ---
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

// --- ТЕЛЕГРАМ БОТ ---
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "LOGIST_X приветствует тебя! 🚀\nСистема готова к приему отчетов.");
});

// --- ПРИЕМ ФОТО ---
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, client, image, fileName, licenseKey, coords } = req.body;
        console.log(`[UPLOAD] Запрос от ${worker} (${city})`);

        const keyData = DB.keys.find(k => k.key === licenseKey);
        if (!keyData) return res.status(403).json({ success: false, error: "Ключ не найден" });

        const f1 = await getOrCreateFolder(keyData.name);
        const f2 = await getOrCreateFolder(worker || "Воркер", f1);
        const f3 = await getOrCreateFolder(client || "Объект", f2);
        const f4 = await getOrCreateFolder(city || "Город", f3);
        const f5 = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), f4);

        const buffer = Buffer.from(image, 'base64');
        await drive.files.create({
            resource: { name: `${fileName}.jpg`, parents: [f5] },
            media: { mimeType: 'image/jpeg', body: Readable.from(buffer) }
        });

        console.log(`[SUCCESS] Фото сохранено в Google Drive`);
        res.json({ success: true });

        // Уведомление в Телеграм (тебе)
        bot.sendMessage('6846149935', `✅ Новый отчет!\nВоркер: ${worker}\nОбъект: ${client}\nГород: ${city}`);

    } catch (e) {
        console.error("[ERROR]", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Админка и ключи
app.get('/api/list_keys', (req, res) => res.json({ keys: DB.keys }));
app.post('/api/add_key', async (req, res) => {
    const { name, days, limit } = req.body;
    const key = { 
        key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(), 
        name, 
        expiry: new Date(Date.now() + (parseInt(days) || 30) * 86400000).toISOString(), 
        limit: parseInt(limit) || 1, 
        workers: [] 
    };
    DB.keys.push(key); saveDB(); res.json({ success: true, key });
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("LOGIST_X SERVER ONLINE"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SERVER RUNNING ON PORT ${PORT}`));
