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
const SERVER_URL = 'https://logist-x-server-production.app';
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
        const pdfLink = `=HYPERLINK("${pdfUrl}"; "ОТЧЕТ ФОТО")`;
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
        const cityId = await getOrCreateFolder(city, wId);
        const dId = await getOrCreateFolder(new Date().toISOString().split('T')[0], cityId);
        if (image) {
            const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
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
    if (idx !== -1) { 
        let d = new Date(keys[idx].expiry); 
        d.setDate(d.getDate() + parseInt(req.body.days || 30)); 
        keys[idx].expiry = d.toISOString(); 
        await saveDatabase(keys); res.json({ success: true }); 
    } else res.json({ success: false });
});
app.post('/api/keys/update', async (req, res) => {
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === req.body.key);
    if (idx !== -1) {
        if (req.body.clearOwner) keys[idx].ownerChatId = null;
        else { 
            keys[idx].name = req.body.name || keys[idx].name; 
            keys[idx].limit = req.body.limit || keys[idx].limit; 
        }
        await saveDatabase(keys); res.json({ success: true });
    } else res.json({ success: false });
});
app.post('/api/keys/delete', async (req, res) => {
    let keys = await readDatabase(); keys = keys.filter(k => k.key !== req.body.key);
    await saveDatabase(keys); res.json({ success: true });
});
app.post('/api/notify-admin', async (req, res) => {
    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔔 **ЗАПРОС ПРОДЛЕНИЯ**\n\nОбъект: ${req.body.name}\nКлюч: \`${req.body.key}\`\nСрок: ${req.body.days} дн.`, { parse_mode: 'Markdown' });
    res.json({ success: true });
});

// --- ДИЗАЙН АДМИНКИ (WEB APP) ---
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>LOGIST_X | Admin</title>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { background-color: #010409; color: #e6edf3; font-family: 'Inter', sans-serif; margin: 0; padding: 15px; }
        .gold-text { color: #f59e0b; }
        .header { display: flex; align-items: center; gap: 10px; margin-bottom: 25px; padding: 10px; }
        .logo-box { background: #f59e0b; padding: 5px; border-radius: 8px; display: flex; align-items: center; }
        .logo-text { font-size: 1.2rem; font-weight: 900; text-transform: uppercase; letter-spacing: -1px; font-style: italic; }
        .card { background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 20px; margin-bottom: 20px; }
        input { width: 100%; padding: 14px; margin-bottom: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff; box-sizing: border-box; }
        .btn { width: 100%; padding: 16px; border-radius: 16px; border: none; font-weight: 900; text-transform: uppercase; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: 0.2s; }
        .btn-gold { background: linear-gradient(135deg, #f59e0b 0%, #b45309 100%); color: #000; }
        .btn-small { padding: 8px; font-size: 0.7rem; border-radius: 8px; width: auto; flex: 1; }
        .btn-red { background: rgba(218, 54, 51, 0.1); color: #da3633; border: 1px solid rgba(218, 54, 51, 0.2); margin-top: 15px; padding: 8px; }
        .worker-list { background: rgba(0,0,0,0.4); padding: 10px; border-radius: 10px; margin: 10px 0; font-size: 12px; }
        .row { display: flex; gap: 5px; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-box"><i data-lucide="shield-check" color="black" size="18"></i></div>
        <div class="logo-text">LOGIST<span class="gold-text">_X ADMIN</span></div>
    </div>
    <div class="card">
        <div style="font-weight:900; margin-bottom:15px">НОВЫЙ ОБЪЕКТ</div>
        <input id="n" placeholder="Название объекта">
        <input id="l" type="number" value="5" placeholder="Лимит">
        <button class="btn btn-gold" onclick="add()">СОЗДАТЬ КЛЮЧ</button>
    </div>
    <div id="list"></div>
    <script>
        async function load(){
            const r = await fetch('/api/keys');
            const keys = await r.json();
            document.getElementById('list').innerHTML = keys.map(k => \`
                <div class="card">
                    <div class="gold-text" style="font-weight:900; font-family:monospace">\${k.key}</div>
                    <div style="font-weight:700; margin:5px 0">\${k.name}</div>
                    
                    <div style="font-size:11px; margin-bottom:10px">
                        Лимит: <input type="number" value="\${k.limit}" style="width:50px; padding:2px; display:inline; margin:0" onchange="updLimit('\${k.key}', this.value)">
                        До: \${new Date(k.expiry).toLocaleDateString()}
                    </div>

                    <div class="worker-list">
                        <b>ШТАТ (\${k.workers.length}):</b><br>
                        \${k.workers.join(', ') || 'Пусто'}
                    </div>

                    <div class="row">
                        <button class="btn btn-gold btn-small" onclick="ext('\${k.key}', 30)">+30д</button>
                        <button class="btn btn-gold btn-small" onclick="ext('\${k.key}', 90)">+90д</button>
                        <button class="btn btn-gold btn-small" onclick="ext('\${k.key}', 180)">+180д</button>
                    </div>
                    <button class="btn btn-red" onclick="del('\${k.key}')">УДАЛИТЬ</button>
                </div>\`).join('');
            lucide.createIcons();
        }
        async function add(){
            await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('n').value,limit:document.getElementById('l').value,days:30})});
            load();
        }
        async function ext(key, days){
            await fetch('/api/keys/extend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key, days})});
            load();
        }
        async function updLimit(key, limit){
            await fetch('/api/keys/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key, limit})});
        }
        async function del(key){
            if(confirm('Удалить?')){
                await fetch('/api/keys/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
                load();
            }
        }
        load();
    </script>
</body>
</html>`);
});

// --- ДИЗАЙН КЛИЕНТСКОГО КАБИНЕТА (WEB APP) ---
app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>LOGIST_X | Кабинет</title>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { background-color: #010409; color: #e6edf3; font-family: 'Inter', sans-serif; margin: 0; padding: 15px; }
        .gold-text { color: #f59e0b; }
        .header { display: flex; align-items: center; gap: 10px; margin-bottom: 25px; padding: 10px; }
        .logo-box { background: #f59e0b; padding: 5px; border-radius: 8px; display: flex; align-items: center; }
        .logo-text { font-size: 1.2rem; font-weight: 900; text-transform: uppercase; letter-spacing: -1px; font-style: italic; }
        .card { background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 20px; margin-bottom: 20px; }
        .obj-title { font-weight: 900; text-transform: uppercase; font-size: 1.1rem; margin-bottom: 15px; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        .stat-item { background: rgba(255,255,255,0.03); padding: 12px; border-radius: 16px; text-align: center; }
        .stat-label { font-size: 9px; text-transform: uppercase; opacity: 0.5; }
        .stat-value { font-weight: 900; display: block; font-size: 1.1rem; }
        .btn { width: 100%; padding: 16px; border-radius: 16px; border: none; font-weight: 900; text-transform: uppercase; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 5px; }
        .btn-gold { background: linear-gradient(135deg, #f59e0b 0%, #b45309 100%); color: #000; }
        .btn-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-box"><i data-lucide="shield-check" color="black" size="18"></i></div>
        <div class="logo-text">LOGIST<span class="gold-text">_X</span></div>
    </div>
    <div id="container"></div>
    <script>
        async function load(){
            const params = new URLSearchParams(window.location.search);
            const cid = params.get('chatId');
            const r = await fetch('/api/client-keys?chatId=' + cid);
            const keys = await r.json();
            document.getElementById('container').innerHTML = keys.map(k => {
                const days = Math.ceil((new Date(k.expiry) - new Date()) / (1000*60*60*24));
                return \`<div class="card">
                    <div class="obj-title">\${k.name}</div>
                    <div class="stats-grid">
                        <div class="stat-item"><span class="stat-label">Дней</span><span class="stat-value">\${days > 0 ? days : 0}</span></div>
                        <div class="stat-item"><span class="stat-label">Места</span><span class="stat-value">\${k.workers.length} / \${k.limit}</span></div>
                    </div>
                    <div style="font-size:10px; opacity:0.6; margin-bottom:10px">ЗАПРОС ПРОДЛЕНИЯ:</div>
                    <div class="btn-row">
                        <button class="btn btn-gold" style="padding:10px" onclick="req('\${k.key}','\${k.name}', 30)">30д</button>
                        <button class="btn btn-gold" style="padding:10px" onclick="req('\${k.key}','\${k.name}', 90)">90д</button>
                        <button class="btn btn-gold" style="padding:10px" onclick="req('\${k.key}','\${k.name}', 180)">180д</button>
                    </div>
                </div>\`;
            }).join('');
            lucide.createIcons();
        }
        async function req(key, name, days){
            await fetch('/api/notify-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,name,days})});
            alert('Запрос на продление ('+days+' дн.) отправлен!');
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
    ctx.reply('👋 Введите ваш ключ для активации:');
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return; 
    const key = ctx.message.text.trim().toUpperCase();
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) { 
        if(keys[idx].ownerChatId) return ctx.reply('Ключ уже занят.'); 
        keys[idx].ownerChatId = ctx.chat.id; await saveDatabase(keys); 
        ctx.reply('✅ АКТИВИРОВАНО!', { reply_markup: { inline_keyboard: [[{ text: "📊 МОЙ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
    } else ctx.reply('Ключ не найден.');
});

bot.launch().then(() => console.log("READY"));
app.listen(process.env.PORT || 3000);
