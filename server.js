const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- НАСТРОЙКИ (Твои данные) ---
const MASTER_KEY = "LX-BOSS-777"; 
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A';

const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// --- ЛОГИКА ТАБЛИЦЫ В ПАПКЕ МОНТАЖНИКА ---
async function getOrCreateWorkerReport(workerFolderId, workerName) {
    const fileName = `ЖУРНАЛ_РАБОТ_${workerName}`;
    const q = `name = '${fileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and '${workerFolderId}' in parents`;
    const res = await drive.files.list({ q });

    if (res.data.files.length > 0) return res.data.files[0].id;

    const ss = await sheets.spreadsheets.create({ resource: { properties: { title: fileName } } });
    const ssId = ss.data.spreadsheetId;
    await drive.files.update({ fileId: ssId, addParents: workerFolderId, removeParents: 'root' });

    await sheets.spreadsheets.values.update({
        spreadsheetId: ssId, range: 'Sheet1!A1', valueInputOption: 'RAW',
        resource: { values: [["ДАТА/ВРЕМЯ", "ГОРОД", "ОБЪЕКТ", "АДРЕС (НАЗВАНИЕ ФОТО)", "ТИП РАБОТЫ", "GPS КАРТА", "ССЫЛКА НА ФОТО"]] }
    });
    return ssId;
}

// --- ФУНКЦИИ ПАПОК ---
async function getOrCreateFolder(name, parentId) {
    let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;
    const res = await drive.files.list({ q });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
    return folder.data.id;
}

// --- ЗАГРУЗКА ---
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, client, image, licenseKey, lat, lon, workType } = req.body;
        const workerName = worker || "Монтажник";

        // Поиск компании по ключу в базе
        const qK = `name = 'DATABASE_KEYS_LOGIST_X' and trashed = false`;
        const rK = await drive.files.list({ q: qK });
        let compName = "Евгений_БОСС";
        if (rK.data.files.length > 0) {
            const keysRes = await sheets.spreadsheets.values.get({ spreadsheetId: rK.data.files[0].id, range: 'A2:B100' });
            const found = (keysRes.data.values || []).find(k => k[0] === (licenseKey ? licenseKey.trim() : ""));
            if (found) compName = found[1];
        }

        console.log(`>>> [ACTION] Загрузка для ${compName} от ${workerName}`);

        // Построение пути
        const f1 = await getOrCreateFolder(compName, MY_ROOT_ID);
        const f2 = await getOrCreateFolder(workerName, f1);
        const ssId = await getOrCreateWorkerReport(f2, workerName);
        const f3 = await getOrCreateFolder(city || "Город", f2);
        const f4 = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), f3);
        const f5 = await getOrCreateFolder(client || "Объект", f4);

        // Сохранение фото (НАЗВАНИЕ = АДРЕС)
        let photoLink = "";
        if (image) {
            const buffer = Buffer.from(image, 'base64');
            const fileName = `${address || 'фото'}.jpg`; // Только адрес, без времени
            
            const file = await drive.files.create({
                resource: { name: fileName, parents: [f5] },
                media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
                fields: 'id, webViewLink'
            });
            photoLink = file.data.webViewLink;
            console.log(`>>> [FILE] Создано фото: ${fileName}`);
        }

        // Запись в персональный журнал монтажника
        const gpsLink = (lat && lon) ? `https://www.google.com/maps?q=${lat},${lon}` : "Нет координат";
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: ssId, range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED',
            resource: { values: [[
                new Date().toLocaleString('ru-RU'),
                city,
                client || "---",
                address,
                workType || "Монтаж",
                gpsLink,
                photoLink
            ]] }
        });

        console.log(`>>> [DONE] Все данные успешно сохранены.`);
        res.json({ success: true });
    } catch (e) { 
        console.error("!!! [ERROR]", e.message);
        res.status(500).json({ success: false }); 
    }
});

// Админка и проверка ключей
app.get('/api/list_keys', async (req, res) => {
    const q = `name = 'DATABASE_KEYS_LOGIST_X' and trashed = false`;
    const resFile = await drive.files.list({ q });
    if (resFile.data.files.length === 0) return res.json({ keys: [] });
    const resData = await sheets.spreadsheets.values.get({ spreadsheetId: resFile.data.files[0].id, range: 'A2:E100' });
    const keys = (resData.data.values || []).map(r => ({ key: r[0], name: r[1], expiry: r[2], limit: r[3] }));
    res.json({ keys });
});

app.get('/admin-panel', (req, res) => res.sendFile(require('path').join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("LOGIST-X PRO LIVE"));

app.listen(process.env.PORT || 3000, () => console.log("[СИСТЕМА] СЕРВЕР В СТРОЮ"));
