const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');

// === БЛОК 1: НАСТРОЙКИ ФАЙЛОВ И БАЗЫ ДАННЫХ ===
// Здесь мы определяем, где лежат наши JSON-файлы (базы)
const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');
const subDbFile = path.join(process.cwd(), 'public', 'subscriptions.json');
const usersDbFile = path.join(process.cwd(), 'public', 'users.json');

let memoryDb = {};      // Оперативная память для сообщений
let subscriptions = {}; // Оперативная память для пуш-подписок
let usersRegistry = {}; // Оперативная память для "Книги ников" (Ник -> ID)

// === БЛОК 2: КЛЮЧИ ДЛЯ PUSH-УВЕДОМЛЕНИЙ ===
// Твои уникальные ключи для работы с браузерными уведомлениями
const vapidKeys = {
    publicKey: 'BPOw_-Te5biFuSMrQLHjfsv3c9LtoFZkhHJp9FE1a1f55L8jGuL1uR39Ho9SWMN6dIdVt8FfxNHwcHuV0uUQ9Jg',
    privateKey: '0SJWxEuVpUlowi2gTaodAoGne93V9DB6PFBoSMbL1WE'
};

webpush.setVapidDetails('mailto:admin@logist-x.store', vapidKeys.publicKey, vapidKeys.privateKey);

// === БЛОК 3: ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (ВРЕМЯ И ОЧИСТКА) ===
// Функция для получения времени по Москве (как в Орле)
function getMskTime() {
    return new Date().toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false
    });
}

// Настройка авто-удаления старых сообщений (храним 24 часа)
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
        console.log(`🧹 [CLEANER]: Удалено старых сообщений: ${totalRemoved}`);
        saveChatDb();
    }
}

// Функция записи сообщений на диск
function saveChatDb() {
    fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), () => {});
}

// === БЛОК 4: ЗАГРУЗКА ДАННЫХ ПРИ СТАРТЕ СЕРВЕРА ===
// Эта функция запускается один раз, когда ты стартуешь Orange Pi
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
    if (fs.existsSync(usersDbFile)) {
        try { usersRegistry = JSON.parse(fs.readFileSync(usersDbFile, 'utf8')); } catch (e) { usersRegistry = {}; }
    }
    console.log(`✅ [SYSTEM]: Подписок: ${Object.keys(subscriptions).length}, Ников: ${Object.keys(usersRegistry).length}`);
    cleanOldMessages();
}

loadToMemory();
setInterval(cleanOldMessages, 60 * 60 * 1000); // Чистим память каждый час

// === БЛОК 5: ГЛАВНАЯ ЛОГИКА СЕРВЕРА (ЭКСПОРТ) ===
module.exports = function (app, context) {
    const io = context.io; 

    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    // Функция обновления статистики в Админке (ОТВЕЧАЕТ ЗА ИМЕНА)
    function broadcastAdminStats() {
        if (!io) return;
        
        const stats = Object.keys(memoryDb).map(chatId => {
            const messages = memoryDb[chatId] || [];
            
            // 🔥 ЖЕЛЕЗНЫЙ ФИЛЬТР: Вычленяем ID клиента из названия комнаты
            const clientId = chatId.split('_').filter(p => p !== 'admin' && p !== 'Дмитрий').join('_');

            // Ищем Ник в нашей базе (usersRegistry)
            let displayName = Object.keys(usersRegistry).find(nick => usersRegistry[nick] === clientId);

            // Если ника нет в базе, ищем последнего КЛИЕНТА в переписке (не админа)
            if (!displayName) {
                const lastClientMsg = [...messages].reverse().find(m => m.user !== 'admin' && m.user !== 'Дмитрий');
                displayName = lastClientMsg ? lastClientMsg.user : (messages[0]?.user || 'Empty');
            }

            const unreadCount = messages.filter(m => !m.read && m.user !== 'admin' && m.user !== 'Дмитрий').length;
            const roomSockets = io.sockets.adapter.rooms.get(chatId);

            return {
                id: chatId,
                lastUser: displayName, // Передаем найденный Ник
                isOnline: !!(roomSockets && roomSockets.size > 0),
                unreadCount: unreadCount
            };
        });

        io.emit('admin_update_stats', stats);
    }

    // === БЛОК 6: РАБОТА С СОКЕТАМИ (Real-time обмен) ===
    if (io) {
        // Настройки, чтобы связь на Orange Pi не рвалась
        io.opts.pingInterval = 15000; 
        io.opts.pingTimeout = 10000;

        io.on('connection', (socket) => {
            console.log(`🔌 [SOCKET]: Подключен ${socket.id}`);

            socket.on('join_room', (roomId) => {
                socket.join(roomId);
                broadcastAdminStats();
            });

            // Обработка статуса "Прочитано" для одного сообщения
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

            // Массовая отметка сообщений прочитанными
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

    // === БЛОК 7: API РЕГИСТРАЦИИ И ПОИСКА НИКОВ ===
    app.post('/x-api/register-nick', (req, res) => {
        const { nickname, chatId } = req.body;
        const cleanNick = String(nickname).trim().toLowerCase();
        if (usersRegistry[cleanNick] && usersRegistry[cleanNick] !== chatId) {
            return res.json({ success: false, message: "Ник занят" });
        }
        usersRegistry[cleanNick] = chatId;
        fs.writeFile(usersDbFile, JSON.stringify(usersRegistry, null, 2), () => {});
        res.json({ success: true });
    });

    app.post('/x-api/find-user', (req, res) => {
        const { myId, searchNick } = req.body;
        const targetId = usersRegistry[String(searchNick).trim().toLowerCase()];
        if (targetId) {
            // Создаем уникальную P2P комнату
            const p2pRoomId = [myId, targetId].sort().join('_');
            res.json({ success: true, roomId: p2pRoomId, foundId: targetId, targetNick: searchNick });
        } else {
            res.json({ success: false });
        }
    });

    // === БЛОК 8: ОТПРАВКА СООБЩЕНИЙ И ПУШИ ===
    app.post('/x-api/chat-send', (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage, myChatId } = req.body;
            const targetRoom = roomId || 'public';
            if (!memoryDb[targetRoom]) memoryDb[targetRoom] = [];

            const newMessage = { 
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
                roomId: targetRoom, user, text, avatar, 
                isAudio: !!isAudio, isImage: !!isImage,
                read: false, time: getMskTime(), timestamp: Date.now() 
            };
            
            memoryDb[targetRoom].push(newMessage);
            if (io) {
                io.to(targetRoom).emit('new_message', newMessage);
                broadcastAdminStats();
            }
            res.json({ success: true });

            setImmediate(() => {
                saveChatDb();
                // Логика пуш-уведомлений (шлем, если сообщение не прочитано через 3 сек)
                setTimeout(() => {
                    const currentMsg = memoryDb[targetRoom]?.find(m => m.id === newMessage.id);
                    if (currentMsg && !currentMsg.read) {
                        const payload = JSON.stringify({
                            title: String(user),
                            body: isAudio ? "🎤 Голосовое" : (isImage ? "📸 Фото" : String(text || "").substring(0, 100))
                        });
                        Object.keys(subscriptions).forEach(id => {
                            if (id !== myChatId) webpush.sendNotification(subscriptions[id], payload).catch(() => {});
                        });
                    }
                }, 3000);
            });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // === БЛОК 9: ПОЛУЧЕНИЕ СПИСКА ЧАТОВ (ДЛЯ ЗАГРУЗКИ АДМИНКИ) ===
    app.get('/x-api/chat-list', (req, res) => {
        const list = Object.keys(memoryDb).map(chatId => {
            const messages = memoryDb[chatId] || [];
            
            // Тот же фильтр ID, что и в Блоке 5
            const clientId = chatId.split('_').filter(p => p !== 'admin' && p !== 'Дмитрий').join('_');
            let displayName = Object.keys(usersRegistry).find(nick => usersRegistry[nick] === clientId);

            if (!displayName) {
                const lastClientMsg = [...messages].reverse().find(m => m.user !== 'admin' && m.user !== 'Дмитрий');
                displayName = lastClientMsg ? lastClientMsg.user : (messages[0]?.user || 'Empty');
            }

            return {
                id: chatId, 
                lastUser: displayName, 
                unreadCount: messages.filter(m => !m.read && m.user !== 'admin' && m.user !== 'Дмитрий').length
            };
        });
        res.json(list);
    });

    // === БЛОК 10: УПРАВЛЕНИЕ ИСТОРИЕЙ И ПИНГ ===
    app.get('/x-api/chat-history', (req, res) => res.json(memoryDb[req.query.roomId || 'public'] || []));
    app.get('/x-api/ping', (req, res) => res.send('ok'));
    app.get('/x-api/vapid-key', (req, res) => res.send(vapidKeys.publicKey));

    app.post('/x-api/chat-room-delete', (req, res) => {
        const { roomId } = req.body;
        if(memoryDb[roomId]) {
            delete memoryDb[roomId];
            saveChatDb();
            broadcastAdminStats();
            res.json({ success: true });
        } else res.json({ success: false });
    });

    app.post('/x-api/save-subscription', (req, res) => {
        const { chatId, subscription } = req.body;
        if (chatId && subscription) {
            subscriptions[chatId] = subscription;
            fs.writeFile(subDbFile, JSON.stringify(subscriptions, null, 2), () => {});
            return res.json({ success: true });
        }
        res.status(400).json({ success: false });
    });
};
