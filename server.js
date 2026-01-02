const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');
const axios = require('axios'); // ОБЯЗАТЕЛЬНО: добавь это в package.json

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

// --- НАСТРОЙКИ (SERVER GS) ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';
const MAX_DISTANCE_METERS = 500; 

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- ФУНКЦИЯ ПОИСКА КООРДИНАТ ПО АДРЕСУ ---
async function getCoords(city, addr) {
    try {
        const fullAddress = `${city}, ${addr}`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`;
        const response = await axios.get(url, { headers: { 'User-Agent': 'LogistX_App' } });
        if (response.data && response.data.length > 0) {
            return { lat: parseFloat(response.data[0].lat), lon: parseFloat(response.data[0].lon) };
        }
    } catch (e) { console.error("Ошибка геокодинга:", e); }
    return null;
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const f1 = lat1 * Math.PI/180; const f2 = lat2 * Math.PI/180;
    const df = (lat2-lat1) * Math.PI/180; const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(df/2) * Math.sin(df/2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2) * Math.sin(dl/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function getOrCreateFolder(rawName, parentId) {
    try {
        const name = String(rawName).trim(); 
        const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const file = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
        return file.data.id;
    } catch (e) { return parentId; }
}

async function readDatabase() {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return [];
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        return content.data.keys || [];
    } catch (e) { return []; }
}

async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const media = { mimeType: 'application/json', body: JSON.stringify({ keys }, null, 2) };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); } 
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media }); }
    } catch (e) { console.error("DB Error", e); }
}

// --- ОТЧЕТЫ ЛОГИСТИКИ (ТВОЙ РАБОЧИЙ КОД) ---
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
        const gpsLink = (lat && lon) ? `=HYPERLINK("http://googleusercontent.com/maps.google.com/maps?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleTimeString("ru-RU"), address, entrance, client, workType, price, gpsLink, "ЗАГРУЖЕНО"]] } });
    } catch (e) { console.error("Logist Error", e); }
}

// --- ОТЧЕТЫ МЕРЧАНДАЙЗИНГА (ОБНОВЛЕНО) ---
async function appendMerchToReport(workerId, workerName, net, address, stock, shelf, share, pMy, pComp, pExp, pdfUrl, duration, lat, lon) {
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
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ДАТА', 'ВРЕМЯ В МАГАЗИНЕ', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ДОЛЯ ПОЛКИ %', 'ЦЕНА МЫ', 'ЦЕНА КОНК', 'СРОК', 'PDF ОТЧЕТ', 'GPS']] } });
        }
        const gps = (lat && lon) ? `=HYPERLINK("http://googleusercontent.com/maps.google.com/maps?q=${lat},${lon}"; "ПОСМОТРЕТЬ")` : "Нет";
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleDateString("ru-RU"), duration, net, address, stock, shelf, share + '%', pMy, pComp, pExp, pdfUrl, gps]] } });
    } catch (e) { console.error("Merch Error", e); }
}

// === API РОУТЫ ===
app.post('/check-license', async (req, res) => {
    try {
        const { licenseKey, workerName } = req.body; const keys = await readDatabase(); const kData = keys.find(k => k.key === licenseKey);
        if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
        if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
        if (!kData.workers) kData.workers = [];
        if (!kData.workers.includes(workerName)) { if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест' }); kData.workers.push(workerName); await saveDatabase(keys); }
        res.json({ status: 'active', expiry: kData.expiry });
    } catch (e) { res.status(500).json({ status: 'error' }); }
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = req.body;
        const keys = await readDatabase(); const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const oId = await getOrCreateFolder(kData ? kData.name : "Unknown", MY_ROOT_ID);
        const wId = await getOrCreateFolder(worker, oId); const cId = await getOrCreateFolder(city || "City", wId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], cId);
        const fId = await getOrCreateFolder(client || "General", dId);
        if (image) { const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64'); await drive.files.create({ resource: { name: `${address} ${entrance||""}.jpg`, parents: [fId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) } }); }
        await appendToReport(wId, worker, city, new Date().toISOString().split('T')[0], address, entrance || "-", client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post('/merch-upload', async (req, res) => {
    try {
        let { worker, net, city, address, stock, faces, share, priceMy, priceComp, expDate, pdf, duration, lat, lon, targetLat, targetLon } = req.body;

        // Автопоиск координат, если их нет
        if (!targetLat || targetLat === 0) {
            const found = await getCoords(city || "Орёл", address);
            if (found) { targetLat = found.lat; targetLon = found.lon; }
        }

        // Проверка дистанции
        if (lat && lon && targetLat && targetLon) {
            const dist = getDistance(lat, lon, targetLat, targetLon);
            if (dist > MAX_DISTANCE_METERS) return res.status(403).json({ success: false, error: "Вы слишком далеко от магазина!" });
        }

        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const oId = await getOrCreateFolder(kData ? kData.name : "Merch", MERCH_ROOT_ID);
        const wId = await getOrCreateFolder(worker, oId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], wId);
        const nId = await getOrCreateFolder(net, dId);
        
        let pUrl = "Нет файла";
        if (pdf) {
            const buf = Buffer.from(pdf.split(',')[1], 'base64');
            const f = await drive.files.create({ resource: { name: `ОТЧЕТ_${address}.pdf`, parents: [nId] }, media: { mimeType: 'application/pdf', body: Readable.from(buf) }, fields: 'id, webViewLink' });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }
        await appendMerchToReport(wId, worker, net, address, stock, faces, share, priceMy, priceComp, expDate, pUrl, duration, lat, lon);
        res.json({ success: true, url: pUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ADMIN</title><style>body{background:#000;color:#fff;font-family:sans-serif;padding:20px;} .card{background:#111;padding:15px;border-radius:10px;border:1px solid #333;margin-bottom:10px;}</style></head><body><h3>LOGIST_X PANEL</h3><div id="l">Загрузка...</div><script>async function load(){ const r=await fetch('/api/keys'); const d=await r.json(); document.getElementById('l').innerHTML=d.map(k=>'<div class="card"><b>'+k.name+'</b><br>'+k.key+'</div>').join(''); } load();</script></body></html>`);
});

app.get('/api/keys', async (req, res) => { res.json(await readDatabase()); });

bot.start((ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) {
        ctx.reply('👑 АДМИН-ПАНЕЛЬ LOGIST_X', { reply_markup: { inline_keyboard: [[{ text: "ОТКРЫТЬ УПРАВЛЕНИЕ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    } else { ctx.reply('👋 Добро пожаловать в Logist X.'); }
});

bot.launch().then(() => console.log("SERVER ONLINE")).catch(e => console.error("Bot Error", e));
app.listen(process.env.PORT || 3000);
