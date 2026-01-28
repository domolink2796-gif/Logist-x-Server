const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');

// === БЛОК 1: НАСТРОЙКИ ФАЙЛОВ И БАЗЫ ===
const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');
const subDbFile = path.join(process.cwd(), 'public', 'subscriptions.json');
let memoryDb = {};      // Тут храним переписку
let subscriptions = {}; // Тут храним токены для пушей
let connectedUsers = {}; // 🔥 НОВОЕ: Тут храним список тех, кто сейчас ОНЛАЙН

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

// Функция для сохранения базы чатов, чтобы не писать одно и то же
function saveChatDb() {
    fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), () => {});
}

// === БЛОК 4: ЗАГРУЗКА ДАННЫХ ПРИ СТАРТЕ ===
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
    console.log(`✅ [SYSTEM]: Подписок загружено: ${Object.keys(subscriptions).length}`);
    cleanOldMessages();
}

loadToMemory();
setInterval(cleanOldMessages, 60 * 60 * 1000); // Чистим каждый час

// === БЛОК 5: ГЛАВНАЯ ЛОГИКА СЕРВЕРА ===
module.exports = function (app, context) {
    const io = context.io; 

    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    // 🔥 НОВОЕ: Функция подсчета статистики для Админа (лампочки и счетчики)
    function broadcastAdminStats() {
        if (!io) return;
        
        // Собираем массив данных по всем чатам
        const stats = Object.keys(memoryDb).map(chatId => {
            const messages = memoryDb[chatId] || [];
            
            // Считаем непрочитанные сообщения (те, где read: false и писал НЕ Админ)
            // Если ты сам Админ, тебе важно знать сколько сообщений ОТ клиента ты не прочел
            const unreadCount = messages.filter(m => !m.read && m.user !== 'admin' && m.user !== 'Дмитрий').length;
            
            // Проверяем, есть ли кто-то онлайн в этой комнате (кроме админа)
            // Берем всех сокетов в комнате
            const roomSockets = io.sockets.adapter.rooms.get(chatId);
            const isOnline = roomSockets && roomSockets.size > 0; 

            return {
                id: chatId,
                lastUser: messages[messages.length - 1]?.user || 'Empty',
                isOnline: !!isOnline, // true/false для лампочки
                unreadCount: unreadCount // Цифра для красного кружка
            };
        });

        // Отправляем всем (админы сами отфильтруют)
        io.emit('admin_update_stats', stats);
    }

    // === БЛОК 6: РАБОТА С СОКЕТАМИ (Real-time) ===
    if (io) {
        io.on('connection', (socket) => {
            console.log(`🔌 [SOCKET]: Подключен ${socket.id}`);

            // 1. Вход в комнату
            socket.on('join_room', (roomId) => {
                socket.join(roomId);
                console.log(`👁️ [SOCKET]: ${socket.id} зашел в ${roomId}`);
                // Сразу обновляем статистику админу (зажечь зеленую лампочку)
                broadcastAdminStats();
            });

            // 2. 🔥 НОВОЕ: Сигнал "Я прочитал сообщение"
            socket.on('message_read', ({ msgId, roomId }) => {
                if (memoryDb[roomId]) {
                    const msg = memoryDb[roomId].find(m => m.id === msgId);
                    if (msg && !msg.read) {
                        msg.read = true; // Ставим галочку в базе
                        saveChatDb();
                        
                        // Сообщаем всем в комнате, что это сообщение прочитано (синие галочки)
                        io.to(roomId).emit('msg_read_status', { msgIds: [msgId] });
                        
                        // Обновляем админу счетчики (убираем красный кружок)
                        broadcastAdminStats();
                        console.log(`👀 [READ]: Сообщение ${msgId} прочитано`);
                    }
                }
            });

            // 3. 🔥 НОВОЕ: Сигнал "Я открыл чат" (пометить всё прочитанным)
            socket.on('mark_seen', ({ roomId, userId }) => {
                if (memoryDb[roomId]) {
                    let updatedIds = [];
                    memoryDb[roomId].forEach(m => {
                        // Если сообщение не мое и не прочитано -> читаем
                        if (m.user !== userId && !m.read) {
                            m.read = true;
                            updatedIds.push(m.id);
                        }
                    });
                    
                    if (updatedIds.length > 0) {
                        saveChatDb();
                        io.to(roomId).emit('msg_read_status', { msgIds: updatedIds });
                        broadcastAdminStats();
                        console.log(`👀 [SEEN]: В комнате ${roomId} прочитано ${updatedIds.length} сообщений`);
                    }
                }
            });

            // 4. Отключение
            socket.on('disconnect', () => {
                console.log(`🔌 [SOCKET]: ${socket.id} ушел`);
                // Обновляем статистику (погасить лампочку)
                setTimeout(broadcastAdminStats, 1000);
            });
        });
    }

    // === БЛОК 7: СОХРАНЕНИЕ ПОДПИСКИ НА ПУШИ ===
    app.post('/x-api/save-subscription', (req, res) => {
        const { chatId, subscription } = req.body;
        console.log(`🔔 [PUSH-REG]: Новый токен для [${chatId}]`);
        if (chatId && subscription) {
            subscriptions[chatId] = subscription;
            fs.writeFile(subDbFile, JSON.stringify(subscriptions, null, 2), () => {});
            return res.json({ success: true });
        }
        res.status(400).json({ success: false });
    });

    app.get('/x-api/vapid-key', (req, res) => res.send(vapidKeys.publicKey));

    // === БЛОК 8: ОТПРАВКА СООБЩЕНИЯ ===
    app.post('/x-api/chat-send', (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage, speechText, myChatId } = req.body;
            const targetRoom = roomId || 'public';
            
            console.log(`📩 [MSG] ${getMskTime()}: ${user} -> ${targetRoom}`);

            if (!memoryDb[targetRoom]) memoryDb[targetRoom] = [];

            const newMessage = { 
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
                user, text, avatar, 
                isAudio: !!isAudio, isImage: !!isImage,
                read: false, // 🔥 НОВОЕ: По умолчанию не прочитано
                time: getMskTime(), 
                timestamp: Date.now() 
            };
            
            memoryDb[targetRoom].push(newMessage);
            
            if (io) {
                // Отправляем само сообщение
                io.to(targetRoom).emit('new_message', newMessage);
                // Обновляем админу счетчики (добавить +1 в красный кружок)
                broadcastAdminStats();
            }

            res.json({ success: true });

            setImmediate(() => {
                saveChatDb();

                // Авто-ответ системы
                const checkText = (String(text || "") + " " + String(speechText || "")).toLowerCase();
                if (checkText.includes("проверка связи")) {
                    const sysMsg = {
                        id: 'sys_' + Date.now(),
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

                // === БЛОК 9: ОТПРАВКА PUSH-УВЕДОМЛЕНИЙ ===
                // Логика: если сообщение не прочитали за 2 секунды - шлем пуш
                setTimeout(() => {
                    // Проверяем актуальный статус сообщения из памяти
                    const currentMsg = memoryDb[targetRoom].find(m => m.id === newMessage.id);
                    
                    // Если сообщение всё еще не прочитано (currentMsg.read === false)
                    if (currentMsg && !currentMsg.read) {
                        console.log(`🚀 [PUSH-ENGINE]: Сообщение не прочитано, отправляем PUSH...`);
                        
                        const pushPayload = JSON.stringify({
                            title: String(user).substring(0, 50),
                            body: isAudio ? "🎤 Голосовое" : (isImage ? "📸 Фото" : String(text || "").substring(0, 100)),
                            icon: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png"
                        });

                        // Шлем пуш в конкретный чат или всем (пока всем для теста)
                        const allSubs = Object.keys(subscriptions);
                        allSubs.forEach(subId => {
                            // Не шлем пуш самому себе (если subId совпадает с myChatId отправителя)
                            if (subId !== myChatId) {
                                webpush.sendNotification(subscriptions[subId], pushPayload)
                                    .then(() => console.log(`✅ [PUSH]: Ушло на ${subId}`))
                                    .catch(err => {
                                        if (err.statusCode === 404 || err.statusCode === 410) {
                                            delete subscriptions[subId]; // Удаляем мертвые токены
                                            fs.writeFile(subDbFile, JSON.stringify(subscriptions, null, 2), () => {});
                                        }
                                    });
                            }
                        });
                    } else {
                        console.log(`zzz [PUSH-SKIP]: Сообщение уже прочитано онлайн, пуш не нужен.`);
                    }
                }, 3000); // Ждем 3 секунды перед отправкой пуша
            });
        } catch (e) { console.error("❌ ERROR:", e.message); res.status(500).json({ success: false }); }
    });

    app.post('/x-api/chat-delete', (req, res) => {
        const { roomId, msgId } = req.body;
        if (memoryDb[roomId]) {
            memoryDb[roomId] = memoryDb[roomId].filter(m => m.id !== msgId);
            if (io) io.to(roomId).emit('delete_message', msgId);
            saveChatDb();
            // После удаления тоже обновляем статистику
            broadcastAdminStats();
            return res.json({ success: true });
        }
        res.json({ success: false });
    });

    app.get('/x-api/chat-history', (req, res) => {
        res.json(memoryDb[req.query.roomId || 'public'] || []);
    });

    // 🔥 НОВОЕ: API списка чатов теперь возвращает статистику
    app.get('/x-api/chat-list', (req, res) => {
        const list = Object.keys(memoryDb).map(chatId => {
            const messages = memoryDb[chatId] || [];
            
            // Те же расчеты, что и в broadcastAdminStats
            const unreadCount = messages.filter(m => !m.read && m.user !== 'admin' && m.user !== 'Дмитрий').length;
            
            const roomSockets = io ? io.sockets.adapter.rooms.get(chatId) : null;
            const isOnline = roomSockets && roomSockets.size > 0;

            return {
                id: chatId, 
                lastUser: messages[messages.length - 1]?.user || 'Empty',
                isOnline: !!isOnline,
                unreadCount: unreadCount
            };
        });
        res.json(list);
    });

    app.get('/x-api/ping', (req, res) => res.send('ok'));
    
    // 🔥 НОВОЕ: Эндпоинт для удаления всей комнаты (полезно для тестов)
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
