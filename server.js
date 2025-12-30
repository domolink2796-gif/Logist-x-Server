const express = require('express');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
const bot = new Telegraf('8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg');

// ГЛАВНОЕ: УБИРАЕМ ЦИФРЫ ПРИНУДИТЕЛЬНО
app.use('/admin-panel', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.resolve(__dirname, 'admin.html'));
});

// Кнопка в боте
bot.start((ctx) => {
    ctx.reply('LOGIST HQ: ДОСТУП ОТКРЫТ 🦾', {
        reply_markup: {
            inline_keyboard: [[
                { text: "ОТКРЫТЬ ТЕЛЕВИЗОР", web_app: { url: "https://logist-x-server-production.up.railway.app/admin-panel" } }
            ]]
        }
    });
});

app.get('/', (req, res) => res.send("<h1>СИСТЕМА ЛОГИСТИКА X ВКЛЮЧЕНА</h1>"));

// Запуск без падений
bot.launch().catch(err => console.error("Ошибка бота:", err));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`>>> СЕРВЕР ПОДНЯЛСЯ НА ПОРТУ ${PORT}`));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
