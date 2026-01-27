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

    // --- ФИКС ЛИМИТОВ: Разрешаем большие данные (голосовые сообщения) ---
    app.use('/x-api/', express.json({ limit: '50mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '50mb', extended: true }));

    // 1. API: Отправка сообщения
    app.post('/x-api/chat-send', (req, res) => {
        try {
            const { roomId, user, text, avatar, time, isAudio } = req.body;
            const targetRoom = roomId || 'public';
            
            // Если это звук, не забиваем консоль цифрами, пишем [AUDIO]
            const logText = isAudio ? "[AUDIO MESSAGE]" : text;
            console.log(`💬 CHAT [${targetRoom}] | ${user}: ${logText}`);

            let db = readDb();
            if (!db[targetRoom]) db[targetRoom] = [];

            const newMessage = { 
                user, 
                text, 
                avatar, 
                time: time || new Date().toLocaleTimeString(),
                timestamp: Date.now() 
            };
            
            db[targetRoom].push(newMessage);

            // --- ЛОГИКА АВТООТВЕТА (ПРОВЕРКА СВЯЗИ) ---
            const lowerText = String(text).toLowerCase();
            if (lowerText.includes("проверка связи")) {
                setTimeout(() => {
                    const freshDb = readDb();
                    if (!freshDb[targetRoom]) freshDb[targetRoom] = [];
                    
                    freshDb[targetRoom].push({
                        user: "X-SYSTEM",
                        text: "Связь установлена! Система X-CONNECT работает штатно. 🚀",
                        avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
                        time: new Date().toLocaleTimeString(),
                        timestamp: Date.now() + 100
                    });
                    
                    fs.writeFileSync(chatDbFile, JSON.stringify(freshDb, null, 2));
                }, 1000); // Отвечаем через секунду
            }

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
                const roomMsgs = db[roomId];
                const lastMsg = roomMsgs[roomMsgs.length - 1];
                return {
                    id: roomId,
                    lastUser: lastMsg ? lastMsg.user : 'Empty',
                    lastText: lastMsg ? (lastMsg.text.startsWith('data:audio') ? '[Голосовое]' : lastMsg.text) : ''
                };
            });
            res.json(list);
        } catch (e) {
            res.json([]);
        }
    });

    // 4. Пинг сервера
    app.get('/x-api/ping', (req, res) => res.send('ok'));

    console.log("🚀 ПЛАГИН X-CHAT (VOICE & AUTO-REPLY) ЗАПУЩЕН");
};
