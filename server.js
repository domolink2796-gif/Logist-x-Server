const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
// Твой токен бота
const bot = new Telegraf('8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg');

// ГЛАВНОЕ ИСПРАВЛЕНИЕ: ПРИНУДИТЕЛЬНЫЙ ВЫВОД КАРТИНКИ
app.get('/admin-panel', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// КНОПКА ДЛЯ БОТА (БЕЗ ОШИБОК 502)
bot.start((ctx) => {
    const webAppUrl = "https://logist-x-server-production.up.railway.app/admin-panel";
    ctx.reply('LOGIST HQ: ДОСТУП РАЗРЕШЕН 🦾', {
        reply_markup: {
            inline_keyboard: [[
                { text: "ОТКРЫТЬ ТЕЛЕВИЗОР", web_app: { url: webAppUrl } }
            ]]
        }
    });
});

app.get('/', (req, res) => res.send("СИСТЕМА LOGIST-X АКТИВНА"));

bot.launch().then(() => console.log(">>> БОТ ВКЛЮЧЕН"));
app.listen(process.env.PORT || 3000, () => console.log(">>> СЕРВЕР ЖИВОЙ"));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
