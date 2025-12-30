const express = require('express');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
// Твой токен бота, где сидит Дядя Гена
const bot = new Telegraf('8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg');

// Чтобы Чебурашка не показывал цифры, а показывал ПАНЕЛЬ
app.get('/admin-panel', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.resolve(__dirname, 'admin.html'));
});

// Когда Дядя Гена пишет /start
bot.start((ctx) => {
    ctx.reply('LOGIST-X: ПРИВЕТ ОТ ЧЕБУРАШКИ! 🦾', {
        reply_markup: {
            inline_keyboard: [[
                { text: "ОТКРЫТЬ ТЕЛЕВИЗОР", web_app: { url: "https://logist-x-server-production.up.railway.app/admin-panel" } }
            ]]
        }
    });
});

app.get('/', (req, res) => res.send("СИСТЕМА ГЕНЫ И ЧЕБУРАШКИ В СТРОЮ"));

bot.launch().catch(err => console.error("Бот упал:", err));
app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ПОДНЯЛСЯ"));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
