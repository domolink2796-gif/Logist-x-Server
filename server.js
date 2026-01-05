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
const MAX_DISTANCE_METERS = 600; 

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

// --- БД Штрих-кодов (Локальная в папке клиента) ---

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

// --- ПЛАНОГРАММЫ (Локальная в папке клиента) ---

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
    } catch (e) { console.error("Planogram DB Save Error:", e); }
}

// --- ЗАПИСЬ В ТАБЛИЦЫ ---

// LOGIST X REPORT
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
        const gpsLink = (lat && lon) ? `=HYPERLINK("http://maps.google.com/?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleTimeString("ru-RU"), address, entrance, client, workType, price, gpsLink, "ЗАГРУЖЕНО"]] } });
    } catch (e) { console.error("Logist Error:", e); }
}

// MERCH X REPORT (ОБНОВЛЕННАЯ: С РАЗДЕЛЕНИЕМ ПОЛКА/СКЛАД)
async function appendMerchToReport(workerId, workerName, net, address, stockShelf, stockWh, faces, share, ourPrice, compPrice, expDate, pdfUrl, startTime, endTime, duration, lat, lon) {
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
        
        // Создаем заголовки, если листа нет (ТЕПЕРЬ С РАЗДЕЛЕНИЕМ ПОЛКА/СКЛАД)
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ 
                spreadsheetId, 
                range: `${sheetTitle}!A1`, 
                valueInputOption: 'USER_ENTERED', 
                resource: { values: [['ДАТА', 'НАЧАЛО', 'КОНЕЦ', 'ВРЕМЯ В ТТ', 'СЕТЬ', 'АДРЕС', 'ПОЛКА', 'СКЛАД', 'СУММА', 'ФЕЙСИНГ', 'ДОЛЯ %', 'ЦЕНА МЫ', 'ЦЕНА КОНК', 'СРОК', 'PDF ОТЧЕТ', 'GPS']] } 
            });
        }
        
        const gps = (lat && lon) ? `=HYPERLINK("http://maps.google.com/?q=${lat},${lon}"; "ПОСМОТРЕТЬ")` : "Нет";
        const pdfLink = `=HYPERLINK("${pdfUrl}"; "ОТЧЕТ ФОТО")`;
        const total = parseInt(stockShelf) + parseInt(stockWh);

        await sheets.spreadsheets.values.append({ 
            spreadsheetId, 
            range: `${sheetTitle}!A1`, 
            valueInputOption: 'USER_ENTERED', 
            resource: { values: [[new Date().toLocaleDateString("ru-RU"), startTime, endTime, duration, net, address, stockShelf, stockWh, total, faces, share, ourPrice, compPrice, expDate, pdfLink, gps]] } 
        });
    } catch (e) { console.error("Merch Error:", e); }
}

// --- НОВАЯ ФУНКЦИЯ: ЕДИНАЯ БАЗА ОСТАТКОВ СЕТИ (ПО ЛИСТАМ МАГАЗИНОВ) ---
async function updateGlobalStockDb(clientFolderId, workerName, net, address, stockShelf, stockWh, faces, share, ourPrice, compPrice, expDate) {
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

        // Формируем имя вкладки: СЕТЬ_АДРЕС
        let sheetTitle = `${net}_${address}`.replace(/[^а-яёa-z0-9]/gi, '_');
        if (sheetTitle.length > 99) sheetTitle = sheetTitle.substring(0, 99); 

        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        
        // Если листа магазина нет — создаем
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ 
                spreadsheetId, 
                resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } 
            });
            await sheets.spreadsheets.values.update({ 
                spreadsheetId, 
                range: `${sheetTitle}!A1`, 
                valueInputOption: 'USER_ENTERED', 
                resource: { values: [['ДАТА ВИЗИТА', 'СОТРУДНИК', 'ПОЛКА (ШТ)', 'СКЛАД (ШТ)', 'ИТОГО', 'ФЕЙСИНГ', 'ДОЛЯ %', 'ЦЕНА НАША', 'ЦЕНА КОНК.', 'СРОК ГОДНОСТИ']] } 
            });
        }

        const total = parseInt(stockShelf) + parseInt(stockWh);
        const dateStr = new Date().toLocaleString("ru-RU");

        // Пишем данные
        await sheets.spreadsheets.values.append({ 
            spreadsheetId, 
            range: `${sheetTitle}!A1`, 
            valueInputOption: 'USER_ENTERED', 
            resource: { values: [[dateStr, workerName, stockShelf, stockWh, total, faces, share, ourPrice, compPrice, expDate]] } 
        });

    } catch (e) { console.error("Global Stock DB Error:", e); }
}

// --- РОУТЫ: ПЛАНОГРАММЫ ---

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

// --- РОУТЫ: ШТРИХ-КОДЫ ---

app.get('/check-barcode', async (req, res) => {
    try {
        const { code, licenseKey } = req.query; 
        const key = licenseKey || req.query.key;
        let keys = await readDatabase();
        const kIdx = keys.findIndex(k => k.key === key);
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

app.post('/save-barcode', async (req, res) => {
    try {
        const { code, name, licenseKey } = req.body;
        const key = licenseKey || req.body.key;
        let keys = await readDatabase();
        const kIdx = keys.findIndex(k => k.key === key);
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

// --- ОСНОВНЫЕ API ---

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
    
    if (!kData.folderId) {
        const projectRoot = (kData.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
        kData.folderId = await getOrCreateFolder(kData.name, projectRoot);
        const kIdx = keys.findIndex(k => k.key === licenseKey);
        keys[kIdx].folderId = kData.folderId;
        await saveDatabase(keys);
    }
    
    const pType = kData.type || 'logist';
    if (licenseKey === 'DEV-MASTER-999') return res.json({ status: 'active', expiry: kData.expiry, type: pType });
    if (!kData.workers) kData.workers = [];
    if (!kData.workers.includes(workerName)) {
        if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест исчерпан' });
        kData.workers.push(workerName); await saveDatabase(keys);
    }
    res.json({ status: 'active', expiry: kData.expiry, type: pType });
});

// LOGIST X UPLOAD
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

// MERCH X UPLOAD (ОБНОВЛЕННЫЙ: ПОЛКА+СКЛАД И ОБЩАЯ БАЗА)
app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock, stock_shelf, stock_wh, faces, share, ourPrice, compPrice, expDate, pdf, pdfName, startTime, endTime, duration, lat, lon, city } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        
        let oId = kData.folderId;
        if (!oId) {
            oId = await getOrCreateFolder(kData ? kData.name : "Merch_Users", MERCH_ROOT_ID);
        }

        const wId = await getOrCreateFolder(worker, oId);
        const cityId = await getOrCreateFolder(city || "Без города", wId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], cityId);
        
        let pUrl = "Нет файла";
        if (pdf) {
            const base64Data = pdf.includes(',') ? pdf.split(',')[1] : pdf;
            const buf = Buffer.from(base64Data, 'base64');
            const finalName = pdfName ? `${pdfName}.pdf` : `${net}_${address}.pdf`;
            const safeName = finalName.replace(/[/\\?%*:|"<>]/g, '-');
            const f = await drive.files.create({ resource: { name: safeName, parents: [dId] }, media: { mimeType: 'application/pdf', body: Readable.from(buf) }, fields: 'id, webViewLink' });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'writer', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }
        
        const s_shelf = stock_shelf || 0;
        const s_wh = stock_wh || 0;

        // 1. Пишем в отчет сотрудника
        await appendMerchToReport(wId, worker, net, address, s_shelf, s_wh, faces, share, ourPrice, compPrice, expDate, pUrl, startTime, endTime, duration, lat, lon);

        // 2. Пишем в ОБЩУЮ БАЗУ ОСТАТКОВ (вкладки по магазинам)
        await updateGlobalStockDb(oId, worker, net, address, s_shelf, s_wh, faces, share, ourPrice, compPrice, expDate);

        res.json({ success: true, url: pUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ADMIN & CLIENT API
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
    const desc = `License ${name}`;
    const sign = crypto.createHash('md5').update(`${ROBO_LOGIN}:${price}:${invId}:${ROBO_PASS1}:Shp_chatId=${chatId}:Shp_days=${days}:Shp_key=${key}:Shp_limit=${kData.limit}:Shp_name=${name}:Shp_type=${type}`).digest('hex');
    const payUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${ROBO_LOGIN}&OutSum=${price}&InvId=${invId}&Description=${encodeURIComponent(desc)}&SignatureValue=${sign}&Shp_days=${days}&Shp_key=${key}&Shp_chatId=${chatId}&Shp_limit=${kData.limit}&Shp_name=${encodeURIComponent(name)}&Shp_type=${type}${IS_TEST ? '&IsTest=1' : ''}`;
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

app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>ADMIN</title></head><body>Admin Dashboard (Use Bot)</body></html>`);
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
        .card { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 25px; margin-bottom: 20px; }
        .obj-name { font-size: 20px; font-weight: 800; margin-bottom: 5px; }
        .status-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: rgba(245, 158, 11, 0.1); color: #f59e0b; margin-bottom: 15px; }
        .expiry-box { background: rgba(0,0,0,0.3); border: 1px solid #f59e0b; padding: 15px; border-radius: 12px; text-align: center; margin: 15px 0; }
        .expiry-date { font-size: 24px; font-weight: 900; color: #f59e0b; display: block; margin-top: 5px; }
        .stat-item { text-align: center; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 12px; flex: 1; margin: 0 4px; }
        .workers-box { background: rgba(0,0,0,0.2); border-radius: 16px; padding: 10px; margin-bottom: 20px; }
        .worker-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .folder-btn { background: rgba(245, 158, 11, 0.1); color: #f59e0b; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; border: 1px solid rgba(245,158,11,0.2); cursor: pointer; }
        .grid-prices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .price-card { background: rgba(0,0,0,0.3); padding: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); text-align: center; cursor: pointer; transition: 0.3s; }
        .price-card:hover { border-color: #f59e0b; background: rgba(245,158,11,0.05); }
    </style>
</head>
<body>
    <div class="header"><div class="logo-box">LOGIST X</div></div>
    <div id="root"></div>
    <script>
        function openExternal(url) { window.open(url, '_blank'); }
        async function load(){
            const params = new URLSearchParams(window.location.search);
            const r = await fetch('/api/client-keys?chatId=' + params.get('chatId'));
            const keys = await r.json();
            document.getElementById('root').innerHTML = keys.map(k => {
                const expDate = new Date(k.expiry);
                const days = Math.ceil((expDate - new Date()) / (1000*60*60*24));
                const dateStr = expDate.toLocaleDateString("ru-RU");
                
                let workersList = [];
                if(k.workers) workersList = k.workers.map(w => \`<div class="worker-item"><span>👤 \${w}</span><div onclick="openExternal('/api/open-folder?workerName=\${encodeURIComponent(w)}')" class="folder-btn">📂 ОТЧЕТЫ</div></div>\`);
                
                return \`
                <div class="card">
                    <div class="status-badge">\${days > 0 ? 'АКТИВЕН' : 'ИСТЕК'}</div>
                    <div class="obj-name">\${k.name} (\${k.type || 'logist'})</div>
                    <div style="font-size: 11px; opacity: 0.5;">Ключ: \${k.key}</div>
                    
                    <div class="expiry-box">
                        <div style="font-size:10px; text-transform:uppercase; opacity:0.7;">ЛИЦЕНЗИЯ ДЕЙСТВУЕТ ДО:</div>
                        <span class="expiry-date">\${dateStr}</span>
                        <div style="font-size:11px; margin-top:5px; color:\${days<7?'#ff3b30':'#aaa'}">Осталось дней: \${days}</div>
                    </div>

                    <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                        <div class="stat-item"><b>\${workersList.length}/\${k.limit}</b><br><span style="font-size:9px">СОТРУДНИКОВ</span></div>
                    </div>
                    <div class="workers-box">\${workersList.join('')}</div>
                    
                    <div class="grid-prices">
                        <div class="price-card" onclick="req('\${k.key}','\${k.name}',30,'\${k.type}')">
                            <div style="font-size:14px; font-weight:800">30 дн.</div>
                            <div style="font-size:10px; color:#f59e0b">\${k.limit*1500}₽</div>
                        </div>
                        <div class="price-card" onclick="req('\${k.key}','\${k.name}',90,'\${k.type}')">
                            <div style="font-size:14px; font-weight:800">90 дн.</div>
                            <div style="font-size:10px; color:#f59e0b">\${k.limit*4050}₽</div>
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

bot.launch().then(() => console.log("READY"));
app.listen(process.env.PORT || 3000);
