const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
const bot = new Telegraf('8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg');

// Чтобы админка была КРАСИВОЙ (без цифр на экране)
app.get('/admin-panel', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Бот: запуск админки одной кнопкой
bot.start((ctx) => {
    ctx.reply('LOGIST HQ: ДОСТУП РАЗРЕШЕН 🦾', {
        reply_markup: {
            inline_keyboard: [[
                { text: "ОТКРЫТЬ ТЕЛЕВИЗОР", web_app: { url: `https://${req.headers.host}/admin-panel` } }
            ]]
        }
    });
});

app.get('/', (req, res) => res.send("СИСТЕМА LOGIST-X АКТИВНА"));

// Запуск бота и сервера
bot.launch().catch(err => console.error("Ошибка бота:", err));
app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ЖИВОЙ"));

// Чтобы не было ошибки Stopping
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
