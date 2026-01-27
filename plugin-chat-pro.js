const fs = require('fs');
const path = require('path');
const express = require('express');

const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');

if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
    fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
}

function readDb() {
    if (!fs.existsSync(chatDbFile)) return {};
    try {
        const data = fs.readFileSync(chatDbFile, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

module.exports = function (app, context) {

    // РАСШИРЯЕМ ГОРЛЫШКО: для голоса до 50МБ
    app.use('/x-api/', express.json({ limit: '50mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '50mb', extended: true }));

    app.post('/x-api/chat-send', (req, res) => {
        try {
            // Берем text (сообщение или звук) и speechText (распознанный голос)
            const { roomId, user, text, avatar, time, isAudio, speechText } = req.body;
            const targetRoom = roomId || 'public';
            
            const logText = isAudio ? `[AUDIO] ${speechText || ''}` : text;
            console.log(`💬 CHAT [${targetRoom}] | ${user}: ${logText}`);

            let db = readDb();
            if (!db[targetRoom]) db[targetRoom] = [];

            // 1. Добавляем твое сообщение
            const newMessage = { 
                user, 
                text, 
                avatar, 
                time: time || new Date().toLocaleTimeString(),
                timestamp: Date.now() 
            };
            db[targetRoom].push(newMessage);

            // 2. ПРОВЕРКА ТРИГГЕРА (и в тексте, и в распознанном голосе)
            const contentToCheck = (String(text || "") + " " + String(speechText || "")).toLowerCase();
            
            if (contentToCheck.includes("проверка связи")) {
                console.log("🤖 ТРИГГЕР СРАБОТАЛ: Добавляю ответ системы...");
                
                db[targetRoom].push({
                    user: "X-SYSTEM",
                    text: "Связь установлена! Сервер logist-x работает в штатном режиме. 🚀",
                    avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
                    time: new Date().toLocaleTimeString(),
                    timestamp: Date.now() + 50 // чуть позже основного
                });
            }

            // Лимит сообщений
            if (db[targetRoom].length > 100) db[targetRoom].shift();

            // 3. СОХРАНЯЕМ ВСЁ СРАЗУ (мгновенно)
            fs.writeFileSync(chatDbFile, JSON.stringify(db, null, 2));

            res.json({ success: true });

        } catch (e) {
            console.error("❌ Ошибка чата:", e.message);
            res.status(500).json({ success: false });
        }
    });

    app.get('/x-api/chat-history', (req, res) => {
        const roomId = req.query.roomId || 'public';
        const db = readDb();
        res.json(db[roomId] || []);
    });

    app.get('/x-api/chat-list', (req, res) => {
        try {
            const db = readDb();
            res.json(Object.keys(db).map(roomId => ({
                id: roomId,
                lastUser: db[roomId][db[roomId].length - 1]?.user || 'Empty'
            })));
        } catch (e) { res.json([]); }
    });

    app.get('/x-api/ping', (req, res) => res.send('ok'));

    console.log("🚀 ПЛАГИН X-CHAT (VOICE & AUTO-REPLY) ОБНОВЛЕН");
};
