Const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
// Лимиты для HD фото и PDF
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

// Auth
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
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
        let data = content.data;
        if (typeof data === 'string') data = JSON.parse(data);
        return data.keys || [];
    } catch (e) { return []; }
}

async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const dataStr = JSON.stringify({ keys }, null, 2);
        const bufferStream = new Readable(); bufferStream.push(dataStr); bufferStream.push(null);
        const media = { mimeType: 'application/json', body: bufferStream };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); } 
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media }); }
    } catch (e) { console.error("DB Error:", e); }
}

// --- ОТЧЕТЫ ЛОГИСТИКИ (БЕЗ ИЗМЕНЕНИЙ) ---

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
            await sheets.spreadsheets.values.update({
                spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
                resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GPS', 'ФОТО']] }
            });
        }
        const gpsLink = (lat && lon) ? `=HYPERLINK("http://maps.google.com/maps?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        const timeNow = new Date().toLocaleTimeString("ru-RU");
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
            resource: { values: [[timeNow, address, entrance, client, workType, price, gpsLink, "ЗАГРУЖЕНО"]] }
        });
    } catch (e) { console.error("Logist Sheet Error:", e); }
}

// --- ОТЧЕТЫ МЕРЧАНДАЙЗИНГА (ОБНОВЛЕННАЯ АНАЛИТИКА) ---

async function appendMerchToReport(workerId, workerName, net, address, stock, shelf, pMy, pComp, pExp, pdfUrl, startTime, endTime, lat, lon) {
    try {
        const reportName = `Мерч_Аналитика_${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId = res.data.files.length > 0 ? res.data.files[0].id : null;
        if (!spreadsheetId) {
            const createRes = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } } });
            spreadsheetId = createRes.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        }

        const sheetTitle = "ОТЧЕТЫ_МЕРЧ";
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ 
                spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', 
                resource: { values: [['ДАТА', 'НАЧАЛО', 'КОНЕЦ', 'ДЛИТЕЛЬНОСТЬ', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ЦЕНА МЫ', 'ЦЕНА КОНК', 'СРОК', 'PDF ОТЧЕТ', 'МЕСТО (GPS)']] } 
            });
        }

        let duration = "-";
        if (startTime && endTime) {
            const [h1, m1] = startTime.split(':').map(Number);
            const [h2, m2] = endTime.split(':').map(Number);
            const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
            duration = diff >= 0 ? `${diff} мин.` : "-";
        }

        const gpsLink = (lat && lon) ? `=HYPERLINK("http://maps.google.com/maps?q=${lat},${lon}"; "ПОСМОТРЕТЬ")` : "Нет GPS";
        const today = new Date().toLocaleDateString("ru-RU");

        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
            resource: { values: [[today, startTime, endTime, duration, net, address, stock, shelf, pMy, pComp, pExp, pdfUrl, gpsLink]] }
        });
    } catch (e) { console.error("Merch Sheet Error:", e); }
}

async function handleLicenseCheck(body) {
    const key = body.licenseKey || body.key;
    const worker = body.workerName || body.worker;
    const keys = await readDatabase();
    const keyData = keys.find(k => k.key === key);
    if (!keyData) return { status: 'error', message: 'Ключ не найден' };
    if (new Date(keyData.expiry) < new Date()) return { status: 'error', message: 'Срок истёк' };
    if (!keyData.workers) keyData.workers = [];
    if (!keyData.workers.includes(worker)) {
        if (keyData.workers.length >= parseInt(keyData.limit)) return { status: 'error', message: 'Лимит мест исчерпан' };
        keyData.workers.push(worker);
        await saveDatabase(keys);
    }
    return { status: 'active', expiry: keyData.expiry };
}

// === API РОУТЫ ===

app.post('/check-license', async (req, res) => {
    try { res.json(await handleLicenseCheck(req.body)); } catch (e) { res.status(500).json({ status: 'error' }); }
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = req.body;
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const ownerName = keyData ? keyData.name : "Неизвестный";
        const ownerId = await getOrCreateFolder(ownerName, MY_ROOT_ID);
        const workerId = await getOrCreateFolder(worker, ownerId);
        const cityId = await getOrCreateFolder(city || "Город", workerId);
        const todayStr = new Date().toISOString().split('T')[0];
        const dateId = await getOrCreateFolder(todayStr, cityId);
        const finalFolderId = await getOrCreateFolder(client || "Общий", dateId);

        if (image) {
            const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            const fileName = `${address} ${entrance || ""}`.trim() + ".jpg";
            await drive.files.create({ resource: { name: fileName, parents: [finalFolderId] }, media: { mimeType: 'image/jpeg', body: bufferStream } });
        }
        await appendToReport(workerId, worker, city, todayStr, address, entrance || "-", client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock, shelf, priceMy, priceComp, expDate, pdf, city, startTime, endTime, lat, lon, targetLat, targetLon } = req.body;

        if (lat && lon && targetLat && targetLon) {
            const dist = getDistance(lat, lon, targetLat, targetLon);
            if (dist > MAX_DISTANCE_METERS) {
                return res.status(403).json({ success: false, error: `Вы слишком далеко (${Math.round(dist)}м).` });
            }
        }

        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const ownerName = keyData ? keyData.name : "Мерч_Клиенты";
        const ownerId = await getOrCreateFolder(ownerName, MERCH_ROOT_ID);
        const workerId = await getOrCreateFolder(worker, ownerId);
        const cityId = await getOrCreateFolder(city || "Орёл", workerId);
        const todayStr = new Date().toISOString().split('T')[0];
        const dateId = await getOrCreateFolder(todayStr, cityId);
        const netId = await getOrCreateFolder(net, dateId);

        let pdfUrl = "Нет файла";
        if (pdf) {
            const buffer = Buffer.from(pdf.split(',')[1], 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            const fileName = `ОТЧЕТ_${address.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;
            const file = await drive.files.create({
                resource: { name: fileName, parents: [netId] },
                media: { mimeType: 'application/pdf', body: bufferStream },
                fields: 'id, webViewLink'
            });
            await drive.permissions.create({ fileId: file.data.id, resource: { role: 'reader', type: 'anyone' } });
            pdfUrl = file.data.webViewLink;
        }

        await appendMerchToReport(workerId, worker, net, address, stock, shelf, priceMy, priceComp, expDate, pdfUrl, startTime, endTime, lat, lon);
        res.json({ success: true, url: pdfUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- АДМИНКА ---
app.get('/api/keys', async (req, res) => { res.json(await readDatabase()); });
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>ADMIN</title>
    <style>body{background:#000;color:#fff;font-family:sans-serif;padding:20px;}.card{background:#111;padding:20px;border-radius:10px;border:1px solid #333;}</style>
    </head><body><div class="card"><h3>LOGIST_X ПАНЕЛЬ</h3><div id="list">Загрузка...</div></div>
    <script>async function load(){ const r=await fetch('/api/keys'); const d=await r.json(); document.getElementById('list').innerHTML=d.map(k=>'<div>'+k.name+': '+k.key+'</div>').join(''); } load();</script>
    </body></html>`);
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID && ctx.message.text === '/start') {
        return ctx.reply('👑 АДМИН-ПАНЕЛЬ', { reply_markup: { inline_keyboard: [[{ text: "ОТКРЫТЬ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    }
});

bot.launch().then(() => console.log("LOGIST_X SERVER ONLINE"));
app.listen(process.env.PORT || 3000);
