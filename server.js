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
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

// --- НАСТРОЙКИ РОБОКАССЫ ---
const ROBO_LOGIN = 'Logist_X'; 
const ROBO_PASS1 = 'P_password1'; 
const ROBO_PASS2 = 'P_password2'; 
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
    } catch (e) { console.error("DB Save Error:", e); }
}

async function readBarcodeDb(clientFolderId) {
    try {
        const q = `name = '${BARCODE_DB_NAME}' and '${clientFolderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return {};
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        return typeof content.data === 'string' ? JSON.parse(content.data) : content.data;
    } catch (e) { return {}; }
}

async function saveBarcodeDb(clientFolderId, data) {
    try {
        const q = `name = '${BARCODE_DB_NAME}' and '${clientFolderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const media = { mimeType: 'application/json', body: JSON.stringify(data, null, 2) };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); } 
        else { await drive.files.create({ resource: { name: BARCODE_DB_NAME, parents: [clientFolderId] }, media }); }
    } catch (e) { console.error("Barcode Save Error:", e); }
}

async function readPlanogramDb(clientFolderId) {
    try {
        const q = `name = '${PLANOGRAM_DB_NAME}' and '${clientFolderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return {};
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        return content.data || {};
    } catch (e) { return {}; }
}

async function savePlanogramDb(clientFolderId, data) {
    try {
        const q = `name = '${PLANOGRAM_DB_NAME}' and '${clientFolderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const media = { mimeType: 'application/json', body: JSON.stringify(data, null, 2) };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); } 
        else { await drive.files.create({ resource: { name: PLANOGRAM_DB_NAME, parents: [clientFolderId] }, media }); }
    } catch (e) { console.error("Planogram DB Error:", e); }
}

// --- ЗАПИСЬ В ТАБЛИЦЫ ---

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
        const gpsLink = (lat && lon) ? `=HYPERLINK("http://googleusercontent.com/maps.google.com/?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleTimeString("ru-RU"), address, entrance, client, workType, price, gpsLink, "ЗАГРУЖЕНО"]] } });
    } catch (e) { console.error("Logist Error:", e); }
}

async function appendMerchToReport(workerId, workerName, net, address, sShelf, sWh, faces, share, ourPrice, compPrice, expDate, pdfUrl, startTime, endTime, duration, lat, lon) {
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
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ДАТА', 'ВРЕМЯ В ТТ', 'СЕТЬ', 'АДРЕС', 'ПОЛКА', 'СКЛАД', 'ИТОГО', 'ФЕЙСИНГ', 'ДОЛЯ %', 'ЦЕНА МЫ', 'ЦЕНА КОНК', 'СРОК', 'PDF ОТЧЕТ', 'GPS']] } });
        }
        const total = parseInt(sShelf || 0) + parseInt(sWh || 0);
        const gps = (lat && lon) ? `=HYPERLINK("http://googleusercontent.com/maps.google.com/?q=${lat},${lon}"; "ПОСМОТРЕТЬ")` : "Нет";
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleDateString("ru-RU"), duration, net, address, sShelf, sWh, total, faces, share, ourPrice, compPrice, expDate, pdfUrl, gps]] } });
    } catch (e) { console.error("Merch Worker Error:", e); }
}

async function updateGlobalStockDb(clientFolderId, workerName, net, address, sShelf, sWh, faces, share, ourPrice, compPrice, expDate) {
    try {
        const dbName = "БАЗА_ОСТАТКОВ_СЕТЬ";
        const q = `name = '${dbName}' and '${clientFolderId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId = res.data.files.length > 0 ? res.data.files[0].id : null;
        if (!spreadsheetId) {
            const cr = await sheets.spreadsheets.create({ resource: { properties: { title: dbName } } });
            spreadsheetId = cr.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: clientFolderId, removeParents: 'root' });
        }
        let sheetTitle = `${net}_${address}`.replace(/[^а-яёa-z0-9]/gi, '_').substring(0, 95);
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ДАТА', 'СОТРУДНИК', 'ПОЛКА', 'СКЛАД', 'ИТОГО', 'ФЕЙСИНГ', 'ДОЛЯ %', 'ЦЕНА НАША', 'ЦЕНА КОНК', 'СРОК']] } });
        }
        const total = parseInt(sShelf || 0) + parseInt(sWh || 0);
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleString("ru-RU"), workerName, sShelf, sWh, total, faces, share, ourPrice, compPrice, expDate]] } });
    } catch (e) { console.error("Global DB Error:", e); }
}

// --- РОУТЫ: ПЛАНОГРАММЫ ---

app.get('/get-planogram', async (req, res) => {
    try {
        const { addr, key } = req.query;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId) return res.json({ exists: false });
        const fileName = `${addr.replace(/[^а-яёa-z0-9]/gi, '_')}.jpg`;
        const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
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
        if (!kData || !kData.folderId) return res.status(403).json({ error: "No Access" });
        const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
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
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- РОУТЫ: ШТРИХ-КОДЫ ---

app.get('/check-barcode', async (req, res) => {
    try {
        const { code, key } = req.query;
        let keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId) return res.json({ exists: false });
        const barcodeDb = await readBarcodeDb(kData.folderId);
        if (barcodeDb[code]) { res.json({ exists: true, name: barcodeDb[code].name || barcodeDb[code] }); } 
        else { res.json({ exists: false }); }
    } catch (e) { res.json({ exists: false }); }
});

app.post('/save-barcode', async (req, res) => {
    try {
        const { code, name, key } = req.body;
        let keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId) return res.status(403).send("Forbidden");
        const barcodeDb = await readBarcodeDb(kData.folderId);
        barcodeDb[code] = { name: name, date: new Date().toISOString() };
        await saveBarcodeDb(kData.folderId, barcodeDb);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ОСНОВНЫЕ API ---

app.post('/check-license', async (req, res) => {
    const { licenseKey, workerName } = req.body;
    const keys = await readDatabase();
    const kData = keys.find(k => k.key === licenseKey);
    if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
    if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
    if (!kData.folderId) {
        kData.folderId = await getOrCreateFolder(kData.name, kData.type === 'merch' ? MERCH_ROOT_ID : MY_ROOT_ID);
        await saveDatabase(keys);
    }
    if (!kData.workers) kData.workers = [];
    if (!kData.workers.includes(workerName)) {
        if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест исчерпан' });
        kData.workers.push(workerName); await saveDatabase(keys);
    }
    res.json({ status: 'active', expiry: kData.expiry, type: kData.type || 'logist' });
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const projR = (kData && kData.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
        const oId = kData.folderId || await getOrCreateFolder(kData ? kData.name : "Logist_Users", projR);
        const wId = await getOrCreateFolder(worker, oId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], await getOrCreateFolder(client || "Общее", wId));
        if (image) {
            const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            await drive.files.create({ resource: { name: `${address}_п${entrance}.jpg`, parents: [dId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) } });
        }
        await appendToReport(wId, worker, city, new Date().toISOString().split('T')[0], address, entrance, client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock_shelf, stock_wh, faces, share, ourPrice, compPrice, expDate, pdf, pdfName, startTime, endTime, duration, lat, lon, city } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        let oId = kData.folderId || await getOrCreateFolder(kData ? kData.name : "Merch_Client", MERCH_ROOT_ID);
        const wId = await getOrCreateFolder(worker, oId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], await getOrCreateFolder(city || "Global", wId));
        let pUrl = "No file";
        if (pdf) {
            const buf = Buffer.from(pdf.split(',')[1] || pdf, 'base64');
            const safeName = (pdfName || `${net}_${address}`).replace(/[/\\?%*:|"<>]/g, '-') + '.pdf';
            const f = await drive.files.create({ resource: { name: safeName, parents: [dId] }, media: { mimeType: 'application/pdf', body: Readable.from(buf) }, fields: 'id, webViewLink' });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'writer', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }
        await appendMerchToReport(wId, worker, net, address, stock_shelf||0, stock_wh||0, faces, share, ourPrice, compPrice, expDate, pUrl, startTime, endTime, duration, lat, lon);
        await updateGlobalStockDb(oId, worker, net, address, stock_shelf||0, stock_wh||0, faces, share, ourPrice, compPrice, expDate);
        res.json({ success: true, url: pUrl });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- АДМИНКА И ПЛАТЕЖИ ---

app.get('/api/keys', async (req, res) => res.json(await readDatabase()));
app.get('/api/client-keys', async (req, res) => {
    const keys = await readDatabase();
    res.json(keys.filter(k => String(k.ownerChatId) === String(req.query.chatId)));
});

app.post('/api/keys/add', async (req, res) => {
    let keys = await readDatabase();
    const newK = Math.random().toString(36).substring(2,6).toUpperCase()+'-'+Math.random().toString(36).substring(2,6).toUpperCase();
    const exp = new Date(); exp.setDate(exp.getDate() + parseInt(req.body.days));
    const fId = await getOrCreateFolder(req.body.name, req.body.type === 'merch' ? MERCH_ROOT_ID : MY_ROOT_ID);
    keys.push({ key: newK, name: req.body.name, limit: req.body.limit||5, expiry: exp.toISOString(), workers: [], folderId: fId, type: req.body.type||'merch' });
    await saveDatabase(keys); res.json({ success: true });
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
    if (days == 365) price = kData.limit * 15000;
    const invId = Math.floor(Date.now() / 1000);
    const sign = crypto.createHash('md5').update(`${ROBO_LOGIN}:${price}:${invId}:${ROBO_PASS1}:Shp_chatId=${chatId}:Shp_days=${days}:Shp_key=${key}:Shp_limit=${kData.limit}:Shp_name=${name}:Shp_type=${type}`).digest('hex');
    const payUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${ROBO_LOGIN}&OutSum=${price}&InvId=${invId}&Description=License&SignatureValue=${sign}&Shp_days=${days}&Shp_key=${key}&Shp_chatId=${chatId}&Shp_limit=${kData.limit}&Shp_name=${encodeURIComponent(name)}&Shp_type=${type}${IS_TEST ? '&IsTest=1' : ''}`;
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
            await bot.telegram.sendMessage(Shp_chatId, `🎉 Оплата успешна! Ваш ключ: ${newK}`);
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

// --- ДИЗАЙН ---

app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ADMIN | LOGIST_X</title><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap'); body { background: radial-gradient(circle at top right, #1a1c2c, #010409); color: #fff; font-family: 'Inter', sans-serif; margin: 0; padding: 20px; min-height: 100vh; } .logo-box { background: #f59e0b; color: #000; padding: 5px 15px; border-radius: 8px; font-weight: 900; font-size: 20px; display: inline-block; margin-bottom: 30px; } .card { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 20px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; } .btn { padding: 12px 20px; border-radius: 12px; border: none; font-weight: 700; cursor: pointer; transition: 0.3s; } .del { background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); } .add { background: #f59e0b; color: #000; width: 100%; margin-bottom: 25px; font-size: 16px; }</style></head><body><div class="logo-box">LOGIST X | ПУЛЬТ</div><button class="btn add" onclick="addKey()">+ ДОБАВИТЬ ОБЪЕКТ</button><div id="list">Загрузка...</div><script>async function load(){ const r=await fetch('/api/keys'); const keys=await r.json(); document.getElementById('list').innerHTML=keys.map(k=>\`<div class="card"><div><div style="font-weight:800;font-size:18px;">\${k.name}</div><div style="font-size:12px;opacity:0.5;">\${k.key} | \${k.type}</div></div><button class="btn del" onclick="delKey('\${k.key}')">УДАЛИТЬ</button></div>\`).join(''); } async function addKey(){ const n=prompt("Имя объекта:"); const t=prompt("Тип: logist/merch?","merch"); if(n){ await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,type:t,days:30})}); load(); } } async function delKey(k){ if(confirm("Удалить?")){ await fetch('/api/keys/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k})}); load(); } } load();</script></body></html>`);
});

app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>КАБИНЕТ</title><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap'); body { background: #010409; color: #fff; font-family: 'Inter', sans-serif; padding: 20px; } .expiry-box { background: rgba(245, 158, 11, 0.1); border: 2px solid #f59e0b; padding: 25px; border-radius: 24px; text-align: center; margin-bottom: 30px; } .expiry-date { font-size: 36px; font-weight: 900; color: #f59e0b; display: block; } .worker-card { background: #111; padding: 15px; border-radius: 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #222; }</style></head><body><div id="root">Загрузка...</div><script>async function load(){ const p=new URLSearchParams(window.location.search); const r=await fetch('/api/client-keys?chatId='+p.get('chatId')); const keys=await r.json(); document.getElementById('root').innerHTML=keys.map(k=> \` <div class="expiry-box"><div style="font-size:10px; opacity:0.6;">ЛИЦЕНЗИЯ ДО:</div><span class="expiry-date">\${new Date(k.expiry).toLocaleDateString()}</span><div style="font-weight:800; margin-top:10px;">\${k.name}</div></div> <div style="font-weight:800; margin-bottom:15px; opacity:0.5;">СОТРУДНИКИ:</div> \${(k.workers || []).map(w => \` <div class="worker-card"><span>👤 \${w}</span><button onclick="window.open('/api/open-folder?workerName='+encodeURIComponent('\${w}'))" style="background:#f59e0b;border:none;padding:5px 10px;border-radius:8px;font-weight:800;">ОТЧЕТЫ</button></div> \`).join('')} \`).join(''); } load();</script></body></html>`);
});

app.get('/api/open-folder', async (req, res) => {
    try {
        const q = `name = '${req.query.workerName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const resWorker = await drive.files.list({ q, fields: 'files(id, webViewLink)', orderBy: 'createdTime desc' });
        if (resWorker.data.files.length > 0) res.redirect(resWorker.data.files[0].webViewLink);
        else res.send("Папка не найдена");
    } catch (e) { res.send(e.message); }
});

// --- БОТ ---

bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) return ctx.reply('👑 ПУЛЬТ', { reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    const keys = await readDatabase(); const ck = keys.find(k => String(k.ownerChatId) === String(cid));
    if (ck) return ctx.reply('🏢 КАБИНЕТ', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ДАННЫЕ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    ctx.reply('👋 Введите ваш лицензионный ключ:');
});

bot.on('text', async (ctx) => {
    const cid = ctx.chat.id; if (cid === MY_TELEGRAM_ID) return;
    const txt = ctx.message.text.trim();
    const step = userSteps[cid];
    if (step && step.step === 'name') {
        step.name = txt; step.step = 'limit';
        return ctx.reply("Сколько сотрудников будет работать? (число)");
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
        if(keys[idx].ownerChatId && keys[idx].ownerChatId !== cid) return ctx.reply('Ключ уже занят.'); 
        keys[idx].ownerChatId = cid; await saveDatabase(keys); 
        ctx.reply('✅ АКТИВИРОВАНО!', { reply_markup: { inline_keyboard: [[{ text: "📊 КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    } else ctx.reply('❌ Ключ не найден.');
});

bot.launch().then(() => console.log("--- СЕРВЕР ЗАПУЩЕН ---"));
app.listen(process.env.PORT || 3000);
