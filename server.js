const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- ТВОИ НАСТРОЙКИ ---
const ADMIN_ID = 6846149935;
const BOT_TOKEN = '7908672389:AAFqJsmCmlJHSckewNPue_XVa_WTxKY7-Aw';
const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

// --- БАЗА КЛЮЧЕЙ ---
const DB_FILE = 'db.json';
let DB = { keys: [] };
try {
    if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        DB = JSON.parse(data);
    }
} catch (e) { console.error("Ошибка базы данных:", e); }

const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));

// --- GOOGLE API SETUP ---
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// --- ТЕЛЕГРАМ БОТ ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/\/start|\/admin/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return bot.sendMessage(msg.chat.id, "Доступ закрыт.");
    bot.sendMessage(msg.chat.id, `Привет, Евгений! 
Твой ID: ${msg.from.id} подтвержден.`, {
        reply_markup: {
            inline_keyboard: [[{ 
                text: "Открыть Master HQ v87.0", 
                web_app: { url: `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/admin-panel` } 
            }]]
        }
    });
});

// --- ЛОГИКА ПАПОК ---
async function getOrCreateFolder(folderName, parentId = null) {
    let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) query += ` and '${parentId}' in parents`;
    const res = await drive.files.list({ q: query, fields: 'files(id)' });
    if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({
        resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : [] },
        fields: 'id'
    });
    return folder.data.id;
}

// --- ЗАПИСЬ В ТАБЛИЦУ ---
async function logToSheet(data) {
    try {
        const spreadsheetName = "БАЗА_ОТЧЕТОВ_LOGIST";
        let res = await drive.files.list({ q: `name = '${spreadsheetName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false` });
        
        let ssId;
        if (res.data.files.length > 0) {
            ssId = res.data.files[0].id;
        } else {
            const ss = await sheets.spreadsheets.create({ resource: { properties: { title: spreadsheetName } } });
            ssId = ss.data.spreadsheetId;
            await sheets.spreadsheets.values.update({
                spreadsheetId: ssId, range: 'Sheet1!A1', valueInputOption: 'RAW',
                resource: { values: [["Дата", "Монтажник", "Город", "Адрес", "Заказчик", "Вид работы", "Сумма", "Координаты"]] }
            });
        }
        
        const row = [
            new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }), 
            data.worker, data.city, data.address, data.client, data.workType, data.price, data.coords || "Нет GPS"
        ];
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: ssId, range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED',
            resource: { values: [row] }
        });
    } catch (err) { console.error("Ошибка записи в таблицу:", err); }
}

// --- API ЭНДПОИНТЫ ---

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, client, image, fileName, licenseKey } = req.body;
        const dateStr = new Date().toLocaleDateString('ru-RU');
        
        // Находим владельца ключа (например, "ТАНДЕР")
        const keyData = DB.keys.find(k => k.key === licenseKey);
        const ownerName = keyData ? keyData.name : "ОБЩИЙ";

        // Создаем иерархию папок по твоему запросу:
        // 1. Владелец из пульта
        const f1 = await getOrCreateFolder(ownerName); 
        // 2. Кто делает (Монтажник)
        const f2 = await getOrCreateFolder(worker || "Без_имени", f1);
        // 3. Объект/Заказчик (например, Магнит)
        const f3 = await getOrCreateFolder(client || "Объект", f2);
        // 4. Город
        const f4 = await getOrCreateFolder(city || "Город", f3);
        // 5. Дата
        const f5 = await getOrCreateFolder(dateStr, f4);

        const buffer = Buffer.from(image, 'base64');
        await drive.files.create({
            resource: { name: `${fileName}.jpg`, parents: [f5] },
            media: { mimeType: 'image/jpeg', body: require('stream').Readable.from(buffer) }
        });

        await logToSheet(req.body);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/check-license', (req, res) => {
    const { licenseKey, workerName } = req.body;
    const keyData = DB.keys.find(k => k.key === licenseKey);
    if (!keyData) return res.json({ status: "error", message: "Ключ не найден" });
    if (new Date(keyData.expiry) < new Date()) return res.json({ status: "error", message: "Срок истек" });
    if (!keyData.workers.includes(workerName)) {
        if (keyData.workers.length >= keyData.limit) return res.json({ status: "error", message: "Лимит воркеров исчерпан" });
        keyData.workers.push(workerName);
        saveDB();
    }
    res.json({ status: "active", expiry: new Date(keyData.expiry).getTime() });
});

app.get('/api/list_keys', (req, res) => res.json({ keys: DB.keys }));

app.post('/api/add_key', async (req, res) => {
    try {
        const { name, days, limit } = req.body;
        await getOrCreateFolder(name); // Сразу создаем корневую папку владельца

        const key = { 
            key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(), 
            name, 
            expiry: new Date(Date.now() + days * 86400000).toISOString(), 
            limit: parseInt(limit), 
            workers: [] 
        };
        DB.keys.push(key); 
        saveDB(); 
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/update_key', (req, res) => {
    const { key, addDays, addLimit } = req.body;
    const keyData = DB.keys.find(k => k.key === key);
    if (keyData) {
        let currentExpiry = new Date(keyData.expiry);
        if (currentExpiry < new Date()) currentExpiry = new Date();
        currentExpiry.setDate(currentExpiry.getDate() + parseInt(addDays || 0));
        keyData.expiry = currentExpiry.toISOString();
        keyData.limit += parseInt(addLimit || 0);
        saveDB();
        res.json({ success: true });
    } else { res.status(404).json({ success: false }); }
});

app.post('/api/delete_key', (req, res) => {
    DB.keys = DB.keys.filter(k => k.key !== req.body.key); saveDB(); res.json({ success: true });
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LOGIST_X MASTER SERVER RUNNING`));
