const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

/**
 * =====================================================================
 * X-CONECT ENGINE v5.6.1: MEDIA-FIX & PERFORMANCE
 * ---------------------------------------------------------------------
 * 1. FIX: Исправлено отображение фото (теперь во весь экран)
 * 2. FIX: Исправлено сохранение и путь к голосовым сообщениям
 * 3. PERF: Режим WAL и Индексы сохранены для скорости на Orange Pi
 * 4. LOGS: Полное отслеживание записи файлов на диск
 * =====================================================================
 */

module.exports = async function (app, context) {
    const io = context.io;
    const publicDir = path.join(process.cwd(), 'public');
    const uploadsDir = path.join(publicDir, 'uploads');
    const dbPath = path.join(publicDir, 'x_connect.db');

    // Гарантируем наличие папки для медиа
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log("📁 [SYSTEM]: Папка uploads создана.");
    }

    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    // Делаем папку uploads публичной, чтобы браузер мог брать оттуда файлы
    app.use('/uploads', express.static(uploadsDir));

    const db = await open({ filename: dbPath, driver: sqlite3.Database });
    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA synchronous = NORMAL;');

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (chatId TEXT PRIMARY KEY, nickname TEXT UNIQUE, password TEXT);
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY, roomId TEXT, user TEXT, avatar TEXT, 
            text TEXT, isAudio INTEGER, isImage INTEGER, read INTEGER DEFAULT 0, timestamp INTEGER
        );
        CREATE TABLE IF NOT EXISTS push_subs (chatId TEXT PRIMARY KEY, subscription TEXT);
        CREATE INDEX IF NOT EXISTS idx_messages_roomId ON messages(roomId);
    `);

    console.log("🚀 [ENGINE]: v5.6.1 запущен. Режим медиа-фиксации ACTIVE.");

    const getMskTime = (ts = Date.now()) => new Date(ts).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false });

    // УЛУЧШЕННАЯ ФУНКЦИЯ СОХРАНЕНИЯ ФАЙЛОВ
    function saveMediaFile(base64Data, isImage) {
        try {
            if (!base64Data || !base64Data.includes('base64')) return base64Data;
            
            const parts = base64Data.split(';base64,');
            const mime = parts[0].split(':')[1];
            const ext = isImage ? 'jpg' : (mime.includes('audio') ? 'webm' : 'bin');
            
            const fileName = `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
            const buffer = Buffer.from(parts[1], 'base64');
            
            fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
            console.log(`💾 [FILE SAVED]: ${fileName} (${buffer.length} bytes)`);
            
            // Возвращаем относительный путь для базы и фронтенда
            return `/uploads/${fileName}`;
        } catch (err) {
            console.error("❌ [MEDIA SAVE ERROR]:", err);
            return base64Data;
        }
    }

    // --- API СПИСКА ЧАТОВ ---
    app.get('/x-api/chat-list', async (req, res) => {
        const { myId, myName } = req.query;
        try {
            const rooms = await db.all(`SELECT DISTINCT roomId FROM messages WHERE roomId LIKE ? OR roomId = 'system_log'`, [`%${myId}%`]);
            const result = [];
            for (let r of rooms) {
                let dName = "⚙️ Настройка...";
                if (r.roomId === 'system_log') dName = "🛰️ СИСТЕМА";
                else if (r.roomId.includes('_')) {
                    const otherId = r.roomId.split('_').find(id => id !== myId);
                    const u = await db.get('SELECT nickname FROM users WHERE chatId = ?', [otherId]);
                    dName = u ? u.nickname : "Чат: " + otherId.substring(0, 5);
                }
                const unread = await db.get('SELECT COUNT(*) as cnt FROM messages WHERE roomId = ? AND read = 0 AND user != ?', [r.roomId, myName]);
                result.push({ id: r.roomId, lastUser: dName, unreadCount: unread.cnt });
            }
            res.json(result);
        } catch (e) { res.json([]); }
    });

    // --- API ОТПРАВКИ (ФИКС МЕДИА) ---
    app.post('/x-api/chat-send', async (req, res) => {
        try {
            const { roomId, user, text, avatar, isAudio, isImage } = req.body;
            const ts = Date.now();
            
            // Если пришел медиа-файл, сохраняем и получаем путь
            let finalContent = text;
            if (isAudio || isImage) {
                finalContent = saveMediaFile(text, !!isImage);
            }

            await db.run(`INSERT INTO messages (id, roomId, user, avatar, text, isAudio, isImage, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                ['msg_'+ts, roomId, user, avatar, finalContent, isAudio ? 1 : 0, isImage ? 1 : 0, ts]);

            console.log(`📩 [MSG]: От ${user} в [${roomId}] | Тип: ${isAudio ? 'АУДИО' : isImage ? 'ФОТО' : 'ТЕКСТ'}`);

            if (io) {
                // ПЕРЕДАЕМ ПУТЬ К ФАЙЛУ (finalContent) ЧТОБЫ КЛИЕНТ ЕГО УВИДЕЛ
                io.to(roomId).emit('new_message', { 
                    id: 'msg_'+ts, 
                    roomId, 
                    user, 
                    avatar, 
                    text: finalContent, 
                    isAudio: !!isAudio, 
                    isImage: !!isImage, 
                    time: getMskTime(ts) 
                });
                io.emit('refresh_chat_list');
            }

            // Системная проверка связи
            if (text && typeof text === 'string' && text.toLowerCase().includes('проверка связи')) {
                const sysTs = Date.now() + 100;
                const sysText = '🛰️ СИСТЕМА v5.6.1: Медиа-движок исправлен. Файлы пишутся в /uploads.';
                await db.run(`INSERT INTO messages (id, roomId, user, text, timestamp) VALUES (?, ?, ?, ?, ?)`, ['sys_'+sysTs, 'system_log', 'СИСТЕМА', sysText, sysTs]);
                if (io) io.to('system_log').emit('new_message', { id: 'sys_'+sysTs, roomId: 'system_log', user: 'СИСТЕМА', text: sysText, time: getMskTime(sysTs) });
            }
            
            res.json({ success: true });
        } catch (e) { 
            console.error("❌ [SEND ERROR]:", e);
            res.status(500).json({ success: false }); 
        }
    });

    // --- API ИСТОРИИ (ОБЯЗАТЕЛЬНО ОТДАЕМ ПУТИ К ФАЙЛАМ) ---
    app.get('/x-api/chat-history', async (req, res) => {
        try {
            const msgs = await db.all('SELECT * FROM messages WHERE roomId = ? ORDER BY timestamp ASC', [req.query.roomId]);
            res.json(msgs.map(m => ({ 
                ...m, 
                isAudio: m.isAudio === 1, 
                isImage: m.isImage === 1, 
                time: getMskTime(m.timestamp) 
            })));
        } catch (e) { res.json([]); }
    });

    app.get('/x-api/ping', (req, res) => res.send('ok'));
};
