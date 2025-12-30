const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- НАСТРОЙКИ LOGIST X ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; // Твоя папка на Диске
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg'; // Твой бот
const DB_NAME = 'DATABASE_KEYS_LOGIST_X'; // Твоя база данных

// Авторизация Google (Твои ключи)
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- ФУНКЦИИ GOOGLE ---
async function getDbId() {
    try {
        const res = await drive.files.list({ q: `name = '${DB_NAME}' and trashed = false` });
        return (res.data.files.length > 0) ? res.data.files[0].id : null;
    } catch (e) { return null; }
}

async function getOrCreateFolder(name, parentId) {
    try {
        const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const fileMetadata = { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] };
        const file = await drive.files.create({ resource: fileMetadata, fields: 'id' });
        return file.data.id;
    } catch (e) { console.error('Ошибка папки:', e); return parentId; }
}

// --- ГЛАВНЫЕ МАРШРУТЫ ---

// 1. АДМИНКА (С ЗАЩИТОЙ ОТ ЦИФР)
app.get('/admin-panel', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// 2. ЗАГРУЗКА ФОТО (ЭТО ВЕРНУЛИ!)
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, client, image } = req.body;
        console.log(`Загрузка фото: ${address}`);

        // Создаем папки: Работник -> Город -> Адрес
        const workerId = await getOrCreateFolder(worker || "Неизвестный", MY_ROOT_ID);
        const cityId = await getOrCreateFolder(city || "Город", workerId);
        const addressId = await getOrCreateFolder(address || "Без адреса", cityId);

        // Имя файла: Дата_Время.jpg
        const fileName = new Date().toLocaleString("ru-RU").replace(/, /g, '_').replace(/:/g, '-') + '.jpg';
        
        // Превращаем картинку из текста в файл
        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const bufferStream = new Readable();
        bufferStream.push(buffer);
        bufferStream.push(null);

        await drive.files.create({
            resource: { name: fileName, parents: [addressId] },
            media: { mimeType: 'image/jpeg', body: bufferStream }
        });

        res.json({ success: true, message: "Фото загружено!" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 3. СПИСОК КЛЮЧЕЙ (ДЛЯ АДМИНКИ)
app.get('/api/list_keys', async (req, res) => {
    try {
        const ssId = await getDbId();
        if (!ssId) return res.json({ keys: [] });
        const data = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Sheet1!A2:E200' });
        const keys = (data.data.values || []).map(r => ({ key: r[0], name: r[1], expiry: r[2], limit: r[3] }));
        res.json({ keys });
    } catch (e) { res.json({ keys: [] }); }
});

// --- БОТ ---
bot.start((ctx) => {
    // Автоматическая ссылка на твой сервер
    const appUrl = `https://${process.env.RAILWAY_STATIC_URL || "logist-x-server-production.up.railway.app"}/admin-panel`;
    ctx.reply('LOGIST HQ: СИСТЕМА ПОЛНОСТЬЮ АКТИВНА 🦾', {
        reply_markup: {
            inline_keyboard: [[ { text: "ОТКРЫТЬ ТЕЛЕВИЗОР", web_app: { url: appUrl } } ]]
        }
    });
});

// Запуск
app.get('/', (req, res) => res.send("СЕРВЕР LOGIST-X РАБОТАЕТ В ШТАТНОМ РЕЖИМЕ"));
bot.launch().catch(e => console.log("Бот:", e));
app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ЗАПУЩЕН"));

// Защита от падений
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
