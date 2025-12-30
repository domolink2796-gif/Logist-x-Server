const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
// Твой токен бота
const bot = new Telegraf('8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg');

// 1. УБИРАЕМ "ЦИФРЫ" - ПРАВИЛЬНЫЙ ВЫВОД АДМИНКИ
app.get('/admin-panel', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// 2. ИСПРАВЛЕННАЯ КОМАНДА ДЛЯ БОТА (БЕЗ ОШИБОК)
bot.start((ctx) => {
    // Получаем адрес твоего сервера автоматически
    const domain = ctx.worker && ctx.worker.domain ? ctx.worker.domain : "logist-x-server-production.up.railway.app";
    
    ctx.reply('LOGIST HQ: ДОСТУП РАЗРЕШЕН 🦾', {
        reply_markup: {
            inline_keyboard: [[
                { text: "ОТКРЫТЬ ТЕЛЕВИЗОР", web_app: { url: `https://${domain}/admin-panel` } }
            ]]
        }
    });
});

app.get('/', (req, res) => res.send("СИСТЕМА LOGIST-X АКТИВНА"));

// Запуск бота
bot.launch().then(() => console.log(">>> БОТ ВКЛЮЧЕН"));

// Запуск сервера
app.listen(process.env.PORT || 3000, () => console.log(">>> СЕРВЕР ЖИВОЙ"));

// Защита от зависания
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
