const express = require('express');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
const bot = new Telegraf('8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg');

// НОВЫЙ АДРЕС - ЧТОБЫ БРАУЗЕР ЗАБЫЛ ПРО ЦИФРЫ
app.get('/hq-panel', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.resolve(__dirname, 'admin.html'));
});

// БОТ ТЕПЕРЬ ШЛЕТ НА НОВЫЙ АДРЕС
bot.start((ctx) => {
    ctx.reply('LOGIST-X: ПАНЕЛЬ ВОССТАНОВЛЕНА 🦾', {
        reply_markup: {
            inline_keyboard: [[
                { text: "ЗАПУСТИТЬ ТЕЛЕВИЗОР", web_app: { url: "https://logist-x-server-production.up.railway.app/hq-panel" } }
            ]]
        }
    });
});

app.get('/', (req, res) => res.send("СЕРВЕР В ПОРЯДКЕ"));

bot.launch().catch(err => console.error("Бот прилёг:", err));
app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ПОДНЯЛСЯ"));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
