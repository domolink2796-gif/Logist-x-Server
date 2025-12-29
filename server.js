const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- КОНФИГУРАЦИЯ ---
const MASTER_KEY = "LX-BOSS-777";
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A';

const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

let DB_SHEET_ID = null;

// --- [1] ЛОГИКА ОБЛАЧНОЙ БАЗЫ С ЛОГАМИ ---

async function getDbSheet() {
    if (DB_SHEET_ID) return DB_SHEET_ID;
    console.log(">>> [DB] Ищу таблицу DATABASE_KEYS_LOGIST_X на Диске...");
    const q = `name = 'DATABASE_KEYS_LOGIST_X' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const res = await drive.files.list({ q });
    
    if (res.data.files.length > 0) {
        DB_SHEET_ID = res.data.files[0].id;
        console.log(">>> [DB] База найдена! ID:", DB_SHEET_ID);
    } else {
        console.log(">>> [DB] База не найдена. Создаю новую...");
        const ss = await sheets.spreadsheets.create({
            resource: { properties: { title: 'DATABASE_KEYS_LOGIST_X' } }
        });
        DB_SHEET_ID = ss.data.spreadsheetId;
        await sheets.spreadsheets.values.update({
            spreadsheetId: DB_SHEET_ID, range: 'Sheet1!A1', valueInputOption: 'RAW',
            resource: { values: [["KEY", "NAME", "EXPIRY", "LIMIT", "WORKERS"]] }
        });
        console.log(">>> [DB] Новая база создана успешно.");
    }
    return DB_SHEET_ID;
}

async function loadKeys() {
    console.log(">>> [DB] Читаю ключи из Облака...");
    const id = await getDbSheet();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: 'Sheet1!A2:E100' });
    const rows = res.data.values || [];
    console.log(`>>> [DB] Загружено ключей: ${rows.length}`);
    return rows.map(r => ({
        key: r[0], name: r[1], expiry: r[2], limit: parseInt(r[3]) || 1, 
        workers: r[4] ? r[4].split(',') : []
    }));
}

// --- [2] ЛОГИКА ПАПОК С ЛОГАМИ ---

async function getOrCreateFolder(name, parentId) {
    console.log(`>>> [DRIVE] Проверка папки: "${name}"`);
    let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;
    const res = await drive.files.list({ q });
    if (res.data.files.length > 0) {
        return res.data.files[0].id;
    }
    console.log(`>>> [DRIVE] Создаю папку: "${name}"`);
    const folder = await drive.files.create({
        resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
        fields: 'id'
    });
    return folder.data.id;
}

// --- [3] МАРШРУТЫ С ПОЛНЫМ ЛОГИРОВАНИЕМ ---

app.post('/check-license', async (req, res) => {
    const { licenseKey, workerName } = req.body;
    const cleanKey = licenseKey ? licenseKey.trim() : "";
    console.log(`\n--- [ВХОД] Запрос от: ${workerName || 'Неизвестный'}, Ключ: "${cleanKey}" ---`);

    if (cleanKey === MASTER_KEY) {
        console.log(">>> [РЕЗУЛЬТАТ] МАСТЕР-КЛЮЧ ПОДТВЕРЖДЕН");
        return res.json({ status: "active", expiry: Date.now() + 315360000000 });
    }

    const keys = await loadKeys();
    const k = keys.find(x => x.key === cleanKey);
    
    if (k && new Date(k.expiry) > new Date()) {
        console.log(`>>> [РЕЗУЛЬТАТ] Ключ компании "${k.name}" принят.`);
        return res.json({ status: "active", expiry: new Date(k.expiry).getTime() });
    }

    console.log(">>> [РЕЗУЛЬТАТ] ОТКАЗ: Ключ не найден или просрочен.");
    res.json({ status: "error" });
});

app.post('/upload', async (req, res) => {
    console.log(`\n--- [UPLOAD] Начинаю загрузку данных ---`);
    try {
        const { worker, city, address, client, image, licenseKey } = req.body;
        
        const keys = await loadKeys();
        const kData = keys.find(k => k.key === (licenseKey ? licenseKey.trim() : ""));
        const compName = kData ? kData.name : (licenseKey === MASTER_KEY ? "Евгений_БОСС" : "ОБЩИЕ");
        
        console.log(`>>> [UPLOAD] Компания: ${compName}, Монтажник: ${worker}`);

        // СТРОИМ ПУТЬ
        const fComp = await getOrCreateFolder(compName, MY_ROOT_ID);
        const fWork = await getOrCreateFolder(worker || "Воркер", fComp);
        const fCity = await getOrCreateFolder(city || "Город", fWork);
        const fObj = await getOrCreateFolder(client || "Объект", fCity);
        const fDate = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), fObj);

        if (image) {
            console.log(`>>> [UPLOAD] Сохраняю фото для адреса: ${address}`);
            const buffer = Buffer.from(image, 'base64');
            await drive.files.create({
                resource: { name: `${address || 'отчет'}.jpg`, parents: [fDate] },
                media: { mimeType: 'image/jpeg', body: Readable.from(buffer) }
            });
            console.log(">>> [UPLOAD] Фото успешно загружено на Диск.");
        }
        
        console.log("--- [UPLOAD] Успешно завершено ---\n");
        res.json({ success: true });
    } catch (e) {
        console.error("!!! [ОШИБКА UPLOAD]", e.message);
        res.status(500).json({ success: false });
    }
});

// Админка
app.post('/api/add_key', async (req, res) => {
    const { name, days, limit } = req.body;
    console.log(`\n--- [АДМИН] Создаю ключ для: ${name} ---`);
    const k = { 
        key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(), 
        name, 
        expiry: new Date(Date.now() + (parseInt(days) || 30) * 86400000).toISOString(), 
        limit: parseInt(limit) || 1 
    };
    
    const id = await getDbSheet();
    await sheets.spreadsheets.values.append({
        spreadsheetId: id, range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED',
        resource: { values: [[k.key, k.name, k.expiry, k.limit, '']] }
    });
    console.log(`>>> [АДМИН] Ключ ${k.key} успешно сохранен в Облако.`);
    res.json({ success: true, key: k });
});

app.get('/api/list_keys', async (req, res) => {
    res.json({ keys: await loadKeys() });
});

app.get('/admin-panel', (req, res) => res.sendFile(require('path').join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("ELITE CLOUD HQ LIVE"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n[СИСТЕМА] БОСС, СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`));
