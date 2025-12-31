const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const MY_TELEGRAM_ID = 6846149935;
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// Функция сброса вебхука (исправляет ошибку 409)
async function resetBot() {
    try {
        console.log("🔄 Сброс старых соединений...");
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log("✅ Соединение очищено");
    } catch (e) { console.error("Ошибка сброса:", e); }
}

// --- ТВОЯ ЛОГИКА ПАПОК И ОТЧЕТОВ (БЕЗ ИЗМЕНЕНИЙ) ---
async function getOrCreateFolder(rawName, parentId) {
    const name = String(rawName).trim();
    const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    const res = await drive.files.list({ q, fields: 'files(id)' });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const file = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
    return file.data.id;
}

// Эндпоинт для загрузки фото из приложения
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, entrance, client, image } = req.body;
        console.log(`📸 Загрузка фото от ${worker}`);
        
        const ownerId = await getOrCreateFolder("Logist-X_Objects", MY_ROOT_ID);
        const workerId = await getOrCreateFolder(worker, ownerId);
        const cityId = await getOrCreateFolder(city, workerId);
        const today = new Date().toISOString().split('T')[0];
        const dateId = await getOrCreateFolder(today, cityId);
        const clientId = await getOrCreateFolder(client || "Общий", dateId);

        if (image) {
            const fileName = `${address || 'Адрес'} ${entrance || ''}`.trim() + ".jpg";
            const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            await drive.files.create({ resource: { name: fileName, parents: [clientId] }, media: { mimeType: 'image/jpeg', body: bufferStream } });
        }
        res.json({ success: true });
    } catch (e) { 
        console.error("Ошибка загрузки:", e);
        res.status(500).json({ success: false, error: e.message }); 
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`);
    await resetBot();
    bot.launch();
});
