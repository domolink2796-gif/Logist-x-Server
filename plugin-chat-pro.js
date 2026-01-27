const fs = require('fs');
const path = require('path');
const express = require('express');

const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');
let memoryDb = {};

if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
    fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
}

function loadToMemory() {
    if (!fs.existsSync(chatDbFile)) return;
    try {
        const data = fs.readFileSync(chatDbFile, 'utf8');
        if (data) memoryDb = JSON.parse(data);
    } catch (e) { memoryDb = {}; }
}
loadToMemory();

module.exports = function (app, context) {

    // Лимит 100мб для фото и голоса
    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    // 1. ОТПРАВКА (Текст, Голос, Фото)
    app.post('/x-api/chat-send', (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage, speechText } = req.body;
            const targetRoom = roomId || 'public';
            
            if (!memoryDb[targetRoom]) memoryDb[targetRoom] = [];

            const newMessage = { 
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
                user, 
                text, 
                avatar, 
                isAudio: !!isAudio,
                isImage: !!isImage, // Новое поле для фото
                time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                timestamp: Date.now() 
            };
            
            memoryDb[targetRoom].push(newMessage);

            // Логика автоответа
            const checkText = (String(text || "") + " " + String(speechText || "")).toLowerCase();
            if (checkText.includes("проверка связи")) {
                memoryDb[targetRoom].push({
                    id: 'sys_' + Date.now(),
                    user: "X-SYSTEM",
                    text: "Система X-CONNECT онлайн. Все каналы работают штатно! 🚀",
                    avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
                    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                    timestamp: Date.now() + 5
                });
            }

            fs.writeFileSync(chatDbFile, JSON.stringify(memoryDb, null, 2));
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // 2. УДАЛЕНИЕ ОДНОГО СООБЩЕНИЯ
    app.post('/x-api/chat-delete', (req, res) => {
        try {
            const { roomId, msgId } = req.body;
            if (memoryDb[roomId]) {
                memoryDb[roomId] = memoryDb[roomId].filter(m => m.id !== msgId);
                fs.writeFileSync(chatDbFile, JSON.stringify(memoryDb, null, 2));
                return res.json({ success: true });
            }
            res.json({ success: false });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // 3. ПОЛНАЯ ОЧИСТКА ЧАТА (Для Админа)
    app.post('/x-api/chat-clear', (req, res) => {
        try {
            const { roomId } = req.body;
            memoryDb[roomId] = [];
            fs.writeFileSync(chatDbFile, JSON.stringify(memoryDb, null, 2));
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // ИСТОРИЯ
    app.get('/x-api/chat-history', (req, res) => {
        const roomId = req.query.roomId || 'public';
        res.setHeader('Cache-Control', 'no-cache');
        res.json(memoryDb[roomId] || []);
    });

    // СПИСОК ЧАТОВ
    app.get('/x-api/chat-list', (req, res) => {
        const list = Object.keys(memoryDb).map(id => ({
            id,
            lastUser: memoryDb[id][memoryDb[id].length - 1]?.user || 'Empty'
        }));
        res.json(list);
    });

    app.get('/x-api/ping', (req, res) => res.send('ok'));
    console.log("🦾 МОЩНЫЙ СЕРВЕР X-CHAT (ФОТО/УДАЛЕНИЕ/БЕЗЛИМИТ) ЗАПУЩЕН");
};
