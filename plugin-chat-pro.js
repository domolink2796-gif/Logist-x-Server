const fs = require('fs');
const path = require('path');
const express = require('express');

const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');
let memoryDb = {};

// --- НОВОЕ: Функция для принудительного Московского времени ---
function getMskTime() {
    return new Date().toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

// Настройка: удаляем сообщения старше 24 часов
const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000; 

if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
    fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
}

// ФУНКЦИЯ ОЧИСТКИ СТАРОГО МУСОРА
function cleanOldMessages() {
    const now = Date.now();
    let totalRemoved = 0;

    for (const roomId in memoryDb) {
        const countBefore = memoryDb[roomId].length;
        // Оставляем только те, что моложе 24 часов
        memoryDb[roomId] = memoryDb[roomId].filter(m => (now - m.timestamp) < MAX_MESSAGE_AGE_MS);
        totalRemoved += (countBefore - memoryDb[roomId].length);
    }

    if (totalRemoved > 0) {
        console.log(`🧹 АВТО-ОЧИСТКА [${getMskTime()} МСК]: Удалено ${totalRemoved} старых сообщений.`);
        fs.writeFileSync(chatDbFile, JSON.stringify(memoryDb, null, 2));
    }
}

function loadToMemory() {
    if (!fs.existsSync(chatDbFile)) return;
    try {
        const data = fs.readFileSync(chatDbFile, 'utf8');
        if (data) {
            memoryDb = JSON.parse(data);
            cleanOldMessages(); // Чистим сразу при старте
        }
    } catch (e) { memoryDb = {}; }
}

loadToMemory();

// Запускаем очистку каждый час
setInterval(cleanOldMessages, 60 * 60 * 1000);

module.exports = function (app, context) {
    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    // 1. ОТПРАВКА (Текст, Голос, Фото)
    app.post('/x-api/chat-send', (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage, speechText } = req.body;
            const targetRoom = roomId || 'public';
            
            // ЛОГИРОВАНИЕ ДЛЯ КОНТРОЛЯ (Теперь с МСК временем)
            let type = "ТЕКСТ";
            if (isAudio) type = "ГОЛОС 🎤";
            if (isImage) type = "ФОТО 📸";
            console.log(`📩 [${targetRoom}] ${user} (${getMskTime()} МСК): Прислал ${type}`);

            if (!memoryDb[targetRoom]) memoryDb[targetRoom] = [];

            const newMessage = { 
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
                user, 
                text, 
                avatar, 
                isAudio: !!isAudio,
                isImage: !!isImage,
                // --- ВРЕМЯ ТЕПЕРЬ ВСЕГДА ПО МОСКВЕ ---
                time: getMskTime(), 
                timestamp: Date.now() 
            };
            
            memoryDb[targetRoom].push(newMessage);

            // Автоответ системы
            const checkText = (String(text || "") + " " + String(speechText || "")).toLowerCase();
            if (checkText.includes("проверка связи")) {
                console.log(`🤖 X-SYSTEM [${getMskTime()}]: Даю ответ...`);
                memoryDb[targetRoom].push({
                    id: 'sys_' + Date.now(),
                    user: "X-SYSTEM",
                    text: "Канал стабилен. Все узлы X-CONNECT онлайн! 🚀",
                    avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
                    time: getMskTime(), // И тут тоже Москва
                    timestamp: Date.now() + 10
                });
            }

            // Жёсткая запись в файл
            fs.writeFileSync(chatDbFile, JSON.stringify(memoryDb, null, 2));
            res.json({ success: true });

        } catch (e) { 
            console.error("❌ ОШИБКА:", e.message);
            res.status(500).json({ success: false }); 
        }
    });

    // 2. УДАЛЕНИЕ
    app.post('/x-api/chat-delete', (req, res) => {
        try {
            const { roomId, msgId } = req.body;
            if (memoryDb[roomId]) {
                memoryDb[roomId] = memoryDb[roomId].filter(m => m.id !== msgId);
                fs.writeFileSync(chatDbFile, JSON.stringify(memoryDb, null, 2));
                console.log(`🗑️ УДАЛЕНИЕ [${getMskTime()}]: Сообщение ${msgId} стерто.`);
                return res.json({ success: true });
            }
            res.json({ success: false });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // 3. ОЧИСТКА ЧАТА (Админ)
    app.post('/x-api/chat-clear', (req, res) => {
        try {
            const { roomId } = req.body;
            memoryDb[roomId] = [];
            fs.writeFileSync(chatDbFile, JSON.stringify(memoryDb, null, 2));
            console.log(`🧹 ОЧИСТКА [${getMskTime()}]: Комната ${roomId} обнулена.`);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    app.get('/x-api/chat-history', (req, res) => {
        const roomId = req.query.roomId || 'public';
        res.setHeader('Cache-Control', 'no-cache');
        res.json(memoryDb[roomId] || []);
    });

    app.get('/x-api/chat-list', (req, res) => {
        const list = Object.keys(memoryDb).map(id => ({
            id,
            lastUser: memoryDb[id][memoryDb[id].length - 1]?.user || 'Empty'
        }));
        res.json(list);
    });

    app.get('/x-api/ping', (req, res) => res.send('ok'));
    
    console.log(`🦾 X-CONNECT ЗАПУЩЕН. ТЕКУЩЕЕ ВРЕМЯ МСК: ${getMskTime()}`);
};
