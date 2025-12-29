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

// --- [1] ПОЛНАЯ КОНФИГУРАЦИЯ ---
const TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJv (ваш токен)'; // Я сократил для текста, оставь свой полный!
const MY_ID = '6846149935';
const APP_URL = 'https://logist-x-server.onrender.com';
const MASTER_KEY = "LX-BOSS-777";

// ТВОЙ КОРЕНЬ
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A';

const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

// Работа с базой данных (keys.json)
const DB_FILE = path.join(__dirname, 'keys.json');
let DB = { keys: [] };

const loadDB = () => {
    if (fs.existsSync(DB_FILE)) {
        try {
            DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            console.log(`[DB] База загружена. Ключей: ${DB.keys.length}`);
        } catch (e) { 
            console.error("[DB] Ошибка чтения:", e);
            DB = { keys: [] }; 
        }
    }
};
loadDB();

const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
    } catch (e) {
        console.error("[DB] Ошибка записи:", e);
    }
};

// Инициализация Google API
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// Инициализация Бота с защитой от конфликта 409
const bot = new TelegramBot('8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg', { polling: true });

bot.on('polling_error', (err) => {
    if (err.message.includes('409')) {
        console.log(">>> [BOT] Конфликт 409. Ожидаю завершения старого процесса...");
    } else {
        console.log(">>> [BOT] Ошибка:", err.message);
    }
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- [2] ГЛУБОКАЯ ЛОГИКА GOOGLE (ТВОИ ФУНКЦИИ + МОИ ПРАВКИ) ---

async function getOrCreateFolder(folderName, parentId) {
    try {
        let q = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        
        const folder = await drive.files.create({
            resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
            fields: 'id'
        });
        return folder.data.id;
    } catch (err) {
        console.error("[DRIVE] Ошибка папки:", err.message);
        return null;
    }
}

// Создание личной таблицы монтажника внутри его папки
async function getOrCreateWorkerSheet(workerFolderId, workerName) {
    try {
        const fileName = `ОТЧЕТЫ_${workerName}`;
        const q = `name = '${fileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and '${workerFolderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        
        if (res.data.files.length > 0) return res.data.files[0].id;

        // Если таблицы нет, создаем новую
        const ss = await sheets.spreadsheets.create({
            resource: { properties: { title: fileName } }
        });
        const sheetId = ss.data.spreadsheetId;
        
        // Переносим её из корня бота в папку монтажника
        const file = await drive.files.get({ fileId: sheetId, fields: 'parents' });
        await drive.files.update({
            fileId: sheetId,
            addParents: workerFolderId,
            removeParents: file.data.parents.join(',')
        });

        // Пишем шапку
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: 'Sheet1!A1',
            valueInputOption: 'RAW',
            resource: { values: [["Дата", "Город", "Адрес", "Конечный_Объект", "Тип_Работы", "Цена", "GPS"]] }
        });
        
        return sheetId;
    } catch (err) {
        console.error("[SHEETS] Ошибка создания таблицы:", err.message);
        return null;
    }
}

// --- [3] API МАРШРУТЫ (ПОД ПРИЛОЖЕНИЕ И АДМИНКУ) ---

app.post('/check-license', (req, res) => {
    const { licenseKey, workerName } = req.body;
    console.log(`[AUTH] Запрос: ${workerName}, Ключ: ${licenseKey}`);
    
    if (licenseKey === MASTER_KEY || licenseKey === "DEV-MASTER-999") {
        return res.json({ status: "active", expiry: Date.now() + 315360000000 });
    }

    const k = DB.keys.find(x => x.key === licenseKey);
    if (!k) return res.json({ status: "error", message: "Ключ не найден" });
    if (new Date(k.expiry) < new Date()) return res.json({ status: "error", message: "Срок истек" });
    
    if (workerName && !k.workers.includes(workerName)) {
        if (k.workers.length >= k.limit) return res.json({ status: "error", message: "Лимит воркеров превышен" });
        k.workers.push(workerName);
        saveDB();
    }
    res.json({ status: "active", expiry: new Date(k.expiry).getTime() });
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, house, entrance, client, image, workType, price, licenseKey, latitude, longitude } = req.body;
        
        let k = DB.keys.find(x => x.key === licenseKey);
        let companyName = k ? k.name : "Евгений_БОСС_МАСТЕР";

        // ПОЛНАЯ ИЕРАРХИЯ В ТВОЕЙ ПАПКЕ
        const fCompany = await getOrCreateFolder(companyName, MY_ROOT_ID);
        const fWorker = await getOrCreateFolder(worker || "Монтажник", fCompany);
        
        // Личная таблица монтажника
        const sheetId = await getOrCreateWorkerSheet(fWorker, worker);
        if (sheetId) {
            const gps = latitude ? `${latitude}, ${longitude}` : "Нет GPS";
            const row = [new Date().toLocaleString('ru-RU'), city, `${address} ${house||''}`, client, workType, price, gps];
            await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId, range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED', resource: { values: [row] }
            });
        }

        // Дальше папки: Город -> Конечный Клиент -> Дата
        const fCity = await getOrCreateFolder(city || "Город", fWorker);
        const fEndClient = await getOrCreateFolder(client || "Конечный_Объект", fCity);
        const fDate = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), fEndClient);

        if (image) {
            const buffer = Buffer.from(image, 'base64');
            await drive.files.create({
                resource: { name: `п.${entrance}_${address || 'фото'}.jpg`, parents: [fDate] },
                media: { mimeType: 'image/jpeg', body: Readable.from(buffer) }
            });
        }

        bot.sendMessage(MY_ID, `✅ **${companyName}**\n👷: ${worker}\n📍: ${city}, ${address}\n💰: ${price}₽`);
        res.json({ success: true });
    } catch (e) {
        console.error("[UPLOAD] Ошибка:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// АДМИНКА
app.post('/api/add_key', async (req, res) => {
    try {
        const { name, days, limit } = req.body;
        const key = { 
            key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(), 
            name, 
            expiry: new Date(Date.now() + (parseInt(days) || 30) * 86400000).toISOString(), 
            limit: parseInt(limit) || 1, 
            workers: [] 
        };
        DB.keys.push(key);
        saveDB();
        res.json({ success: true, key });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/list_keys', (req, res) => res.json({ keys: DB.keys }));

app.post('/api/update_key', (req, res) => {
    const { key, addDays, addLimit } = req.body;
    const k = DB.keys.find(x => x.key === key);
    if (k) {
        let exp = new Date(k.expiry);
        if (exp < new Date()) exp = new Date();
        exp.setDate(exp.getDate() + parseInt(addDays || 0));
        k.expiry = exp.toISOString();
        k.limit += parseInt(addLimit || 0);
        saveDB(); res.json({ success: true });
    } else res.status(404).json({ success: false });
});

app.post('/api/delete_key', (req, res) => {
    DB.keys = DB.keys.filter(k => k.key !== req.body.key);
    saveDB(); res.json({ success: true });
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("LOGIST_X ELITE HQ ONLINE"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[HQ] СИСТЕМА ОНЛАЙН. ПОРТ: ${PORT}`));
