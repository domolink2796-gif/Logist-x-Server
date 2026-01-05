const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');
const crypto = require('crypto');

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
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';
const MAX_DISTANCE_METERS = 600; 

// --- НАСТРОЙКИ РОБОКАССЫ ---
const ROBO_LOGIN = 'Logist_X'; 
const ROBO_PASS1 = 'P_password1'; 
const ROBO_PASS2 = 'P_password2'; 
const IS_TEST = 1; 

// Auth
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

async function getOrCreateFolder(rawName, parentId) {
    try {
        const name = String(rawName).trim(); 
        const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        let folderId;
        if (res.data.files.length > 0) {
            folderId = res.data.files[0].id;
        } else {
            const file = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
            folderId = file.data.id;
            await drive.permissions.create({ fileId: folderId, resource: { role: 'writer', type: 'anyone' } });
        }
        return folderId;
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
        let data = (typeof content.data === 'string') ? JSON.parse(content.data) : content.data;
        let keys = Array.isArray(data) ? data : (data.keys || []);
        
        let changed = false;
        // --- ПРОВЕРКА И СОЗДАНИЕ ПАПОК ДЛЯ СТАРЫХ КЛЮЧЕЙ ---
        for (let k of keys) {
            if (!k.folderId && k.key !== 'DEV-MASTER-999') {
                const projectRoot = (k.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
                k.folderId = await getOrCreateFolder(k.name, projectRoot);
                changed = true;
            }
        }

        if (!keys.find(k => k.key === 'DEV-MASTER-999')) {
            keys.push({ key: 'DEV-MASTER-999', name: 'SYSTEM_ADMIN', limit: 999, expiry: '2099-12-31T23:59:59.000Z', workers: [] });
            changed = true;
        }
        
        if (changed) await saveDatabase(keys);
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

async function readBarcodeDb(clientFolderId) {
    if (!clientFolderId) return {};
    try {
        const q = `name = '${BARCODE_DB_NAME}' and '${clientFolderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return {};
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        let data = content.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e) { data = {}; } }
        return data || {};
    } catch (e) { return {}; }
}

async function saveBarcodeDb(clientFolderId, data) {
    if (!clientFolderId || clientFolderId === MY_ROOT_ID) return console.error("Security Block");
    try {
        const q = `name = '${BARCODE_DB_NAME}' and '${clientFolderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const jsonContent = JSON.stringify(data, null, 2);
        const media = { mimeType: 'application/json', body: Readable.from([jsonContent]) };
        if (res.data.files.length > 0) {
            await drive.files.update({ fileId: res.data.files[0].id, media });
        } else {
            const f = await drive.files.create({ resource: { name: BARCODE_DB_NAME, parents: [clientFolderId] }, media: { mimeType: 'application/json', body: jsonContent }, fields: 'id' });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'writer', type: 'anyone' } });
        }
    } catch (e) { console.error("Barcode Save Error:", e); }
}

async function readPlanogramDb(clientFolderId) {
    if (!clientFolderId) return {};
    try {
        const q = `name = '${PLANOGRAM_DB_NAME}' and '${clientFolderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return {};
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        let data = content.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e) { data = {}; } }
        return data || {};
    } catch (e) { return {}; }
}

async function savePlanogramDb(clientFolderId, data) {
    if (!clientFolderId || clientFolderId === MY_ROOT_ID) return;
    try {
        const q = `name = '${PLANOGRAM_DB_NAME}' and '${clientFolderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const jsonContent = JSON.stringify(data, null, 2);
        const media = { mimeType: 'application/json', body: Readable.from([jsonContent]) };
        if (res.data.files.length > 0) {
            await drive.files.update({ fileId: res.data.files[0].id, media });
        } else {
            const f = await drive.files.create({ resource: { name: PLANOGRAM_DB_NAME, parents: [clientFolderId] }, media: { mimeType: 'application/json', body: jsonContent }, fields: 'id' });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'writer', type: 'anyone' } });
        }
    } catch (e) { console.error("Planogram Save Error:", e); }
}

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
        const gpsLink = (lat && lon) ? `=HYPERLINK("https://www.google.com/maps?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleTimeString("ru-RU"), address, entrance, client, workType, price, gpsLink, "ЗАГРУЖЕНО"]] } });
    } catch (e) { console.error("Logist Report Error:", e); }
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
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ДАТА', 'НАЧАЛО', 'КОНЕЦ', 'ДЛИТЕЛЬНОСТЬ', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ДОЛЯ %', 'ЦЕНА МЫ', 'ЦЕНА КОНК', 'СРОК', 'PDF ОТЧЕТ', 'GPS']] } });
        }
        const gps = (lat && lon) ? `=HYPERLINK("https://www.google.com/maps?q=${lat},${lon}"; "ПОСМОТРЕТЬ")` : "Нет";
        const pdfLink = `=HYPERLINK("${pdfUrl}"; "ОТЧЕТ ФОТО")`;
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleDateString("ru-RU"), startTime, endTime, duration, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdfLink, gps]] } });
    } catch (e) { console.error("Merch Report Error:", e); }
}

app.get('/check-barcode', async (req, res) => {
    try {
        const { code, licenseKey } = req.query;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === licenseKey);
        if (!kData || !kData.folderId) return res.json({ success: false });
        const db = await readBarcodeDb(kData.folderId);
        if (db[code]) res.json({ success: true, name: db[code] });
        else res.json({ success: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/save-barcode', async (req, res) => {
    try {
        const { code, name, licenseKey } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === licenseKey);
        if (!kData || !kData.folderId) return res.status(403).json({ error: "Ключ не найден" });
        const db = await readBarcodeDb(kData.folderId);
        db[code] = name;
        await saveBarcodeDb(kData.folderId, db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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
        } else { res.json({ exists: false }); }
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
        if (existing.data.files.length > 0) {
            await drive.files.update({ fileId: existing.data.files[0].id, media: { mimeType: 'image/jpeg', body: Readable.from(buf) } });
        } else {
            const f = await drive.files.create({ resource: { name: fileName, parents: [planFolderId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) }, fields: 'id' });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
        }
        const planDb = await readPlanogramDb(kData.folderId);
        planDb[addr] = true;
        await savePlanogramDb(kData.folderId, planDb);
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
        } else { res.send(`Папка сотрудника ${workerName} еще не создана.`); }
    } catch (e) { res.send("Ошибка: " + e.message); }
});

app.post('/check-license', async (req, res) => {
    const { licenseKey, workerName } = req.body;
    const keys = await readDatabase();
    const kData = keys.find(k => k.key === licenseKey);
    if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
    if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
    const pType = kData.type || 'logist';
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
        const curW = worker || workerName;
        const kData = keys.find(k => k.workers && k.workers.includes(curW)) || keys.find(k => k.key === licenseKey);
        const projR = (kData && kData.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
        const oId = kData ? kData.folderId : await getOrCreateFolder("Logist_Users", projR);
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
        const { worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdf, startTime, endTime, duration, lat, lon, city } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const oId = kData ? kData.folderId : await getOrCreateFolder("Merch_Users", MERCH_ROOT_ID);
        const wId = await getOrCreateFolder(worker, oId);
        const cityId = await getOrCreateFolder(city || "Без города", wId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], cityId);
        let pUrl = "Нет файла";
        if (pdf) {
            const base64Data = pdf.includes(',') ? pdf.split(',')[1] : pdf;
            const buf = Buffer.from(base64Data, 'base64');
            const f = await drive.files.create({ resource: { name: `ОТЧЕТ_${address}.jpg`, parents: [dId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) }, fields: 'id, webViewLink' });
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
        if (Shp_key === "NEW_USER") {
            const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
            const exp = new Date(); exp.setDate(exp.getDate() + parseInt(Shp_days));
            const projR = (Shp_type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
            const fId = await getOrCreateFolder(Shp_name, projR);
            keys.push({ key: newK, name: Shp_name, limit: parseInt(Shp_limit), expiry: exp.toISOString(), workers: [], ownerChatId: Shp_chatId, folderId: fId, type: Shp_type });
            await bot.telegram.sendMessage(Shp_chatId, `🎉 Оплата успешна! Ключ: ${newK}`);
        } else {
            const idx = keys.findIndex(k => k.key === Shp_key);
            if (idx !== -1) {
                let d = new Date(keys[idx].expiry); if (d < new Date()) d = new Date();
                d.setDate(d.getDate() + parseInt(Shp_days)); keys[idx].expiry = d.toISOString();
                await bot.telegram.sendMessage(Shp_chatId, `✅ Лицензия продлена!`);
            }
        }
        await saveDatabase(keys); return res.send(`OK${InvId}`);
    }
    res.send("error");
});

app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ADMIN</title><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');body{background-color:#010409;color:#e6edf3;font-family:'Inter',sans-serif;margin:0;padding:15px;}.card{background:#0d1117;border:1px solid #30363d;border-radius:16px;padding:20px;margin-bottom:15px;}.btn{padding:14px;border-radius:8px;border:none;font-weight:700;cursor:pointer;width:100%;margin-top:5px;}</style></head><body><div id="list">Загрузка...</div><script>async function load(){const r=await fetch('/api/keys');const keys=await r.json();document.getElementById('list').innerHTML=keys.map(k=>'<div class="card">'+k.name+' ('+k.key+')</div>').join('');}load();</script></body></html>`);
});

app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>КАБИНЕТ</title></head><body>Личный кабинет загружается...</body></html>`);
});

bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) return ctx.reply('👑 ПУЛЬТ', { reply_markup: { inline_keyboard: [[{ text: "📦 ОБЪЕКТЫ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    const keys = await readDatabase(); 
    const ck = keys.find(k => String(k.ownerChatId) === String(cid));
    if (ck) return ctx.reply('🏢 КАБИНЕТ', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ДАННЫЕ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    ctx.reply('👋 Logist X!', { reply_markup: { inline_keyboard: [[{ text: "💳 КУПИТЬ", callback_data: "buy_new" }], [{ text: "🔑 КЛЮЧ", callback_data: "have_key" }]] } });
});

bot.action('buy_new', (ctx) => {
    userSteps[ctx.chat.id] = { step: 'type' };
    ctx.reply("Тип проекта:", { inline_keyboard: [[{ text: "📦 ЛОГИСТ", callback_data: "set_type_logist" }, { text: "🛒 МЕРЧ", callback_data: "set_type_merch" }]] });
});

bot.on('text', async (ctx) => {
    const cid = ctx.chat.id; const txt = ctx.message.text.trim();
    const key = txt.toUpperCase(); let keys = await readDatabase(); 
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) { 
        keys[idx].ownerChatId = cid; await saveDatabase(keys); 
        ctx.reply('✅ АКТИВИРОВАНО');
    }
});

bot.launch();
app.listen(process.env.PORT || 3000);
