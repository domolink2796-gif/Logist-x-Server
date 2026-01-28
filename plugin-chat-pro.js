const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');

/**
 * === БЛОК 1: КОНФИГУРАЦИЯ ПУТЕЙ И ХРАНИЛИЩА ===
 * Здесь мы определяем, где физически лежат данные на диске Orange Pi 3 LTS.
 * Все файлы хранятся в папке public для обеспечения доступа.
 */
const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');
const subDbFile = path.join(process.cwd(), 'public', 'subscriptions.json');
const usersDbFile = path.join(process.cwd(), 'public', 'users.json');

// Инициализация оперативной памяти сервера
let memoryDb = {};      // История переписки
let subscriptions = {}; // Токены для Push-уведомлений
let usersRegistry = {}; // База: { "ник": { chatId: "...", password: "..." } }

/**
 * === БЛОК 2: НАСТРОЙКА КЛЮЧЕЙ WEB-PUSH ===
 * VAPID ключи позволяют твоему серверу отправлять уведомления прямо в шторку телефона.
 */
const vapidKeys = {
    publicKey: 'BPOw_-Te5biFuSMrQLHjfsv3c9LtoFZkhHJp9FE1a1f55L8jGuL1uR39Ho9SWMN6dIdVt8FfxNHwcHuV0uUQ9Jg',
    privateKey: '0SJWxEuVpUlowi2gTaodAoGne93V9DB6PFBoSMbL1WE'
};

webpush.setVapidDetails(
    'mailto:admin@logist-x.store', 
    vapidKeys.publicKey, 
    vapidKeys.privateKey
);

/**
 * === БЛОК 3: ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (УТИЛИТЫ) ===
 * Время по МСК и автоматическая очистка старых данных.
 */
function getMskTime() {
    return new Date().toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow', 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false
    });
}

// Храним сообщения ровно 24 часа для экономии ресурсов платы
const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000; 

function cleanOldMessages() {
    const now = Date.now();
    let totalRemoved = 0;
    
    console.log(`🧹 [CLEANER] ${getMskTime()}: Запуск плановой очистки...`);
    
    for (const roomId in memoryDb) {
        const countBefore = memoryDb[roomId].length;
        memoryDb[roomId] = memoryDb[roomId].filter(m => (now - m.timestamp) < MAX_MESSAGE_AGE_MS);
        totalRemoved += (countBefore - memoryDb[roomId].length);
    }
    
    if (totalRemoved > 0) {
        console.log(`✅ [CLEANER]: Удалено старых сообщений: ${totalRemoved}`);
        saveChatDb();
    }
}

// Функция записи базы чатов на диск
function saveChatDb() {
    try {
        fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), (err) => {
            if (err) console.error("❌ [DB ERROR]: Ошибка записи чатов:", err);
        });
    } catch (e) { console.error("❌ [CRITICAL]: Ошибка сохранения базы!"); }
}

/**
 * === БЛОК 4: ЗАГРУЗКА ДАННЫХ ПРИ СТАРТЕ СИСТЕМЫ ===
 * Поднимаем все файлы в оперативную память.
 */
function loadToMemory() {
    console.log(`📡 [SYSTEM] ${getMskTime()}: Инициализация X-CONECT Engine...`);
    
    // Создаем папку public, если её нет
    if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
        fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
    }

    // Загрузка истории чатов
    if (fs.existsSync(chatDbFile)) {
        try { 
            memoryDb = JSON.parse(fs.readFileSync(chatDbFile, 'utf8')); 
            console.log("📂 [DB]: История чатов загружена.");
        } catch (e) { memoryDb = {}; }
    }

    // Загрузка подписок на пуши
    if (fs.existsSync(subDbFile)) {
        try { 
            subscriptions = JSON.parse(fs.readFileSync(subDbFile, 'utf8')); 
            console.log("📂 [DB]: Подписки Push загружены.");
        } catch (e) { subscriptions = {}; }
    }

    // Загрузка реестра пользователей (Ники и пароли)
    if (fs.existsSync(usersDbFile)) {
        try { 
            usersRegistry = JSON.parse(fs.readFileSync(usersDbFile, 'utf8')); 
            console.log(`📂 [DB]: Реестр пользователей загружен (${Object.keys(usersRegistry).length} чел).`);
        } catch (e) { usersRegistry = {}; }
    }

    cleanOldMessages();
}

loadToMemory();
// Интервал очистки - 1 час
setInterval(cleanOldMessages, 60 * 60 * 1000);

/**
 * === БЛОК 5: ОСНОВНОЙ ЭКСПОРТ ПЛАГИНА (API & SOCKETS) ===
 */
module.exports = function (app, context) {
    const io = context.io; 

    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    /**
     * ФУНКЦИЯ: broadcastAdminStats
     * Собирает данные о всех чатах и шлет их в Админку в реальном времени.
     * Здесь исправлена логика именования — берем только из реестра пользователей.
     */
    function broadcastAdminStats() {
        if (!io) return;
        
        const stats = Object.keys(memoryDb).map(chatId => {
            const messages = memoryDb[chatId] || [];
            
            // Извлекаем чистый ID клиента (убираем приставки админов)
            const clientId = chatId.split('_')
                                   .filter(p => p !== 'admin' && p !== 'Дмитрий')
                                   .join('_');

            // Ищем Ник в нашей базе (usersRegistry)
            let displayName = Object.keys(usersRegistry).find(nick => usersRegistry[nick].chatId === clientId);

            // Если ника нет (старый чат), ищем в истории
            if (!displayName) {
                const lastMsg = [...messages].reverse().find(m => m.user !== 'admin' && m.user !== 'Дмитрий');
                displayName = lastMsg ? lastMsg.user : (messages[0]?.user || 'User');
            }

            const unreadCount = messages.filter(m => !m.read && m.user !== 'admin' && m.user !== 'Дмитрий').length;
            
            // Проверка онлайн-статуса через сокеты
            const roomSockets = io.sockets.adapter.rooms.get(chatId);
            const isOnline = !!(roomSockets && roomSockets.size > 0);

            return {
                id: chatId,
                lastUser: displayName, 
                isOnline: isOnline,
                unreadCount: unreadCount
            };
        });

        io.emit('admin_update_stats', stats);
    }

    /**
     * === БЛОК 6: SOCKET.IO (REAL-TIME ОБМЕН СООБЩЕНИЯМИ) ===
     */
    if (io) {
        io.on('connection', (socket) => {
            console.log(`🔌 [SOCKET]: Новое подключение - ${socket.id}`);

            socket.on('join_room', (roomId) => {
                socket.join(roomId);
                console.log(`👁️ [SOCKET]: Клиент зашел в комнату ${roomId}`);
                broadcastAdminStats();
            });

            // Отметка одного сообщения как прочитанного
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

            // Массовое прочтение при входе в чат
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
                // Небольшая задержка, чтобы сокет успел выйти из комнат
                setTimeout(broadcastAdminStats, 1000);
            });
        });
    }

    /**
     * === БЛОК 7: API РЕГИСТРАЦИИ И ПОИСКА (НОВОЕ: ПАРОЛИ) ===
     */
    
    // 1. Регистрация или Вход по паролю
    app.post('/x-api/register-nick', (req, res) => {
        const { nickname, password, chatId } = req.body;
        const cleanNick = String(nickname).trim().toLowerCase();
        const cleanPass = String(password).trim();

        if (usersRegistry[cleanNick]) {
            // Если ник уже занят, проверяем пароль (универсальный доступ)
            if (usersRegistry[cleanNick].password === cleanPass) {
                // Пароль верный - обновляем ID (если зашли с нового телефона)
                usersRegistry[cleanNick].chatId = chatId;
                fs.writeFile(usersDbFile, JSON.stringify(usersRegistry, null, 2), () => {});
                console.log(`🔐 [AUTH]: Пользователь ${cleanNick} залогинился.`);
                return res.json({ success: true, message: "Вход выполнен успешно" });
            } else {
                console.log(`🚫 [AUTH]: Попытка взлома ника ${cleanNick}!`);
                return res.json({ success: false, message: "Этот Ник занят. Неверный пароль!" });
            }
        }

        // Если ника нет - регистрируем новый аккаунт
        usersRegistry[cleanNick] = {
            chatId: chatId,
            password: cleanPass
        };
        
        fs.writeFile(usersDbFile, JSON.stringify(usersRegistry, null, 2), () => {});
        console.log(`📒 [REGISTRY]: Новый пользователь: ${cleanNick}`);
        
        return res.json({ success: true, message: "Регистрация прошла успешно" });
    });

    // 2. Поиск пользователя по нику для создания P2P чата
    app.post('/x-api/find-user', (req, res) => {
        const { myId, searchNick } = req.body;
        const cleanSearch = String(searchNick).trim().toLowerCase();
        
        const target = usersRegistry[cleanSearch];

        if (target) {
            // Создаем уникальную ID комнаты, сортируя ID участников
            const p2pRoomId = [myId, target.chatId].sort().join('_');
            
            res.json({ 
                success: true, 
                roomId: p2pRoomId, 
                foundId: target.chatId,
                targetNick: searchNick 
            });
        } else {
            res.json({ success: false, message: "Пользователь не найден" });
        }
    });

    /**
     * === БЛОК 8: ОТПРАВКА СООБЩЕНИЙ И УВЕДОМЛЕНИЙ ===
     */
    app.post('/x-api/chat-send', (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage, myChatId } = req.body;
            const targetRoom = roomId || 'public';
            
            if (!memoryDb[targetRoom]) memoryDb[targetRoom] = [];

            const newMessage = { 
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
                roomId: targetRoom, 
                user, 
                text, 
                avatar, 
                isAudio: !!isAudio, 
                isImage: !!isImage,
                read: false, 
                time: getMskTime(), 
                timestamp: Date.now() 
            };
            
            memoryDb[targetRoom].push(newMessage);
            
            // Рассылка через сокеты
            if (io) {
                io.to(targetRoom).emit('new_message', newMessage);
                broadcastAdminStats();
            }

            res.json({ success: true });

            // Отложенные задачи (Запись на диск и Пуши)
            setImmediate(() => {
                saveChatDb();

                // Авто-ответчик X-SYSTEM (Проверка связи)
                const checkText = String(text || "").toLowerCase();
                if (checkText === "проверка связи") {
                    const sysMsg = {
                        id: 'sys_' + Date.now(),
                        roomId: targetRoom,
                        user: "X-SYSTEM",
                        text: "X-CONECT: ONLINE 🟢. Все системы в норме.",
                        avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
                        time: getMskTime(),
                        timestamp: Date.now() + 50,
                        read: false
                    };
                    memoryDb[targetRoom].push(sysMsg);
                    if (io) io.to(targetRoom).emit('new_message', sysMsg);
                }

                // Логика PUSH-УВЕДОМЛЕНИЙ
                setTimeout(() => {
                    const currentMsg = memoryDb[targetRoom]?.find(m => m.id === newMessage.id);
                    
                    if (currentMsg && !currentMsg.read) {
                        const pushPayload = JSON.stringify({
                            title: String(user).substring(0, 50),
                            body: isAudio ? "🎤 Голосовое сообщение" : (isImage ? "📸 Фотография" : String(text || "").substring(0, 100)),
                            icon: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png"
                        });

                        Object.keys(subscriptions).forEach(subId => {
                            // Не шлем пуш самому себе
                            if (subId !== myChatId) {
                                webpush.sendNotification(subscriptions[subId], pushPayload)
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
        } catch (e) { 
            console.error("❌ ERROR [CHAT-SEND]:", e.message); 
            res.status(500).json({ success: false }); 
        }
    });

    /**
     * === БЛОК 9: API УПРАВЛЕНИЯ ЧАТАМИ (СПИСКИ И ИСТОРИЯ) ===
     */
    
    // Получение списка всех чатов для Админки
    app.get('/x-api/chat-list', (req, res) => {
        const list = Object.keys(memoryDb).map(chatId => {
            const messages = memoryDb[chatId] || [];
            
            const clientId = chatId.split('_').filter(p => p !== 'admin' && p !== 'Дмитрий').join('_');
            let displayName = Object.keys(usersRegistry).find(nick => usersRegistry[nick].chatId === clientId);

            if (!displayName) {
                const lastMsg = [...messages].reverse().find(m => m.user !== 'admin' && m.user !== 'Дмитрий');
                displayName = lastMsg ? lastMsg.user : (messages[0]?.user || 'User');
            }

            return {
                id: chatId, 
                lastUser: displayName, 
                unreadCount: messages.filter(m => !m.read && m.user !== 'admin' && m.user !== 'Дмитрий').length
            };
        });
        res.json(list);
    });

    // Загрузка истории конкретного чата
    app.get('/x-api/chat-history', (req, res) => {
        const roomId = req.query.roomId || 'public';
        res.json(memoryDb[roomId] || []);
    });

    // Удаление одного сообщения
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

    // Полное удаление комнаты (чата)
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

    /**
     * === БЛОК 10: СЕРВИСНЫЕ МАРШРУТЫ ===
     */
    
    // Сохранение подписки на пуши
    app.post('/x-api/save-subscription', (req, res) => {
        const { chatId, subscription } = req.body;
        if (chatId && subscription) {
            subscriptions[chatId] = subscription;
            fs.writeFile(subDbFile, JSON.stringify(subscriptions, null, 2), () => {});
            return res.json({ success: true });
        }
        res.status(400).json({ success: false });
    });

    app.get('/x-api/ping', (req, res) => res.send('ok'));
    app.get('/x-api/vapid-key', (req, res) => res.send(vapidKeys.publicKey));
};
