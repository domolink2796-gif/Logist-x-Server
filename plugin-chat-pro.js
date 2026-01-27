const fs = require('fs');
const path = require('path');
const express = require('express');

// Файл истории (теперь это будет объект с комнатами)
const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');

// Проверяем папку public
if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
    fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
}

// Помощник для чтения базы
function readDb() {
    if (!fs.existsSync(chatDbFile)) return {};
    try {
        return JSON.parse(fs.readFileSync(chatDbFile, 'utf8'));
    } catch (e) { return {}; }
}

module.exports = function (app, context) {

    // 1. API: Отправка сообщения (С поддержкой комнат)
    app.post('/x-api/chat-send', express.json(), (req, res) => {
        try {
            const { roomId, user, text, avatar, time } = req.body;
            const targetRoom = roomId || 'public'; // Если ID нет, кидаем в общую
            
            console.log(`💬 CHAT [${targetRoom}] | ${user}: ${text}`);

            let db = readDb();
            
            // Если такой комнаты еще нет — создаем её
            if (!db[targetRoom]) db[targetRoom] = [];

            // Добавляем сообщение
            const newMessage = { 
                user, 
                text, 
                avatar, 
                time: time || new Date().toLocaleTimeString(),
                timestamp: Date.now() 
            };
            
            db[targetRoom].push(newMessage);

            // Лимит 100 сообщений на одну комнату
            if (db[targetRoom].length > 100) db[targetRoom].shift();

            fs.writeFileSync(chatDbFile, JSON.stringify(db, null, 2));

            res.json({ success: true });

        } catch (e) {
            console.error("Chat Error:", e.message);
            res.status(500).json({ success: false });
        }
    });

    // 2. API: Загрузка истории конкретной комнаты
    app.get('/x-api/chat-history', (req, res) => {
        const roomId = req.query.roomId || 'public';
        const db = readDb();
        res.json(db[roomId] || []);
    });

    // 3. API: Список всех активных чатов (ДЛЯ АДМИНА)
    app.get('/x-api/chat-list', (req, res) => {
        try {
            const db = readDb();
            const list = Object.keys(db).map(roomId => {
                const lastMsg = db[roomId][db[roomId].length - 1];
                return {
                    id: roomId,
                    lastUser: lastMsg ? lastMsg.user : 'Empty',
                    lastText: lastMsg ? lastMsg.text : ''
                };
            });
            res.json(list);
        } catch (e) {
            res.json([]);
        }
    });

    console.log("🚀 ПЛАГИН X-CHAT (MULTI-ROOM) ЗАПУЩЕН");
};
