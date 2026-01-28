const fs = require('fs');
const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

/**
 * =====================================================================
 * X-CONECT ENGINE v5.7: СТАБИЛЬНЫЙ МОНОЛИТ
 * 1. ИСПРАВЛЕНО: Связь с сервером (убраны конфликты путей)
 * 2. ИСПРАВЛЕНО: Голосовые и фото (теперь пути пишутся верно)
 * 3. ИСПРАВЛЕНО: Латиница в именах (жесткий поиск в базе)
 * 4. ПОДРОБНЫЕ ЛОГИ: Каждое действие в консоли PM2
 * =====================================================================
 */

module.exports = async function (app, context) {
    const io = context.io;
    const dbPath = path.join(process.cwd(), 'public', 'x_connect.db');
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');

    // Гарантируем права на папку медиа
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    const db = await open({ filename: dbPath, driver: sqlite3.Database });
    
    // Включаем WAL режим (он ускоряет, но не ломает)
    await db.exec('PRAGMA journal_mode = WAL;');

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (chatId TEXT PRIMARY KEY, nickname TEXT UNIQUE, password TEXT);
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY, roomId TEXT, user TEXT, avatar TEXT, 
            text TEXT, isAudio INTEGER, isImage INTEGER, read INTEGER DEFAULT 0, timestamp INTEGER
        );
    `);

    console.log("📡 [SYSTEM]: X-CONECT v5.7 запущен. Связь установлена.");

    const getMskTime = (ts = Date.now()) => new Date(ts).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false });

    // Функция сохранения файлов
    function saveMediaFile(base64Data, isImage) {
        if (!base64Data || !base64Data.includes('base64')) return base64Data;
        const ext = isImage ? 'jpg' : 'webm';
        const fileName = `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
        const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
        fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
        console.log(`💾 [FILE]: Сохранен ${fileName}`);
        return `/uploads/${fileName}`; 
    }

    if (io) {
        io.on('connection', (socket) => {
            socket.on('join_room', (roomId) => {
                socket.join(roomId);
                console.log(`🔌 [SOCKET]: Юзер зашел в ${roomId}`);
            });
            socket.on('mark_seen', async (data) => {
                const { roomId, userId } = data;
                await db.run('UPDATE messages SET read = 1 WHERE roomId = ? AND user != ? AND read = 0', [roomId, userId]);
                io.to(roomId).emit('msg_read_status', { roomId });
                io.emit('refresh_chat_list');
            });
        });
    }

    // Регистрация
    app.post('/x-api/register-nick', async (req, res) => {
        const { nickname, password, chatId } = req.body;
        try {
            await db.run('INSERT OR REPLACE INTO users (chatId, nickname, password) VALUES (?, ?, ?)', [chatId, nickname, password]);
            console.log(`📝 [REG]: ${nickname} вошел.`);
            io.emit('refresh_chat_list'); 
            res.json({ success: true });
        } catch (e) { res.json({ success: false }); }
    });

    // Список чатов (без латиницы)
    app.get('/x-api/chat-list', async (req, res) => {
        const { myId, myName } = req.query;
        try {
            const rooms = await db.all(`SELECT DISTINCT roomId FROM messages WHERE roomId LIKE ? OR roomId = 'system_log'`, [`%${myId}%`]);
            const result = [];
            for (let r of rooms) {
                let dName = "⚙️ Настройка...";
                if (r.roomId === 'system_log') dName = "🛰️ СИСТЕМА";
                else {
                    const otherId = r.roomId.split('_').find(id => id !== myId);
                    const u = await db.get('SELECT nickname FROM users WHERE chatId = ?', [otherId]);
                    dName = u ? u.nickname : "ID: " + otherId.substring(0, 5);
                }
                const unread = await db.get('SELECT COUNT(*) as cnt FROM messages WHERE roomId = ? AND read = 0 AND user != ?', [r.roomId, myName]);
                result.push({ id: r.roomId, lastUser: dName, unreadCount: unread.cnt });
            }
            res.json(result);
        } catch (e) { res.json([]); }
    });

    // Отправка сообщений (с ответом системы)
    app.post('/x-api/chat-send', async (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage } = req.body;
            const ts = Date.now();
            const finalContent = (isAudio || isImage) ? saveMediaFile(text, isImage) : text;

            await db.run(`INSERT INTO messages (id, roomId, user, avatar, text, isAudio, isImage, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                ['msg_'+ts, roomId, user, avatar, finalContent, isAudio?1:0, isImage?1:0, ts]);

            console.log(`📩 [MSG]: От ${user} в ${roomId}`);

            if (io) {
                io.to(roomId).emit('new_message', { id: 'msg_'+ts, roomId, user, avatar, text: finalContent, isAudio: !!isAudio, isImage: !!isImage, time: getMskTime(ts) });
                io.emit('refresh_chat_list');
            }

            // Ответ системы
            if (text && text.toLowerCase().includes('проверка связи')) {
                const sysTs = Date.now() + 500;
                const sysText = '🛰️ СИСТЕМА: Связь восстановлена. v5.7 в строю.';
                await db.run(`INSERT INTO messages (id, roomId, user, text, timestamp) VALUES (?, ?, ?, ?, ?)`, ['sys_'+sysTs, 'system_log', 'СИСТЕМА', sysText, sysTs]);
                if (io) io.to('system_log').emit('new_message', { id: 'sys_'+sysTs, roomId: 'system_log', user: 'СИСТЕМА', text: sysText, time: getMskTime(sysTs) });
            }
            res.json({ success: true });
        } catch (e) { res.json({ success: false }); }
    });

    app.get('/x-api/chat-history', async (req, res) => {
        const msgs = await db.all('SELECT * FROM messages WHERE roomId = ? ORDER BY timestamp ASC', [req.query.roomId]);
        res.json(msgs.map(m => ({ ...m, isAudio: !!m.isAudio, isImage: !!m.isImage, time: getMskTime(m.timestamp) })));
    });

    app.post('/x-api/chat-room-delete', async (req, res) => {
        await db.run('DELETE FROM messages WHERE roomId = ?', [req.body.roomId]);
        io.emit('refresh_chat_list');
        res.json({ success: true });
    });

    app.get('/x-api/ping', (req, res) => res.json({ success: true }));
};
