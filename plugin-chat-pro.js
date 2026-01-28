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

function cleanOldMessages() {
    const now = Date.now();
    let totalRemoved = 0;
    for (const roomId in memoryDb) {
        const countBefore = memoryDb[roomId].length;
        memoryDb[roomId] = memoryDb[roomId].filter(m => (now - m.timestamp) < MAX_MESSAGE_AGE_MS);
        totalRemoved += (countBefore - memoryDb[roomId].length);
    }
    if (totalRemoved > 0) {
        console.log(`🧹 [CLEANER] ${getMskTime()}: Удалено старых сообщений: ${totalRemoved}`);
        fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), () => {});
    }
}

function loadToMemory() {
    console.log(`📡 [SYSTEM] ${getMskTime()}: Старт системы...`);
    if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
        fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
    }
    if (fs.existsSync(chatDbFile)) {
        try { memoryDb = JSON.parse(fs.readFileSync(chatDbFile, 'utf8')); } catch (e) { memoryDb = {}; }
    }
    if (fs.existsSync(subDbFile)) {
        try { subscriptions = JSON.parse(fs.readFileSync(subDbFile, 'utf8')); } catch (e) { subscriptions = {}; }
    }
    console.log(`✅ [SYSTEM]: База подписок содержит: ${Object.keys(subscriptions).length} токенов`);
    cleanOldMessages();
}

loadToMemory();
setInterval(cleanOldMessages, 60 * 60 * 1000);

module.exports = function (app, context) {
    const io = context.io; 

    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    if (io) {
        io.on('connection', (socket) => {
            console.log(`🔌 [SOCKET]: Подключен клиент ${socket.id}`);
            socket.on('join_room', (roomId) => {
                socket.join(roomId);
                console.log(`👁️ [SOCKET]: Клиент ${socket.id} зашел в ${roomId}`);
            });
            socket.on('disconnect', () => {
                console.log(`🔌 [SOCKET]: Клиент ${socket.id} отключился`);
            });
        });
    }

    app.post('/x-api/save-subscription', (req, res) => {
        const { chatId, subscription } = req.body;
        console.log(`🔔 [PUSH-REG]: Запрос на регистрацию для [${chatId}]`);
        if (chatId && subscription) {
            subscriptions[chatId] = subscription;
            fs.writeFile(subDbFile, JSON.stringify(subscriptions, null, 2), () => {
                console.log(`✅ [PUSH-REG]: Токен для ${chatId} успешно сохранен в файл`);
            });
            return res.json({ success: true });
        }
        res.status(400).json({ success: false });
    });

    app.get('/x-api/vapid-key', (req, res) => res.send(vapidKeys.publicKey));

    app.post('/x-api/chat-send', (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage, speechText, myChatId } = req.body;
            const targetRoom = roomId || 'public';
            
            console.log(`📩 [ЧАТ] ${getMskTime()}: Новое от ${user} в ${targetRoom}`);

            if (!memoryDb[targetRoom]) memoryDb[targetRoom] = [];

            const newMessage = { 
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
                user, text, avatar, 
                isAudio: !!isAudio, isImage: !!isImage,
                time: getMskTime(), 
                timestamp: Date.now() 
            };
            
            memoryDb[targetRoom].push(newMessage);
            
            if (io) {
                io.to(targetRoom).emit('new_message', newMessage);
                console.log(`🚀 [SOCKET]: Отправлено в эфир комнаты ${targetRoom}`);
            }

            res.json({ success: true });

            setImmediate(() => {
                fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), () => {});

                const checkText = (String(text || "") + " " + String(speechText || "")).toLowerCase();
                if (checkText.includes("проверка связи")) {
                    const sysMsg = {
                        id: 'sys_' + Date.now(),
                        user: "X-SYSTEM",
                        text: "Канал стабилен. Все узлы X-CONNECT онлайн! 🚀",
                        avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
                        time: getMskTime(),
                        timestamp: Date.now() + 10
                    };
                    memoryDb[targetRoom].push(sysMsg);
                    if (io) io.to(targetRoom).emit('new_message', sysMsg);
                }

                // 🔥 ИСПРАВЛЕННЫЙ ПУШ-ПАКЕТ (Облегченный для мобилок)
                const pushPayload = JSON.stringify({
                    title: String(user).substring(0, 50),
                    body: isAudio ? "🎤 Голос" : (isImage ? "📸 Фото" : String(text || "").substring(0, 100)),
                    // Убираем передачу тяжелых аватар из пуша, чтобы не превысить 4Кб
                    icon: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png"
                });

                const allSubs = Object.keys(subscriptions);
                
                // ВРЕМЕННО УБИРАЕМ ФИЛЬТР, чтобы пуш пришел вообще ВСЕМ в базе для теста
                const recipients = allSubs; 
                
                console.log(`📡 [PUSH-ENGINE]: В базе ${allSubs.length}. Рассылка на всех!`);

                recipients.forEach(subId => {
                    webpush.sendNotification(subscriptions[subId], pushPayload)
                        .then(() => console.log(`✅ [PUSH-SUCCESS]: Улетело на [${subId}]`))
                        .catch(err => {
                            console.error(`❌ [PUSH-ERROR]: Ошибка для ${subId}. Код: ${err.statusCode}`);
                            if (err.statusCode === 404 || err.statusCode === 410) {
                                delete subscriptions[subId];
                                fs.writeFile(subDbFile, JSON.stringify(subscriptions, null, 2), () => {});
                            }
                        });
                });
            });
        } catch (e) { console.error("❌ Ошибка:", e.message); res.status(500).json({ success: false }); }
    });

    app.post('/x-api/chat-delete', (req, res) => {
        const { roomId, msgId } = req.body;
        if (memoryDb[roomId]) {
            memoryDb[roomId] = memoryDb[roomId].filter(m => m.id !== msgId);
            if (io) io.to(roomId).emit('delete_message', msgId);
            fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), () => {});
            return res.json({ success: true });
        }
        res.json({ success: false });
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
