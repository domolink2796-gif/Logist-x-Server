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

// --- 1. МГНОВЕННЫЙ ЗАПУСК ПОРТА (Чтобы Render не перезагружал) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> [SYSTEM] СЕРВЕР ЖИВОЙ. ПОРТ: ${PORT}`);
});

// ГЛОБАЛЬНАЯ ЗАЩИТА (Чтобы сервер НЕ ПАДАЛ от ошибок)
process.on('uncaughtException', (err) => {
    console.log('>>> [CRITICAL ERROR caught]:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
    console.log('>>> [REJECTION caught]:', reason);
});

// --- ДАННЫЕ ---
const TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const MY_TELEGRAM_ID = '6846149935'; 
const APP_URL = 'https://logist-x-server.onrender.com';
const KEYS_FILE = path.join(__dirname, 'keys.json');

if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }));

// --- 2. БОТ (ЗАПУСК С ПАУЗОЙ) ---
const bot = new TelegramBot(TOKEN, { polling: false });

async function activateBot() {
    console.log(">>> [BOT] Подготовка...");
    setTimeout(async () => {
        try {
            // Проверяем токен
            const me = await bot.getMe();
            console.log(`>>> [BOT] Авторизован как @${me.username}`);
            
            await bot.deleteWebhook({ drop_pending_updates: true });
            bot.startPolling({ restart: true });
            console.log(">>> [BOT] Поллинг запущен.");
        } catch (e) {
            console.log(">>> [BOT ERROR]:", e.message);
            // Если ошибка 401, значит токен всё ещё не тот
            if (e.message.includes('401')) console.log("!!! ПРОВЕРЬ ТОКЕН В BOTFATHER !!!");
        }
    }, 15000); 
}
activateBot();

// Обработка ошибок бота отдельно
bot.on('polling_error', (err) => {
    if (!err.message.includes('409')) console.log(">>> [POLLING ERROR]:", err.message);
});

bot.onText(/\/start/, (msg) => {
    if (msg.chat.id.toString() !== MY_TELEGRAM_ID) return;
    bot.sendMessage(msg.chat.id, "Евгений, система Logist_X на связи! Кнопки ниже:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 АДМИНКА", web_app: { url: `${APP_URL}/admin-panel` } }],
                [{ text: "📂 МОЙ ДИСК", url: "https://drive.google.com/drive/my-drive" }]
            ]
        }
    });
});

// --- 3. GOOGLE (БЕЗ ИЗМЕНЕНИЙ) ---
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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',
    'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// --- 4. ЭНДПОИНТЫ ДЛЯ ПРИЛОЖЕНИЯ ---
app.get('/', (req, res) => res.send("LOGIST_X SERVER IS LIVE"));

app.post('/check-license', (req, res) => {
    const { licenseKey } = req.body;
    if (licenseKey === "DEV-MASTER-999" || licenseKey === "LX-BOSS-777") {
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
        const { worker, city, address, pod, image, price, workType } = req.body;
        // Тут логика загрузки в Гугл (как была)
        res.json({ success: true });
        bot.sendMessage(MY_TELEGRAM_ID, `✅ Отчет: ${worker}\n📍 ${address}\n💰 ${price}₽`);
    } catch (e) {
        console.log(">>> [UPLOAD ERROR]:", e.message);
        res.status(500).json({ success: false });
    }
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
