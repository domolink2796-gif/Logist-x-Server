const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

// 1. ПУСКАЕМ ПРИЛОЖЕНИЕ (CORS)
app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '50mb' }));

const TOKEN = '7908672389:AAF63DoOmlrCXTRoIlmFVg71I1SgC55kHUc';
const MY_TELEGRAM_ID = '6846149935';
const MASTER_KEY_VAL = 'LX-BOSS-777';
const KEYS_FILE = path.join(__dirname, 'keys.json');

// 2. ПОДГОТОВКА ФАЙЛА КЛЮЧЕЙ
if (!fs.existsSync(KEYS_FILE)) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }, null, 2));
}

// 3. БОТ (С ЗАЩИТОЙ ОТ 409)
const bot = new TelegramBot(TOKEN, { polling: false });

async function restartBot() {
    try {
        console.log(">>> [BOT] Сброс старых обновлений...");
        await bot.deleteWebhook({ drop_pending_updates: true });
        setTimeout(() => {
            bot.startPolling();
            console.log(">>> [BOT] БОТ АКТИВЕН");
        }, 15000); // 15 секунд паузы для Render
    } catch (e) {
        console.log(">>> [BOT] Ошибка старта (повтор через 5 сек):", e.message);
        setTimeout(restartBot, 5000);
    }
}
restartBot();

// Игнорируем 409 в логах, чтобы не засорять
bot.on('polling_error', (err) => {
    if (!err.message.includes('409 Conflict')) console.log("Bot Error:", err.message);
});

// 4. API ДЛЯ ПРИЛОЖЕНИЯ (ПРОВЕРКА ЛИЦЕНЗИИ)
app.post('/api/check_key', (req, res) => {
    const { licenseKey } = req.body;
    console.log(`>>> [APP] Попытка входа с ключом: ${licenseKey}`);

    if (licenseKey === MASTER_KEY_VAL) return res.json({ success: true });

    try {
        const data = JSON.parse(fs.readFileSync(KEYS_FILE));
        const found = data.keys.find(k => k.key === licenseKey);
        if (found) return res.json({ success: true });
    } catch (e) { console.log("Ошибка БД"); }

    res.status(403).json({ success: false });
});

// 5. GOOGLE И ТВОЯ ИЕРАРХИЯ
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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',
    'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

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
    } catch (e) { return null; }
}

async function getOrCreateSheet(name, parentId) {
    try {
        let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and '${parentId}' in parents`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const ss = await sheets.spreadsheets.create({ resource: { properties: { title: name } }, fields: 'spreadsheetId' });
        const fileId = ss.data.spreadsheetId;
        await drive.files.update({ fileId, addParents: parentId, removeParents: 'root' });
        await sheets.spreadsheets.values.append({
            spreadsheetId: fileId, range: 'Sheet1!A1', valueInputOption: 'RAW',
            resource: { values: [['Дата', 'Город', 'Адрес', 'Объект', 'GPS', 'Фото']] }
        });
        return fileId;
    } catch (e) { return null; }
}

// ЗАГРУЗКА
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, house, entrance, client, image, licenseKey, latitude, longitude } = req.body;
        let clientName = "Евгений_БОСС";
        
        try {
            const data = JSON.parse(fs.readFileSync(KEYS_FILE));
            const found = data.keys.find(k => k.key === licenseKey);
            if (found) clientName = found.name;
        } catch (e) {}

        // ИЕРАРХИЯ: Клиент -> Воркер -> ТАБЛИЦА (в воркере) -> Город -> Объект
        const f1 = await getOrCreateFolder(clientName);
        const f2 = await getOrCreateFolder(worker || "Воркер", f1);
        const sheetId = await getOrCreateSheet(`Отчет_${worker}`, f2);
        const f3 = await getOrCreateFolder(city || "Город", f2);
        const f4 = await getOrCreateFolder(client || "Объект", f3);

        const photoName = `${address}_${house}_${entrance}.jpg`.replace(/\s+/g, '_');
        const buffer = Buffer.from(image, 'base64');
        const file = await drive.files.create({
            resource: { name: photoName, parents: [f4] },
            media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
            fields: 'id, webViewLink'
        });

        if (sheetId) {
            const gps = (latitude && longitude) ? `https://www.google.com/maps?q=${latitude},${longitude}` : "Нет GPS";
            await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId, range: 'Sheet1!A2', valueInputOption: 'RAW',
                resource: { values: [[new Date().toLocaleString('ru-RU'), city, `${address}, ${house}`, client, gps, file.data.webViewLink]] }
            });
        }
        res.json({ success: true });
        bot.sendMessage(MY_TELEGRAM_ID, `✅ Принято для: ${clientName}`);
    } catch (e) {
        console.log("Ошибка загрузки:", e.message);
        res.status(500).json({ success: false });
    }
});

// КНОПКИ
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Logist-X активен!", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 АДМИНКА", web_app: { url: "https://logist-x-server.onrender.com/admin-panel" } }],
                [{ text: "📂 ДИСК", url: "https://drive.google.com/drive/my-drive" }]
            ]
        }
    });
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/api/list_keys', (req, res) => res.json(JSON.parse(fs.readFileSync(KEYS_FILE))));
app.get('/', (req, res) => res.send("SERVER LIVE"));

app.listen(process.env.PORT || 3000, () => console.log("SERVER READY"));
