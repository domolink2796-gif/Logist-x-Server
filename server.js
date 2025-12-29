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

const TOKEN = '7908672389:AAFqJsmCmlJHSckewNPue_XVa_WTxKY7-Aw';
const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';
const MY_TELEGRAM_ID = '6846149935';
const MASTER_KEY_VAL = 'LX-BOSS-777';

const bot = new TelegramBot(TOKEN, { polling: true });
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// --- ФУНКЦИЯ ДЛЯ ПОСТОЯННЫХ КНОПОК ---
const mainMenu = {
    reply_markup: {
        keyboard: [
            [{ text: "📊 Админ-панель" }, { text: "📂 Google Drive" }]
        ],
        resize_keyboard: true, // Делает кнопки компактными
        one_time_keyboard: false // Кнопки НЕ будут исчезать
    }
};

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
        const ss = await sheets.spreadsheets.create({
            resource: { properties: { title: name } },
            fields: 'spreadsheetId'
        });
        const fileId = ss.data.spreadsheetId;
        await drive.files.update({ fileId, addParents: parentId, removeParents: 'root' });
        await sheets.spreadsheets.values.append({
            spreadsheetId: fileId, range: 'Sheet1!A1', valueInputOption: 'RAW',
            resource: { values: [['Дата', 'Город', 'Адрес', 'Клиент', 'Карта GPS', 'Ссылка на фото']] }
        });
        return fileId;
    } catch (err) { return null; }
}

app.post('/api/check_key', (req, res) => {
    const { licenseKey } = req.body;
    if (licenseKey === MASTER_KEY_VAL) return res.json({ success: true });
    res.status(403).json({ success: false });
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, house, entrance, client, image, licenseKey, latitude, longitude } = req.body;
        if (licenseKey !== MASTER_KEY_VAL) return res.status(403).json({ success: false });

        const gpsLink = (latitude && longitude) ? `https://www.google.com/maps?q=${latitude},${longitude}` : "Нет GPS";
        const photoName = `${address || 'Улица'}_${house || 'Дом'}_${entrance || 'Подъезд'}.jpg`.replace(/\s+/g, '_');

        const f1 = await getOrCreateFolder("Евгений_Admin"); 
        const f2 = await getOrCreateFolder(worker || "Воркер", f1);
        const f3 = await getOrCreateFolder(city || "Город", f2);
        const f4 = await getOrCreateFolder(client || "Клиент", f3);

        const buffer = Buffer.from(image, 'base64');
        const file = await drive.files.create({
            resource: { name: photoName, parents: [f4] },
            media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
            fields: 'id, webViewLink'
        });

        const sheetId = await getOrCreateSheet(`Отчет_${worker}`, f2);
        if (sheetId) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId, range: 'Sheet1!A2', valueInputOption: 'RAW',
                resource: { values: [[new Date().toLocaleString('ru-RU'), city, `${address}, д.${house}, под.${entrance}`, client, gpsLink, file.data.webViewLink]] }
            });
        }

        res.json({ success: true });
        bot.sendMessage(MY_TELEGRAM_ID, `✅ Фото принято!\n🏠 Файл: ${photoName}\n👷 Воркер: ${worker}\n📍 Адрес: ${city}, ${address}, д.${house}, под.${entrance}\n🏢 Клиент: ${client}\n🗺 Карта: ${gpsLink}`, mainMenu);
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- ЛОГИКА КНОПОК ---
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Привет, Евгений! Твои кнопки управления всегда внизу:", mainMenu);
});

bot.on('message', (msg) => {
    if (msg.text === "📊 Админ-панель") {
        bot.sendMessage(msg.chat.id, "🔗 Твоя админка: https://logist-x-server.onrender.com/admin-panel");
    }
    if (msg.text === "📂 Google Drive") {
        bot.sendMessage(msg.chat.id, "📂 Твой Google Drive: https://drive.google.com/drive/my-drive");
    }
});

app.get('/', (req, res) => res.send("LOGIST_X ONLINE"));
app.listen(process.env.PORT || 3000, () => console.log("SERVER START"));
