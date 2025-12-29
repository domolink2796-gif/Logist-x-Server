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

// --- [1] УМНАЯ ЛОГИКА ОПРЕДЕЛЕНИЯ ИМЕНИ ЛИСТА ---

async function getFirstSheetName(spreadsheetId) {
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    return res.data.sheets[0].properties.title; // Вернет "Лист1" или "Sheet1" сам
}

async function getDbSheet() {
    if (DB_SHEET_ID) return DB_SHEET_ID;
    console.log(">>> [DB] Поиск таблицы DATABASE_KEYS_LOGIST_X...");
    const q = `name = 'DATABASE_KEYS_LOGIST_X' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const res = await drive.files.list({ q });
    
    if (res.data.files.length > 0) {
        DB_SHEET_ID = res.data.files[0].id;
        console.log(">>> [DB] База найдена. ID:", DB_SHEET_ID);
    } else {
        console.log(">>> [DB] База не найдена. Создаю новую...");
        const ss = await sheets.spreadsheets.create({ resource: { properties: { title: 'DATABASE_KEYS_LOGIST_X' } } });
        DB_SHEET_ID = ss.data.spreadsheetId;
        const sName = await getFirstSheetName(DB_SHEET_ID);
        await sheets.spreadsheets.values.update({
            spreadsheetId: DB_SHEET_ID, range: `${sName}!A1`, valueInputOption: 'RAW',
            resource: { values: [["KEY", "NAME", "EXPIRY", "LIMIT", "WORKERS"]] }
        });
        console.log(`>>> [DB] База создана. Лист: ${sName}`);
    }
    return DB_SHEET_ID;
}

async function loadKeys() {
    console.log(">>> [DB] Загрузка ключей...");
    const id = await getDbSheet();
    const sName = await getFirstSheetName(id);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${sName}!A2:E100` });
    const rows = res.data.values || [];
    console.log(`>>> [DB] Загружено ключей: ${rows.length}`);
    return rows.map(r => ({
        key: r[0], name: r[1], expiry: r[2], limit: parseInt(r[3]) || 1, 
        workers: r[4] ? r[4].split(',') : []
    }));
}

// --- [2] ЛОГИКА ПАПОК И ОТЧЕТОВ ---

async function getOrCreateFolder(name, parentId) {
    console.log(`>>> [DRIVE] Папка: "${name}"`);
    let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;
    const res = await drive.files.list({ q });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({
        resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
        fields: 'id'
    });
    return folder.data.id;
}

// --- [3] МАРШРУТЫ ---

app.post('/check-license', async (req, res) => {
    const { licenseKey, workerName } = req.body;
    const cleanKey = licenseKey ? licenseKey.trim() : "";
    console.log(`\n--- [ВХОД] ${workerName || 'Кто-то'}, Ключ: "${cleanKey}" ---`);

    if (cleanKey === MASTER_KEY) {
        console.log(">>> [OK] МАСТЕР-КЛЮЧ");
        return res.json({ status: "active", expiry: Date.now() + 315360000000 });
    }

    try {
        const keys = await loadKeys();
        const k = keys.find(x => x.key === cleanKey);
        if (k && new Date(k.expiry) > new Date()) {
            console.log(`>>> [OK] Компания: ${k.name}`);
            return res.json({ status: "active", expiry: new Date(k.expiry).getTime() });
        }
    } catch (e) { console.error("!!! Ошибка базы ключей:", e.message); }

    console.log(">>> [FAIL] ОТКАЗ");
    res.json({ status: "error" });
});

app.post('/upload', async (req, res) => {
    console.log(`\n--- [ОТЧЕТ] Старт загрузки ---`);
    try {
        const { worker, city, address, client, image, licenseKey } = req.body;
        const keys = await loadKeys();
        const kData = keys.find(k => k.key === (licenseKey ? licenseKey.trim() : ""));
        const compName = kData ? kData.name : (licenseKey === MASTER_KEY ? "Евгений_БОСС" : "ОБЩИЕ");

        // Иерархия: Компания -> Монтажник -> Город -> Клиент -> Дата
        const fComp = await getOrCreateFolder(compName, MY_ROOT_ID);
        const fWork = await getOrCreateFolder(worker || "Воркер", fComp);
        const fCity = await getOrCreateFolder(city || "Город", fWork);
        const fObj = await getOrCreateFolder(client || "Объект", fCity);
        const fDate = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), fObj);

        if (image) {
            console.log(`>>> [PHOTO] Сохраняю адрес: ${address}`);
            const buffer = Buffer.from(image, 'base64');
            await drive.files.create({
                resource: { name: `${address || 'фото'}.jpg`, parents: [fDate] },
                media: { mimeType: 'image/jpeg', body: Readable.from(buffer) }
            });
        }
        console.log("--- [ОТЧЕТ] Все файлы на месте ---\n");
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/add_key', async (req, res) => {
    const { name, days, limit } = req.body;
    const k = { 
        key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(), 
        name, 
        expiry: new Date(Date.now() + (parseInt(days) || 30) * 86400000).toISOString(), 
        limit: parseInt(limit) || 1 
    };
    const id = await getDbSheet();
    const sName = await getFirstSheetName(id);
    await sheets.spreadsheets.values.append({
        spreadsheetId: id, range: `${sName}!A1`, valueInputOption: 'USER_ENTERED',
        resource: { values: [[k.key, k.name, k.expiry, k.limit, '']] }
    });
    console.log(`>>> [ADMIN] Создан ключ: ${k.key}`);
    res.json({ success: true, key: k });
});

app.get('/api/list_keys', async (req, res) => { res.json({ keys: await loadKeys() }); });
app.get('/admin-panel', (req, res) => res.sendFile(require('path').join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("ELITE HQ LIVE"));

app.listen(process.env.PORT || 3000, () => console.log(">>> [СИСТЕМА] БОСС, СЕРВЕР В СТРОЮ!"));
