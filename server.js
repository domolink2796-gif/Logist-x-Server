const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');
const crypto = require('crypto');

// Подключаем fetch для работы с картами (Geocoding)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

// --- НАСТРОЙКИ (SERVER GS) ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const PLANOGRAM_DB_NAME = 'planograms_db.json'; 
const BARCODE_DB_NAME = 'barcodes_db.json'; 
const SHOP_ITEMS_DB = 'shop_items_db.json'; // База товаров в магазинах
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';
const MAX_DISTANCE_METERS = 600; 

// --- НАСТРОЙКИ РОБОКАССЫ ---
const ROBO_LOGIN = 'Logist_X'; 
const ROBO_PASS1 = 'uWvrnYz8roL3a6RN1Ua3'; 
const ROBO_PASS2 ='cke71a0ABJG3PpnCzuM7'; 
const IS_TEST = 1; 

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

const userSteps = {};

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const f1 = lat1 * Math.PI/180; const f2 = lat2 * Math.PI/180;
    const df = (lat2-lat1) * Math.PI/180; const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(df/2) * Math.sin(df/2) + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dl/2) * Math.sin(dl/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

app.get('/get-coords', async (req, res) => {
    try {
        const { addr } = req.query;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`;
        const response = await fetch(url, { headers: { 'User-Agent': 'LogistX_App_Server' } });
        const data = await response.json();
        if (data && data.length > 0) {
            res.json({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
        } else {
            res.status(404).json({ error: "Адрес не найден" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

async function getOrCreateFolder(rawName, parentId) {
    try {
        const name = String(rawName).trim(); 
        const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const file = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
        await drive.permissions.create({ fileId: file.data.id, resource: { role: 'writer', type: 'anyone' } });
        return file.data.id;
    } catch (e) { return parentId; }
}

async function getOrCreatePlanogramFolder(parentId) {
    return await getOrCreateFolder("PLANOGRAMS", parentId);
}

async function readDatabase() {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return [];
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        let data = content.data;
        let keys = Array.isArray(data) ? data : (data.keys || []);
        if (!keys.find(k => k.key === 'DEV-MASTER-999')) {
            keys.push({ key: 'DEV-MASTER-999', name: 'SYSTEM_ADMIN', limit: 999, expiry: '2099-12-31T23:59:59.000Z', workers: [] });
            await saveDatabase(keys);
        }
        return keys;
    } catch (e) { return []; }
}

async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const media = { mimeType: 'application/json', body: JSON.stringify({ keys }, null, 2) };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); } 
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media }); }
    } catch (e) { console.error("DB Error:", e); }
}

async function readJsonFromDrive(folderId, fileName) {
    try {
        const q = `name = '${fileName}' and '${folderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return {};
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        return typeof content.data === 'string' ? JSON.parse(content.data) : content.data;
    } catch (e) { return {}; }
}

async function saveJsonToDrive(folderId, fileName, data) {
    try {
        const q = `name = '${fileName}' and '${folderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const media = { mimeType: 'application/json', body: JSON.stringify(data, null, 2) };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); } 
        else { await drive.files.create({ resource: { name: fileName, parents: [folderId] }, media }); }
    } catch (e) { console.error("Save JSON Error:", e); }
}

async function readBarcodeDb(clientFolderId) { return await readJsonFromDrive(clientFolderId, BARCODE_DB_NAME); }
async function saveBarcodeDb(clientFolderId, data) { return await saveJsonToDrive(clientFolderId, BARCODE_DB_NAME, data); }
async function readPlanogramDb(clientFolderId) { return await readJsonFromDrive(clientFolderId, PLANOGRAM_DB_NAME); }
async function savePlanogramDb(clientFolderId, data) { return await saveJsonToDrive(clientFolderId, PLANOGRAM_DB_NAME, data); }
async function readShopItemsDb(clientFolderId) { return await readJsonFromDrive(clientFolderId, SHOP_ITEMS_DB); }
async function saveShopItemsDb(clientFolderId, data) { return await saveJsonToDrive(clientFolderId, SHOP_ITEMS_DB, data); }

async function appendToReport(workerId, workerName, city, dateStr, address, entrance, client, workType, price, lat, lon) {
    try {
        const reportName = `Отчет ${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId = res.data.files.length > 0 ? res.data.files[0].id : null;
        if (!spreadsheetId) {
            const createRes = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } } });
            spreadsheetId = createRes.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        }
        const sheetTitle = `${city}_${dateStr}`;
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GPS', 'ФОТО']] } });
        }
        const gpsLink = (lat && lon) ? `=HYPERLINK("http://googleusercontent.com/maps.google.com/search?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleTimeString("ru-RU"), address, entrance, client, workType, price, gpsLink, "ЗАГРУЖЕНО"]] } });
    } catch (e) { console.error("Logist Error:", e); }
}

async function appendMerchToReport(workerId, workerName, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdfUrl, startTime, endTime, duration, lat, lon) {
    try {
        const reportName = `Мерч_Аналитика_${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId = res.data.files.length > 0 ? res.data.files[0].id : null;
        if (!spreadsheetId) {
            const cr = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } } });
            spreadsheetId = cr.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        }
        const sheetTitle = "ОТЧЕТЫ_МЕРЧ";
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ДАТА', 'НАЧАЛО', 'КОНЕЦ', 'МИНУТ', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ДОЛЯ %', 'ЦЕНА МЫ', 'ЦЕНА КОНК', 'СРОК', 'PDF ОТЧЕТ', 'GPS']] } });
        }
        const gps = (lat && lon) ? `=HYPERLINK("http://googleusercontent.com/maps.google.com/search?q=${lat},${lon}"; "ПОСМОТРЕТЬ")` : "Нет";
        const pdfLink = `=HYPERLINK("${pdfUrl}"; "ОТЧЕТ ФОТО")`;
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleDateString("ru-RU"), startTime, endTime, duration, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdfLink, gps]] } });
    } catch (e) { console.error("Merch Error:", e); }
}

app.get('/get-planogram', async (req, res) => {
    try {
        const { addr, key } = req.query;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId || kData.type !== 'merch') return res.json({ exists: false });
        const planFolderId = await getOrCreatePlanogramFolder(kData.folderId);
        const fileName = `${addr.replace(/[^а-яёa-z0-9]/gi, '_')}.jpg`;
        const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
        const search = await drive.files.list({ q, fields: 'files(id, webViewLink, webContentLink)' });
        if (search.data.files.length > 0) {
            res.json({ exists: true, url: search.data.files[0].webContentLink || search.data.files[0].webViewLink });
        } else {
            res.json({ exists: false });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/upload-planogram', async (req, res) => {
    try {
        const { addr, image, key } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId || kData.type !== 'merch') return res.status(403).json({ error: "Доступ запрещен" });
        const planFolderId = await getOrCreatePlanogramFolder(kData.folderId);
        const fileName = `${addr.replace(/[^а-яёa-z0-9]/gi, '_')}.jpg`;
        const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
        const existing = await drive.files.list({ q });
        let fileId;
        if (existing.data.files.length > 0) {
            fileId = existing.data.files[0].id;
            await drive.files.update({ fileId, media: { mimeType: 'image/jpeg', body: Readable.from(buf) } });
        } else {
            const f = await drive.files.create({ resource: { name: fileName, parents: [planFolderId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) }, fields: 'id' });
            fileId = f.data.id;
            await drive.permissions.create({ fileId: fileId, resource: { role: 'reader', type: 'anyone' } });
        }
        const planDb = await readPlanogramDb(kData.folderId);
        planDb[addr] = true;
        await savePlanogramDb(kData.folderId, planDb);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/get-catalog', async (req, res) => {
    try {
        const { key } = req.query;
        let keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId) return res.json({});
        const catalog = await readBarcodeDb(kData.folderId);
        res.json(catalog);
    } catch (e) { res.json({}); }
});

app.get('/get-shop-stock', async (req, res) => {
    try {
        const { key, addr } = req.query;
        let keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId) return res.json([]);
        const shopDb = await readShopItemsDb(kData.folderId);
        res.json(shopDb[addr] || []);
    } catch (e) { res.json([]); }
});

app.get('/check-barcode', async (req, res) => {
    try {
        const { code, licenseKey } = req.query;
        let keys = await readDatabase();
        const kIdx = keys.findIndex(k => k.key === licenseKey);
        if (kIdx === -1) return res.json({ exists: false });
        if (!keys[kIdx].folderId) {
            const projectRoot = (keys[kIdx].type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
            keys[kIdx].folderId = await getOrCreateFolder(keys[kIdx].name, projectRoot);
            await saveDatabase(keys);
        }
        const barcodeDb = await readBarcodeDb(keys[kIdx].folderId);
        if (barcodeDb[code]) {
            res.json({ exists: true, name: barcodeDb[code].name || barcodeDb[code] });
        } else {
            res.json({ exists: false });
        }
    } catch (e) { res.json({ exists: false }); }
});

app.post('/save-product', async (req, res) => {
    try {
        const { barcode, name, key } = req.body;
        let keys = await readDatabase();
        const kIdx = keys.findIndex(k => k.key === key);
        if (kIdx === -1) return res.status(403).send("Forbidden");
        if (!keys[kIdx].folderId) {
            const projectRoot = (keys[kIdx].type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
            keys[kIdx].folderId = await getOrCreateFolder(keys[kIdx].name, projectRoot);
            await saveDatabase(keys);
        }
        const barcodeDb = await readBarcodeDb(keys[kIdx].folderId);
        barcodeDb[barcode] = { name: name, date: new Date().toISOString() };
        await saveBarcodeDb(keys[kIdx].folderId, barcodeDb);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/save-barcode', async (req, res) => {
    try {
        const { code, name, licenseKey } = req.body;
        let keys = await readDatabase();
        const kIdx = keys.findIndex(k => k.key === licenseKey);
        if (kIdx === -1) return res.status(403).send("Forbidden");
        if (!keys[kIdx].folderId) {
            const projectRoot = (keys[kIdx].type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
            keys[kIdx].folderId = await getOrCreateFolder(keys[kIdx].name, projectRoot);
            await saveDatabase(keys);
        }
        const barcodeDb = await readBarcodeDb(keys[kIdx].folderId);
        barcodeDb[code] = { name: name, date: new Date().toISOString() };
        await saveBarcodeDb(keys[kIdx].folderId, barcodeDb);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/open-folder', async (req, res) => {
    try {
        const { workerName } = req.query;
        const qWorker = `name = '${workerName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const resWorker = await drive.files.list({ q: qWorker, fields: 'files(id, webViewLink)', orderBy: 'createdTime desc' });
        if (resWorker.data.files.length > 0) {
            res.setHeader('Content-Type', 'text/html');
            res.send(`<html><script>window.location.href="${resWorker.data.files[0].webViewLink}";</script></html>`);
        } else {
            res.send(`Папка сотрудника ${workerName} еще не создана. Отправьте первый отчет.`);
        }
    } catch (e) { res.send("Ошибка поиска: " + e.message); }
});

app.post('/check-license', async (req, res) => {
    const { licenseKey, workerName } = req.body;
    const keys = await readDatabase();
    const kData = keys.find(k => k.key === licenseKey);
    if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
    if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
    const pType = kData.type || 'logist';
    if (licenseKey === 'DEV-MASTER-999') return res.json({ status: 'active', expiry: kData.expiry, type: pType });
    if (!kData.workers) kData.workers = [];
    if (!kData.workers.includes(workerName)) {
        if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест исчерпан' });
        kData.workers.push(workerName); await saveDatabase(keys);
    }
    res.json({ status: 'active', expiry: kData.expiry, type: pType });
});

app.post('/upload', async (req, res) => {
    try {
        const { action, licenseKey, workerName, worker, city, address, entrance, client, image, lat, lon, workType, price } = req.body;
        const keys = await readDatabase();
        if (action === 'check_license') {
            const kData = keys.find(k => k.key === licenseKey);
            if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
            if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
            if (!kData.workers) kData.workers = [];
            if (!kData.workers.includes(workerName)) {
                if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест исчерпан' });
                kData.workers.push(workerName); await saveDatabase(keys);
            }
            return res.json({ status: 'active', expiry: kData.expiry, type: kData.type || 'logist' });
        }
        const curW = worker || workerName;
        const kData = keys.find(k => k.workers && k.workers.includes(curW)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const projR = (kData && kData.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
        const oId = kData.folderId || await getOrCreateFolder(kData ? kData.name : "Logist_Users", projR);
        const wId = await getOrCreateFolder(curW, oId);
        const folderName = (client && client.trim() !== "") ? client.trim() : "Общее";
        const finalId = await getOrCreateFolder(folderName, wId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], finalId);
        if (image) {
            const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            const fileName = `${address}_п${entrance}.jpg`;
            await drive.files.create({ resource: { name: fileName, parents: [dId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) } });
        }
        await appendToReport(wId, curW, city, new Date().toISOString().split('T')[0], address, entrance, client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdf, startTime, endTime, duration, lat, lon, city, items, key, entrance } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key) || keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        if (kData && kData.folderId && items) {
            const shopDb = await readShopItemsDb(kData.folderId);
            shopDb[address] = items.map(i => ({ bc: i.bc, name: i.name, shelf: i.shelf || 0, stock: i.stock || 0 }));
            await saveShopItemsDb(kData.folderId, shopDb);
        }
        const oId = kData.folderId || await getOrCreateFolder(kData ? kData.name : "Merch_Users", MERCH_ROOT_ID);
        const wId = await getOrCreateFolder(worker, oId);
        const cityId = await getOrCreateFolder(city || "Без города", wId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], cityId);
        let pUrl = "Нет файла";
        if (pdf) {
            const base64Data = pdf.includes(',') ? pdf.split(',')[1] : pdf;
            const buf = Buffer.from(base64Data, 'base64');
            const safeAddr = (address || "ADDRESS").replace(/[/\\?%*:|"<>]/g, '-');
            const fileName = `${safeAddr} под ${entrance || "1"}.jpg`;
            const f = await drive.files.create({ resource: { name: fileName, parents: [dId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) }, fields: 'id, webViewLink' });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'writer', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }
        await appendMerchToReport(wId, worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pUrl, startTime, endTime, duration, lat, lon);
        res.json({ success: true, url: pUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/keys', async (req, res) => { res.json(await readDatabase()); });
app.get('/api/client-keys', async (req, res) => {
    try { const keys = await readDatabase(); res.json(keys.filter(k => String(k.ownerChatId) === String(req.query.chatId))); } catch (e) { res.json([]); }
});

app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days, type } = req.body; 
    let keys = await readDatabase();
    const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const exp = new Date(); exp.setDate(exp.getDate() + parseInt(days));
    const projectRoot = (type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
    const fId = await getOrCreateFolder(name, projectRoot);
    keys.push({ key: newK, name, limit, expiry: exp.toISOString(), workers: [], ownerChatId: null, folderId: fId, type: type || 'logist' });
    await saveDatabase(keys); res.json({ success: true });
});

app.post('/api/keys/extend', async (req, res) => {
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === req.body.key);
    if (idx !== -1) { 
        let d = new Date(keys[idx].expiry); if (d < new Date()) d = new Date();
        d.setDate(d.getDate() + parseInt(req.body.days || 30)); keys[idx].expiry = d.toISOString(); 
        await saveDatabase(keys); res.json({ success: true }); 
    } else res.json({ success: false });
});

app.post('/api/keys/update', async (req, res) => {
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === req.body.key);
    if (idx !== -1) {
        if (req.body.limit) keys[idx].limit = req.body.limit;
        if (req.body.name) keys[idx].name = req.body.name;
        await saveDatabase(keys); res.json({ success: true });
    } else res.json({ success: false });
});

app.post('/api/keys/delete', async (req, res) => {
    let keys = await readDatabase(); keys = keys.filter(k => k.key !== req.body.key);
    await saveDatabase(keys); res.json({ success: true });
});

// --- ОПЛАТА С 4-МЯ ВАРИАНТАМИ СРОКОВ ---
app.post('/api/notify-admin', async (req, res) => {
    const { key, name, days, chatId, limit, type } = req.body;
    const keys = await readDatabase();
    const kData = keys.find(k => k.key === key) || { limit: limit || 1 };
    let price = kData.limit * 1500;
    if (days == 90) price = kData.limit * 4050; 
    if (days == 180) price = kData.limit * 7650; 
    if (days == 365) price = kData.limit * 15000; 
    const invId = Math.floor(Date.now() / 1000);
    const sign = crypto.createHash('md5').update(`${ROBO_LOGIN}:${price}:${invId}:${ROBO_PASS1}:Shp_chatId=${chatId}:Shp_days=${days}:Shp_key=${key}:Shp_limit=${kData.limit}:Shp_name=${name}:Shp_type=${type}`).digest('hex');
    const payUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${ROBO_LOGIN}&OutSum=${price}&InvId=${invId}&Description=${encodeURIComponent("License "+name)}&SignatureValue=${sign}&Shp_days=${days}&Shp_key=${key}&Shp_chatId=${chatId}&Shp_limit=${kData.limit}&Shp_name=${encodeURIComponent(name)}&Shp_type=${type}${IS_TEST ? '&IsTest=1' : ''}`;
    res.json({ success: true, payUrl });
});

app.post('/api/payment-result', async (req, res) => {
    const { OutSum, InvId, SignatureValue, Shp_key, Shp_days, Shp_chatId, Shp_limit, Shp_name, Shp_type } = req.body;
    const mySign = crypto.createHash('md5').update(`${OutSum}:${InvId}:${ROBO_PASS2}:Shp_chatId=${Shp_chatId}:Shp_days=${Shp_days}:Shp_key=${Shp_key}:Shp_limit=${Shp_limit}:Shp_name=${Shp_name}:Shp_type=${Shp_type}`).digest('hex');
    if (SignatureValue.toLowerCase() === mySign.toLowerCase()) {
        let keys = await readDatabase();
        let currentKey = Shp_key;
        let clientMsg = "";
        if (Shp_key === "NEW_USER") {
            currentKey = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
            const exp = new Date(); exp.setDate(exp.getDate() + parseInt(Shp_days));
            const projR = (Shp_type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
            const fId = await getOrCreateFolder(Shp_name, projR);
            keys.push({ key: currentKey, name: Shp_name, limit: parseInt(Shp_limit), expiry: exp.toISOString(), workers: [], ownerChatId: Shp_chatId, folderId: fId, type: Shp_type });
            
            // СООБЩЕНИЕ-ЧЕК ДЛЯ ТЕЛЕГРАМА
            clientMsg = `💸 **ОПЛАТА УСПЕШНА!**\n\n` +
                        `📦 Проект: **${Shp_name}**\n` +
                        `📅 Срок: **${Shp_days} дней**\n\n` +
                        `🔑 **ВАШ КЛЮЧ ДОСТУПА:**\n` +
                        `\`${currentKey}\`\n\n` +
                        `⚠️ *Нажмите на ключ выше, чтобы скопировать его. Сохраните этот ключ!*`;
        } else {
            const idx = keys.findIndex(k => k.key === Shp_key);
            if (idx !== -1) {
                let d = new Date(keys[idx].expiry); if (d < new Date()) d = new Date();
                d.setDate(d.getDate() + parseInt(Shp_days)); keys[idx].expiry = d.toISOString();
                clientMsg = `✅ **ЛИЦЕНЗИЯ ПРОДЛЕНА!**\n\nОбъект: **${Shp_name}**\nСрок: до **${new Date(keys[idx].expiry).toLocaleDateString()}**`;
            }
        }
        await saveDatabase(keys); 
        
        // Отправка в ТГ (защищенная)
        if (Shp_chatId && Shp_chatId !== 'null' && Shp_chatId !== 'undefined') {
            try { await bot.telegram.sendMessage(Shp_chatId, clientMsg, { parse_mode: 'Markdown' }); } catch(e) { console.log("Tg Client Send Err"); }
        }
        
        // Уведомление админу
        try { await bot.telegram.sendMessage(MY_TELEGRAM_ID, `💰 **ОПЛАТА!**\nОбъект: ${Shp_name}\nКлюч: ${currentKey}\nСумма: ${OutSum}₽`); } catch(e) {}
        
        return res.send(`OK${InvId}`);
    }
    res.send("error");
});

app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ADMIN | LOGIST_X</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { background-color: #010409; color: #e6edf3; font-family: 'Inter', sans-serif; margin: 0; padding: 15px; font-size: 14px; }
        .card { background: #0d1117; border: 1px solid #30363d; border-radius: 16px; padding: 20px; margin-bottom: 15px; }
        .expired { border-color: #da3633 !important; }
        .gold-text { color: #f59e0b; font-size: 16px; font-weight: 900; }
        input, select { width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 8px; border: 1px solid #30363d; background: #010409; color: #fff; box-sizing: border-box; }
        .btn { padding: 14px; border-radius: 8px; border: none; font-weight: 700; cursor: pointer; width: 100%; margin-top: 5px; }
        .btn-gold { background: #f59e0b; color: #000; }
        .btn-red { background: #da3633; color: #fff; }
        .row { display: flex; gap: 5px; }
    </style>
</head>
<body>
    <div style="margin-bottom:20px; font-weight:900; font-size: 18px;">📦 АДМИН-ПАНЕЛЬ</div>
    <div class="card">
        <b>НОВЫЙ ОБЪЕКТ</b>
        <input id="n" placeholder="Название">
        <input id="l" type="number" value="5" placeholder="Лимит">
        <select id="t"><option value="logist">Логист</option><option value="merch">Мерч</option></select>
        <button class="btn btn-gold" onclick="add()">СОЗДАТЬ</button>
    </div>
    <div id="list"></div>
    <script>
        async function load(){
            const r = await fetch('/api/keys');
            const keys = await r.json();
            document.getElementById('list').innerHTML = keys.map(k => {
                const isExp = new Date(k.expiry) < new Date();
                return \`<div class="card \${isExp ? 'expired' : ''}">
                    <div class="gold-text">\${k.key}</div>
                    <div style="margin:5px 0;">\${k.name} (\${k.type || 'logist'})</div>
                    <div style="font-size:12px; opacity:0.6">До: \${new Date(k.expiry).toLocaleDateString()} | Мест: \${k.limit}</div>
                    <div class="row" style="margin-top:10px;">
                        <button class="btn btn-gold" onclick="ext('\${k.key}', 30)">+30д</button>
                        <button class="btn btn-red" onclick="del('\${k.key}')">УДАЛИТЬ</button>
                    </div>
                </div>\`;
            }).join('');
        }
        async function add(){
            const n=document.getElementById('n').value; const l=document.getElementById('l').value; const t=document.getElementById('t').value;
            await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,limit:l,days:30,type:t})});
            load();
        }
        async function ext(key, days){
            await fetch('/api/keys/extend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key, days})});
            load();
        }
        async function del(key){
            if(confirm('Удалить?')){ await fetch('/api/keys/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})}); load(); }
        }
        load();
    </script>
</body>
</html>`);
});

app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>КАБИНЕТ | LOGIST_X</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
        body { background: #010409; color: #fff; font-family: 'Inter', sans-serif; margin: 0; padding: 20px; }
        .card { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 20px; margin-bottom: 20px; border-left: 5px solid #f59e0b; }
        .key-box { background: #000; padding: 15px; border-radius: 10px; border: 1px dashed #f59e0b; color: #f59e0b; font-weight: 800; font-size: 20px; text-align: center; margin: 15px 0; letter-spacing: 2px; }
        .btn-pay { background: #f59e0b; color: #000; padding: 12px; border-radius: 10px; display: block; text-align: center; font-weight: 800; text-decoration: none; margin-top: 10px; }
        
        /* ГИГАНТСКОЕ ОКНО С КЛЮЧОМ */
        #success-modal { 
            display: none; 
            position: fixed; top:0; left:0; width:100%; height:100%; 
            background: rgba(0,0,0,0.9); z-index: 9999; 
            justify-content: center; align-items: center; padding: 20px; box-sizing: border-box;
        }
        .modal-content { 
            background: #f59e0b; color: #000; padding: 30px; border-radius: 30px; 
            max-width: 500px; width: 100%; text-align: center; border: 5px solid #fff;
        }
    </style>
</head>
<body>
    <div id="success-modal">
        <div class="modal-content">
            <h1 style="margin:0; font-size: 40px;">💰 ОПЛАЧЕНО!</h1>
            <p style="font-size: 20px; font-weight: 800; margin: 20px 0;">ВАШ КЛЮЧ ДЛЯ ВХОДА В ПРИЛОЖЕНИЕ:</p>
            <div id="final-key" style="font-size: 45px; font-weight: 900; background: #000; color: #f59e0b; padding: 20px; border-radius: 15px; border: 3px solid #fff; word-break: break-all;"></div>
            <p style="color: #000; font-weight: 900; margin-top: 20px;">⚠️ СДЕЛАЙТЕ СКРИНШОТ ИЛИ СОХРАНИТЕ КЛЮЧ!</p>
            <button onclick="document.getElementById('success-modal').style.display='none'" style="margin-top: 20px; padding: 15px 30px; background: #000; color: #fff; border: none; border-radius: 10px; font-weight: 900; cursor: pointer;">Я СОХРАНИЛ КЛЮЧ, ЗАКРЫТЬ</button>
        </div>
    </div>

    <div style="font-weight:800; font-size:24px; margin-bottom:20px;">🏢 МОИ ОБЪЕКТЫ</div>
    <div id="root"></div>
    
    <script>
        const params = new URLSearchParams(window.location.search);
        if(window.location.href.includes('status=success') || params.get('status') === 'success') {
            const savedKey = params.get('key') || 'ОБНОВЛЕНО';
            document.getElementById('success-modal').style.display = 'flex';
            document.getElementById('final-key').innerText = savedKey;
        }

        async function load(){
            const r = await fetch('/api/client-keys?chatId=' + params.get('chatId'));
            const keys = await r.json();
            document.getElementById('root').innerHTML = keys.map(k => {
                return \`
                <div class="card">
                    <div style="font-size:18px; font-weight:800">\${k.name} [\${k.type || 'logist'}]</div>
                    <div style="opacity:0.6; font-size:12px; margin-top:5px;">Срок: до \${new Date(k.expiry).toLocaleDateString()}</div>
                    <div class="key-box">\${k.key}</div>
                    <div style="color:#ff7b72; font-size:11px; text-align:center; font-weight: 900;">⚠️ ВВОДИТЕ ЭТОТ КЛЮЧ В ПРИЛОЖЕНИИ</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px;">
                        <a href="#" class="btn-pay" onclick="req('\${k.key}','\${k.name}',30,'\${k.type}')">30 дн / \${k.limit*1500}₽</a>
                        <a href="#" class="btn-pay" onclick="req('\${k.key}','\${k.name}',90,'\${k.limit*4050}₽</a>
                    </div>
                </div>\`;
            }).join('');
        }
        async function req(key, name, days, type){
            const cid = params.get('chatId');
            const r = await fetch('/api/notify-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,name,days,chatId:cid,type})});
            const res = await r.json();
            if(res.success && res.payUrl) window.location.href = res.payUrl;
        }
        load();
    </script>
</body>
</html>`);
});

bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) return ctx.reply('👑 АДМИН-ПАНЕЛЬ', { reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    const keys = await readDatabase(); const ck = keys.find(k => String(k.ownerChatId) === String(cid));
    if (ck) return ctx.reply('🏢 ВАШ КАБИНЕТ', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ДАННЫЕ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    ctx.reply(`👋 **Добро пожаловать в Logist X!**`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "💳 КУПИТЬ ДОСТУП", callback_data: "buy_new" }], [{ text: "🔑 У МЕНЯ ЕСТЬ КЛЮЧ", callback_data: "have_key" }]] } });
});

bot.action('buy_new', (ctx) => {
    userSteps[ctx.chat.id] = { step: 'type' };
    ctx.reply("Тип проекта:", { reply_markup: { inline_keyboard: [[{ text: "📦 ЛОГИСТ X", callback_data: "set_type_logist" }], [{ text: "🛒 МЕРЧ", callback_data: "set_type_merch" }]] } });
});

bot.action(/set_type_(.+)/, (ctx) => {
    userSteps[ctx.chat.id] = { type: ctx.match[1], step: 'name' };
    ctx.reply("Название объекта:");
});

bot.on('text', async (ctx) => {
    const cid = ctx.chat.id; if (cid === MY_TELEGRAM_ID) return; 
    const txt = ctx.message.text.trim(); const step = userSteps[cid];
    if (step && step.step === 'name') {
        step.name = txt; step.step = 'limit';
        return ctx.reply("Количество сотрудников:");
    }
    if (step && step.step === 'limit') {
        const limit = parseInt(txt); if(isNaN(limit)) return ctx.reply("Число!");
        const r = await fetch(SERVER_URL + '/api/notify-admin', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key: "NEW_USER", name: step.name, days: 30, limit, chatId: cid, type: step.type }) });
        const res = await r.json();
        ctx.reply(`💳 К оплате: ${limit * 1500}₽`, { reply_markup: { inline_keyboard: [[{ text: "ОПЛАТИТЬ", url: res.payUrl }]] } });
        delete userSteps[cid]; return;
    }
    const key = txt.toUpperCase(); let keys = await readDatabase(); 
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) { 
        keys[idx].ownerChatId = cid; await saveDatabase(keys); 
        ctx.reply('✅ АКТИВИРОВАНО!', { reply_markup: { inline_keyboard: [[{ text: "📊 КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    } else ctx.reply('❌ Неверный ключ.');
});

bot.launch().then(() => console.log("BOT STARTED"));
app.listen(process.env.PORT || 3000);
