const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- СИСТЕМНЫЕ ФУНКЦИИ ---
async function readDatabase() {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return { keys: [] };
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        return content.data;
    } catch (e) { return { keys: [] }; }
}

async function saveDatabase(data) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const media = { mimeType: 'application/json', body: JSON.stringify(data, null, 2) };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); } 
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media }); }
    } catch (e) { console.error("DB Save Error", e); }
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

// --- ТАБЛИЦА МЕРЧ (АНАЛИТИКА) ---
async function appendMerchToReport(parentId, workerName, net, address, stock, shelf, pMy, pComp, pExp, pdfUrl, startTime, endTime, lat, lon) {
    try {
        const reportName = `Мерч_Аналитика_${workerName}`;
        const q = `name = '${reportName}' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId = res.data.files.length > 0 ? res.data.files[0].id : null;
        if (!spreadsheetId) {
            const cr = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } } });
            spreadsheetId = cr.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: parentId, removeParents: 'root' });
        }
        const sheetTitle = "ОТЧЕТЫ_МЕРЧ";
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ДАТА', 'НАЧАЛО', 'КОНЕЦ', 'ДЛИТЕЛЬНОСТЬ', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ЦЕНА МЫ', 'ЦЕНА КОНК', 'СРОК', 'PDF ОТЧЕТ', 'GPS']] } });
        }
        let dur = "-"; 
        if (startTime && endTime) { 
            const [h1, m1] = startTime.split(':').map(Number); 
            const [h2, m2] = endTime.split(':').map(Number); 
            const diff = (h2*60+m2)-(h1*60+m1); 
            dur = diff >= 0 ? `${diff} мин.` : "-"; 
        }
        const gps = (lat && lon) ? `=HYPERLINK("http://googleusercontent.com/maps.google.com/maps?q=${lat},${lon}"; "ПОСМОТРЕТЬ")` : "Нет";
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleDateString("ru-RU"), startTime, endTime, dur, net, address, stock, shelf, pMy, pComp, pExp, pdfUrl, gps]] } });
    } catch (e) { console.error("Merch Table Error", e); }
}

// --- ТАБЛИЦА ЛОГИСТ (ОТЧЕТ И ДЕНЬГИ) ---
async function appendToReport(parentId, workerName, city, dateStr, address, entrance, client, workType, price, lat, lon) {
    try {
        const reportName = `Отчет ${workerName}`;
        const q = `name = '${reportName}' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId = res.data.files.length > 0 ? res.data.files[0].id : null;
        if (!spreadsheetId) {
            const createRes = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } } });
            spreadsheetId = createRes.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: parentId, removeParents: 'root' });
        }
        const sheetTitle = `${city}_${dateStr}`;
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА (₽)', 'GPS КАРТЫ']] } });
        }
        const gpsLink = (lat && lon) ? `=HYPERLINK("http://googleusercontent.com/maps.google.com/maps?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleTimeString("ru-RU"), address, entrance, client, workType, price, gpsLink]] } });
    } catch (e) { console.error("Logist Table Error", e); }
}

// === API РОУТЫ ===

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = req.body;
        const db = await readDatabase();
        const kData = db.keys.find(k => k.workers && k.workers.includes(worker)) || db.keys.find(k => k.key === 'DEV-MASTER-999');
        const dateStr = new Date().toISOString().split('T')[0];

        const oId = await getOrCreateFolder(kData ? kData.name : "Unknown", MY_ROOT_ID);
        const cityId = await getOrCreateFolder(city || "Без города", oId);
        const dateId = await getOrCreateFolder(dateStr, cityId);
        const wId = await getOrCreateFolder(worker, dateId);

        if (image) {
            const base64Data = image.includes(',') ? image.split(',')[1] : image;
            const photoName = `${address} ${entrance || ""}`.trim();
            await drive.files.create({ resource: { name: `${photoName}.jpg`, parents: [wId] }, media: { mimeType: 'image/jpeg', body: Readable.from(Buffer.from(base64Data, 'base64')) } });
        }
        await appendToReport(oId, worker, city, dateStr, address, entrance || "-", client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, city, address, stock, shelf, priceMy, priceComp, expDate, pdf, startTime, endTime, lat, lon } = req.body;
        const db = await readDatabase();
        const kData = db.keys.find(k => k.workers && k.workers.includes(worker)) || db.keys.find(k => k.key === 'DEV-MASTER-999');
        const dateStr = new Date().toISOString().split('T')[0];

        const oId = await getOrCreateFolder(kData ? kData.name : "Merch_Objects", MERCH_ROOT_ID);
        const cityId = await getOrCreateFolder(city || "Без города", oId);
        const dateId = await getOrCreateFolder(dateStr, cityId);
        const wId = await getOrCreateFolder(worker, dateId);

        let pUrl = "Нет файла";
        if (pdf) {
            const base64Data = pdf.includes(',') ? pdf.split(',')[1] : pdf;
            const f = await drive.files.create({ resource: { name: `ОТЧЕТ_${address}.pdf`, parents: [wId] }, media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(base64Data, 'base64')) }, fields: 'id, webViewLink' });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }
        await appendMerchToReport(oId, worker, net, address, stock, shelf, priceMy, priceComp, expDate, pUrl, startTime, endTime, lat, lon);
        res.json({ success: true, url: pUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- КАБИНЕТЫ ---
app.get('/dashboard', async (req, res) => {
    const userId = req.query.userId;
    const db = await readDatabase();
    if (userId == MY_TELEGRAM_ID) {
        res.send(`<html><body style="background:#0d1117;color:#fff;font-family:sans-serif;padding:20px;"><h2>👑 АДМИН ПАНЕЛЬ</h2>${db.keys.map(k => `<div style="background:#161b22;padding:15px;margin:10px;border-radius:10px;border:1px solid #30363d;"><b>ОБЪЕКТ: ${k.name}</b><br>Ключ: ${k.key}<br>Люди: ${k.workers ? k.workers.join(', ') : 'нет'}</div>`).join('')}</body></html>`);
    } else {
        const myKey = db.keys.find(k => k.ownerId == userId);
        if (myKey) {
            res.send(`<html><body style="background:#0d1117;color:#fff;font-family:sans-serif;padding:20px;"><h2>📊 КАБИНЕТ НАЧАЛЬНИКА: ${myKey.name}</h2><div style="background:#161b22;padding:15px;border-radius:10px;border:1px solid #58a6ff;">Ключ: ${myKey.key}<br>Лимит: ${myKey.limit} чел.<br>Ваши сотрудники: ${myKey.workers ? myKey.workers.join(', ') : 'ожидание активации'}</div><p>Отчеты доступны в вашей папке Google Drive.</p></body></html>`);
        } else { res.send("Доступ ограничен."); }
    }
});

// --- ТЕЛЕГРАМ БОТ ---
bot.start(async (ctx) => {
    const userId = ctx.chat.id;
    const db = await readDatabase();
    const isOwner = (userId == MY_TELEGRAM_ID);
    const isClient = db.keys.some(k => k.ownerId == userId);
    if (isOwner || isClient) {
        ctx.reply('👋 Logist X: Доступ к кабинету открыт.', { reply_markup: { inline_keyboard: [[{ text: "ОТКРЫТЬ КАБИНЕТ", web_app: { url: `${SERVER_URL}/dashboard?userId=${userId}` } }]] } });
    } else { ctx.reply('👋 Введите: /activate [ваш_ключ]'); }
});

bot.command('activate', async (ctx) => {
    const keyStr = ctx.message.text.split(' ')[1];
    let db = await readDatabase();
    const idx = db.keys.findIndex(k => k.key === keyStr);
    if (idx !== -1 && !db.keys[idx].ownerId) {
        db.keys[idx].ownerId = ctx.chat.id;
        await saveDatabase(db);
        ctx.reply('✅ Ключ активирован! Нажмите /start для входа в кабинет.');
    } else { ctx.reply('❌ Ошибка активации.'); }
});

bot.launch().then(() => console.log("SERVER READY"));
app.listen(process.env.PORT || 3000);
