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

// --- 1. ПЕРЕМЕННЫЕ (ПРОВЕРЯЕМ ТОЧНОСТЬ) ---
const TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const MY_ID = '6846149935'; 
const APP_URL = 'https://logist-x-server.onrender.com';

console.log(">>> [LOG] Шаг 1: Переменные загружены");

// --- 2. ЗАПУСК ПОРТА (СРАЗУ) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> [LOG] Шаг 2: Порт ${PORT} открыт. Render должен быть доволен.`);
});

// --- 3. ИНИЦИАЛИЗАЦИЯ БОТА ---
let bot;
try {
    bot = new TelegramBot(TOKEN, { polling: true });
    console.log(">>> [LOG] Шаг 3: Объект бота создан успешно");
} catch (err) {
    console.log(">>> [LOG] ОШИБКА ПРИ СОЗДАНИИ ОБЪЕКТА БОТА:", err.message);
}

// Ловим ошибки поллинга
if (bot) {
    bot.on('polling_error', (err) => {
        console.log(">>> [LOG] ОШИБКА ПОЛЛИНГА:", err.message);
    });

    // Реакция на /start
    bot.onText(/\/start/, (msg) => {
        console.log(`>>> [LOG] Получена команда /start от ID: ${msg.chat.id}`);
        if (msg.chat.id.toString() === MY_ID) {
            bot.sendMessage(MY_ID, "Евгений, система Logist_X на связи! Кнопки:", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📊 АДМИНКА", web_app: { url: `${APP_URL}/admin-panel` } }],
                        [{ text: "📂 МОЙ ДИСК", url: "https://drive.google.com/drive/my-drive" }]
                    ]
                }
            });
        }
    });
}

// --- 4. ОСТАЛЬНАЯ ЛОГИКА (GOOGLE И Т.Д.) ---
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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',
    'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

app.get('/', (req, res) => res.send("SERVER IS RUNNING"));
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Заглушка для загрузки, чтобы не падало
app.post('/upload', (req, res) => {
    console.log(">>> [LOG] Получен запрос на загрузку");
    res.json({ success: true });
});
