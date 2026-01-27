const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');

const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');
const subDbFile = path.join(process.cwd(), 'public', 'subscriptions.json');
let memoryDb = {};
let subscriptions = {};

const vapidKeys = {
    publicKey: 'BPOw_-Te5biFuSMrQLHjfsv3c9LtoFZkhHJp9FE1a1f55L8jGuL1uR39Ho9SWMN6dIdVt8FfxNHwcHuV0uUQ9Jg',
    privateKey: '0SJWxEuVpUlowi2gTaodAoGne93V9DB6PFBoSMbL1WE'
};

webpush.setVapidDetails('mailto:admin@logist-x.store', vapidKeys.publicKey, vapidKeys.privateKey);

function getMskTime() {
    return new Date().toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false
    });
}

const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000; 

if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
    fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
}

// Оптимизированная очистка (асинхронная запись)
function cleanOldMessages() {
    const now = Date.now();
    let totalRemoved = 0;
    for (const roomId in memoryDb) {
        const countBefore = memoryDb[roomId].length;
        memoryDb[roomId] = memoryDb[roomId].filter(m => (now - m.timestamp) < MAX_MESSAGE_AGE_MS);
        totalRemoved += (countBefore - memoryDb[roomId].length);
    }
    if (totalRemoved > 0) {
        console.log(`🧹 АВТО-ОЧИСТКА [${getMskTime()}]: Удалено ${totalRemoved}.`);
        fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), () => {});
    }
}

function loadToMemory() {
    if (fs.existsSync(chatDbFile)) {
        try { memoryDb = JSON.parse(fs.readFileSync(chatDbFile, 'utf8')); cleanOldMessages(); } catch (e) { memoryDb = {}; }
    }
    if (fs.existsSync(subDbFile)) {
        try { subscriptions = JSON.parse(fs.readFileSync(subDbFile, 'utf8')); } catch (e) { subscriptions = {}; }
    }
}

loadToMemory();
setInterval(cleanOldMessages, 60 * 60 * 1000);

module.exports = function (app, context) {
    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    app.post('/x-api/save-subscription', (req, res) => {
        const { chatId, subscription } = req.body;
        if (chatId && subscription) {
            subscriptions[chatId] = subscription;
            fs.writeFile(subDbFile, JSON.stringify(subscriptions, null, 2), () => {});
            return res.json({ success: true });
        }
        res.status(400).json({ success: false });
    });

    app.get('/x-api/vapid-key', (req, res) => res.send(vapidKeys.publicKey));

    // --- РЕАКТИВНАЯ ОТПРАВКА ---
    app.post('/x-api/chat-send', (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage, speechText, myChatId } = req.body;
            const targetRoom = roomId || 'public';
            
            if (!memoryDb[targetRoom]) memoryDb[targetRoom] = [];

            const newMessage = { 
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
                user, text, avatar, 
                isAudio: !!isAudio, isImage: !!isImage,
                time: getMskTime(), 
                timestamp: Date.now() 
            };
            
            memoryDb[targetRoom].push(newMessage);

            // ⚡ ШАГ 1: МОМЕНТАЛЬНЫЙ ОТВЕТ КЛИЕНТУ
            res.json({ success: true });

            // 🛠 ШАГ 2: ФОНОВЫЕ ОПЕРАЦИИ (не тормозят чат)
            setImmediate(() => {
                // Асинхронная запись истории
                fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), (err) => {
                    if (err) console.error("❌ Ошибка сохранения истории:", err);
                });

                // Рассылка пушей
                const pushPayload = JSON.stringify({
                    title: user,
                    body: isAudio ? "Голосовое сообщение 🎤" : (isImage ? "Фотография 📸" : text),
                    icon: avatar || "https://cdn-icons-png.flaticon.com/512/4712/4712035.png"
                });

                Object.keys(subscriptions).forEach(subChatId => {
                    if (subChatId !== myChatId) {
                        webpush.sendNotification(subscriptions[subChatId], pushPayload)
                            .catch(err => {
                                if (err.statusCode === 404 || err.statusCode === 410) {
                                    delete subscriptions[subChatId];
                                    fs.writeFile(subDbFile, JSON.stringify(subscriptions, null, 2), () => {});
                                }
                            });
                    }
                });

                // Обработка автоответа системы
                const checkText = (String(text || "") + " " + String(speechText || "")).toLowerCase();
                if (checkText.includes("проверка связи")) {
                    memoryDb[targetRoom].push({
                        id: 'sys_' + Date.now(),
                        user: "X-SYSTEM",
                        text: "Канал стабилен. Все узлы X-CONNECT онлайн! 🚀",
                        avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
                        time: getMskTime(),
                        timestamp: Date.now() + 10
                    });
                    fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), () => {});
                }
            });

        } catch (e) { 
            console.error("❌ КРИТИЧЕСКАЯ ОШИБКА:", e.message);
            if (!res.headersSent) res.status(500).json({ success: false }); 
        }
    });

    app.post('/x-api/chat-delete', (req, res) => {
        try {
            const { roomId, msgId } = req.body;
            if (memoryDb[roomId]) {
                memoryDb[roomId] = memoryDb[roomId].filter(m => m.id !== msgId);
                res.json({ success: true }); // Отвечаем сразу
                fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), () => {});
                return;
            }
            res.json({ success: false });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    app.get('/x-api/chat-history', (req, res) => {
        res.json(memoryDb[req.query.roomId || 'public'] || []);
    });

    app.get('/x-api/chat-list', (req, res) => {
        const list = Object.keys(memoryDb).map(id => ({
            id, lastUser: memoryDb[id][memoryDb[id].length - 1]?.user || 'Empty'
        }));
        res.json(list);
    });

    app.get('/x-api/ping', (req, res) => res.send('ok'));
};
