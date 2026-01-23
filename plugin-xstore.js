const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Telegraf } = require('telegraf');

// --- НАСТРОЙКИ ТВОЕГО МАГАЗИННОГО БОТА ---
const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw'; 
const MY_ID = 6846149935; 

const storeBot = new Telegraf(STORE_BOT_TOKEN);

// Настройка папки карантина (куда физически упадет ZIP)
const upload = multer({ 
    dest: 'uploads-quarantine/', 
    limits: { fileSize: 50 * 1024 * 1024 } 
});

module.exports = function(app, context) {
    console.log("🛠 X-STORE: Модуль запущен через личный бот (ID: 8177...)");

    app.get('/x-api/ping', (req, res) => {
        res.json({ status: "online", message: "X-Server Bridge is Working!" });
    });

    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        try {
            const { name, email, cat, url } = req.body;
            const file = req.file;

            let message = `🛡 **НОВАЯ ЗАЯВКА В X-STORE**\n\n` +
                          `📦 Приложение: ${name}\n` +
                          `👤 От: ${email}\n` +
                          `🗂 Категория: ${cat}\n`;

            if (file) {
                message += `⚖️ Размер: ${(file.size / (1024 * 1024)).toFixed(2)} MB\n` +
                           `📁 Тип: ZIP-архив (сохранен на сервере)`;
            } else if (url) {
                message += `🔗 Ссылка: ${url}\n` +
                           `📁 Тип: Внешний сайт`;
            }

            // Отправляем уведомление именно в новый бот
            await storeBot.telegram.sendMessage(MY_ID, message);

            res.json({ success: true, message: "Заявка отправлена в личный бот Евгения!" });
        } catch (e) {
            console.error("Ошибка бота X-Store:", e);
            res.status(500).json({ error: e.message });
        }
    });
};
