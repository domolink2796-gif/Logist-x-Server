const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

/**
 * =====================================================================
 * X-CONECT ENGINE v5.5: FULL MONOLITH (AXX Tuning Edition)
 * 1. ЖЕСТКАЯ ПРИВЯЗКА ИМЕН (БЕЗ ЛАТИНИЦЫ В ВКЛАДКАХ)
 * 2. ПОЛНАЯ СИНХРОНИЗАЦИЯ УДАЛЕНИЯ И СИСТЕМНОГО ЧАТА
 * 3. ПОДРОБНЫЕ ЛОГИ ВСЕХ ДЕЙСТВИЙ В КОНСОЛИ
 * =====================================================================
 */

module.exports = async function (app, context) {
    const io = context.io;
    const publicDir = path.join(process.cwd(), 'public');
    const uploadsDir = path.join(publicDir, 'uploads');
    const dbPath = path.join(publicDir, 'x_connect.db');

    // Настройка лимитов для передачи тяжелых данных (фото/аудио)
    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    // Инициализация базы данных SQLite
    const db = await open({ filename: dbPath, driver: sqlite3.Database });

    // Создание структуры таблиц, если их нет
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (chatId TEXT PRIMARY KEY, nickname TEXT UNIQUE, password TEXT);
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY, roomId TEXT, user TEXT, avatar TEXT, 
            text TEXT, isAudio INTEGER, isImage INTEGER, read INTEGER DEFAULT 0, timestamp INTEGER
        );
        CREATE TABLE IF NOT EXISTS push_subs (chatId TEXT PRIMARY KEY, subscription TEXT);
    `);

    console.log("📡 [SYSTEM]: X-CONECT v5.5 запущен. Логирование: ACTIVE.");

    // Настройка Push-уведомлений (VAPID)
    const vapidKeys = {
        publicKey: 'BPOw_-Te5biFuSMrQLHjfsv3c9LtoFZkhHJp9FE1a1f55L8jGuL1uR39Ho9SWMN6dIdVt8FfxNHwcHuV0uUQ9Jg',
        privateKey: '0SJWxEuVpUlowi2gTaodAoGne93V9DB6PFBoSMbL1WE'
    };
    webpush.setVapidDetails('mailto:admin@logist-x.store', vapidKeys.publicKey, vapidKeys.privateKey);

    // Функция получения времени по МСК
    const getMskTime = (ts = Date.now()) => new Date(ts).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false });

    // Функция сохранения медиафайлов (фото/голос) на диск
    function saveMediaFile(base64Data, isImage) {
        if (!base64Data || !base64Data.includes('base64')) return base64Data;
        const ext = isImage ? 'jpg' : 'webm';
        const fileName = `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
        const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
        return `/uploads/${fileName}`; 
    }

    // --- SOCKET.IO: УПРАВЛЕНИЕ СОЕДИНЕНИЯМИ ---
    if (io) {
        io.on('connection', (socket) => {
            socket.on('join_room', async (roomId) => {
                socket.join(roomId);
                console.log(`🔌 [SOCKET]: Клиент вошел в комнату [${roomId}]`);
            });
            
            socket.on('mark_seen', async (data) => {
                const { roomId, userId } = data;
                await db.run('UPDATE messages SET read = 1 WHERE roomId = ? AND user != ? AND read = 0', [roomId, userId]);
                io.to(roomId).emit('msg_read_status', { roomId });
                io.emit('refresh_chat_list');
                console.log(`👀 [STATUS]: Сообщения в [${roomId}] прочитаны пользователем ${userId}`);
            });
        });
    }

    // --- API РЕГИСТРАЦИИ: ПРИВЯЗКА НИКА К ID ---
    app.post('/x-api/register-nick', async (req, res) => {
        const { nickname, password, chatId } = req.body;
        const nick = String(nickname).trim();
        try {
            const existingNick = await db.get('SELECT * FROM users WHERE nickname = ?', [nick]);
            if (existingNick && existingNick.password !== password) {
                return res.json({ success: false, message: "Ник занят другим паролем" });
            }
            await db.run('INSERT OR REPLACE INTO users (chatId, nickname, password) VALUES (?, ?, ?)', [chatId, nick, password]);
            console.log(`📝 [USER]: Регистрация/Вход: ${nick} (ID: ${chatId})`);
            io.emit('refresh_chat_list'); 
            res.json({ success: true });
        } catch (e) { res.json({ success: false }); }
    });

    // --- API СПИСКА ЧАТОВ: ГЕНЕРАЦИЯ ИМЕН БЕЗ ЛАТИНИЦЫ ---
    app.get('/x-api/chat-list', async (req, res) => {
        const { myId, myName } = req.query;
        try {
            const rooms = await db.all(`SELECT DISTINCT roomId FROM messages WHERE roomId LIKE ? OR roomId = 'system_log'`, [`%${myId}%`]);
            const result = [];
            for (let r of rooms) {
                let dName = "⚙️ Настройка...";
                let isOnline = false;

                if (r.roomId === 'system_log') {
                    dName = "🛰️ СИСТЕМА";
                    isOnline = true;
                } else if (r.roomId.includes('_')) {
                    const otherId = r.roomId.split('_').find(id => id !== myId);
                    // ЖЕСТКИЙ ПОИСК НИКА ПО ID
                    const u = await db.get('SELECT nickname FROM users WHERE chatId = ?', [otherId]);
                    if (u) dName = u.nickname;
                    else {
                        // Резервный поиск по последнему сообщению
                        const lastMsg = await db.get('SELECT user FROM messages WHERE roomId = ? AND user != "СИСТЕМА" ORDER BY timestamp DESC LIMIT 1', [r.roomId]);
                        dName = lastMsg ? lastMsg.user : "ID: " + otherId.substring(0, 5);
                    }
                    isOnline = !!(io && io.sockets.adapter.rooms.has(otherId));
                }
                const unread = await db.get('SELECT COUNT(*) as cnt FROM messages WHERE roomId = ? AND read = 0 AND user != ?', [r.roomId, myName]);
                result.push({ id: r.roomId, lastUser: dName, unreadCount: unread.cnt, isOnline: isOnline });
            }
            res.json(result);
        } catch (e) { res.json([]); }
    });

    // --- API ОТПРАВКИ: СООБЩЕНИЯ + СИСТЕМНЫЙ ОТВЕТ ---
    app.post('/x-api/chat-send', async (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage } = req.body;
            const ts = Date.now();
            const finalContent = (isAudio || isImage) ? saveMediaFile(text, isImage) : text;

            await db.run(`INSERT INTO messages (id, roomId, user, avatar, text, isAudio, isImage, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                ['msg_'+ts, roomId, user, avatar, finalContent, isAudio ? 1 : 0, isImage ? 1 : 0, ts]);

            console.log(`📩 [MSG]: От ${user} в [${roomId}]: ${isAudio ? '[ГОЛОС]' : isImage ? '[ФОТО]' : text}`);

            if (io) {
                io.to(roomId).emit('new_message', { id: 'msg_'+ts, roomId, user, avatar, text: finalContent, isAudio: !!isAudio, isImage: !!isImage, read: false, time: getMskTime(ts), timestamp: ts });
                io.emit('refresh_chat_list');
            }

            // ПРОВЕРКА СВЯЗИ (СИСТЕМНЫЙ ОТВЕТ)
            if (text && text.toLowerCase().includes('проверка связи')) {
                const sysTs = Date.now() + 500;
                const sysRoom = 'system_log';
                const sysText = '🛰️ СИСТЕМА v5.5: СВЯЗЬ УСТАНОВЛЕНА. SQLite Engine Active.';
                
                await db.run('UPDATE messages SET read = 1 WHERE roomId = ? AND read = 0', [sysRoom]);
                await db.run(`INSERT INTO messages (id, roomId, user, avatar, text, isAudio, isImage, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    ['sys_'+sysTs, sysRoom, 'СИСТЕМА', '', sysText, 0, 0, sysTs]);

                console.log(`🛰️ [SYSTEM]: Сгенерирован ответ в системный лог.`);

                setTimeout(() => { if (io) { 
                    io.to(sysRoom).emit('msg_read_status', { roomId: sysRoom });
                    io.emit('new_message', { id: 'sys_'+sysTs, roomId: sysRoom, user: 'СИСТЕМА', text: sysText, time: getMskTime(sysTs) });
                    io.emit('refresh_chat_list');
                }}, 800);
            }
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // --- API УДАЛЕНИЯ: ПОЛНАЯ ОЧИСТКА ---
    app.post('/x-api/chat-room-delete', async (req, res) => {
        const { roomId } = req.body;
        try {
            await db.run('DELETE FROM messages WHERE roomId = ?', [roomId]);
            console.log(`🗑️ [DELETE]: Чат [${roomId}] полностью очищен.`);
            if (io) io.emit('refresh_chat_list');
            res.json({ success: true });
        } catch (e) { res.json({ success: false }); }
    });

    app.post('/x-api/chat-delete', async (req, res) => {
        const { msgId, roomId } = req.body;
        try {
            await db.run('DELETE FROM messages WHERE id = ?', [msgId]);
            console.log(`🗑️ [DELETE]: Сообщение [${msgId}] удалено.`);
            if (io) io.to(roomId).emit('delete_message', msgId);
            res.json({ success: true });
        } catch (e) { res.json({ success: false }); }
    });

    // --- ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ (ИСТОРИЯ, ПУШИ, ПИНГ) ---
    app.get('/x-api/chat-history', async (req, res) => {
        const msgs = await db.all('SELECT * FROM messages WHERE roomId = ? ORDER BY timestamp ASC LIMIT 200', [req.query.roomId]);
        res.json(msgs.map(m => ({ ...m, isAudio: !!m.isAudio, isImage: !!m.isImage, time: getMskTime(m.timestamp) })));
    });

    app.post('/x-api/save-subscription', async (req, res) => {
        const { chatId, subscription } = req.body;
        await db.run('INSERT OR REPLACE INTO push_subs (chatId, subscription) VALUES (?, ?)', [chatId, JSON.stringify(subscription)]);
        res.json({ success: true });
    });

    app.get('/x-api/vapid-key', (req, res) => res.send(vapidKeys.publicKey));
    app.get('/x-api/ping', (req, res) => res.send('ok'));
};
