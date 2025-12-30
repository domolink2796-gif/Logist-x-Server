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

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A';
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_NAME = 'DATABASE_KEYS_LOGIST_X';

// Auth
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

async function getOrCreateFolder(rawName, parentId) {
    try {
        const name = String(rawName).trim(); 
        const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const fileMetadata = { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] };
        const file = await drive.files.create({ resource: fileMetadata, fields: 'id' });
        return file.data.id;
    } catch (e) { return parentId; }
}

// --- ЛЕЧЕНИЕ "ТЕКСТОВОГО ФОРМАТА" ---

// 1. Создаем НОВЫЙ адрес /dashboard
app.get('/dashboard', (req, res) => {
    // Эта команда ЗАСТАВЛЯЕТ браузер рисовать страницу
    res.type('html'); 
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// 2. Все старые адреса перекидываем на новый
app.get('/tv', (req, res) => res.redirect('/dashboard'));
app.get('/admin-panel', (req, res) => res.redirect('/dashboard'));

// --- ЗАГРУЗКА ФОТО ---
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, client, image } = req.body;
        console.log(`Фото: ${worker} -> ${client || 'Общий'}`);
        
        const workerId = await getOrCreateFolder(worker || "Неизвестный", MY_ROOT_ID);
        const cityId = await getOrCreateFolder(city || "Город", workerId);
        
        let finalFolderName = "Общий";
        if (client && client.trim().length > 0) finalFolderName = client.trim();
        const finalFolderId = await getOrCreateFolder(finalFolderName, cityId);

        const safeAddress = address && address.trim().length > 0 ? address.trim() : "Без адреса";
        const timeStr = new Date().toLocaleString("ru-RU").replace(/, /g, '_').replace(/:/g, '-');
        const fileName = `${safeAddress} ${timeStr}.jpg`;

        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const bufferStream = new Readable();
        bufferStream.push(buffer);
        bufferStream.push(null);

        await drive.files.create({
            resource: { name: fileName, parents: [finalFolderId] },
            media: { mimeType: 'image/jpeg', body: bufferStream }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/list_keys', async (req, res) => {
    try {
        const resFile = await drive.files.list({ q: `name = '${DB_NAME}' and trashed = false` });
        if (resFile.data.files.length === 0) return res.json({ keys: [] });
        const data = await sheets.spreadsheets.values.get({ spreadsheetId: resFile.data.files[0].id, range: 'Sheet1!A2:E200' });
        const keys = (data.data.values || []).map(r => ({ key: r[0], name: r[1], expiry: r[2], limit: r[3] }));
        res.json({ keys });
    } catch (e) { res.json({ keys: [] }); }
});

// --- БОТ ---
bot.start((ctx) => {
    const domain = process.env.RAILWAY_STATIC_URL || "logist-x-server-production.up.railway.app";
    // ВЕДЕМ НА НОВЫЙ АДРЕС
    const appUrl = `https://${domain}/dashboard`;
    
    ctx.reply('LOGIST HQ: ПАНЕЛЬ ОБНОВЛЕНА 🚀', {
        reply_markup: {
            inline_keyboard: [[ { text: "ОТКРЫТЬ DASHBOARD", web_app: { url: appUrl } } ]]
        }
    });
});

app.get('/', (req, res) => res.send("SERVER ONLINE"));

bot.launch().catch(e => console.log("Бот:", e));
app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ЗАПУЩЕН"));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
