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

// --- НАСТРОЙКИ БОТА И СЕРВЕРА ---
const TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const MY_ID = '6846149935'; 
const APP_URL = 'https://logist-x-server.onrender.com';

const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

// База данных
const DB_FILE = 'db.json';
let DB = { keys: [] };
if (fs.existsSync(DB_FILE)) {
    try {
        DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) { console.error("[DB] Ошибка чтения базы:", e); }
}

const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
    } catch (e) { console.error("[DB] Ошибка записи базы:", e); }
};

// Инициализация Google
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// Инициализация Бота
const bot = new TelegramBot(TOKEN, { polling: true });
bot.on('polling_error', (err) => { if(!err.message.includes('409')) console.log("Бот:", err.message); });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- ФУНКЦИИ ГУГЛА ---
async function getOrCreateFolder(folderName, parentId = null) {
    try {
        let q = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        if (parentId) q += ` and '${parentId}' in parents`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const folder = await drive.files.create({
            resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : [] },
            fields: 'id'
        });
        return folder.data.id;
    } catch (err) { return null; }
}

async function logToWorkerSheet(spreadsheetId, workerName, data) {
    if (!spreadsheetId) return;
    try {
        const sheetName = workerName || "Общий";
        const ss = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetExists = ss.data.sheets.some(s => s.properties.title === sheetName);
        if (!sheetExists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId, range: `${sheetName}!A1`, valueInputOption: 'RAW',
                resource: { values: [["Дата", "Город", "Адрес", "Объект", "Работа", "Цена", "GPS (Карта)"]] }
            });
        }

        // GPS Ссылка для таблицы
        let gpsValue = data.coords || "Нет GPS";
        if (data.latitude && data.longitude) {
            const mapUrl = `https://www.google.com/maps?q=${data.latitude},${data.longitude}`;
            gpsValue = `=HYPERLINK("${mapUrl}"; "${data.latitude}, ${data.longitude}")`;
        }

        const row = [new Date().toLocaleString('ru-RU'), data.city, data.address, data.client, data.workType, data.price, gpsValue];

        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [row] }
        });
    } catch (err) { console.error("Ошибка таблицы:", err.message); }
}

// --- API МАРШРУТЫ ---
app.post('/api/add_key', async (req, res) => {
    try {
        const { name, days, limit } = req.body;
        const folderId = await getOrCreateFolder(name);
        await sleep(1000);

        const ss = await sheets.spreadsheets.create({ resource: { properties: { title: `ОТЧЕТЫ_${name}` } } });
        const sheetId = ss.data.spreadsheetId;
        
        await drive.files.update({
            fileId: sheetId, addParents: folderId, removeParents: (await drive.files.get({fileId: sheetId, fields: 'parents'})).data.parents.join(',')
        });

        const key = { 
            key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(), 
            name, expiry: new Date(Date.now() + (parseInt(days) || 30) * 86400000).toISOString(), 
            limit: parseInt(limit) || 1, workers: [], folderId, sheetId 
        };

        DB.keys.push(key);
        saveDB();
        res.json({ success: true, key });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, house, entrance, client, image, workType, price, licenseKey } = req.body;
        const keyData = DB.keys.find(k => k.key === licenseKey);
        if (!keyData) throw new Error("Ключ не найден");

        const f1 = await getOrCreateFolder(keyData.name); 
        const f2 = await getOrCreateFolder(worker || "Воркер", f1);
        const f3 = await getOrCreateFolder(client || "Объект", f2);
        const f4 = await getOrCreateFolder(city || "Город", f3);
        const f5 = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), f4);

        if (image) {
            const buffer = Buffer.from(image, 'base64');
            await drive.files.create({
                resource: { name: `${address || 'отчет'}_${Date.now()}.jpg`, parents: [f5] },
                media: { mimeType: 'image/jpeg', body: Readable.from(buffer) }
            });
        }

        if (keyData.sheetId) await logToWorkerSheet(keyData.sheetId, worker, req.body);
        
        // Уведомление в Telegram
        bot.sendMessage(MY_ID, `✅ **НОВЫЙ ОТЧЕТ**\n👤 Воркер: ${worker}\n🏢 Объект: ${client}\n📍 Адрес: ${address} ${house || ''}\n🛠 Работа: ${workType}\n💰 Сумма: ${price}₽`);

        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Команды бота
bot.onText(/\/start/, (msg) => {
    if (msg.chat.id.toString() === MY_ID) {
        bot.sendMessage(MY_ID, "Система LOGIST_X на связи. Панель управления:", {
            reply_markup: { inline_keyboard: [[{ text: "📊 АДМИНКА", web_app: { url: `${APP_URL}/admin-panel` } }]] }
        });
    }
});

app.get('/api/list_keys', (req, res) => res.json({ keys: DB.keys }));
app.post('/api/delete_key', (req, res) => { DB.keys = DB.keys.filter(k => k.key !== req.body.key); saveDB(); res.json({ success: true }); });
app.post('/check-license', (req, res) => {
    const { licenseKey, workerName } = req.body;
    const k = DB.keys.find(x => x.key === licenseKey);
    if (!k) return res.json({ status: "error", message: "Ключ не найден" });
    if (new Date(k.expiry) < new Date()) return res.json({ status: "error", message: "Срок истек" });
    if (!k.workers.includes(workerName)) {
        if (k.workers.length >= k.limit) return res.json({ status: "error", message: "Лимит воркеров исчерпан" });
        k.workers.push(workerName); saveDB();
    }
    res.json({ status: "active", expiry: new Date(k.expiry).getTime() });
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("LOGIST_X SERVER ONLINE"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`));
