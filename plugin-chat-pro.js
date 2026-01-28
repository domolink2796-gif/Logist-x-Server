const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');

/**
 * =====================================================================
 * X-CONECT ENGINE v3.0: ПОЛНАЯ ВЕРСИЯ (MASTER BUILD)
 * Базируется на архитектуре AXX Tuning / Orange Pi 3 LTS
 * =====================================================================
 */

// === БЛОК 1: ОПРЕДЕЛЕНИЕ ПУТЕЙ К БАЗАМ ДАННЫХ ===
const publicDir = path.join(process.cwd(), 'public');
const chatDbFile = path.join(publicDir, 'chat_history.json');
const subDbFile = path.join(publicDir, 'subscriptions.json');
const usersDbFile = path.join(publicDir, 'users.json');

// Глобальные переменные в оперативной памяти
let memoryDb = {};      // История сообщений
let subscriptions = {}; // Подписки на PUSH
let usersRegistry = {}; // Реестр: { "ник": { chatId: "...", password: "..." } }

// === БЛОК 2: НАСТРОЙКА PUSH-УВЕДОМЛЕНИЙ ===
const vapidKeys = {
    publicKey: 'BPOw_-Te5biFuSMrQLHjfsv3c9LtoFZkhHJp9FE1a1f55L8jGuL1uR39Ho9SWMN6dIdVt8FfxNHwcHuV0uUQ9Jg',
    privateKey: '0SJWxEuVpUlowi2gTaodAoGne93V9DB6PFBoSMbL1WE'
};

webpush.setVapidDetails(
    'mailto:admin@logist-x.store', 
    vapidKeys.publicKey, 
    vapidKeys.privateKey
);

// === БЛОК 3: ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (УТИЛИТЫ) ===
function getMskTime() {
    const options = {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    return new Date().toLocaleTimeString('ru-RU', options);
}

// Функция сохранения чатов на диск
function saveChatDb() {
    const data = JSON.stringify(memoryDb, null, 2);
    fs.writeFile(chatDbFile, data, (err) => {
        if (err) {
            console.error("❌ [DATABASE ERROR]: Не удалось сохранить чаты:", err);
        }
    });
}

// Очистка старых сообщений (старше 24 часов)
const MAX_MESSAGE_AGE = 24 * 60 * 60 * 1000; 

function cleanOldMessages() {
    console.log(`🧹 [CLEANER] ${getMskTime()}: Запуск плановой очистки...`);
    const now = Date.now();
    let totalRemoved = 0;

    for (const roomId in memoryDb) {
        const initialCount = memoryDb[roomId].length;
        memoryDb[roomId] = memoryDb[roomId].filter(function(msg) {
            return (now - msg.timestamp) < MAX_MESSAGE_AGE;
        });
        const removed = initialCount - memoryDb[roomId].length;
        totalRemoved += removed;
    }

    if (totalRemoved > 0) {
        console.log(`✅ [CLEANER]: Удалено сообщений: ${totalRemoved}`);
        saveChatDb();
    }
}

// === БЛОК 4: ЗАГРУЗКА ДАННЫХ ИЗ ФАЙЛОВ ПРИ СТАРТЕ ===
function initializeSystem() {
    console.log(`📡 [SYSTEM] ${getMskTime()}: Инициализация X-CONECT...`);

    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }

    // 1. Загрузка реестра пользователей
    if (fs.existsSync(usersDbFile)) {
        try {
            usersRegistry = JSON.parse(fs.readFileSync(usersDbFile, 'utf8'));
            console.log(`📒 [DB]: Загружено пользователей: ${Object.keys(usersRegistry).length}`);
        } catch (e) { console.error("Ошибка загрузки пользователей"); }
    }

    // 2. Загрузка истории переписки
    if (fs.existsSync(chatDbFile)) {
        try {
            memoryDb = JSON.parse(fs.readFileSync(chatDbFile, 'utf8'));
            console.log(`📂 [DB]: История чатов синхронизирована.`);
        } catch (e) { console.error("Ошибка загрузки чатов"); }
    }

    // 3. Загрузка подписок на пуши
    if (fs.existsSync(subDbFile)) {
        try {
            subscriptions = JSON.parse(fs.readFileSync(subDbFile, 'utf8'));
            console.log(`🔔 [DB]: Подписки PUSH активны.`);
        } catch (e) { console.error("Ошибка загрузки подписок"); }
    }

    cleanOldMessages();
}

initializeSystem();
setInterval(cleanOldMessages, 60 * 60 * 1000); // Очистка каждый час

// === БЛОК 5: ЭКСПОРТ ПЛАГИНА (API И СОКЕТЫ) ===
module.exports = function (app, context) {
    const io = context.io; 

    // Настройка лимитов для передачи тяжелых фото и аудио
    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    // Функция обновления вкладок (для всех участников)
    function notifyClientsToRefresh() {
        if (io) {
            io.emit('refresh_chat_list');
        }
    }

    // === БЛОК 6: ЛОГИКА SOCKET.IO (REAL-TIME) ===
    if (io) {
        io.on('connection', function(socket) {
            console.log(`🔌 [SOCKET]: Подключено новое устройство - ${socket.id}`);

            socket.on('join_room', function(roomId) {
                socket.join(roomId);
                console.log(`👁️ [SOCKET]: Устройство вошло в комнату: ${roomId}`);
            });

            socket.on('message_read', function(data) {
                const { msgId, roomId } = data;
                if (memoryDb[roomId]) {
                    const message = memoryDb[roomId].find(m => m.id === msgId);
                    if (message && message.read === false) {
                        message.read = true;
                        saveChatDb();
                        io.to(roomId).emit('msg_read_status', { msgIds: [msgId] });
                    }
                }
            });

            socket.on('mark_seen', function(data) {
                const { roomId, userId } = data;
                if (memoryDb[roomId]) {
                    let changedIds = [];
                    memoryDb[roomId].forEach(function(m) {
                        if (m.user !== userId && m.read === false) {
                            m.read = true;
                            changedIds.push(m.id);
                        }
                    });
                    
                    if (changedIds.length > 0) {
                        saveChatDb();
                        io.to(roomId).emit('msg_read_status', { msgIds: changedIds });
                    }
                }
            });

            socket.on('disconnect', function() {
                console.log(`🔌 [SOCKET]: Отключение - ${socket.id}`);
            });
        });
    }

    // === БЛОК 7: API - РЕГИСТРАЦИЯ И ПАРОЛИ ===
    app.post('/x-api/register-nick', function(req, res) {
        const { nickname, password, chatId } = req.body;
        const lowerNick = String(nickname).trim().toLowerCase();

        console.log(`📒 [REG]: Запрос регистрации для: ${lowerNick}`);

        if (usersRegistry[lowerNick]) {
            // Если ник существует, проверяем пароль
            if (usersRegistry[lowerNick].password === password) {
                usersRegistry[lowerNick].chatId = chatId; // Обновляем ID устройства
                fs.writeFile(usersDbFile, JSON.stringify(usersRegistry, null, 2), () => {});
                return res.json({ success: true, message: "Вход выполнен успешно" });
            } else {
                console.log(`🚫 [AUTH]: Неверный пароль для никнейма ${lowerNick}`);
                return res.json({ success: false, message: "Ник занят. Неверный пароль!" });
            }
        }

        // Если ника нет - создаем новый аккаунт
        usersRegistry[lowerNick] = {
            chatId: chatId,
            password: password
        };
        
        fs.writeFile(usersDbFile, JSON.stringify(usersRegistry, null, 2), () => {});
        console.log(`🆕 [REG]: Новый пользователь в базе: ${lowerNick}`);
        
        return res.json({ success: true, message: "Регистрация завершена" });
    });

    // === БЛОК 8: API - ПОИСК ПОЛЬЗОВАТЕЛЕЙ ===
    app.post('/x-api/find-user', function(req, res) {
        const { myId, searchNick } = req.body;
        const targetNick = String(searchNick).trim().toLowerCase();
        
        const target = usersRegistry[targetNick];

        if (target) {
            // Создаем уникальную комнату (сортировка ID для постоянства)
            const roomIds = [myId, target.chatId].sort();
            const p2pRoomId = roomIds[0] + "_" + roomIds[1];
            
            console.log(`🔍 [SEARCH]: Пользователь ${searchNick} найден. Комната: ${p2pRoomId}`);
            
            res.json({ 
                success: true, 
                roomId: p2pRoomId, 
                targetNick: searchNick 
            });
        } else {
            console.log(`🔍 [SEARCH]: Пользователь ${searchNick} НЕ найден.`);
            res.json({ success: false, message: "Пользователь не найден" });
        }
    });

    // === БЛОК 9: API - ОТПРАВКА СООБЩЕНИЙ И ПУШИ ===
    app.post('/x-api/chat-send', function(req, res) {
        try {
            const { roomId, user, text, avatar, isAudio, isImage, myChatId } = req.body;
            const finalRoomId = roomId || 'public';
            
            if (!memoryDb[finalRoomId]) {
                memoryDb[finalRoomId] = [];
            }

            const newMessage = { 
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
                roomId: finalRoomId, 
                user: user, 
                text: text, 
                avatar: avatar, 
                isAudio: !!isAudio, 
                isImage: !!isImage,
                read: false, 
                time: getMskTime(), 
                timestamp: Date.now() 
            };
            
            memoryDb[finalRoomId].push(newMessage);
            saveChatDb();

            if (io) {
                io.to(finalRoomId).emit('new_message', newMessage);
                notifyClientsToRefresh();
            }

            res.json({ success: true });

            // ЛОГИКА PUSH-УВЕДОМЛЕНИЙ (С задержкой 3 сек)
            setTimeout(function() {
                const checkMsg = memoryDb[finalRoomId].find(m => m.id === newMessage.id);
                
                if (checkMsg && checkMsg.read === false) {
                    const payload = JSON.stringify({
                        title: String(user).substring(0, 50),
                        body: isAudio ? "🎤 Голосовое сообщение" : (isImage ? "📸 Фотография" : String(text || "").substring(0, 100)),
                        icon: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png"
                    });

                    // Рассылка по всем подпискам кроме отправителя
                    for (const subId in subscriptions) {
                        if (subId !== myChatId) {
                            webpush.sendNotification(subscriptions[subId], payload).catch(err => {
                                if (err.statusCode === 410) delete subscriptions[subId];
                            });
                        }
                    }
                }
            }, 3000);
            
        } catch (e) {
            console.error("❌ [API ERROR]:", e.message);
            res.status(500).json({ success: false });
        }
    });

    // === БЛОК 10: API - СПИСОК ЧАТОВ ДЛЯ ВКЛАДОК ===
    app.get('/x-api/chat-list', function(req, res) {
        const { myId, myName } = req.query;
        const isAdmin = (myName === 'admin' || myName === 'Дмитрий');

        console.log(`📂 [GET-LIST]: Запрос вкладок для ${myName}`);

        const result = Object.keys(memoryDb)
            .filter(function(chatId) {
                // Если админ - видит всё. Если юзер - только те чаты, где есть его ID.
                if (isAdmin === true) return true;
                return chatId.indexOf(myId) !== -1;
            })
            .map(function(chatId) {
                const messages = memoryDb[chatId] || [];
                
                // Ищем имя собеседника в реестре
                const parts = chatId.split('_');
                const otherParticipantId = parts.find(p => p !== myId && p !== 'admin');
                
                let displayName = "Чат";
                for (const nick in usersRegistry) {
                    if (usersRegistry[nick].chatId === otherParticipantId) {
                        displayName = nick;
                        break;
                    }
                }

                return {
                    id: chatId,
                    lastUser: displayName,
                    unreadCount: messages.filter(m => m.read === false && m.user !== myName).length,
                    isOnline: !!(io && io.sockets.adapter.rooms.get(chatId)?.size > 0)
                };
            });

        res.json(result);
    });

    // === СЕРВИСНЫЕ МАРШРУТЫ ===
    app.get('/x-api/chat-history', function(req, res) {
        const roomId = req.query.roomId || 'public';
        res.json(memoryDb[roomId] || []);
    });

    app.post('/x-api/save-subscription', function(req, res) {
        const { chatId, subscription } = req.body;
        if (chatId && subscription) {
            subscriptions[chatId] = subscription;
            fs.writeFile(subDbFile, JSON.stringify(subscriptions, null, 2), () => {});
            res.json({ success: true });
        } else { res.status(400).json({ success: false }); }
    });

    app.get('/x-api/vapid-key', function(req, res) { res.send(vapidKeys.publicKey); });
    app.get('/x-api/ping', function(req, res) { res.send('ok'); });
    
    app.post('/x-api/chat-room-delete', function(req, res) {
        const { roomId } = req.body;
        if (memoryDb[roomId]) {
            delete memoryDb[roomId];
            saveChatDb();
            notifyClientsToRefresh();
            res.json({ success: true });
        } else { res.json({ success: false }); }
    });
};
