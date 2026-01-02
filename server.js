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
const MAX_DISTANCE_METERS = 600; 

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
    const f1 = lat1 * Math.PI/180; const f2 = lat2 * Math.PI/180;
    const df = (lat2-lat1) * Math.PI/180; const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(df/2) * Math.sin(df/2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2) * Math.sin(dl/2);
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
        const media = { mimeType: 'application/json', body: JSON.stringify({ keys }, null, 2) };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); } 
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media }); }
    } catch (e) { console.error("DB Error:", e); }
}

// --- ОТЧЕТЫ ЛОГИСТИКИ ---
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

// --- ОТЧЕТЫ МЕРЧАНДАЙЗИНГА ---
async function appendMerchToReport(workerId, workerName, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdfUrl, startTime, endTime, duration, lat, lon) {
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
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ДАТА', 'НАЧАЛО', 'КОНЕЦ', 'ДЛИТЕЛЬНОСТЬ', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ДОЛЯ %', 'ЦЕНА МЫ', 'ЦЕНА КОНК', 'СРОК', 'PDF ОТЧЕТ', 'GPS']] } });
        }
        const gps = (lat && lon) ? `=HYPERLINK("http://maps.google.com/?q=${lat},${lon}"; "ПОСМОТРЕТЬ")` : "Нет";
        const pdfLink = `=HYPERLINK("${pdfUrl}"; "ВРЕМЯ ПРОВЕДЕННОЕ В МАГАЗИНЕ")`;
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleDateString("ru-RU"), startTime, endTime, duration, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdfLink, gps]] } });
    } catch (e) { console.error("Merch Error:", e); }
}

// === API ===
app.post('/check-license', async (req, res) => {
    const { licenseKey, workerName } = req.body;
    const keys = await readDatabase();
    const kData = keys.find(k => k.key === licenseKey);
    if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
    if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
    if (!kData.workers) kData.workers = [];
    if (!kData.workers.includes(workerName)) {
        if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест' });
        kData.workers.push(workerName); await saveDatabase(keys);
    }
    res.json({ status: 'active', expiry: kData.expiry });
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const oId = await getOrCreateFolder(kData ? kData.name : "Logist_Users", MY_ROOT_ID);
        const wId = await getOrCreateFolder(worker, oId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], wId);
        if (image) {
            const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            // Название фото по правилу: адрес номер дома, потом подъезд
            const fileName = `${address}_п${entrance}.jpg`;
            await drive.files.create({ resource: { name: fileName, parents: [dId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) } });
        }
        await appendToReport(wId, worker, city, new Date().toISOString().split('T')[0], address, entrance, client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdf, startTime, endTime, duration, lat, lon } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const oId = await getOrCreateFolder(kData ? kData.name : "Merch_Users", MERCH_ROOT_ID);
        const wId = await getOrCreateFolder(worker, oId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], wId);
        let pUrl = "Нет файла";
        if (pdf) {
            const buf = Buffer.from(pdf.split(',')[1], 'base64');
            const f = await drive.files.create({ resource: { name: `ОТЧЕТ_${address}.jpg`, parents: [dId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) }, fields: 'id, webViewLink' });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }
        await appendMerchToReport(wId, worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pUrl, startTime, endTime, duration, lat, lon);
        res.json({ success: true, url: pUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// === АДМИНКА И КЛИЕНТСКИЕ РОУТЫ ===
app.get('/api/keys', async (req, res) => { res.json(await readDatabase()); });
app.get('/api/client-keys', async (req, res) => {
    try { const keys = await readDatabase(); res.json(keys.filter(k => String(k.ownerChatId) === String(req.query.chatId))); } catch (e) { res.json([]); }
});
app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body; let keys = await readDatabase();
    const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const exp = new Date(); exp.setDate(exp.getDate() + parseInt(days));
    keys.push({ key: newK, name, limit, expiry: exp.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(keys); res.json({ success: true });
});
app.post('/api/keys/extend', async (req, res) => {
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === req.body.key);
    if (idx !== -1) { let d = new Date(keys[idx].expiry); d.setDate(d.getDate() + 30); keys[idx].expiry = d.toISOString(); await saveDatabase(keys); res.json({ success: true }); } else res.json({ success: false });
});
app.post('/api/keys/update', async (req, res) => {
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === req.body.key);
    if (idx !== -1) {
        if (req.body.clearOwner) keys[idx].ownerChatId = null;
        else { keys[idx].name = req.body.name || keys[idx].name; keys[idx].limit = req.body.limit || keys[idx].limit; }
        await saveDatabase(keys); res.json({ success: true });
    } else res.json({ success: false });
});
app.post('/api/keys/delete', async (req, res) => {
    let keys = await readDatabase(); keys = keys.filter(k => k.key !== req.body.key);
    await saveDatabase(keys); res.json({ success: true });
});
app.post('/api/notify-admin', async (req, res) => {
    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔔 **ЗАПРОС ПРОДЛЕНИЯ**\n\nОбъект: ${req.body.name}\nКлюч: \`${req.body.key}\``, { parse_mode: 'Markdown' });
    res.json({ success: true });
});

// --- ДИЗАЙН АДМИНКИ (WEB APP) ---
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ADMIN | LOGIST X</title>
    <style>
        :root { --bg: #0a0c10; --card: #161b22; --accent: #f0ad4e; --text: #f0f6fc; --green: #238636; --border: #30363d; --red: #da3633; }
        body { background: var(--bg); color: var(--text); font-family: -apple-system, system-ui, sans-serif; padding: 15px; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        h3 { margin-top:0; color: var(--accent); }
        input, select, button { width: 100%; padding: 12px; margin-bottom: 12px; border-radius: 8px; border: 1px solid var(--border); background: #010409; color: #fff; box-sizing: border-box; }
        button { background: var(--accent); color: #000; font-weight: bold; cursor: pointer; border: none; }
        .key-item { background: #0d1117; padding: 15px; border-radius: 10px; margin-bottom: 10px; border-left: 5px solid var(--accent); }
        .btn-red { background: var(--red); color: #fff; margin-top: 5px; }
        .btn-green { background: var(--green); color: #fff; margin-top: 5px; }
    </style></head>
    <body>
        <div class="card"><h3>НОВАЯ ЛИЦЕНЗИЯ</h3>
            <input type="text" id="newName" placeholder="Название объекта">
            <input type="number" id="newLimit" value="5">
            <button onclick="addKey()">СГЕНЕРИРОВАТЬ КЛЮЧ</button>
        </div>
        <div id="keysList"></div>
    <script>
        async function load(){ 
            const res = await fetch('/api/keys'); const keys = await res.json(); 
            document.getElementById('keysList').innerHTML = keys.map(k => \`
                <div class="key-item">
                    <div style="font-weight:bold; color:var(--accent)">\${k.key}</div>
                    <input value="\${k.name}" onchange="upd('\${k.key}','name',this.value)" style="border:none; background:transparent; font-size:1.1rem; padding:5px 0">
                    <div style="font-size:0.85rem; color:#8b949e">Пользователей: \${k.workers ? k.workers.length : 0} / \${k.limit}</div>
                    <div style="font-size:0.85rem; color:#8b949e">До: \${new Date(k.expiry).toLocaleDateString()}</div>
                    <button class="btn-green" onclick="extendKey('\${k.key}')">ПРОДЛИТЬ +30 ДН.</button>
                    <button class="btn-red" onclick="delKey('\${k.key}')">УДАЛИТЬ</button>
                </div>\`).join(''); 
        }
        async function addKey(){ await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('newName').value,limit:document.getElementById('newLimit').value,days:30})}); load(); }
        async function extendKey(key){ await fetch('/api/keys/extend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})}); load(); }
        async function delKey(key){ if(confirm('Удалить?')){ await fetch('/api/keys/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})}); load(); }}
        async function upd(key,f,v){ await fetch('/api/keys/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key, [f]:v})}); load(); }
        load();
    </script></body></html>`);
});

// --- ДИЗАЙН КЛИЕНТСКОГО КАБИНЕТА (WEB APP) ---
app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>CLIENT | LOGIST X</title>
    <style>
        body { background: #0a0c10; color: #c9d1d9; font-family: sans-serif; padding: 15px; }
        .accent { color: #f0ad4e; text-transform: uppercase; text-align:center; display:block; margin-bottom:20px; }
        .card { background: #161b22; border-radius: 16px; padding: 20px; border: 1px solid #30363d; margin-bottom: 20px; }
        .key-code { font-family: monospace; background: #0d1117; padding: 8px; border-radius: 6px; color: #f0ad4e; display: block; margin: 10px 0; text-align: center; }
        .btn-pay { background: #f0ad4e; color: #000; border: none; padding: 14px; border-radius: 10px; width: 100%; font-weight: bold; text-decoration:none; display:block; text-align:center; }
    </style></head>
    <body>
        <div class="accent">Мои Лицензии</div>
        <div id="content"></div>
    <script>
        async function load(){ 
            const cid = new URLSearchParams(window.location.search).get('chatId'); 
            const res = await fetch('/api/client-keys?chatId=' + cid); const keys = await res.json();
            document.getElementById('content').innerHTML = keys.map(k => \`
                <div class="card">
                    <div style="font-size:1.3rem; font-weight:bold;">\${k.name}</div>
                    <span class="key-code">\${k.key}</span>
                    <div>👥 Мест: \${k.workers ? k.workers.length : 0} / \${k.limit}</div>
                    <div>⏳ До: \${new Date(k.expiry).toLocaleDateString()}</div>
                    <button onclick="requestExtend('\${k.key}', '\${k.name}')" class="btn-pay" style="margin-top:15px">ПРОДЛИТЬ СРОК</button>
                </div>\`).join('');
        }
        async function requestExtend(key, name) {
            await fetch('/api/notify-admin', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key, name})});
            alert('Запрос отправлен!');
        }
        load();
    </script></body></html>`);
});

// --- БОТ ---
bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) return ctx.reply('👑 ПАНЕЛЬ УПРАВЛЕНИЯ', { reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ КЛЮЧАМИ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    const keys = await readDatabase(); const ck = keys.find(k => String(k.ownerChatId) === String(cid));
    if (ck) return ctx.reply('🏢 ВАШ КАБИНЕТ ОБЪЕКТОВ', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ДАННЫЕ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    ctx.reply('👋 Logist X активен.', { reply_markup: { inline_keyboard: [[{ text: "🔑 У МЕНЯ ЕСТЬ КЛЮЧ", callback_data: "have" }]] } });
});

bot.action('have', ctx => ctx.reply('Введите ключ:'));

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return; 
    const key = ctx.message.text.trim().toUpperCase();
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) { 
        if(keys[idx].ownerChatId) return ctx.reply('Занят.'); 
        keys[idx].ownerChatId = ctx.chat.id; await saveDatabase(keys); 
        ctx.reply('✅ АКТИВИРОВАНО!', { reply_markup: { inline_keyboard: [[{ text: "📊 МОЙ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
    } else ctx.reply('Не найден.');
});

bot.launch().then(() => console.log("READY"));
app.listen(process.env.PORT || 3000);
