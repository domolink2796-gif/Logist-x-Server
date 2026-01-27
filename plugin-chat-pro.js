const fs = require('fs');
const path = require('path');
const express = require('express');

// Файл истории (будет лежать в папке public)
const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');

// Проверяем, есть ли папка public
if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
    fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
}

module.exports = function (app, context) {

    // 1. API: Отправка сообщения
    app.post('/x-api/chat-send', express.json(), (req, res) => {
        try {
            const { user, text, avatar, time } = req.body;
            
            // Лог в консоль сервера (чтобы ты видел активность)
            console.log(`💬 CHAT | ${user}: ${text}`);

            // Читаем текущую историю
            let history = [];
            if (fs.existsSync(chatDbFile)) {
                try { history = JSON.parse(fs.readFileSync(chatDbFile, 'utf8')); } catch (e) {}
            }

            // Добавляем новое сообщение
            const newMessage = { user, text, avatar, time: time || new Date().toLocaleTimeString() };
            history.push(newMessage);

            // Храним только последние 50 сообщений (чтобы не забивать память)
            if (history.length > 50) history.shift();

            // Сохраняем файл
            fs.writeFileSync(chatDbFile, JSON.stringify(history, null, 2));

            // --- ПРОВЕРКА СВЯЗИ ---
            let replyMsg = null;
            if (text && text.toLowerCase().includes('тест системы')) {
                replyMsg = `✅ Связь отличная, Шеф! Сервер принимает данные.`;
            }

            res.json({ success: true, reply: replyMsg });

        } catch (e) {
            console.error("Chat Error:", e.message);
            res.status(500).json({ success: false });
        }
    });

    // 2. API: Загрузка истории (чтобы при входе чат не был пустым)
    app.get('/x-api/chat-history', (req, res) => {
        if (fs.existsSync(chatDbFile)) {
            res.json(JSON.parse(fs.readFileSync(chatDbFile, 'utf8')));
        } else {
            res.json([]);
        }
    });

    console.log("🚀 ПЛАГИН X-CHAT (Автономный) ЗАПУЩЕН");
};
