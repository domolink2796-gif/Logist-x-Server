const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

/**
 * =====================================================================
 * X-CONECT ENGINE v4.7: SQLITE MONOLITH (AXX Tuning Edition)
 * ИСПРАВЛЕНА ОШИБКА UNIQUE CONSTRAINT + ИМЕНА В ЛОГАХ
 * =====================================================================
 */

module.exports = async function (app, context) {
    const io = context.io;
    const publicDir = path.join(process.cwd(), 'public');
    const uploadsDir = path.join(publicDir, 'uploads');
    const dbPath = path.join(publicDir, 'x_connect.db');

    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    const db = await open({ filename: dbPath, driver: sqlite3.Database });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (chatId TEXT PRIMARY KEY, nickname TEXT UNIQUE, password TEXT);
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY, roomId TEXT, user TEXT, avatar TEXT, 
            text TEXT, isAudio INTEGER, isImage INTEGER, read INTEGER DEFAULT 0, timestamp INTEGER
        );
        CREATE TABLE IF NOT EXISTS push_subs (chatId TEXT PRIMARY KEY, subscription TEXT);
    `);

    console.log("📡 [SYSTEM]: X-CONECT v4.7 (SQLite) запущен.");

    const vapidKeys = {
        publicKey: 'BPOw_-Te5biFuSMrQLHjfsv3c9LtoFZkhHJp9FE1a1f55L8jGuL1uR39Ho9SWMN6dIdVt8FfxNHwcHuV0uUQ9Jg',
        privateKey: '0SJWxEuVpUlowi2gTaodAoGne93V9DB6PFBoSMbL1WE'
    };
    webpush.setVapidDetails('mailto:admin@logist-x.store', vapidKeys.publicKey, vapidKeys.privateKey);

    function getMskTime(ts = Date.now()) {
        return new Date(ts).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false });
    }

    function saveMediaFile(base64Data, isImage) {
        if (!base64Data || !base64Data.includes('base64')) return base64Data;
        const ext = isImage ? 'jpg' : 'webm';
        const fileName = `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
        const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
        fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
        return `/uploads/${fileName}`; 
    }

    if (io) {
        io.on('connection', (socket) => {
            // Улучшенные логи сокетов
            socket.on('join_room', async (roomId) => {
                socket.join(roomId);
                // Пытаемся найти имя пользователя для красивого лога
                const user = await db.get('SELECT nickname FROM users WHERE chatId = ?', [roomId]);
                const name = user ? user.nickname : 'Клиент';
                console.log(`📡 Socket: ${name} вошел в комнату [${roomId}]`);
            });
            
            socket.on('mark_seen', async (data) => {
                const { roomId, userId } = data;
                await db.run('UPDATE messages SET read = 1 WHERE roomId = ? AND user != ? AND read = 0', [roomId, userId]);
                io.to(roomId).emit('msg_read_status', { roomId });
                io.emit('refresh_chat_list');
            });
        });
    }

    // --- API РЕГИСТРАЦИИ: ИСПРАВЛЕНЫ КОНФЛИКТЫ UNIQUE ---
    app.post('/x-api/register-nick', async (req, res) => {
        const { nickname, password, chatId } = req.body;
        const nick = String(nickname).trim().toLowerCase();

        try {
            const existingNick = await db.get('SELECT * FROM users WHERE nickname = ?', [nick]);
            
            if (existingNick) {
                if (existingNick.password === password) {
                    // Тот же юзер, просто обновляем ID если сменился
                    await db.run('UPDATE users SET chatId = ? WHERE nickname = ?', [chatId, nick]);
                    return res.json({ success: true });
                }
                return res.json({ success: false, message: "Ник занят другим паролем" });
            }

            // Если ника нет, проверяем не занят ли ID другим ником
            const existingId = await db.get('SELECT * FROM users WHERE chatId = ?', [chatId]);
            if (existingId) {
                // Переименовываем существующий аккаунт этого устройства
                await db.run('UPDATE users SET nickname = ?, password = ? WHERE chatId = ?', [nick, password, chatId]);
            } else {
                // Новый пользователь
                await db.run('INSERT INTO users (chatId, nickname, password) VALUES (?, ?, ?)', [chatId, nick, password]);
            }
            res.json({ success: true });
        } catch (e) {
            console.error("❌ REG ERROR:", e);
            res.json({ success: false });
        }
    });

    app.post('/x-api/find-user', async (req, res) => {
        const { myId, searchNick } = req.body;
        const targetNick = String(searchNick).trim().toLowerCase();
        const target = await db.get('SELECT chatId, nickname FROM users WHERE nickname = ?', [targetNick]);
        if (target) {
            const roomIds = [myId, target.chatId].sort();
            res.json({ success: true, roomId: roomIds[0] + "_" + roomIds[1], targetNick: target.nickname });
        } else { res.json({ success: false, message: "Пользователь не найден" }); }
    });

    app.post('/x-api/chat-send', async (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage, myChatId } = req.body;
            const finalRoomId = roomId || 'public';
            const ts = Date.now();
            const msgId = 'msg_' + ts;
            const finalContent = (isAudio || isImage) ? saveMediaFile(text, isImage) : text;

            await db.run(`INSERT INTO messages (id, roomId, user, avatar, text, isAudio, isImage, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [msgId, finalRoomId, user, avatar, finalContent, isAudio ? 1 : 0, isImage ? 1 : 0, ts]);

            if (io) {
                io.to(finalRoomId).emit('new_message', { id: msgId, roomId: finalRoomId, user, avatar, text: finalContent, isAudio: !!isAudio, isImage: !!isImage, read: false, time: getMskTime(ts), timestamp: ts });
                io.emit('refresh_chat_list');
            }

            if (text.toLowerCase() === 'проверка связи') {
                const sysTs = Date.now() + 500;
                const sysRoom = 'system_log';
                const sysText = '🛰️ СВЯЗЬ УСТАНОВЛЕНА. Все системы в норме.';
                
                await db.run('UPDATE messages SET read = 1 WHERE roomId = ? AND read = 0', [sysRoom]);

                await db.run(`INSERT INTO messages (id, roomId, user, avatar, text, isAudio, isImage, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    ['sys_'+sysTs, sysRoom, 'СИСТЕМА', '', sysText, 0, 0, sysTs]);

                setTimeout(() => { if (io) { 
                    io.to(sysRoom).emit('msg_read_status', { roomId: sysRoom });
                    io.emit('new_message', { id: 'sys_'+sysTs, roomId: sysRoom, user: 'СИСТЕМА', text: sysText, time: getMskTime(sysTs) });
                    io.emit('refresh_chat_list');
                }}, 800);
            }
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    app.get('/x-api/chat-list', async (req, res) => {
        const { myId, myName } = req.query;
        const rooms = await db.all(`SELECT DISTINCT roomId FROM messages WHERE roomId LIKE ? OR roomId = 'public' OR roomId = 'system_log'`, [`%${myId}%`]);
        const result = [];
        for (let r of rooms) {
            let dName = (r.roomId === 'public') ? "🌐 ОБЩИЙ КАНАЛ" : "Чат";
            if (r.roomId === 'system_log') dName = "🛰️ СИСТЕМА";
            else if (r.roomId.includes('_')) {
                const otherId = r.roomId.split('_').find(id => id !== myId);
                const u = await db.get('SELECT nickname FROM users WHERE chatId = ?', [otherId]);
                if (u) dName = u.nickname;
            }
            const unread = await db.get('SELECT COUNT(*) as cnt FROM messages WHERE roomId = ? AND read = 0 AND user != ?', [r.roomId, myName]);
            result.push({ id: r.roomId, lastUser: dName, unreadCount: unread.cnt, isOnline: !!(io && io.sockets.adapter.rooms.get(r.roomId)?.size > 0) });
        }
        res.json(result);
    });

    app.get('/x-api/chat-history', async (req, res) => {
        const msgs = await db.all('SELECT * FROM messages WHERE roomId = ? ORDER BY timestamp ASC LIMIT 200', [req.query.roomId || 'public']);
        res.json(msgs.map(m => ({ ...m, isAudio: !!m.isAudio, isImage: !!m.isImage, time: getMskTime(m.timestamp) })));
    });

    app.post('/x-api/chat-delete', async (req, res) => {
        await db.run('DELETE FROM messages WHERE id = ?', [req.body.msgId]);
        if (io) io.to(req.body.roomId).emit('delete_message', req.body.msgId);
        res.json({ success: true });
    });

    app.post('/x-api/chat-room-delete', async (req, res) => {
        await db.run('DELETE FROM messages WHERE roomId = ?', [req.body.roomId]);
        io.emit('refresh_chat_list');
        res.json({ success: true });
    });

    app.get('/x-api/vapid-key', (req, res) => res.send(vapidKeys.publicKey));
    app.get('/x-api/ping', (req, res) => res.send('ok'));
};
