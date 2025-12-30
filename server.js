const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
// Твой токен бота
const bot = new Telegraf('8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg');

// ГЛАВНОЕ: Убираем "цифры" и включаем графику
app.get('/admin-panel', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Бот: запуск админки кнопкой
bot.start((ctx) => {
    ctx.reply('LOGIST HQ: СИСТЕМА ГОТОВА 🦾', {
        reply_markup: {
            inline_keyboard: [[
                { text: "ОТКРЫТЬ ТЕЛЕВИЗОР", web_app: { url: `https://${req.headers.host}/admin-panel` } }
            ]]
        }
    });
});

app.get('/', (req, res) => res.send("СИСТЕМА LOGIST-X АКТИВНА"));

// Запуск без падений
bot.launch().catch(err => console.error("Ошибка бота:", err));
app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ПОДНЯЛСЯ"));

// Чтобы Railway не гасил сервер
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
