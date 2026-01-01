const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());

// Лимиты для тяжелых PDF и данных логистики
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

// --- НАСТРОЙКИ (ТВОИ ОРИГИНАЛЬНЫЕ ID) ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 

// Auth Google
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- СИСТЕМНЫЕ ФУНКЦИИ (ЛОГИСТИКА + БАЗА) ---
async function getOrCreateFolder(rawName, parentId) {
    try {
        const name = String(rawName).trim(); 
        const q = `name = '${name.replace(/'/g, "\\")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
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
        return data.keys || [];
    } catch (e) { return []; }
}

async function saveDatabase(keys) {
    const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
    const res = await drive.files.list({ q });
    const dataStr = JSON.stringify({ keys: keys }, null, 2);
    const bufferStream = new Readable(); bufferStream.push(dataStr); bufferStream.push(null);
    const media = { mimeType: 'application/json', body: bufferStream };
    if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media: media }); } 
    else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media: media }); }
}

// --- ОТЧЕТНОСТЬ МЕРЧ (АНАЛИТИКА) ---
async function appendMerchToReport(workerId, workerName, net, address, stock, shelf, priceMy, priceComp, expDate, pdfUrl) {
    try {
        const reportName = `Мерч_Аналитика_${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId;
        if (res.data.files.length === 0) {
            const createRes = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } } });
            spreadsheetId = createRes.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        } else { spreadsheetId = res.data.files[0].id; }

        const timeNow = new Date().toLocaleString("ru-RU");
        const sheetTitle = "ОТЧЕТЫ_МЕРЧ";
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ 
                spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', 
                resource: { values: [['ДАТА', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ЦЕНА_МЫ', 'ЦЕНА_КОНК', 'СРОК', 'PDF']] } 
            });
        }
        await sheets.spreadsheets.values.append({ 
            spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', 
            resource: { values: [[timeNow, net, address, stock, shelf, priceMy, priceComp, expDate, pdfUrl]] } 
        });
    } catch (e) { console.error("Sheet Error:", e); }
}

// === API РОУТЫ (ЛОГИСТИКА И ЛИЦЕНЗИИ) ===
app.post('/check-license', async (req, res) => {
    const { licenseKey, workerName } = req.body;
    const keys = await readDatabase();
    const keyData = keys.find(k => k.key === licenseKey);
    if (!keyData) return res.json({ status: 'error', message: 'Ключ не найден' });
    if (!keyData.workers) keyData.workers = [];
    if (!keyData.workers.includes(workerName)) {
        if (keyData.workers.length >= parseInt(keyData.limit)) return res.json({ status: 'error' });
        keyData.workers.push(workerName);
        await saveDatabase(keys);
    }
    res.json({ status: 'active', expiry: keyData.expiry });
});

app.get('/api/keys', async (req, res) => { res.json(await readDatabase()); });

// === API РОУТ МЕРЧАНДАЙЗИНГ ===
app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock, shelf, priceMy, priceComp, expDate, pdf, city } = req.body;
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const ownerName = keyData ? keyData.name : "ОБЩАЯ_ПАПКА";

        const ownerId = await getOrCreateFolder(ownerName, MERCH_ROOT_ID);
        const workerId = await getOrCreateFolder(worker || "Без_имени", ownerId);
        const cityId = await getOrCreateFolder(city || "Орёл", workerId);
        const today = new Date().toISOString().split('T')[0];
        const dateId = await getOrCreateFolder(today, cityId);

        let pdfUrl = "Файл не загружен";
        if (pdf) {
            const buffer = Buffer.from(pdf.split(',')[1], 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            const fileName = `ОТЧЕТ_${address}.pdf`.replace(/[/\\?%*:|"<>]/g, '-');
            const driveRes = await drive.files.create({
                resource: { name: fileName, parents: [dateId] },
                media: { mimeType: 'application/pdf', body: bufferStream },
                fields: 'id, webViewLink'
            });
            await drive.permissions.create({ fileId: driveRes.data.id, resource: { role: 'reader', type: 'anyone' } });
            pdfUrl = driveRes.data.webViewLink;
        }

        await appendMerchToReport(workerId, worker, net, address, stock, shelf, priceMy, priceComp, expDate, pdfUrl);
        res.json({ success: true, url: pdfUrl });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/', (req, res) => res.send("LOGIST_X MULTI-SERVER ACTIVE"));
app.listen(process.env.PORT || 3000);
