const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');

// === БЛОК 1: НАСТРОЙКИ ФАЙЛОВ И БАЗЫ ===
const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');
const subDbFile = path.join(process.cwd(), 'public', 'subscriptions.json');
const usersDbFile = path.join(process.cwd(), 'public', 'users.json'); // 🔥 НОВОЕ: Файл с никами

let memoryDb = {};      // Тут храним переписку
let subscriptions = {}; // Тут храним токены для пушей
let usersRegistry = {}; // 🔥 НОВОЕ: Тут храним связку "Ник -> ID"

// === БЛОК 2: КЛЮЧИ ДЛЯ PUSH-УВЕДОМЛЕНИЙ ===
const vapidKeys = {
    publicKey: 'BPOw_-Te5biFuSMrQLHjfsv3c9LtoFZkhHJp9FE1a1f55L8jGuL1uR39Ho9SWMN6dIdVt8FfxNHwcHuV0uUQ9Jg',
    privateKey: '0SJWxEuVpUlowi2gTaodAoGne93V9DB6PFBoSMbL1WE'
};

webpush.setVapidDetails('mailto:admin@logist-x.store', vapidKeys.publicKey, vapidKeys.privateKey);

// === БЛОК 3: ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (ВРЕМЯ И ОЧИСТКА) ===
function getMskTime() {
    return new Date().toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false
    });
}

const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000; // Храним 24 часа

function cleanOldMessages() {
    const now = Date.now();
    let totalRemoved = 0;
    for (const roomId in memoryDb) {
        const countBefore = memoryDb[roomId].length;
        memoryDb[roomId] = memoryDb[roomId].filter(m => (now - m.timestamp) < MAX_MESSAGE_AGE_MS);
        totalRemoved += (countBefore - memoryDb[roomId].length);
    }
    if (totalRemoved > 0) {
        console.log(`🧹 [CLEANER]: Удалено старых сообщений: ${totalRemoved}`);
        saveChatDb();
    }
}

// Функция для сохранения базы чатов
function saveChatDb() {
    fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), () => {});
}

// === БЛОК 4: ЗАГРУЗКА ДАННЫХ ПРИ СТАРТЕ ===
function loadToMemory() {
    console.log(`📡 [SYSTEM] ${getMskTime()}: Старт системы...`);
    if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
        fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
    }
    // Загрузка чатов
    if (fs.existsSync(chatDbFile)) {
        try { memoryDb = JSON.parse(fs.readFileSync(chatDbFile, 'utf8')); } catch (e) { memoryDb = {}; }
    }
    // Загрузка подписок
    if (fs.existsSync(subDbFile)) {
        try { subscriptions = JSON.parse(fs.readFileSync(subDbFile, 'utf8')); } catch (e) { subscriptions = {}; }
    }
    // 🔥 НОВОЕ: Загрузка ников
    if (fs.existsSync(usersDbFile)) {
        try { usersRegistry = JSON.parse(fs.readFileSync(usersDbFile, 'utf8')); } catch (e) { usersRegistry = {}; }
    }

    console.log(`✅ [SYSTEM]: Подписок: ${Object.keys(subscriptions).length}, Ников: ${Object.keys(usersRegistry).length}`);
    cleanOldMessages();
}

loadToMemory();
setInterval(cleanOldMessages, 60 * 60 * 1000); // Чистим каждый час

// === БЛОК 5: ГЛАВНАЯ ЛОГИКА СЕРВЕРА ===
module.exports = function (app, context) {
    const io = context.io; 

    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    // Функция подсчета статистики для Админа
    function broadcastAdminStats() {
        if (!io) return;
        
        const stats = Object.keys(memoryDb).map(chatId => {
            const messages = memoryDb[chatId] || [];
            const unreadCount = messages.filter(m => !m.read && m.user !== 'admin' && m.user !== 'Дмитрий').length;
            
            const roomSockets = io.sockets.adapter.rooms.get(chatId);
            const isOnline = roomSockets && roomSockets.size > 0; 

            return {
                id: chatId,
                lastUser: [...messages].reverse().find(m => m.user !== 'admin' && m.user !== 'Дмитрий')?.user || (messages[0]?.user || 'Empty'),

                isOnline: !!isOnline,
                unreadCount: unreadCount
            };
        });

        io.emit('admin_update_stats', stats);
    }

    // === БЛОК 6: РАБОТА С СОКЕТАМИ (Real-time) ===
    if (io) {
        io.on('connection', (socket) => {
            console.log(`🔌 [SOCKET]: Подключен ${socket.id}`);

            socket.on('join_room', (roomId) => {
                socket.join(roomId);
                console.log(`👁️ [SOCKET]: ${socket.id} зашел в ${roomId}`);
                broadcastAdminStats();
            });

            socket.on('message_read', ({ msgId, roomId }) => {
                if (memoryDb[roomId]) {
                    const msg = memoryDb[roomId].find(m => m.id === msgId);
                    if (msg && !msg.read) {
                        msg.read = true;
                        saveChatDb();
                        io.to(roomId).emit('msg_read_status', { msgIds: [msgId] });
                        broadcastAdminStats();
                    }
                }
            });

            socket.on('mark_seen', ({ roomId, userId }) => {
                if (memoryDb[roomId]) {
                    let updatedIds = [];
                    memoryDb[roomId].forEach(m => {
                        if (m.user !== userId && !m.read) {
                            m.read = true;
                            updatedIds.push(m.id);
                        }
                    });
                    
                    if (updatedIds.length > 0) {
                        saveChatDb();
                        io.to(roomId).emit('msg_read_status', { msgIds: updatedIds });
                        broadcastAdminStats();
                    }
                }
            });

            socket.on('disconnect', () => {
                setTimeout(broadcastAdminStats, 1000);
            });
        });
    }

    // === БЛОК 7: СОХРАНЕНИЕ ПОДПИСКИ НА ПУШИ ===
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

    // === 🔥 БЛОК 10: РЕГИСТРАЦИЯ И ПОИСК НИКОВ (НОВОЕ) ===
    
    // 1. Регистрация нового ника
    app.post('/x-api/register-nick', (req, res) => {
        const { nickname, chatId } = req.body;
        const cleanNick = String(nickname).trim().toLowerCase();

        // Проверяем, не занят ли ник КЕМ-ТО ДРУГИМ (если это наш ID - обновляем)
        if (usersRegistry[cleanNick] && usersRegistry[cleanNick] !== chatId) {
            return res.json({ success: false, message: "Ник занят" });
        }

        usersRegistry[cleanNick] = chatId;
        fs.writeFile(usersDbFile, JSON.stringify(usersRegistry, null, 2), () => {});
        console.log(`📒 [REGISTRY]: Зарегистрирован ник: ${cleanNick}`);
        
        return res.json({ success: true });
    });

    // 2. Поиск пользователя по нику
    app.post('/x-api/find-user', (req, res) => {
        const { myId, searchNick } = req.body;
        const cleanSearch = String(searchNick).trim().toLowerCase();
        
        const targetId = usersRegistry[cleanSearch];

        if (targetId) {
            // 🔥 СОЗДАЕМ УНИКАЛЬНУЮ КОМНАТУ: Сортируем ID, чтобы chatA_chatB было одинаково для обоих
            const p2pRoomId = [myId, targetId].sort().join('_');
            
            res.json({ 
                success: true, 
                roomId: p2pRoomId, 
                foundId: targetId,
                targetNick: searchNick 
            });
        } else {
            res.json({ success: false, message: "Пользователь не найден" });
        }
    });

    // === БЛОК 8: ОТПРАВКА СООБЩЕНИЯ ===
    app.post('/x-api/chat-send', (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage, speechText, myChatId } = req.body;
            const targetRoom = roomId || 'public';
            
            console.log(`📩 [MSG] ${getMskTime()}: ${user} -> ${targetRoom}`);

            if (!memoryDb[targetRoom]) memoryDb[targetRoom] = [];

            const newMessage = { 
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
                roomId: targetRoom, 
                user, text, avatar, 
                isAudio: !!isAudio, isImage: !!isImage,
                read: false, 
                time: getMskTime(), 
                timestamp: Date.now() 
            };
            
            memoryDb[targetRoom].push(newMessage);
            
            if (io) {
                io.to(targetRoom).emit('new_message', newMessage);
                broadcastAdminStats();
            }

            res.json({ success: true });

            setImmediate(() => {
                saveChatDb();

                // Авто-ответ
                const checkText = (String(text || "") + " " + String(speechText || "")).toLowerCase();
                if (checkText.includes("проверка связи")) {
                    const sysMsg = {
                        id: 'sys_' + Date.now(),
                        roomId: targetRoom,
                        user: "X-SYSTEM",
                        text: "Системы в норме. Статус: ONLINE 🟢",
                        avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
                        time: getMskTime(),
                        timestamp: Date.now() + 10,
                        read: false
                    };
                    memoryDb[targetRoom].push(sysMsg);
                    if (io) io.to(targetRoom).emit('new_message', sysMsg);
                }

                // === БЛОК 9: PUSH-УВЕДОМЛЕНИЯ ===
                setTimeout(() => {
                    const currentMsg = memoryDb[targetRoom].find(m => m.id === newMessage.id);
                    
                    if (currentMsg && !currentMsg.read) {
                        console.log(`🚀 [PUSH-ENGINE]: Сообщение не прочитано, шлем PUSH...`);
                        
                        const pushPayload = JSON.stringify({
                            title: String(user).substring(0, 50),
                            body: isAudio ? "🎤 Голосовое" : (isImage ? "📸 Фото" : String(text || "").substring(0, 100)),
                            icon: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png"
                        });

                        const allSubs = Object.keys(subscriptions);
                        allSubs.forEach(subId => {
                            // Не шлем пуш самому себе
                            if (subId !== myChatId) {
                                // ⚠️ ВАЖНО: Если это приватный чат (длинный ID), шлем пуш обоим участникам (кроме отправителя)
                                // Но тут мы шлем всем подписчикам, это допустимо для старта.
                                webpush.sendNotification(subscriptions[subId], pushPayload)
                                    .then(() => {})
                                    .catch(err => {
                                        if (err.statusCode === 404 || err.statusCode === 410) {
                                            delete subscriptions[subId];
                                            fs.writeFile(subDbFile, JSON.stringify(subscriptions, null, 2), () => {});
                                        }
                                    });
                            }
                        });
                    }
                }, 3000); 
            });
        } catch (e) { console.error("❌ ERROR:", e.message); res.status(500).json({ success: false }); }
    });

    app.post('/x-api/chat-delete', (req, res) => {
        const { roomId, msgId } = req.body;
        if (memoryDb[roomId]) {
            memoryDb[roomId] = memoryDb[roomId].filter(m => m.id !== msgId);
            if (io) io.to(roomId).emit('delete_message', msgId);
            saveChatDb();
            broadcastAdminStats();
            return res.json({ success: true });
        }
        res.json({ success: false });
    });

    app.get('/x-api/chat-history', (req, res) => {
        res.json(memoryDb[req.query.roomId || 'public'] || []);
    });

    app.get('/x-api/chat-list', (req, res) => {
        const list = Object.keys(memoryDb).map(chatId => {
            const messages = memoryDb[chatId] || [];
            const unreadCount = messages.filter(m => !m.read && m.user !== 'admin' && m.user !== 'Дмитрий').length;
            const roomSockets = io ? io.sockets.adapter.rooms.get(chatId) : null;
            const isOnline = roomSockets && roomSockets.size > 0;

            return {
                id: chatId, 
                lastUser: [...messages].reverse().find(m => m.user !== 'admin' && m.user !== 'Дмитрий')?.user || (messages[0]?.user || 'Empty'),

                isOnline: !!isOnline,
                unreadCount: unreadCount
            };
        });
        res.json(list);
    });

    app.get('/x-api/ping', (req, res) => res.send('ok'));
    
    app.post('/x-api/chat-room-delete', (req, res) => {
        const { roomId } = req.body;
        if(memoryDb[roomId]) {
            delete memoryDb[roomId];
            saveChatDb();
            broadcastAdminStats();
            return res.json({ success: true });
        }
        res.json({ success: false });
    });
};
