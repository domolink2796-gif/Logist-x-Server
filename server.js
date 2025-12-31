const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const MY_TELEGRAM_ID = 6846149935;
const ADMIN_PASS = 'Logist_X_ADMIN'; 

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- АДМИНКА ---
app.get('/dashboard', (req, res) => {
    res.send(`<html><body style="background:#0a0c10;color:#f0ad4e;font-family:sans-serif;padding:20px;">
    <h1>LOGIST-X HQ</h1><p>Сервер работает. Бот в процессе подключения...</p>
    <button onclick="location.reload()">ОБНОВИТЬ СТАТУС</button></body></html>`);
});

// --- ЗАПУСК ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`);
    
    try {
        console.log("🔄 Сброс старых соединений...");
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log("✅ Соединение очищено");
        
        bot.launch().then(() => {
            console.log("🤖 БОТ ЗАПУЩЕН");
        }).catch((err) => {
            console.log("⚠️ Ошибка бота (но сервер живет):", err.message);
        });
    } catch (e) {
        console.log("⚠️ Критическая ошибка старта:", e.message);
    }
});

// Чтобы Railway не выключал сервер
setInterval(() => { console.log("💎 Logist-X Heartbeat: OK"); }, 60000);
