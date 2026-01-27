const fs = require('fs');
const path = require('path');
const express = require('express');

const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');

// Глобальная переменная в памяти для мгновенной отдачи
let memoryDb = {};

// Инициализация при запуске
if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
    fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
}

function loadToMemory() {
    if (!fs.existsSync(chatDbFile)) return;
    try {
        const data = fs.readFileSync(chatDbFile, 'utf8');
        if (data) memoryDb = JSON.parse(data);
    } catch (e) { console.log("Ошибка загрузки базы:", e.message); }
}
loadToMemory();

module.exports = function (app, context) {

    // Увеличиваем лимиты для всех запросов в API
    app.use('/x-api/', express.json({ limit: '100mb' }));
    app.use('/x-api/', express.urlencoded({ limit: '100mb', extended: true }));

    // 1. API: ОТПРАВКА
    app.post('/x-api/chat-send', (req, res) => {
        try {
            const { roomId, user, text, avatar, time, isAudio, speechText } = req.body;
            const targetRoom = roomId || 'public';
            
            // Логируем в консоль
            const logText = isAudio ? `[ГОЛОС] ${speechText || ''}` : text;
            console.log(`📩 НОВОЕ: [${targetRoom}] от ${user}: ${logText}`);

            // Обновляем память
            if (!memoryDb[targetRoom]) memoryDb[targetRoom] = [];

            const newMessage = { 
                user, 
                text, 
                avatar, 
                time: time || new Date().toLocaleTimeString(),
                timestamp: Date.now() 
            };
            memoryDb[targetRoom].push(newMessage);

            // ТРИГГЕР ОТВЕТА
            const check = (String(text || "") + " " + String(speechText || "")).toLowerCase();
            if (check.includes("проверка связи")) {
                console.log("🤖 Система генерирует ответ...");
                memoryDb[targetRoom].push({
                    user: "X-SYSTEM",
                    text: "Связь подтверждена. Все узлы системы logist-x работают штатно! 🚀",
                    avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
                    time: new Date().toLocaleTimeString(),
                    timestamp: Date.now() + 10
                });
            }

            // СОХРАНЯЕМ В ФАЙЛ (асинхронно, чтобы не тормозить ответ)
            fs.writeFile(chatDbFile, JSON.stringify(memoryDb, null, 2), (err) => {
                if (err) console.error("Ошибка записи файла:", err);
            });

            // Мгновенный успех
            res.json({ success: true });

        } catch (e) {
            console.error("Критическая ошибка API:", e);
            res.status(500).json({ success: false });
        }
    });

    // 2. API: ИСТОРИЯ (Отдаем из памяти - это очень быстро!)
    app.get('/x-api/chat-history', (req, res) => {
        const roomId = req.query.roomId || 'public';
        res.setHeader('Cache-Control', 'no-cache'); // Запрещаем кэширование браузером
        res.json(memoryDb[roomId] || []);
    });

    // 3. API: СПИСОК ЧАТОВ
    app.get('/x-api/chat-list', (req, res) => {
        try {
            const list = Object.keys(memoryDb).map(roomId => ({
                id: roomId,
                lastUser: memoryDb[roomId][memoryDb[roomId].length - 1]?.user || 'Empty'
            }));
            res.json(list);
        } catch (e) { res.json([]); }
    });

    app.get('/x-api/ping', (req, res) => res.send('ok'));

    console.log("🦾 СЕРВЕРНЫЙ МОДУЛЬ X-CHAT ПОЛНОСТЬЮ ОБНОВЛЕН (MEMORY-MODE)");
};
