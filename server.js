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

// --- НАСТРОЙКИ (ОРИГИНАЛ) ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const BARCODE_DB_NAME = 'barcodes_db.json'; 
const SHOP_ITEMS_DB = 'shop_items_db.json'; 
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
        return Array.isArray(data) ? data : (data.keys || []);
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
    } catch (e) { console.error("Save Error:", e); }
}

// --- ОТЧЕТЫ (ТАБЛИЦЫ) ---

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
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ДАТА', 'НАЧАЛО', 'КОНЕЦ', 'МИН', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ДОЛЯ %', 'ЦЕНА МЫ', 'ЦЕНА КОНК', 'СРОК', 'PDF', 'GPS']] } });
        }
        const gps = (lat && lon) ? `=HYPERLINK("http://googleusercontent.com/maps.google.com/search?q=${lat},${lon}"; "MAP")` : "Нет";
        const pdfLink = `=HYPERLINK("${pdfUrl}"; "СМОТРЕТЬ")`;
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleDateString("ru-RU"), startTime, endTime, duration, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdfLink, gps]] } });
    } catch (e) { console.error("Merch Sheets Error:", e); }
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
        const gpsLink = (lat && lon) ? `=HYPERLINK("http://googleusercontent.com/maps.google.com/search?q=${lat},${lon}"; "MAP")` : "Нет";
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleTimeString("ru-RU"), address, entrance, client, workType, price, gpsLink, "ЗАГРУЖЕНО"]] } });
    } catch (e) { console.error("Logist Sheets Error:", e); }
}

// --- РОУТЫ СИСТЕМЫ ---

app.get('/get-catalog', async (req, res) => {
    try {
        const { key } = req.query;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId) return res.json({});
        const catalog = await readJsonFromDrive(kData.folderId, BARCODE_DB_NAME);
        res.json(catalog);
    } catch (e) { res.json({}); }
});

app.post('/save-product', async (req, res) => {
    try {
        const { barcode, name, key } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId) return res.status(403).send("Forbidden");
        const catalog = await readJsonFromDrive(kData.folderId, BARCODE_DB_NAME);
        catalog[barcode] = { name, date: new Date().toISOString() };
        await saveJsonToDrive(kData.folderId, BARCODE_DB_NAME, catalog);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/get-shop-stock', async (req, res) => {
    try {
        const { key, addr } = req.query;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId) return res.json([]);
        const shopDb = await readJsonFromDrive(kData.folderId, SHOP_ITEMS_DB);
        res.json(shopDb[addr] || []);
    } catch (e) { res.json([]); }
});

app.get('/get-planogram', async (req, res) => {
    try {
        const { addr, key } = req.query;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId) return res.json({ exists: false });
        const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
        const fileName = `${addr.replace(/[^а-яёa-z0-9]/gi, '_')}.jpg`;
        const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
        const search = await drive.files.list({ q, fields: 'files(id, webViewLink, webContentLink)' });
        if (search.data.files.length > 0) {
            res.json({ exists: true, url: search.data.files[0].webContentLink || search.data.files[0].webViewLink });
        } else res.json({ exists: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/upload-planogram', async (req, res) => {
    try {
        const { addr, image, key } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        if (!kData || !kData.folderId) return res.status(403).json({ error: "No Folder" });
        const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
        const fileName = `${addr.replace(/[^а-яёa-z0-9]/gi, '_')}.jpg`;
        const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        await drive.files.create({ resource: { name: fileName, parents: [planFolderId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdf, startTime, endTime, duration, lat, lon, city, items, key } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key) || keys.find(k => k.workers && k.workers.includes(worker));
        if (!kData) return res.status(403).json({ error: "No License" });

        if (items) {
            const shopDb = await readJsonFromDrive(kData.folderId, SHOP_ITEMS_DB);
            shopDb[address] = items.map(i => ({ bc: i.bc, name: i.name }));
            await saveJsonToDrive(kData.folderId, SHOP_ITEMS_DB, shopDb);
        }

        const oId = kData.folderId || await getOrCreateFolder(kData.name, MERCH_ROOT_ID);
        const wId = await getOrCreateFolder(worker, oId);
        const cityId = await getOrCreateFolder(city || "Без города", wId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], cityId);
        
        let pUrl = "Нет фото";
        if (pdf) {
            const buf = Buffer.from(pdf.split(',')[1] || pdf, 'base64');
            const f = await drive.files.create({ resource: { name: `ОТЧЕТ_${address}.jpg`, parents: [dId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) }, fields: 'id, webViewLink' });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'writer', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }
        await appendMerchToReport(wId, worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pUrl, startTime, endTime, duration, lat, lon);
        res.json({ success: true, url: pUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
        const kData = keys.find(k => k.workers && k.workers.includes(curW));
        const projR = (kData && kData.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
        const oId = kData.folderId || await getOrCreateFolder(kData ? kData.name : "System", projR);
        const wId = await getOrCreateFolder(curW, oId);
        const finalId = await getOrCreateFolder(client || "Общее", wId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], finalId);
        if (image) {
            const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            await drive.files.create({ resource: { name: `${address}.jpg`, parents: [dId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) } });
        }
        await appendToReport(wId, curW, city, new Date().toISOString().split('T')[0], address, entrance, client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

// --- ТЕЛЕГРАМ БОТ ---

app.post('/check-license', async (req, res) => {
    const { licenseKey, workerName } = req.body;
    const keys = await readDatabase();
    const kData = keys.find(k => k.key === licenseKey);
    if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
    if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
    if (!kData.workers) kData.workers = [];
    if (!kData.workers.includes(workerName)) {
        if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест исчерпан' });
        kData.workers.push(workerName); await saveDatabase(keys);
    }
    res.json({ status: 'active', expiry: kData.expiry, type: kData.type || 'logist' });
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
            await bot.telegram.sendMessage(Shp_chatId, `🎉 Ключ готов: ${newK}`);
        } else {
            const idx = keys.findIndex(k => k.key === Shp_key);
            if (idx !== -1) {
                let d = new Date(keys[idx].expiry); if (d < new Date()) d = new Date();
                d.setDate(d.getDate() + parseInt(Shp_days)); keys[idx].expiry = d.toISOString();
                await bot.telegram.sendMessage(Shp_chatId, `✅ Продлено!`);
            }
        }
        await saveDatabase(keys); return res.send(`OK${InvId}`);
    }
    res.send("error");
});

// --- HTML ПАНЕЛИ (ОРИГИНАЛ) ---

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
    <div style="margin-bottom:20px; font-weight:900; font-size: 18px;">📦 ПАНЕЛЬ УПРАВЛЕНИЯ</div>
    <div class="card">
        <b style="display: block; margin-bottom: 10px;">ДОБАВИТЬ ОБЪЕКТ</b>
        <input id="n" placeholder="Название объекта">
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
                    <div class="gold-text">\${k.key} [\${k.type || 'logist'}]</div>
                    <div style="margin:8px 0; font-weight: 600;">\${k.name}</div>
                    <div style="font-size:12px; opacity:0.8">Лимит: \${k.limit} | До: \${new Date(k.expiry).toLocaleDateString()}</div>
                    <div style="font-size:11px; margin:10px 0; color:#8b949e">\${k.workers && k.workers.length ? k.workers.join(', ') : 'НЕТ ЛЮДЕЙ'}</div>
                    <div class="row">
                        <button class="btn btn-gold" onclick="ext('\${k.key}', 30)">+30д</button>
                        <button class="btn btn-gold" onclick="ext('\${k.key}', 90)">+90д</button>
                    </div>
                    <button class="btn btn-red" style="margin-top:10px; opacity:0.5" onclick="del('\${k.key}')">УДАЛИТЬ</button>
                </div>\`;
            }).join('');
        }
        async function add(){
            const n = document.getElementById('n').value;
            const l = document.getElementById('l').value;
            const t = document.getElementById('t').value;
            await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,limit:l,days:30,type:t})});
            load();
        }
        async function ext(key, days){
            await fetch('/api/keys/extend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key, days})});
            load();
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
        body { background: #010409; color: #fff; font-family: 'Inter', sans-serif; padding: 20px; }
        .logo-box { background: #f59e0b; color: #000; padding: 5px 10px; border-radius: 8px; font-weight: 800; display: inline-block; margin-bottom: 20px; }
        .card { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 25px; margin-bottom: 20px; }
        .obj-name { font-size: 20px; font-weight: 800; margin-bottom: 5px; }
        .stats { display: flex; gap: 10px; margin: 20px 0; }
        .stat-item { background: rgba(0,0,0,0.2); padding: 10px; border-radius: 12px; flex: 1; text-align: center; }
        .stat-val { display: block; font-weight: 800; color: #f59e0b; }
        .worker-item { display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .btn-folder { background: #f59e0b; color: #000; padding: 5px 10px; border-radius: 8px; text-decoration: none; font-size: 11px; font-weight: 800; }
        .grid-prices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 20px; }
        .price-card { background: rgba(0,0,0,0.3); padding: 15px; border-radius: 12px; text-align: center; border: 1px solid rgba(255,255,255,0.05); }
    </style>
</head>
<body>
    <div class="logo-box">LOGIST X</div>
    <div id="root"></div>
    <script>
        async function load(){
            const cid = new URLSearchParams(window.location.search).get('chatId');
            const r = await fetch('/api/client-keys?chatId=' + cid);
            const keys = await r.json();
            document.getElementById('root').innerHTML = keys.map(k => {
                const days = Math.ceil((new Date(k.expiry) - new Date()) / (1000*60*60*24));
                return \`<div class="card">
                    <div class="obj-name">\${k.name} (\${k.type || 'logist'})</div>
                    <div style="opacity:0.4; font-size:11px;">Ключ: \${k.key}</div>
                    <div class="stats">
                        <div class="stat-item"><span class="stat-val">\${days > 0 ? days : 0}</span>Дней</div>
                        <div class="stat-item"><span class="stat-val">\${k.workers.length}/\${k.limit}</span>Людей</div>
                    </div>
                    <div>\${k.workers.map(w => \`<div class="worker-item"><span>\${w}</span><a class="btn-folder" href="/api/open-folder?workerName=\${encodeURIComponent(w)}" target="_blank">АРХИВ</a></div>\`).join('')}</div>
                    <div class="grid-prices">
                        <div class="price-card" onclick="req('\${k.key}','\${k.name}',30,'\text{\${k.type}}')"><b>30 дн.</b><br>\${k.limit*1500}₽</div>
                        <div class="price-card" onclick="req('\${k.key}','\text{\${k.name}}',90,'\text{\${k.type}}')"><b>90 дн.</b><br>\${k.limit*4050}₽</div>
                    </div>
                </div>\`;
            }).join('');
        }
        async function req(key, name, days, type){
            const cid = new URLSearchParams(window.location.search).get('chatId');
            const r = await fetch('/api/notify-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,name,days,chatId:cid,type})});
            const res = await r.json(); window.location.href = res.payUrl;
        }
        load();
    </script>
</body>
</html>`);
});

// --- ТЕЛЕГРАМ БОТ ---

bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) return ctx.reply('👑 АДМИН', { reply_markup: { inline_keyboard: [[{ text: "ОБЪЕКТЫ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    const keys = await readDatabase(); const ck = keys.find(k => String(k.ownerChatId) === String(cid));
    if (ck) return ctx.reply('🏢 КАБИНЕТ', { reply_markup: { inline_keyboard: [[{ text: "ДАННЫЕ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    ctx.reply(`👋 Logist X:`, { reply_markup: { inline_keyboard: [[{ text: "КУПИТЬ", callback_data: "buy_new" }], [{ text: "ЕСТЬ КЛЮЧ", callback_data: "have_key" }]] } });
});

bot.action('buy_new', (ctx) => {
    userSteps[ctx.chat.id] = { step: 'type' };
    ctx.reply("Тип проекта:", { reply_markup: { inline_keyboard: [[{ text: "ЛОГИСТ", callback_data: "set_type_logist" }], [{ text: "МЕРЧ", callback_data: "set_type_merch" }]] } });
});

bot.action(/set_type_(.+)/, (ctx) => {
    userSteps[ctx.chat.id] = { type: ctx.match[1], step: 'name' }; ctx.reply("Название:");
});

bot.on('text', async (ctx) => {
    const cid = ctx.chat.id; if (cid === MY_TELEGRAM_ID) return; 
    const step = userSteps[cid];
    if (step && step.step === 'name') { step.name = ctx.message.text; step.step = 'limit'; return ctx.reply("Лимит сотрудников:"); }
    if (step && step.step === 'limit') {
        const r = await fetch(SERVER_URL + '/api/notify-admin', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key: "NEW_USER", name: step.name, days: 30, limit: ctx.message.text, chatId: cid, type: step.type }) });
        const res = await r.json(); ctx.reply("Оплата:", { reply_markup: { inline_keyboard: [[{ text: "ОПЛАТИТЬ", url: res.payUrl }]] } });
        delete userSteps[cid]; return;
    }
    const key = ctx.message.text.toUpperCase(); let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) { keys[idx].ownerChatId = cid; await saveDatabase(keys); ctx.reply('✅'); } else ctx.reply('❌');
});

bot.launch();
app.listen(process.env.PORT || 3000);
