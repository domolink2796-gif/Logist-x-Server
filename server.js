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

// --- [1] КОНФИГУРАЦИЯ ---
const TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const MY_ID = '6846149935'; 
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A';
const MASTER_KEY = "LX-BOSS-777";

const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

const DB_FILE = path.join(__dirname, 'keys.json');
let DB = { keys: [] };
const loadDB = () => {
    if (fs.existsSync(DB_FILE)) {
        try { DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { DB = { keys: [] }; }
    }
};
loadDB();
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// Инициализация бота с защитой от 409
const bot = new TelegramBot(TOKEN, { polling: { interval: 500, params: { timeout: 10 } } });

bot.on('polling_error', (err) => {
    if (!err.message.includes('409')) console.log("Бот:", err.message);
});

// --- [2] ЛОГИКА ПАПОК ---
async function getOrCreateFolder(name, parentId) {
    try {
        let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const folder = await drive.files.create({
            resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
            fields: 'id'
        });
        return folder.data.id;
    } catch (err) { return null; }
}

async function getOrCreateWorkerSheet(folderId, workerName) {
    const fileName = `ОТЧЕТЫ_${workerName}`;
    const q = `name = '${fileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed = false`;
    const res = await drive.files.list({ q, fields: 'files(id)' });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const ss = await sheets.spreadsheets.create({ resource: { properties: { title: fileName } } });
    const sheetId = ss.data.spreadsheetId;
    await drive.files.update({ fileId: sheetId, addParents: folderId, removeParents: (await drive.files.get({fileId: sheetId, fields: 'parents'})).data.parents.join(',') });
    await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId, range: 'Sheet1!A1', valueInputOption: 'RAW',
        resource: { values: [["Дата", "Город", "Адрес", "Объект", "Работа", "Цена", "GPS"]] }
    });
    return sheetId;
}

// --- [3] API ---
app.post('/check-license', (req, res) => {
    const { licenseKey, workerName } = req.body;
    if (licenseKey === MASTER_KEY) return res.json({ status: "active", expiry: Date.now() + 315360000000 });
    const k = DB.keys.find(x => x.key === licenseKey);
    if (k && new Date(k.expiry) > new Date()) {
        if (workerName && !k.workers.includes(workerName)) { k.workers.push(workerName); saveDB(); }
        return res.json({ status: "active", expiry: new Date(k.expiry).getTime() });
    }
    res.json({ status: "error", message: "Отказ" });
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, house, entrance, client, image, workType, price, licenseKey, latitude, longitude } = req.body;
        let k = DB.keys.find(x => x.key === licenseKey);
        let company = k ? k.name : (licenseKey === MASTER_KEY ? "Евгений_БОСС_МАСТЕР" : "НЕИЗВЕСТНО");

        const fCompany = await getOrCreateFolder(company, MY_ROOT_ID);
        const fWorker = await getOrCreateFolder(worker || "Монтажник", fCompany);
        const sheetId = await getOrCreateWorkerSheet(fWorker, worker);
        const row = [new Date().toLocaleString('ru-RU'), city, `${address} ${house||''}`, client, workType, price, `${latitude},${longitude}`];
        await sheets.spreadsheets.values.append({ spreadsheetId: sheetId, range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED', resource: { values: [row] } });

        const fCity = await getOrCreateFolder(city || "Город", fWorker);
        const fEndClient = await getOrCreateFolder(client || "Конечный_Клиент", fCity);
        const fDate = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), fEndClient);

        if (image) {
            const buffer = Buffer.from(image, 'base64');
            await drive.files.create({
                resource: { name: `п.${entrance}_${address}.jpg`, parents: [fDate] },
                media: { mimeType: 'image/jpeg', body: Readable.from(buffer) }
            });
        }
        bot.sendMessage(MY_ID, `✅ **${company}**\n👷: ${worker}\n📍: ${city}, ${address}\n💰: ${price}₽`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/list_keys', (req, res) => res.json({ keys: DB.keys }));
app.post('/api/add_key', (req, res) => {
    const { name, days, limit } = req.body;
    const key = { key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(), name, expiry: new Date(Date.now() + (parseInt(days) || 30) * 86400000).toISOString(), limit: parseInt(limit) || 1, workers: [] };
    DB.keys.push(key); saveDB();
    res.json({ success: true, key });
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("HQ LIVE"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер на порту ${PORT}`);
    // ВОТ ЭТО СООБЩЕНИЕ БОТ ПРИШЛЕТ ТЕБЕ САМ ПРИ ЗАПУСКЕ:
    bot.sendMessage(MY_ID, "🚀 СИСТЕМА LOGIST_X ЗАПУЩЕНА И ГОТОВА К РАБОТЕ!").catch(e => {});
});
