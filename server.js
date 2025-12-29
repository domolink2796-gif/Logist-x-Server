const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- 1. ПОРТ ЗАПУСКАЕМ СРАЗУ (Чтобы Render не ругался на Time-out) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> [SYSTEM] СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`);
});

// --- 2. НАСТРОЙКИ (Твой новый токен и ID) ---
const TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const MY_TELEGRAM_ID = '6846149935';
const MASTER_KEY_VAL = 'LX-BOSS-777';
const APP_URL = 'https://logist-x-server.onrender.com';
const KEYS_FILE = path.join(__dirname, 'keys.json');

if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }));

const bot = new TelegramBot(TOKEN, { polling: false });

// Очистка и запуск бота (фоном)
setTimeout(async () => {
    try {
        await bot.deleteWebhook({ drop_pending_updates: true });
        bot.startPolling({ restart: true });
        console.log(">>> [BOT] БОТ АКТИВИРОВАН");
    } catch (e) { console.log("Ошибка старта бота:", e.message); }
}, 15000);

// Google Auth
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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',
    'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// --- ЛОГИКА ПАПОК И ЗАГРУЗКИ ---
async function getOrCreateFolder(name, parentId = null) {
    try {
        let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        if (parentId) q += ` and '${parentId}' in parents`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const folder = await drive.files.create({
            resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : [] },
            fields: 'id'
        });
        return folder.data.id;
    } catch (err) { return null; }
}

async function getOrCreateSheet(name, parentId) {
    try {
        let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and '${parentId}' in parents`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const ss = await sheets.spreadsheets.create({ resource: { properties: { title: name } }, fields: 'spreadsheetId' });
        const fileId = ss.data.spreadsheetId;
        await drive.files.update({ fileId, addParents: parentId, removeParents: 'root' });
        // ДОБАВИЛ НОВЫЕ ЗАГОЛОВКИ (Цена, Работа)
        await sheets.spreadsheets.values.append({
            spreadsheetId: fileId, range: 'Sheet1!A1', valueInputOption: 'RAW',
            resource: { values: [['Дата', 'Город', 'Адрес', 'Объект', 'Работа', 'Цена', 'GPS Карта', 'Фото']] }
        });
        return fileId;
    } catch (err) { return null; }
}

// --- API ЭНДПОИНТЫ ---
app.post('/check-license', (req, res) => {
    const { licenseKey } = req.body;
    if (licenseKey === MASTER_KEY_VAL || licenseKey === "DEV-MASTER-999") return res.json({ status: "active", expiry: Date.now() + 315360000000 });
    try {
        const data = JSON.parse(fs.readFileSync(KEYS_FILE));
        const found = data.keys.find(k => k.key === licenseKey);
        if (found && new Date(found.expiry) > new Date()) return res.json({ status: "active", expiry: new Date(found.expiry).getTime() });
    } catch (e) {}
    res.json({ status: "error", message: "Ключ не подходит" });
});

app.post('/upload', async (req, res) => {
    try {
        // Достаем все данные из приложения (включая работу и цену)
        const { worker, city, address, house, entrance, client, image, licenseKey, latitude, longitude, workType, price } = req.body;
        
        let clientFolderName = "Евгений_БОСС";
        const data = JSON.parse(fs.readFileSync(KEYS_FILE));
        const keyData = data.keys.find(k => k.key === licenseKey);
        if (keyData) clientFolderName = keyData.name;

        // Иерархия папок
        const f1 = await getOrCreateFolder(clientFolderName);
        const f2 = await getOrCreateFolder(worker || "Воркер", f1);
        const f3 = await getOrCreateFolder(city || "Город", f2);
        const f4 = await getOrCreateFolder(client || "Объект", f3);

        const photoName = `${address}_${house}_${entrance}_${Date.now()}.jpg`.replace(/\s+/g, '_');
        const buffer = Buffer.from(image, 'base64');
        const file = await drive.files.create({
            resource: { name: photoName, parents: [f4] },
            media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
            fields: 'id, webViewLink'
        });

        const sheetId = await getOrCreateSheet(`Отчет_${worker}`, f2);
        if (sheetId) {
            // Исправленная ссылка GPS
            const gps = (latitude && longitude) ? `https://www.google.com/maps?q=${latitude},${longitude}` : "Нет GPS";
            await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId, range: 'Sheet1!A2', valueInputOption: 'USER_ENTERED',
                resource: { values: [[new Date().toLocaleString('ru-RU'), city, `${address}, д.${house}`, client, workType || "Монтаж", price || 0, gps, file.data.webViewLink]] }
            });
        }
        
        res.json({ success: true });
        bot.sendMessage(MY_TELEGRAM_ID, `✅ Отчет от ${worker} принят!\n🛠 ${workType}\n📍 ${address}\n💰 ${price}₽`);
    } catch (e) { 
        console.log("Ошибка загрузки:", e.message);
        res.status(500).json({ success: false }); 
    }
});

// Кнопки
bot.onText(/\/start/, (msg) => {
    if (msg.chat.id.toString() !== MY_TELEGRAM_ID) return;
    bot.sendMessage(msg.chat.id, "Евгений, система Logist-X готова:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 ОТКРЫТЬ АДМИНКУ", web_app: { url: `${APP_URL}/admin-panel` } }],
                [{ text: "📂 ПЕРЕЙТИ НА ДИСК", url: "https://drive.google.com/drive/my-drive" }]
            ]
        }
    });
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("SERVER LIVE"));
