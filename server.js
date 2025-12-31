const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// --- ТВОИ НАСТРОЙКИ (Строго по твоему серверу) ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- ОРИГИНАЛЬНАЯ ЛОГИКА ПАПОК ---
async function getOrCreateFolder(rawName, parentId) {
    try {
        const name = String(rawName || "Без названия").trim(); 
        const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;
        
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
        if (typeof data === 'string') data = JSON.parse(data);
        return data.keys || [];
    } catch (e) { return []; }
}

// --- ФОРМИРОВАНИЕ ОТЧЕТА (Оригинальная структура) ---
async function appendToReport(workerId, workerName, city, dateStr, address, entrance, client, workType, price, lat, lon) {
    try {
        const reportName = `Отчет ${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId;
        
        if (res.data.files.length === 0) {
            const createRes = await sheets.spreadsheets.create({
                resource: { properties: { title: reportName } }, fields: 'spreadsheetId'
            });
            spreadsheetId = createRes.data.spreadsheetId;
            // Перемещаем таблицу в папку работника
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        } else {
            spreadsheetId = res.data.files[0].id;
        }

        const sheetTitle = `${city}_${dateStr}`;
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const existingSheet = meta.data.sheets.find(s => s.properties.title === sheetTitle);
        
        if (!existingSheet) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] }
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
                resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GPS', 'ФОТО']] }
            });
        }

        const timeNow = new Date().toLocaleTimeString("ru-RU");
        const gpsValue = (lat && lon) ? `=HYPERLINK("http://maps.google.com/?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
            resource: { values: [[timeNow, address, entrance, client, workType, price, gpsValue, "ЗАГРУЖЕНО"]] }
        });
    } catch (e) { console.error("Ошибка отчёта:", e.message); }
}

// --- ГЛАВНЫЙ API ЗАГРУЗКИ ---
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = req.body;
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        
        const ownerName = keyData ? keyData.name : "Неизвестный";
        const ownerId = await getOrCreateFolder(ownerName, MY_ROOT_ID);
        const workerId = await getOrCreateFolder(worker, ownerId);
        const cityId = await getOrCreateFolder(city, workerId);
        const todayStr = new Date().toISOString().split('T')[0];
        const dateFolderId = await getOrCreateFolder(todayStr, cityId);
        const clientFolderId = await getOrCreateFolder(client || "Общий", dateFolderId);

        if (image) {
            const fileName = `${address || 'Адрес'} ${entrance || ''}`.trim() + ".jpg";
            const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            await drive.files.create({
                resource: { name: fileName, parents: [clientFolderId] },
                media: { mimeType: 'image/jpeg', body: bufferStream }
            });
        }

        await appendToReport(workerId, worker, city, todayStr, address, entrance, client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Роут для проверки лицензий (чтобы приложение не вылетало)
app.post('/check-license', async (req, res) => {
    const keys = await readDatabase();
    const key = keys.find(k => k.key === req.body.licenseKey);
    res.json(key ? { status: 'active', expiry: key.expiry } : { status: 'error' });
});

bot.launch();
app.listen(process.env.PORT || 3000, () => console.log("LOGIST_X ВОССТАНОВЛЕН"));
