const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- НАСТРОЙКИ ---
const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

// База данных
const DB_FILE = 'db.json';
let DB = { keys: [] };
if (fs.existsSync(DB_FILE)) {
    try {
        DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log(`[DB] Найдено ключей в базе: ${DB.keys.length}`);
    } catch (e) { console.error("[DB] Ошибка чтения базы:", e); }
}

const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
    } catch (e) { console.error("[DB] Ошибка записи базы:", e); }
};

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- ФУНКЦИИ ГУГЛА ---
async function getOrCreateFolder(folderName, parentId = null) {
    try {
        let q = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        if (parentId) q += ` and '${parentId}' in parents`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const folder = await drive.files.create({
            resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : [] },
            fields: 'id'
        });
        return folder.data.id;
    } catch (err) { console.error("Ошибка папки:", err.message); return null; }
}

async function logToWorkerSheet(spreadsheetId, workerName, data) {
    if (!spreadsheetId) return;
    try {
        const sheetName = workerName || "Общий";
        const ss = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetExists = ss.data.sheets.some(s => s.properties.title === sheetName);
        if (!sheetExists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId, range: `${sheetName}!A1`, valueInputOption: 'RAW',
                resource: { values: [["Дата", "Город", "Адрес", "Объект", "Работа", "Цена", "GPS (Карта)"]] }
            });
        }

        // --- ЛОГИКА ССЫЛКИ НА КАРТУ (ИСПРАВЛЕНО) ---
        let gpsValue = data.coords || "Нет GPS";
        if (data.coords && data.coords.includes(',')) {
            const cleanCoords = data.coords.replace(/\s+/g, ''); 
            const mapUrl = `https://www.google.com/maps?q=${cleanCoords}`;
            gpsValue = `=HYPERLINK("${mapUrl}"; "${data.coords}")`;
        }

        const row = [
            new Date().toLocaleString('ru-RU'), 
            data.city, 
            data.address, 
            data.client, 
            data.workType, 
            data.price, 
            gpsValue
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId, 
            range: `${sheetName}!A1`, 
            valueInputOption: 'USER_ENTERED', 
            resource: { values: [row] }
        });
    } catch (err) { console.error("Ошибка записи в таблицу:", err.message); }
}

// --- API МАРШРУТЫ ---
app.post('/api/add_key', async (req, res) => {
    let folderId = null;
    let sheetId = null;
    try {
        const { name, days, limit } = req.body;
        console.log(`[PROCESS] Создаю ключ для ${name}`);

        folderId = await getOrCreateFolder(name);
        await sleep(1000);

        try {
            const ss = await sheets.spreadsheets.create({ resource: { properties: { title: `ОТЧЕТЫ_${name}` } } });
            sheetId = ss.data.spreadsheetId;
            console.log(`[API] Таблица создана: ${sheetId}`);
            
            await sleep(1500);
            const parentData = await drive.files.get({fileId: sheetId, fields: 'parents'});
            await drive.files.update({
                fileId: sheetId, 
                addParents: folderId, 
                removeParents: parentData.data.parents.join(','), 
                fields: 'id, parents'
            });
        } catch (e) { console.error("[!!!] Таблица НЕ создана. Проверь Sheets API!"); }

        const key = { 
            key: 'LX-' + Math.random().toString(36).substr(2, 9).toUpperCase(), 
            name, 
            expiry: new Date(Date.now() + (parseInt(days) || 30) * 86400000).toISOString(), 
            limit: parseInt(limit) || 1, 
            workers: [], folderId, sheetId 
        };

        DB.keys.push(key);
        saveDB();
        res.json({ success: true, key });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, client, image, fileName, licenseKey } = req.body;
        const keyData = DB.keys.find(k => k.key === licenseKey);
        if (!keyData) throw new Error("Ключ не найден");

        const f1 = await getOrCreateFolder(keyData.name); 
        const f2 = await getOrCreateFolder(worker || "Воркер", f1);
        const f3 = await getOrCreateFolder(client || "Объект", f2);
        const f4 = await getOrCreateFolder(city || "Город", f3);
        const f5 = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), f4);

        const buffer = Buffer.from(image, 'base64');
        await drive.files.create({
            resource: { name: `${fileName}.jpg`, parents: [f5] },
            media: { mimeType: 'image/jpeg', body: require('stream').Readable.from(buffer) }
        });

        if (keyData.sheetId) await logToWorkerSheet(keyData.sheetId, worker, req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/list_keys', (req, res) => res.json({ keys: DB.keys }));
app.post('/api/delete_key', (req, res) => { DB.keys = DB.keys.filter(k => k.key !== req.body.key); saveDB(); res.json({ success: true }); });
app.post('/api/update_key', (req, res) => {
    const { key, addDays, addLimit } = req.body;
    const k = DB.keys.find(x => x.key === key);
    if (k) {
        let exp = new Date(k.expiry);
        if (exp < new Date()) exp = new Date();
        exp.setDate(exp.getDate() + parseInt(addDays || 0));
        k.expiry = exp.toISOString();
        k.limit += parseInt(addLimit || 0);
        saveDB(); res.json({ success: true });
    } else res.status(404).json({ success: false });
});

app.post('/check-license', (req, res) => {
    const { licenseKey, workerName } = req.body;
    const k = DB.keys.find(x => x.key === licenseKey);
    if (!k) return res.json({ status: "error", message: "Ключ не найден" });
    if (new Date(k.expiry) < new Date()) return res.json({ status: "error", message: "Срок истек" });
    if (!k.workers.includes(workerName)) {
        if (k.workers.length >= k.limit) return res.json({ status: "error", message: "Лимит воркеров исчерпан" });
        k.workers.push(workerName); saveDB();
    }
    res.json({ status: "active", expiry: new Date(k.expiry).getTime() });
});

// --- ОБРАБОТКА ФАЙЛОВ ---
// Оставляем только админку, проверяя её наличие
app.get('/admin-panel', (req, res) => {
    const adminPath = path.join(__dirname, 'admin.html');
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.status(404).send("Файл админки не найден в этом репозитории");
    }
});

// Заглушка для главной (так как лендинг в другом месте)
app.get('/', (req, res) => {
    res.send("LOGIST_X API SERVER ONLINE. Лендинг запущен отдельно.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LOGIST_X SERVER ONLINE [PORT ${PORT}]`));
