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

// --- ДАННЫЕ ИЗ ТВОИХ СООБЩЕНИЙ ---
const TOKEN = '7908672389:AAFv_T2qZU7hO9NlaUvD2WslVHxdPvVdjIc'; // Твой токен
const MY_TELEGRAM_ID = '6846149935'; // Твой ID
const MASTER_KEY_VAL = 'LX-BOSS-777'; 
const APP_URL = 'https://logist-x-server.onrender.com';
const KEYS_FILE = path.join(__dirname, 'keys.json');

if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }));

// --- СТАРТ ПОРТА (МГНОВЕННО) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> [SYSTEM] СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`);
});

// --- БОТ С ПРОВЕРКОЙ АВТОРИЗАЦИИ (ОШИБКА 401) ---
const bot = new TelegramBot(TOKEN, { polling: false });

async function checkBotAuth() {
    console.log(">>> [BOT] Проверка токена...");
    try {
        const me = await bot.getMe();
        console.log(`>>> [OK] Бот @${me.username} успешно авторизован!`);
        
        // Очищаем хвосты и запускаем
        await bot.deleteWebhook({ drop_pending_updates: true });
        setTimeout(() => {
            bot.startPolling({ restart: true });
            console.log(">>> [OK] Поллинг запущен.");
        }, 5000);
    } catch (e) {
        if (e.message.includes('401')) {
            console.log(">>> [КРИТИЧЕСКАЯ ОШИБКА] 401: Твой токен Telegram не подходит. Проверь его в BotFather!");
        } else {
            console.log(">>> [BOT ERROR]:", e.message);
        }
    }
}
checkBotAuth();

// Команда /start для тебя
bot.onText(/\/start/, (msg) => {
    if (msg.chat.id.toString() !== MY_TELEGRAM_ID) return;
    bot.sendMessage(msg.chat.id, "Евгений, всё готово! Работаем по трем видам: монтаж, замена рекламы и pseudomona.", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 АДМИНКА", web_app: { url: `${APP_URL}/admin-panel` } }],
                [{ text: "📂 МОЙ ДИСК", url: "https://drive.google.com/drive/my-drive" }]
            ]
        }
    });
});

// --- GOOGLE AUTH ---
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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',
    'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// --- API ДЛЯ ПРИЛОЖЕНИЯ ---
app.post('/check-license', (req, res) => {
    const { licenseKey } = req.body;
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

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, pod, client, image, licenseKey, coords, workType, price, fileName } = req.body;
        let clientName = "Евгений_БОСС";
        
        const buffer = Buffer.from(image, 'base64');
        // Загрузка (тут тоже может быть 401 от Google)
        const file = await drive.files.create({
            resource: { name: `${fileName}.jpg` },
            media: { mimeType: 'image/jpeg', body: Readable.from(buffer) }
        }).catch(err => {
            if (err.message.includes('401')) console.log(">>> [GOOGLE ERROR] 401: Refresh Token устарел!");
            throw err;
        });

        res.json({ success: true });
        bot.sendMessage(MY_TELEGRAM_ID, `✅ Отчет принят: ${worker}\nРабота: ${workType || 'монтаж'}`);
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("SERVER LIVE"));
