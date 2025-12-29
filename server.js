const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- [1] КОНФИГУРАЦИЯ ---
const MASTER_KEY = "LX-BOSS-777";
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; // Твоя папка

const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

// Настройка Google
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// Глобальный ID таблицы с ключами (чтобы не сбрасывались)
let DB_SHEET_ID = '';

// --- [2] ЛОГИКА ОБЛАЧНОГО ХРАНЕНИЯ КЛЮЧЕЙ (Вместо db.json) ---

async function initDbSheet() {
    if (DB_SHEET_ID) return DB_SHEET_ID;
    const q = `name = 'ELITE_DATABASE_KEYS' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const res = await drive.files.list({ q });
    if (res.data.files.length > 0) {
        DB_SHEET_ID = res.data.files[0].id;
    } else {
        const ss = await sheets.spreadsheets.create({ resource: { properties: { title: 'ELITE_DATABASE_KEYS' } } });
        DB_SHEET_ID = ss.data.spreadsheetId;
        await sheets.spreadsheets.values.update({
            spreadsheetId: DB_SHEET_ID, range: 'Sheet1!A1', valueInputOption: 'RAW',
            resource: { values: [["KEY", "NAME", "EXPIRY", "LIMIT", "WORKERS"]] }
        });
    }
    return DB_SHEET_ID;
}

async function loadKeys() {
    const id = await initDbSheet();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: 'Sheet1!A2:E100' });
    return (res.data.values || []).map(r => ({
        key: r[0], name: r[1], expiry: r[2], limit: parseInt(r[3]), workers: r[4] ? r[4].split(',') : []
    }));
}

async function saveNewKey(k) {
    const id = await initDbSheet();
    await sheets.spreadsheets.values.append({
        spreadsheetId: id, range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED',
        resource: { values: [[k.key, k.name, k.expiry, k.limit, '']] }
    });
}

// --- [3] ЛОГИКА ГУГЛ ДИСКА (Иерархия БОССА) ---

async function getOrCreateFolder(name, parentId) {
    try {
        let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const folder = await drive.files.create({
            resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id'
        });
        return folder.data.id;
    } catch (e) { return null; }
}

async function logToSheet(folderId, workerName, data) {
    const fileName = `ОТЧЕТЫ_${workerName}`;
    const q = `name = '${fileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and '${folderId}' in parents`;
    let res = await drive.files.list({ q });
    let sheetId = res.data.files.length > 0 ? res.data.files[0].id : null;

    if (!sheetId) {
        const ss = await sheets.spreadsheets.create({ resource: { properties: { title: fileName } } });
        sheetId = ss.data.spreadsheetId;
        await drive.files.update({ fileId: sheetId, addParents: folderId, removeParents: (await drive.files.get({fileId: sheetId, fields: 'parents'})).data.parents.join(',') });
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId, range: 'Sheet1!A1', valueInputOption: 'RAW',
            resource: { values: [["Дата", "Город", "Адрес", "Объект", "Работа", "Цена", "GPS"]] }
        });
    }
    const row = [new Date().toLocaleString('ru-RU'), data.city, data.address, data.client, data.workType, data.price, data.coords || "Нет"];
    await sheets.spreadsheets.values.append({ spreadsheetId: sheetId, range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED', resource: { values: [row] } });
}

// --- [4] МАРШРУТЫ (ТОЛЬКО РАБОТА) ---

app.post('/check-license', async (req, res) => {
    const { licenseKey, workerName } = req.body;
    
    // МАСТЕР-ВХОД
    if (licenseKey === MASTER_KEY) {
        return res.json({ status: "active", expiry: Date.now() + 315360000000 });
    }

    const keys = await loadKeys();
    const k = keys.find(x => x.key === licenseKey);

    if (!k) return res.json({ status: "error", message: "Ключ не найден" });
    if (new Date(k.expiry) < new Date()) return res.json({ status: "error", message: "Срок истек" });
    
    // Логика добавления воркера (упрощена для стабильности)
    res.json({ status: "active", expiry: new Date(k.expiry).getTime() });
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, client, image, licenseKey } = req.body;
        const keys = await loadKeys();
        let kData = keys.find(k => k.key === licenseKey);
        let compName = kData ? kData.name : (licenseKey === MASTER_KEY ? "Евгений_БОСС" : "ОБЩИЕ");

        // ПОЛНАЯ ИЕРАРХИЯ
        const fComp = await getOrCreateFolder(compName, MY_ROOT_ID);
        const fWork = await getOrCreateFolder(worker || "Воркер", fComp);
        
        await logToSheet(fWork, worker, req.body);

        const fCity = await getOrCreateFolder(city || "Город", fWork);
        const fObj = await getOrCreateFolder(client || "Объект", fCity);
        const fDate = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), fObj);

        if (image) {
            const buffer = Buffer.from(image, 'base64');
            await drive.files.create({
                resource: { name: `${address || 'отчет'}.jpg`, parents: [fDate] },
                media: { mimeType: 'image/jpeg', body: Readable.from(buffer) }
            });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/add_key', async (req, res) => {
    const { name, days, limit } = req.body;
    const k = { key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(), name, expiry: new Date(Date.now() + (parseInt(days) || 30) * 86400000).toISOString(), limit: parseInt(limit) || 1, workers: [] };
    await saveNewKey(k);
    res.json({ success: true, key: k });
});

app.get('/api/list_keys', async (req, res) => { res.json({ keys: await loadKeys() }); });
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("HQ API LIVE - NO BOT"));

app.listen(process.env.PORT || 3000);
