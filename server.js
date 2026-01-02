const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

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

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
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
        if (res.data.files.length === 0) return { keys: [] };
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        let data = content.data;
        if (typeof data === 'string') data = JSON.parse(data);
        return data;
    } catch (e) { return { keys: [] }; }
}

async function saveDatabase(data) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const media = { mimeType: 'application/json', body: JSON.stringify(data, null, 2) };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); } 
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media }); }
    } catch (e) { console.error("DB Error:", e); }
}

// --- ТАБЛИЦА ЛОГИСТИКИ ---
async function appendToLogistReport(parentId, workerName, city, dateStr, address, entrance, client, workType, price, lat, lon) {
    try {
        const reportName = `Отчет ${workerName}`;
        const q = `name = '${reportName}' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        let ssId = res.data.files.length > 0 ? res.data.files[0].id : null;
        if (!ssId) {
            const cr = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } } });
            ssId = cr.data.spreadsheetId;
            await drive.files.update({ fileId: ssId, addParents: parentId, removeParents: 'root' });
        }
        const sheetTitle = `${city}_${dateStr}`;
        const meta = await sheets.spreadsheets.get({ spreadsheetId: ssId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId: ssId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ spreadsheetId: ssId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GPS']] } });
        }
        const gpsLink = (lat && lon) ? `=HYPERLINK("https://www.google.com/maps?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        await sheets.spreadsheets.values.append({ spreadsheetId: ssId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleTimeString("ru-RU"), address, entrance, client, workType, price, gpsLink]] } });
    } catch (e) { console.error("Logist Sheet Error:", e); }
}

// --- ТАБЛИЦА МЕРЧАНДАЙЗИНГА ---
async function appendToMerchReport(parentId, workerName, net, address, stock, shelf, pMy, pComp, pExp, pdfUrl, startTime, endTime, lat, lon) {
    try {
        const reportName = `Мерч_Аналитика_${workerName}`;
        const q = `name = '${reportName}' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        let ssId = res.data.files.length > 0 ? res.data.files[0].id : null;
        if (!ssId) {
            const cr = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } } });
            ssId = cr.data.spreadsheetId;
            await drive.files.update({ fileId: ssId, addParents: parentId, removeParents: 'root' });
        }
        const sheetTitle = "ОТЧЕТЫ_МЕРЧ";
        const meta = await sheets.spreadsheets.get({ spreadsheetId: ssId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId: ssId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ spreadsheetId: ssId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ДАТА', 'НАЧАЛО', 'КОНЕЦ', 'ДЛИТЕЛЬНОСТЬ', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ЦЕНА МЫ', 'ЦЕНА КОНК', 'СРОК', 'PDF ОТЧЕТ', 'GPS']] } });
        }
        let dur = "-";
        if (startTime && endTime) {
            const [h1, m1] = startTime.split(':').map(Number);
            const [h2, m2] = endTime.split(':').map(Number);
            const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
            dur = diff >= 0 ? `${diff} мин.` : "-";
        }
        const gps = (lat && lon) ? `=HYPERLINK("https://www.google.com/maps?q=${lat},${lon}"; "ПОСМОТРЕТЬ")` : "Нет";
        await sheets.spreadsheets.values.append({ spreadsheetId: ssId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleDateString("ru-RU"), startTime, endTime, dur, net, address, stock, shelf, pMy, pComp, pExp, pdfUrl, gps]] } });
    } catch (e) { console.error("Merch Sheet Error:", e); }
}

// === API РОУТЫ ===

app.post('/check-license', async (req, res) => {
    const { licenseKey, workerName } = req.body;
    let db = await readDatabase();
    const kData = db.keys.find(k => k.key === licenseKey);
    if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
    if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
    if (!kData.workers) kData.workers = [];
    if (!kData.workers.includes(workerName)) {
        if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест' });
        kData.workers.push(workerName); 
        await saveDatabase(db);
    }
    res.json({ status: 'active', expiry: kData.expiry });
});

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
            await drive.files.create({ 
                resource: { name: `${photoName}.jpg`, parents: [wId] }, 
                media: { mimeType: 'image/jpeg', body: Readable.from(Buffer.from(base64Data, 'base64')) } 
            });
        }
        await appendToLogistReport(oId, worker, city, dateStr, address, entrance || "-", client, workType, price, lat, lon);
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
            const f = await drive.files.create({ 
                resource: { name: `ОТЧЕТ_${address}.pdf`, parents: [wId] }, 
                media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(base64Data, 'base64')) }, 
                fields: 'id, webViewLink' 
            });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }
        await appendToMerchReport(oId, worker, net, address, stock, shelf, priceMy, priceComp, expDate, pUrl, startTime, endTime, lat, lon);
        res.json({ success: true, url: pUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- АДМИН ПАНЕЛЬ И КЛИЕНТСКИЕ РОУТЫ ---
app.get('/api/keys', async (req, res) => { const db = await readDatabase(); res.json(db.keys); });
app.get('/api/client-keys', async (req, res) => {
    try { const db = await readDatabase(); res.json(db.keys.filter(k => String(k.ownerChatId) === String(req.query.chatId))); } catch (e) { res.json([]); }
});

app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body; 
    let db = await readDatabase();
    const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const exp = new Date(); exp.setDate(exp.getDate() + parseInt(days));
    db.keys.push({ key: newK, name, limit, expiry: exp.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(db); res.json({ success: true });
});

// --- ДИЗАЙН ПАНЕЛЕЙ (HTML) ---
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ADMIN | LOGIST X</title>
    <style>
        :root { --bg: #0a0c10; --card: #161b22; --accent: #f0ad4e; --text: #f0f6fc; --border: #30363d; }
        body { background: var(--bg); color: var(--text); font-family: sans-serif; padding: 15px; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        input, button { width: 100%; padding: 12px; margin-bottom: 12px; border-radius: 8px; border: 1px solid var(--border); background: #010409; color: #fff; box-sizing: border-box; }
        button { background: var(--accent); color: #000; font-weight: bold; border: none; cursor: pointer; }
        .key-item { background: #0d1117; padding: 15px; border-radius: 10px; margin-bottom: 10px; border-left: 5px solid var(--accent); }
    </style></head>
    <body>
        <div class="card"><h3>НОВАЯ ЛИЦЕНЗИЯ</h3>
            <input type="text" id="newName" placeholder="Название объекта">
            <input type="number" id="newLimit" placeholder="Лимит человек" value="5">
            <button onclick="addKey()">СГЕНЕРИРОВАТЬ</button>
        </div>
        <div id="keysList"></div>
    <script>
        async function load(){ 
            const res = await fetch('/api/keys'); const keys = await res.json(); 
            document.getElementById('keysList').innerHTML = keys.map(k => \`
                <div class="key-item">
                    <b>\${k.key}</b><br>🏢 \${k.name} | 👥 \${k.workers ? k.workers.length : 0}/\${k.limit}<br>📅 До: \${new Date(k.expiry).toLocaleDateString()}
                </div>\`).join(''); 
        }
        async function addKey(){ 
            await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('newName').value,limit:document.getElementById('newLimit').value,days:30})}); 
            load(); 
        }
        load();
    </script></body></html>`);
});

app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>CLIENT | LOGIST X</title>
    <style>body { background: #0a0c10; color: #c9d1d9; font-family: sans-serif; padding: 15px; } .card { background: #161b22; border-radius: 16px; padding: 20px; border: 1px solid #30363d; margin-bottom: 20px; }</style></head>
    <body><div id="content">Загрузка...</div><script>
        async function load(){ 
            const cid = new URLSearchParams(window.location.search).get('chatId'); 
            const res = await fetch('/api/client-keys?chatId=' + cid); const keys = await res.json();
            document.getElementById('content').innerHTML = keys.map(k => \`<div class="card"><b>\${k.name}</b><br>Ключ: \${k.key}<br>Мест: \${k.workers.length}/\${k.limit}</div>\`).join('');
        } load();
    </script></body></html>`);
});

// --- БОТ ---
bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) return ctx.reply('👑 АДМИН ПАНЕЛЬ', { reply_markup: { inline_keyboard: [[{ text: "ОТКРЫТЬ УПРАВЛЕНИЕ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    const db = await readDatabase(); 
    const ck = db.keys.find(k => String(k.ownerChatId) === String(cid));
    if (ck) return ctx.reply('🏢 ВАШ КАБИНЕТ', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ДАННЫЕ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    ctx.reply('👋 Logist X: Активируйте ключ.', { reply_markup: { inline_keyboard: [[{ text: "🔑 У МЕНЯ ЕСТЬ КЛЮЧ", callback_data: "have" }]] } });
});

bot.action('have', ctx => ctx.reply('Введите ваш лицензионный ключ:'));
bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return;
    const keyStr = ctx.message.text.trim();
    let db = await readDatabase();
    const idx = db.keys.findIndex(k => k.key === keyStr);
    if (idx !== -1) {
        if(db.keys[idx].ownerChatId) return ctx.reply('⚠️ Этот ключ уже активирован.');
        db.keys[idx].ownerChatId = ctx.chat.id;
        await saveDatabase(db);
        ctx.reply('✅ КЛЮЧ УСПЕШНО ПРИВЯЗАН! Теперь вам доступен личный кабинет Начальника через /start');
    } else ctx.reply('❌ Ключ не найден.');
});

bot.launch().then(() => console.log("SERVER ONLINE"));
app.listen(process.env.PORT || 3000);
