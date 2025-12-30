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

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';

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

async function getOrCreateFolder(rawName, parentId) {
    try {
        const name = String(rawName).trim(); 
        const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
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

// --- УМНЫЙ ОТЧЕТ (EXCEL) ---
async function appendToReport(workerId, workerName, city, dateStr, address, entrance, client, workType, price, gpsLink) {
    try {
        const reportName = `Отчет ${workerName}`; // Имя файла таблицы
        
        // 1. Ищем файл таблицы у работника
        const q = `name = '${reportName}' and '${workerId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
        const res = await drive.files.list({ q });
        
        let spreadsheetId;

        if (res.data.files.length === 0) {
            // Создаем файл, если нет
            const createRes = await sheets.spreadsheets.create({
                resource: { properties: { title: reportName } },
                fields: 'spreadsheetId'
            });
            spreadsheetId = createRes.data.spreadsheetId;
            // Перемещаем в папку работника
            const fileId = spreadsheetId; 
            const getFile = await drive.files.get({ fileId, fields: 'parents' });
            const previousParents = getFile.data.parents.join(',');
            await drive.files.update({ fileId: fileId, addParents: workerId, removeParents: previousParents });
        } else {
            spreadsheetId = res.data.files[0].id;
        }

        // 2. Формируем имя Листа: "Москва_2025-12-30"
        const sheetTitle = `${city}_${dateStr}`;

        // 3. Проверяем, есть ли такой лист
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const existingSheet = meta.data.sheets.find(s => s.properties.title === sheetTitle);

        if (!existingSheet) {
            // Если листа нет - создаем
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] }
            });
            // И пишем заголовки
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetTitle}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GPS', 'ФОТО']] }
            });
        }

        // 4. Пишем данные
        const timeNow = new Date().toLocaleTimeString("ru-RU");
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetTitle}!A1`, // Google сам найдет первую пустую строку
            valueInputOption: 'USER_ENTERED',
            resource: { 
                values: [[timeNow, address, entrance, client, workType, price, gpsLink, "ЗАГРУЖЕНО"]] 
            }
        });

    } catch (e) { console.error("Report Error:", e); }
}

// --- ЛОГИКА ---
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

// === МАРШРУТЫ ===

app.post('/check-license', async (req, res) => {
    try { const result = await handleLicenseCheck(req.body); res.json(result); } 
    catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

app.post('/upload', async (req, res) => {
    try {
        const body = req.body;
        if (body.action === 'check_license') {
            const result = await handleLicenseCheck(body);
            return res.json(result);
        }

        // ПОЛУЧАЕМ НОВЫЕ ДАННЫЕ (workType, price)
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = body;
        
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker));
        const ownerName = keyData ? keyData.name : "Неизвестный";

        // ПАПКИ: Владелец -> Работник -> Город -> ДАТА -> Клиент
        const ownerId = await getOrCreateFolder(ownerName, MY_ROOT_ID);
        const workerId = await getOrCreateFolder(worker || "Работник", ownerId);
        const cityId = await getOrCreateFolder(city || "Город", workerId);
        
        const todayStr = new Date().toISOString().split('T')[0]; // 2025-12-30
        const dateFolderId = await getOrCreateFolder(todayStr, cityId);
        
        let finalFolderName = client && client.trim().length > 0 ? client.trim() : "Общий";
        const finalFolderId = await getOrCreateFolder(finalFolderName, dateFolderId);

        // ФАЙЛ: Улица Дом Подъезд.jpg
        const safeAddress = address ? address.trim() : "Без адреса";
        const safeEntrance = entrance ? " " + entrance : ""; 
        const fileName = `${safeAddress}${safeEntrance}.jpg`.trim();

        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);

        await drive.files.create({
            resource: { name: fileName, parents: [finalFolderId] },
            media: { mimeType: 'image/jpeg', body: bufferStream }
        });

        // ОТЧЕТ: Передаем тип работы и цену
        const gpsLink = (lat && lon) ? `http://googleusercontent.com/maps.google.com/4{lat},${lon}` : "Нет GPS";
        await appendToReport(workerId, worker, city, todayStr, safeAddress, entrance || "-", finalFolderName, workType || "Не указан", price || 0, gpsLink);
        
        res.json({ success: true });

    } catch (e) { res.json({ status: 'error', message: e.message, success: false }); }
});

// АДМИНКА
app.get('/api/keys', async (req, res) => { const keys = await readDatabase(); res.json(keys); });
app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body;
    let keys = await readDatabase();
    const genPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const newKey = `${genPart()}-${genPart()}`;
    const expiryDate = new Date(); expiryDate.setDate(expiryDate.getDate() + parseInt(days));
    keys.push({ key: newKey, name: name, limit: limit, expiry: expiryDate.toISOString(), workers: [] });
    await saveDatabase(keys);
    res.json({ success: true });
});
app.post('/api/keys/del', async (req, res) => {
    const { key } = req.body;
    let keys = await readDatabase(); keys = keys.filter(k => k.key !== key);
    await saveDatabase(keys);
    res.json({ success: true });
});

// ДИЗАЙН АДМИНКИ (COMMAND CENTER)
app.get('/dashboard', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LOGIST X | COMMAND</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;800;900&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --accent: #d29922; --text: #c9d1d9; --green: #238636; --red: #da3633; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; padding: 20px; }
            .container { max-width: 800px; margin: 0 auto; }
            .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 25px; margin-bottom: 20px; }
            input, select, button { width: 100%; padding: 14px; margin-bottom: 10px; border-radius: 8px; border: 1px solid var(--border); background: #010409; color: #fff; font-family: 'JetBrains Mono'; }
            button { background: var(--accent); color: #000; font-weight: 900; cursor: pointer; border: none; text-transform: uppercase; }
            .key-item { background: #010409; padding: 15px; border: 1px solid var(--border); margin-bottom: 10px; border-radius: 8px; border-left: 4px solid var(--green); }
            .k-code { font-size: 1.2rem; font-weight: bold; color: #fff; }
        </style>
    </head>
    <body>
    <div class="container">
        <h1 style="color:var(--accent)">LOGIST X // ADMIN</h1>
        <div class="card">
            <h3>СОЗДАТЬ ЛИЦЕНЗИЮ</h3>
            <input type="text" id="newName" placeholder="Имя Владельца">
            <input type="number" id="newLimit" value="5" placeholder="Лимит">
            <select id="newDays"><option value="30">30 Дней</option><option value="365">1 Год</option></select>
            <button onclick="addKey()">СГЕНЕРИРОВАТЬ</button>
        </div>
        <div id="keysList"></div>
    </div>
    <script>
        async function load() {
            const res = await fetch('/api/keys'); const keys = await res.json();
            document.getElementById('keysList').innerHTML = keys.map(k => 
                \`<div class="key-item">
                    <div class="k-code">\${k.key}</div>
                    <div>📂 \${k.name} | 👤 \${k.workers?k.workers.length:0}/\${k.limit}</div>
                    <button onclick="delKey('\${k.key}')" style="background:none; color:var(--red); text-align:left; padding:0; margin-top:10px; width:auto;">УДАЛИТЬ</button>
                </div>\`
            ).join('');
        }
        async function addKey() {
            await fetch('/api/keys/add', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
                name:document.getElementById('newName').value, limit:document.getElementById('newLimit').value, days:document.getElementById('newDays').value
            })}); load();
        }
        async function delKey(key) { if(confirm('Удалить?')) await fetch('/api/keys/del', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key}) }); load(); }
        load();
    </script>
    </body>
    </html>
    `;
    res.send(html);
});

app.get('/', (req, res) => res.redirect('/dashboard'));
app.listen(process.env.PORT || 3000, () => console.log("SERVER ONLINE"));
