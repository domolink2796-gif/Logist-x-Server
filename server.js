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

const TOKEN = '7908672389:AAF63DoOmlrCXTRoIlmFVg71I1SgC55kHUc';
const MY_TELEGRAM_ID = '6846149935';
const KEYS_FILE = path.join(__dirname, 'keys.json');

const bot = new TelegramBot(TOKEN, { polling: true });

// ГЛАВНОЕ МЕНЮ
const mainMenu = {
    reply_markup: {
        keyboard: [
            [
                // АДМИНКА - открывается СРАЗУ (WebApp)
                { text: "📊 Админ-панель", web_app: { url: "https://logist-x-server.onrender.com/admin-panel" } },
                // ДИСК - просто текст, на который бот ответит ссылкой
                { text: "📂 Google Drive" }
            ]
        ],
        resize_keyboard: true
    }
};

// ОБРАБОТКА НАЖАТИЯ НА "📂 Google Drive"
bot.on('message', (msg) => {
    if (msg.text === "📂 Google Drive") {
        bot.sendMessage(msg.chat.id, "Нажми на кнопку ниже, чтобы перейти в Google Диск:", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔗 ПЕРЕЙТИ В GOOGLE DRIVE", url: "https://drive.google.com/drive/my-drive" }]
                ]
            }
        });
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Привет, Евгений! Твои кнопки управления:", mainMenu);
});

// (Весь остальной код загрузки фото и работы с папками остается таким же идеальным)
// ... [здесь твой код из прошлых сообщений] ...

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("SERVER ONLINE"));
app.listen(process.env.PORT || 3000, () => console.log("SERVER START"));
