const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
// Лимиты для работы с HD фото и PDF отчетами
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

// Авторизация Google
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- БАЗОВЫЕ ФУНКЦИИ ---
async function getOrCreateFolder(rawName, parentId) {
    try {
        const name = String(rawName).trim(); 
        const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q, fields: 'files(id, trashed)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const fileMetadata = { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] };
        const file = await drive.files.create({ resource: fileMetadata, fields: 'id' });
        return file.data.id;
    } catch (e) { return parentId; }
}

async function readDatabase() {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return [];
        const fileId = res.data.files[0].id;
        const content = await drive.files.get({ fileId, alt: 'media' });
        let data = content.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e) { return []; } }
        let keys = data.keys || [];
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
        const dataStr = JSON.stringify({ keys: keys }, null, 2);
        const bufferStream = new Readable(); bufferStream.push(dataStr); bufferStream.push(null);
        const media = { mimeType: 'application/json', body: bufferStream };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media: media }); } 
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media: media }); }
    } catch (e) { console.error("DB Error:", e); }
}

// --- ОТЧЕТЫ ЛОГИСТИКА ---
async function appendToReport(workerId, workerName, city, dateStr, address, entrance, client, workType, price, lat, lon) {
    try {
        const reportName = `Отчет ${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId;
        if (res.data.files.length === 0) {
            const createRes = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } }, fields: 'spreadsheetId' });
            spreadsheetId = createRes.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        } else { spreadsheetId = res.data.files[0].id; }
        const sheetTitle = `${city}_${dateStr}`;
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({
                spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
                resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GPS', 'ФОТО']] }
            });
        }
        let gpsValue = (lat && lon) ? `=HYPERLINK("http://maps.google.com/?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        const timeNow = new Date().toLocaleTimeString("ru-RU");
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
            resource: { values: [[timeNow, address, entrance, client, workType, price, gpsValue, "ЗАГРУЖЕНО"]] }
        });
    } catch (e) { console.error("Logist Report Error:", e); }
}

// --- ОТЧЕТЫ МЕРЧАНДАЙЗИНГ ---
async function appendMerchToReport(workerId, workerName, net, address, stock, shelf, pMy, pComp, pExp, pdfUrl) {
    try {
        const reportName = `Мерч_Аналитика_${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId;
        if (res.data.files.length === 0) {
            const createRes = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } }, fields: 'spreadsheetId' });
            spreadsheetId = createRes.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        } else { spreadsheetId = res.data.files[0].id; }

        const timeNow = new Date().toLocaleString("ru-RU");
        const sheetTitle = "ОТЧЕТЫ_МЕРЧ";
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ДАТА/ВРЕМЯ', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ЦЕНА (МЫ)', 'ЦЕНА (КОНК)', 'СРОК', 'PDF ОТЧЕТ']] } });
        }
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[timeNow, net, address, stock, shelf, pMy || 0, pComp || 0, pExp || "-", pdfUrl]] } });
    } catch (e) { console.error("Merch Report Error:", e); }
}

async function handleLicenseCheck(body) {
    const { licenseKey, workerName } = body;
    const keys = await readDatabase();
    const keyData = keys.find(k => k.key === licenseKey);
    if (!keyData) return { status: 'error', message: 'Ключ не найден' };
    if (new Date(keyData.expiry) < new Date()) return { status: 'error', message: 'Срок истёк' };
    if (!keyData.workers) keyData.workers = [];
    if (!keyData.workers.includes(workerName)) {
        if (keyData.workers.length >= parseInt(keyData.limit)) return { status: 'error', message: 'Лимит мест исчерпан' };
        keyData.workers.push(workerName);
        await saveDatabase(keys);
    }
    return { status: 'active', expiry: keyData.expiry };
}

// === API РОУТЫ ===
app.post('/check-license', async (req, res) => {
    try { res.json(await handleLicenseCheck(req.body)); } 
    catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

app.post('/upload', async (req, res) => {
    try {
        const body = req.body;
        if (body.action === 'check_license') return res.json(await handleLicenseCheck(body));
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = body;
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const ownerId = await getOrCreateFolder(keyData ? keyData.name : "Неизвестный", MY_ROOT_ID);
        const workerId = await getOrCreateFolder(worker || "Работник", ownerId);
        const cityId = await getOrCreateFolder(city || "Город", workerId);
        const todayStr = new Date().toISOString().split('T')[0]; 
        const dateFolderId = await getOrCreateFolder(todayStr, cityId);
        const finalFolderId = await getOrCreateFolder(client || "Общий", dateFolderId);
        if (image) {
            const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            const fileName = `${address || "Без адреса"} ${entrance || ""}.jpg`.trim();
            await drive.files.create({ resource: { name: fileName, parents: [finalFolderId] }, media: { mimeType: 'image/jpeg', body: bufferStream } });
        }
        await appendToReport(workerId, worker, city, todayStr, address, entrance || "-", client || "Общий", workType || "Не указан", price || 0, lat, lon);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

// РОУТ МЕРЧАНДАЙЗЕРА (С ИСПРАВЛЕННЫМ PDF)
app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock, shelf, priceMy, priceComp, expDate, pdf, city } = req.body;
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        
        const ownerId = await getOrCreateFolder(keyData ? keyData.name : "Мерч_Клиенты", MERCH_ROOT_ID);
        const workerId = await getOrCreateFolder(worker || "Мерчандайзер", ownerId);
        const cityId = await getOrCreateFolder(city || "Орёл", workerId);
        const todayStr = new Date().toISOString().split('T')[0]; 
        const dateFolderId = await getOrCreateFolder(todayStr, cityId);
        const netFolderId = await getOrCreateFolder(net || "Общая сеть", dateFolderId);

        let pdfUrl = "Нет файла";
        if (pdf) {
            const base64Data = pdf.includes(',') ? pdf.split(',')[1] : pdf;
            const buffer = Buffer.from(base64Data, 'base64');
            const bufferStream = new Readable();
            bufferStream.push(buffer);
            bufferStream.push(null);
            
            const safeAddress = address.replace(/[/\\?%*:|"<>]/g, '-').trim();
            const fileName = `ОТЧЕТ_${safeAddress}.pdf`;
            
            const file = await drive.files.create({ 
                requestBody: { name: fileName, parents: [netFolderId], mimeType: 'application/pdf' }, 
                media: { mimeType: 'application/pdf', body: bufferStream }, 
                fields: 'id, webViewLink' 
            });

            await drive.permissions.create({
                fileId: file.data.id,
                requestBody: { role: 'reader', type: 'anyone' }
            });

            pdfUrl = file.data.webViewLink;
        }

        await appendMerchToReport(workerId, worker, net, address, stock, shelf, priceMy, priceComp, expDate, pdfUrl);
        res.json({ success: true, url: pdfUrl });
    } catch (e) { 
        console.error("PDF ERROR:", e.message);
        res.status(500).json({ success: false, error: e.message }); 
    }
});

app.get('/api/keys', async (req, res) => res.json(await readDatabase()));

app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body;
    let keys = await readDatabase();
    const newKey = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const expiryDate = new Date(); expiryDate.setDate(expiryDate.getDate() + parseInt(days));
    keys.push({ key: newKey, name, limit, expiry: expiryDate.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(keys); res.json({ success: true });
});

// ОСТАЛЬНЫЕ РОУТЫ И БОТ
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    if (chatId === MY_TELEGRAM_ID) {
        return ctx.reply('👑 АДМИН ПАНЕЛЬ', { reply_markup: { inline_keyboard: [[{ text: "📦 КЛЮЧИ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    }
    ctx.reply('👋 Введите ключ доступа:');
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return;
    const key = ctx.message.text.trim();
    const keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) {
        keys[idx].ownerChatId = ctx.chat.id; await saveDatabase(keys);
        ctx.reply('✅ ДОСТУП ОТКРЫТ!');
    } else ctx.reply('Ключ не найден.');
});

bot.launch().then(() => console.log("SERVER GS: READY"));
app.listen(process.env.PORT || 3000);
