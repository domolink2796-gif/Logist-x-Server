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
const SERVER_URL = 'https://logist-x.store';
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
app.emit('barcode-scanned', { key: licenseKey, bc: code, name: name });
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
    if (kData.folderId) { 
        await readPlanogramDb(kData.folderId); 
        await readBarcodeDb(kData.folderId); 
    }
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
        
        // СОХРАНЕНИЕ АССОРТИМЕНТА И ОСТАТКОВ ДЛЯ ДИНАМИКИ
        if (kData && kData.folderId && items) {
            const shopDb = await readShopItemsDb(kData.folderId);
            // Сохраняем shelf и stock для следующего визита
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
            
            // ПРАВИЛЬНОЕ НАЗВАНИЕ ФОТО: адрес номер_дома подъезд
            const safeAddr = (address || "ADDRESS").replace(/[/\\?%*:|"<>]/g, '-');
            const safeEntr = (entrance || "1");
            const fileName = `${safeAddr} под ${safeEntr}.jpg`;

            const f = await drive.files.create({ 
                resource: { name: fileName, parents: [dId] }, 
                media: { mimeType: 'image/jpeg', body: Readable.from(buf) }, 
                fields: 'id, webViewLink' 
            });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'writer', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }
        await appendMerchToReport(wId, worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pUrl, startTime, endTime, duration, lat, lon);
        res.json({ success: true, url: pUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/keys', async (req, res) => { res.json(await readDatabase()); });

// --- ПРАВИЛЬНОЕ ИСПРАВЛЕНИЕ ФУНКЦИИ (СТРОКА 332) ---
app.get('/api/client-keys', async (req, res) => {
    try { 
        const keys = await readDatabase(); 
        const { chatId, key } = req.query;
        
        // Если зашли через бота по chatId
        if (chatId && chatId !== 'null' && chatId !== 'undefined') {
            const myKeys = keys.filter(k => 
                k.ownerChatId && 
                String(k.ownerChatId) === String(chatId) && 
                k.ownerChatId !== 'WEBSITE_SALE'
            );
            return res.json(myKeys);
        }
        // Если человек с сайта ввел ключ вручную
        if (key) {
            const found = keys.find(k => k.key === key.toUpperCase());
            return res.json(found ? [found] : []);
        }
        res.json([]); 
    } catch (e) { res.json([]); }
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
    try {
        const { key, name, days, chatId, limit, type } = req.body;
        const keys = await readDatabase();

        // Определяем ключ для отображения
        let displayKey = key;
        if (key === "NEW_USER") {
            displayKey = (type === 'merch' ? 'M-' : 'L-') + Math.random().toString(36).substring(2, 6).toUpperCase();
        }

        // ПРАВИЛЬНЫЙ РАСЧЕТ ЛИМИТА (чтобы сервер не выдавал ошибку на новых юзеров)
        const foundInDb = keys.find(k => k.key === key);
        const finalLimit = foundInDb ? parseInt(foundInDb.limit) : (parseInt(limit) || 1);

        // ТВОЯ ЛОГИКА ЦЕН (сохранена полностью)
        let price = finalLimit * 1500;
        if (days == 90) price = finalLimit * 4050; 
        if (days == 180) price = finalLimit * 7650; 
        if (days == 365) price = finalLimit * 15000; 

        const invId = Math.floor(Date.now() / 1000);

        // Описание для Робокассы
        const desc = `Программа: ${type === 'merch' ? 'Merch X' : 'Logist X'}. Объект: ${name}. КЛЮЧ: ${displayKey}`;

        // ТВОЯ ПОДПИСЬ (Signature)
        const sign = crypto.createHash('md5').update(`${ROBO_LOGIN}:${price}:${invId}:${ROBO_PASS1}:Shp_chatId=${chatId}:Shp_days=${days}:Shp_key=${displayKey}:Shp_limit=${finalLimit}:Shp_name=${name}:Shp_type=${type}`).digest('hex');

        // ССЫЛКА ВОЗВРАТА С КЛЮЧОМ
        console.log("СФОРМИРОВАН КЛЮЧ ДЛЯ ОПЛАТЫ:", displayKey);
const returnUrl = encodeURIComponent(`https://logist-x.ru/success.html?key=${displayKey}`);

        const payUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${ROBO_LOGIN}&OutSum=${price}&InvId=${invId}&Description=${encodeURIComponent(desc)}&SignatureValue=${sign}&Shp_days=${days}&Shp_key=${displayKey}&Shp_chatId=${chatId}&Shp_limit=${finalLimit}&Shp_name=${encodeURIComponent(name)}&Shp_type=${type}${IS_TEST ? '&IsTest=1' : ''}&SuccessURL=${returnUrl}`;

        res.json({ success: true, payUrl });
    } catch (e) {
        console.error("ОШИБКА СЕРВЕРА В ОПЛАТЕ:", e);
        res.status(500).json({ success: false, error: "Ошибка на стороне сервера" });
    }
});


app.post('/api/payment-result', async (req, res) => {
    const { OutSum, InvId, SignatureValue, Shp_key, Shp_days, Shp_chatId, Shp_limit, Shp_name, Shp_type } = req.body;
    const mySign = crypto.createHash('md5').update(`${OutSum}:${InvId}:${ROBO_PASS2}:Shp_chatId=${Shp_chatId}:Shp_days=${Shp_days}:Shp_key=${Shp_key}:Shp_limit=${Shp_limit}:Shp_name=${Shp_name}:Shp_type=${Shp_type}`).digest('hex');
    if (SignatureValue.toLowerCase() === mySign.toLowerCase()) {
        let keys = await readDatabase();
        let clientMsg = "";

        if (Shp_key.startsWith('M-') || Shp_key.startsWith('L-') || Shp_key.includes('-')) {
             const existingIdx = keys.findIndex(k => k.key === Shp_key);
             if (existingIdx === -1) {
                const exp = new Date(); exp.setDate(exp.getDate() + parseInt(Shp_days));
                const projR = (Shp_type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
                const fId = await getOrCreateFolder(Shp_name, projR);
                // При покупке с сайта (WEBSITE_SALE) ставим null, чтобы ключ был "свободным" до активации в ТГ
                const finalOwner = (Shp_chatId === 'WEBSITE_SALE') ? null : Shp_chatId;
                keys.push({ key: Shp_key, name: Shp_name, limit: parseInt(Shp_limit), expiry: exp.toISOString(), workers: [], ownerChatId: finalOwner, folderId: fId, type: Shp_type });
                clientMsg = `🎉 Оплата успешна! Ваш ключ: ${Shp_key}`;
             } else {
                let d = new Date(keys[existingIdx].expiry); if (d < new Date()) d = new Date();
                d.setDate(d.getDate() + parseInt(Shp_days)); keys[existingIdx].expiry = d.toISOString();
                clientMsg = `✅ Лицензия продлена!`;
             }
        }
        await saveDatabase(keys); 

        if (Shp_chatId && Shp_chatId !== 'null' && Shp_chatId !== 'undefined' && Shp_chatId !== 'WEBSITE_SALE') {
            try { await bot.telegram.sendMessage(Shp_chatId, clientMsg); } catch(e) { console.log("Tg Client Send Error:", e.message); }
        }

        try {
            await bot.telegram.sendMessage(MY_TELEGRAM_ID, `💰 ОПЛАТА!\nОбъект: ${Shp_name}\nСумма: ${OutSum}₽\nКлюч: ${Shp_key}\nТип: ${Shp_type}`);
        } catch(e) { console.log("Tg Admin Send Error:", e.message); }

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
        .expired { border-color: #da3633 !important; box-shadow: 0 0 10px rgba(218, 54, 51, 0.2); }
        .gold-text { color: #f59e0b; font-size: 16px; }
        input, select { width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 8px; border: 1px solid #30363d; background: #010409; color: #fff; box-sizing: border-box; font-size: 14px; }
        .btn { padding: 14px; border-radius: 8px; border: none; font-weight: 700; cursor: pointer; width: 100%; margin-top: 5px; font-size: 14px; }
        .btn-gold { background: #f59e0b; color: #000; }
        .btn-red { background: #da3633; color: #fff; }
        .btn-small { padding: 8px; width: auto; flex: 1; font-size: 12px; }
        .row { display: flex; gap: 5px; }
    </style>
</head>
<body>
    <div style="margin-bottom:20px; font-weight:900; font-size: 18px;">📦 ПАНЕЛЬ УПРАВЛЕНИЯ</div>
    <div class="card">
        <b style="font-size: 16px; display: block; margin-bottom: 10px;">ДОБАВИТЬ ОБЪЕКТ</b>
        <input id="n" placeholder="Название объекта">
        <input id="l" type="number" value="5" placeholder="Лимит человек">
        <select id="t"><option value="logist">Логист</option><option value="merch">Мерч</option></select>
        <button class="btn btn-gold" onclick="add()">СОЗДАТЬ КЛЮЧ</button>
    </div>
    <div id="list"></div>
    <script>
        async function load(){
            const r = await fetch('/api/keys');
            const keys = await r.json();
            document.getElementById('list').innerHTML = keys.map(k => {
                const isExp = new Date(k.expiry) < new Date();
                return \`<div class="card \${isExp ? 'expired' : ''}">
                    <div class="gold-text" style="font-weight:900">\${k.key} [\${k.type || 'logist'}]</div>
                    <div style="margin:8px 0; font-size: 15px; font-weight: 600;">\${k.name}</div>
                    <div style="font-size:13px; opacity:0.8">
                        Лимит: <input type="number" value="\${k.limit}" style="width:50px; border:none; background:transparent; color:#f59e0b; font-weight:700; padding:0; margin:0;" onchange="updLimit('\${k.key}', this.value)">
                        | До: \${new Date(k.expiry).toLocaleDateString()} \${isExp ? '❌' : '✅'}
                    </div>
                    <div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:8px; font-size:12px; margin:10px 0; color:#8b949e">
                        \${k.workers && k.workers.length ? k.workers.join(', ') : 'НЕТ АКТИВНЫХ ПОЛЬЗОВАТЕЛЕЙ'}
                    </div>
                    <div class="row">
                        <button class="btn btn-gold btn-small" onclick="ext('\${k.key}', 30)">+30д</button>
                        <button class="btn btn-gold btn-small" onclick="ext('\${k.key}', 90)">+90д</button>
                        <button class="btn btn-gold btn-small" onclick="ext('\${k.key}', 180)">+180д</button>
                    </div>
                    <button class="btn btn-red btn-small" style="width:100%; margin-top:10px; opacity:0.5" onclick="del('\${k.key}')">УДАЛИТЬ КЛЮЧ</button>
                </div>\`;
            }).join('');
        }
        async function add(){
            const n = document.getElementById('n').value;
            const l = document.getElementById('l').value;
            const t = document.getElementById('t').value;
            if(!n) return alert('Введите имя');
            await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,limit:l,days:30,type:t})});
            load();
        }
        async function ext(key, days){
            await fetch('/api/keys/extend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key, days})});
            load();
        }
        async function updLimit(key, limit){
            await fetch('/api/keys/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key, limit})});
        }
        async function del(key){
            if(confirm('Удалить?')){
                await fetch('/api/keys/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
                load();
            }
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
        body { background: radial-gradient(circle at top right, #1a1c2c, #010409); color: #fff; font-family: 'Inter', sans-serif; margin: 0; padding: 20px; min-height: 100vh; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .logo-box { background: #f59e0b; color: #000; padding: 5px 10px; border-radius: 8px; font-weight: 800; font-size: 18px; }
        .card { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 25px; margin-bottom: 20px; position: relative; overflow: hidden; }
        .card::before { content: ""; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #f59e0b; }
        .obj-name { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 5px; }
        .status-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: rgba(245, 158, 11, 0.1); color: #f59e0b; margin-bottom: 15px; }
        .stats { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .stat-item { text-align: center; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 12px; flex: 1; margin: 0 4px; }
        .stat-val { display: block; font-weight: 800; font-size: 16px; color: #f59e0b; }
        .stat-lbl { font-size: 9px; opacity: 0.5; text-transform: uppercase; }
        .warning-box { background: rgba(218, 54, 51, 0.1); border: 1px dashed #da3633; color: #ff7b72; padding: 12px; border-radius: 12px; font-size: 11px; margin-bottom: 20px; text-align: center; line-height: 1.4; }
        .workers-box { background: rgba(0,0,0,0.2); border-radius: 16px; padding: 10px; margin-bottom: 20px; }
        .worker-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .folder-btn { text-decoration: none; background: rgba(245, 158, 11, 0.1); color: #f59e0b; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; transition: 0.2s; border: 1px solid rgba(245,158,11,0.2); cursor: pointer; }
        .grid-prices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .price-card { background: rgba(0,0,0,0.3); padding: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); text-align: center; cursor: pointer; transition: 0.3s; }
        .price-card:hover { border-color: #f59e0b; background: rgba(245,158,11,0.05); }
        .sale-tag { font-size: 8px; background: #da3633; color: #fff; padding: 2px 5px; border-radius: 4px; display: inline-block; margin-bottom: 4px; }
        
        #success-modal { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.9); z-index: 9999; justify-content: center; align-items: center; padding: 20px; }
        .modal-content { background: #000; color: #fff; padding: 30px; border-radius: 30px; max-width: 500px; width: 100%; text-align: center; border: 2px solid #f59e0b; }
    </style>
</head>
<body>
    <div id="success-modal">
        <div class="modal-content">
            <h1 style="margin:0; font-size: 32px; color: #f59e0b;">💰 ОПЛАЧЕНО!</h1>
            <p style="font-size: 16px; margin: 20px 0; opacity: 0.7;">ВАШ КЛЮЧ ДЛЯ ПРИЛОЖЕНИЯ:</p>
            <div id="final-key" style="font-size: 32px; font-weight: 900; background: rgba(245,158,11,0.1); color: #f59e0b; padding: 20px; border-radius: 15px; border: 1px dashed #f59e0b; word-break: break-all;"></div>
            <button onclick="document.getElementById('success-modal').style.display='none'" style="margin-top: 30px; width: 100%; padding: 15px; background: #f59e0b; color: #000; border: none; border-radius: 15px; font-weight: 900; cursor: pointer; text-transform: uppercase;">Я СОХРАНИЛ КЛЮЧ</button>
        </div>
    </div>

    <div class="header">
        <div class="logo-box">LOGIST X</div>
        <div style="font-size: 12px; opacity: 0.6">ЛИЧНЫЙ КАБИНЕТ</div>
    </div>
    <div id="root"></div>

    <script>
        function openExternal(url) {
            const absoluteUrl = url.startsWith('http') ? url : window.location.origin + url;
            const a = document.createElement('a');
            a.href = absoluteUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
            a.click();
        }

        async function load(){
            const params = new URLSearchParams(window.location.search);
            
            // Если пришли после оплаты - показываем окно
            if(params.get('payment') === 'success' || params.get('status') === 'success') {
                const modal = document.getElementById('success-modal');
                const keyBox = document.getElementById('final-key');
                if(modal && keyBox) {
                    modal.style.display = 'flex';
                    keyBox.innerText = params.get('key') || 'АКТИВИРОВАН';
                }
            }

            const r = await fetch('/api/client-keys?chatId=' + params.get('chatId'));
            const keys = await r.json();
            
            if(keys.length === 0) {
                document.getElementById('root').innerHTML = '<div style="text-align:center; padding:50px; opacity:0.5;">У вас пока нет активных объектов.</div>';
                return;
            }

            document.getElementById('root').innerHTML = keys.map(k => {
                const days = Math.ceil((new Date(k.expiry) - new Date()) / (1000*60*60*24));
                let workersList = [];
                k.workers.forEach(w => {
                    workersList.push(\`<div class="worker-item"><span class="worker-name">👤 \${w}</span><div onclick="openExternal('/api/open-folder?workerName=\${encodeURIComponent(w)}')" class="folder-btn">📂 ОТЧЕТЫ</div></div>\`);
                });
                for(let i = k.workers.length; i < k.limit; i++) {
                    workersList.push(\`<div class="worker-item"><span style="font-size:13px; opacity:0.3; font-style:italic">⚪️ Свободное место</span></div>\`);
                }
                return \`
                <div class="card">
                    <div class="status-badge">\${days > 0 ? 'Доступ активен' : 'Срок истек'}</div>
                    <div class="obj-name">\${k.name} (\${k.type || 'logist'})</div>
                    <div style="font-size: 11px; opacity: 0.4; margin-bottom: 15px;">Ключ: \${k.key}</div>
                    <div class="warning-box">⚠️ ФОТО-ОТЧЕТЫ И АРХИВЫ ХРАНЯТСЯ 60 ДНЕЙ.</div>
                    <div class="stats">
                        <div class="stat-item"><span class="stat-val">\${days > 0 ? days : 0}</span><span class="stat-lbl">Дней</span></div>
                        <div class="stat-item"><span class="stat-val">\${k.workers.length}/\${k.limit}</span><span class="stat-lbl">Людей</span></div>
                    </div>
                    <div class="workers-box">\${workersList.join('')}</div>
                    
                    <div style="font-size:12px; font-weight:800; color:#f59e0b; margin-top:15px;">ПРОДЛИТЬ ЛИЦЕНЗИЮ:</div>
                    <div class="grid-prices">
                        <div class="price-card" onclick="req('\${k.key}','\${k.name}',30,'\${k.type}')">
                            <div style="font-size:14px; font-weight:800">30 дн.</div>
                            <div style="font-size:10px; color:#f59e0b">\${k.limit*1500}₽</div>
                        </div>
                        <div class="price-card" onclick="req('\${k.key}','\${k.name}',90,'\${k.type}')">
                            <div class="sale-tag">-10%</div>
                            <div style="font-size:14px; font-weight:800">90 дн.</div>
                            <div style="font-size:10px; color:#f59e0b">\${k.limit*4050}₽</div>
                        </div>
                        <div class="price-card" onclick="req('\${k.key}','\${k.name}',180,'\${k.type}')">
                            <div class="sale-tag">-15%</div>
                            <div style="font-size:14px; font-weight:800">180 дн.</div>
                            <div style="font-size:10px; color:#f59e0b">\${k.limit*7650}₽</div>
                        </div>
                        <div class="price-card" onclick="req('\${k.key}','\${k.name}',365,'\${k.type}')">
                            <div class="sale-tag">-20%</div>
                            <div style="font-size:14px; font-weight:800">365 дн.</div>
                            <div style="font-size:10px; color:#f59e0b">\${k.limit*15000}₽</div>
                        </div>
                    </div>
                </div>\`;
            }).join('');
        }

        async function req(key, name, days, type){
            const cid = new URLSearchParams(window.location.search).get('chatId');
            const r = await fetch('/api/notify-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,name,days,chatId:cid,type})});
            const res = await r.json();
            if(res.success && res.payUrl) window.location.href = res.payUrl;
            else alert('Ошибка платежа');
        }
        load();
    </script>
</body>
</html>`);
});

bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) return ctx.reply('👑 ПУЛЬТ УПРАВЛЕНИЯ', { reply_markup: { inline_keyboard: [[{ text: "📦 ОБЪЕКТЫ / КЛЮЧИ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    const keys = await readDatabase(); const ck = keys.find(k => String(k.ownerChatId) === String(cid));
    if (ck) return ctx.reply('🏢 ВАШ КАБИНЕТ', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ДАННЫЕ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    ctx.reply(`👋 **Добро пожаловать в Logist X!**`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "💳 КУПИТЬ НОВЫЙ ДОСТУП", callback_data: "buy_new" }], [{ text: "🔑 У МЕНЯ ЕСТЬ КЛЮЧ", callback_data: "have_key" }]] } });
});

bot.action('buy_new', (ctx) => {
    userSteps[ctx.chat.id] = { step: 'type' };
    ctx.reply("Выберите тип проекта:", { reply_markup: { inline_keyboard: [[{ text: "📦 ЛОГИСТ X", callback_data: "set_type_logist" }], [{ text: "🛒 МЕРЧЕНДАЙЗИНГ", callback_data: "set_type_merch" }]] } });
});

bot.action(/set_type_(.+)/, (ctx) => {
    const type = ctx.match[1]; userSteps[ctx.chat.id] = { type, step: 'name' };
    ctx.reply("Введите название вашего объекта:");
});

bot.on('text', async (ctx) => {
    const cid = ctx.chat.id; if (cid === MY_TELEGRAM_ID) return; 
    const txt = ctx.message.text.trim();
    const step = userSteps[cid];
    if (step && step.step === 'name') {
        step.name = txt; step.step = 'limit';
        return ctx.reply("Сколько сотрудников будет работать? (введите число)");
    }
    if (step && step.step === 'limit') {
        const limit = parseInt(txt); if(isNaN(limit)) return ctx.reply("Введите число!");
        const r = await fetch(SERVER_URL + '/api/notify-admin', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key: "NEW_USER", name: step.name, days: 30, limit, chatId: cid, type: step.type }) });
        const res = await r.json();
        ctx.reply(`💳 К оплате за ${limit} чел.: ${limit * 1500}₽`, { reply_markup: { inline_keyboard: [[{ text: "ОПЛАТИТЬ", url: res.payUrl }]] } });
        delete userSteps[cid]; return;
    }
    const key = txt.toUpperCase(); let keys = await readDatabase(); 
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) { 
        if(keys[idx].ownerChatId && keys[idx].ownerChatId !== cid) return ctx.reply('Этот ключ уже активирован.'); 
        keys[idx].ownerChatId = cid; await saveDatabase(keys); 
        ctx.reply('✅ КЛЮЧ АКТИВИРОВАН!', { reply_markup: { inline_keyboard: [[{ text: "📊 ОТКРЫТЬ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    } else ctx.reply('❌ Ключ не найден.');
});
// --- ЗАГРУЗЧИК ПЛАГИНОВ ---
const fs = require('fs');
const path = require('path');

const pluginContext = {
    app, 
    drive, 
    google, 
    sheets, 
    bot, 
    readDatabase, 
    saveDatabase, 
    getOrCreateFolder, 
    readPlanogramDb, 
    savePlanogramDb, 
    readJsonFromDrive, 
    saveJsonToDrive,
    readBarcodeDb, 
    saveBarcodeDb, 
    readShopItemsDb, 
    saveShopItemsDb,
    MY_ROOT_ID, 
    MERCH_ROOT_ID 
};

// --- 1. ПЛАГИН МЕРЧ (СОЛНЦЕ) ---
try {
    require('./plugin-merch-sun.js')(app, pluginContext); 
    console.log("✅ ПЛАГИН СОЛНЦЕ ПОДКЛЮЧЕН");
} catch (e) {
    console.log("❌ Ошибка в файле plugin-merch-sun.js: " + e.message);
}

// --- 2. ПЛАГИН ХРАНИЛИЩА (АВТОДЕПЛОЙ + ДИСК) ---
try {
    require('./plugin-storage-pro.js')(app, pluginContext);
    console.log("✅ ПЛАГИН STORAGE PRO ПОДКЛЮЧЕН");
} catch (e) {
    console.log("⚠️ Плагин Storage Pro ошибка: " + e.message);
}
// --- [НОВОЕ] 3. ГЛОБАЛЬНЫЙ СКАНЕР ---
try { 
    require('./plugin-neural-scanner.js')(app, pluginContext);
    console.log("✅ ПЛАГИН NEURAL SCANNER ПОДКЛЮЧЕН");
} catch (e) {
    console.log("⚠️ Ошибка сканера: " + e.message);
}
// --- [НОВОЕ] 4. ПЛАГИН ТЕСТ-ДРАЙВА ---
try {
    require('./plugin-trial.js')(app, pluginContext);
} catch (e) {
    console.log("⚠️ Ошибка плагина тест-драйва: " + e.message);
}
// --- 4. ПЛАГИН АВТО-ФОТО (GEMINI AI) ---
try {
    require('./plugin-photo-ai.js')(app, pluginContext);
} catch (e) {
    console.log("⚠️ Не удалось загрузить плагин Photo-AI: " + e.message);
}
// Подключаем наш новый пульт
try {
    require('./plugin-remote.js')(app, pluginContext);
} catch (e) {
    console.error("❌ Не удалось загрузить плагин пульта:", e);
}
// --- [X-STORE BRIDGE] ОБНОВЛЕННЫЙ ---
try {
    const fs = require('fs');
    const path = require('path');
    
    // Пытаемся найти плагин в разных местах (рядом или уровнем выше)
    const paths = [
        path.join(__dirname, 'plugin-xstore.js'),
        path.join(__dirname, '..', 'x-store', 'plugin-xstore.js'),
        path.join(process.cwd(), 'x-store', 'plugin-xstore.js')
    ];

    let found = false;
    for (const p of paths) {
        if (fs.existsSync(p)) {
            require(p)(app, pluginContext);
            console.log("🚀 МОСТ С X-STORE УСТАНОВЛЕН (путь: " + p + ")");
            found = true;
            break;
        }
    }
    if (!found) console.log("⚠️ ПРЕДУПРЕЖДЕНИЕ: Файл plugin-xstore.js не найден ни по одному адресу");

} catch (e) {
    console.log("❌ КРИТИЧЕСКАЯ ОШИБКА X-STORE: " + e.message);
}
const fs = require('fs');
const path = require('path');
const express = require('express');

// Файл истории (будет лежать в папке public)
const chatDbFile = path.join(process.cwd(), 'public', 'chat_history.json');

// Проверяем, есть ли папка public
if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
    fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
}

module.exports = function (app, context) {

    // 1. API: Отправка сообщения
    app.post('/x-api/chat-send', express.json(), (req, res) => {
        try {
            const { user, text, avatar, time } = req.body;
            
            // Лог в консоль сервера (чтобы ты видел активность)
            console.log(`💬 CHAT | ${user}: ${text}`);

            // Читаем текущую историю
            let history = [];
            if (fs.existsSync(chatDbFile)) {
                try { history = JSON.parse(fs.readFileSync(chatDbFile, 'utf8')); } catch (e) {}
            }

            // Добавляем новое сообщение
            const newMessage = { user, text, avatar, time: time || new Date().toLocaleTimeString() };
            history.push(newMessage);

            // Храним только последние 50 сообщений (чтобы не забивать память)
            if (history.length > 50) history.shift();

            // Сохраняем файл
            fs.writeFileSync(chatDbFile, JSON.stringify(history, null, 2));

            // --- ПРОВЕРКА СВЯЗИ ---
            let replyMsg = null;
            if (text && text.toLowerCase().includes('тест системы')) {
                replyMsg = `✅ Связь отличная, Шеф! Сервер принимает данные.`;
            }

            res.json({ success: true, reply: replyMsg });

        } catch (e) {
            console.error("Chat Error:", e.message);
            res.status(500).json({ success: false });
        }
    });

    // 2. API: Загрузка истории (чтобы при входе чат не был пустым)
    app.get('/x-api/chat-history', (req, res) => {
        if (fs.existsSync(chatDbFile)) {
            res.json(JSON.parse(fs.readFileSync(chatDbFile, 'utf8')));
        } else {
            res.json([]);
        }
    });

    console.log("🚀 ПЛАГИН X-CHAT (Автономный) ЗАПУЩЕН");
};


// --- ЗАПУСК БОТА ---
bot.launch().then(() => {
    console.log('✅ Бот запущен');
}).catch(err => {
    console.error('❌ Ошибка бота:', err);
});

// --- ЗАПУСК СЕРВЕРА (ЧЕРЕЗ NGINX) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`);
    console.log(`📡 Nginx пробрасывает трафик с https://logist-x.store на этот порт`);
});
