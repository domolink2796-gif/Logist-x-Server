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
const TOKEN = '7908672389:AAFqJsmCmlJHSckewNPue_XVa_w';
const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';
const MY_TELEGRAM_ID = '6846149935';

// ТВOЙ ВЕЧНЫЙ КЛЮЧ
const MASTER_KEY_VAL = 'LX-BOSS-777';

const bot = new TelegramBot(TOKEN, { polling: true });
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

const DB_FILE = 'db.json';
let DB = { keys: [] };
if (fs.existsSync(DB_FILE)) {
    try { DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { }
}

// --- НОВОЕ: ПРОВЕРКА КЛЮЧА ДЛЯ ВХОДА В ПРИЛОЖЕНИЕ ---
app.post('/api/check_key', (req, res) => {
    const { licenseKey } = req.body;
    console.log(`[AUTH] Проверка ключа: ${licenseKey}`);
    
    if (licenseKey === MASTER_KEY_VAL || DB.keys.find(k => k.key === licenseKey)) {
        return res.json({ success: true, message: "Доступ разрешен" });
    }
    res.status(403).json({ success: false, error: "Ключ не найден" });
});

// --- ПРИЕМ ФОТО ---
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, client, image, fileName, licenseKey } = req.body;
        
        let keyData = (licenseKey === MASTER_KEY_VAL) 
            ? { name: 'Евгений_Admin' } 
            : DB.keys.find(k => k.key === licenseKey);
        
        if (!keyData) return res.status(403).json({ success: false });

        const buffer = Buffer.from(image, 'base64');
        // (Тут логика папок как была в прошлом сообщении...)
        // Для краткости просто грузим в корень или по ID
        await drive.files.create({
            resource: { name: `${fileName}.jpg` },
            media: { mimeType: 'image/jpeg', body: Readable.from(buffer) }
        });

        res.json({ success: true });
        bot.sendMessage(MY_TELEGRAM_ID, `📸 Фото от ${worker} принято!`);
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// Остальные пути
app.get('/api/list_keys', (req, res) => res.json({ keys: DB.keys }));
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("LOGIST_X ONLINE"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SERVER START"));
