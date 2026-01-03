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
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';
const MAX_DISTANCE_METERS = 600; 

// --- НАСТРОЙКИ РОБОКАССЫ (ТЕСТОВЫЙ РЕЖИМ) ---
const ROBO_LOGIN = 'ВАШ_ЛОГИН'; 
const ROBO_PASS1 = 'ТЕСТ_ПАРОЛЬ_1'; 
const ROBO_PASS2 = 'ТЕСТ_ПАРОЛЬ_2'; 
const IS_TEST = 1; 

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

// Вспомогательный эндпоинт для открытия папки из кабинета
app.get('/api/open-folder', async (req, res) => {
    try {
        const { objectName, workerName } = req.query;
        // Поиск папки объекта
        const qObj = `name = '${objectName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const resObj = await drive.files.list({ q: qObj, fields: 'files(id)' });
        if (resObj.data.files.length === 0) return res.send("Папка объекта еще не создана.");
        
        let targetLink = null;
        for (let obj of resObj.data.files) {
            const qW = `name = '${workerName}' and '${obj.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
            const resW = await drive.files.list({ q: qW, fields: 'files(webViewLink)' });
            if (resW.data.files.length > 0) {
                targetLink = resW.data.files[0].webViewLink;
                break;
            }
        }
        if (targetLink) res.redirect(targetLink);
        else res.send("Папка сотрудника пока отсутствует.");
    } catch (e) { res.send("Ошибка: " + e.message); }
});

// --- ОТЧЕТЫ ЛОГИСТИКИ / МЕРЧ ---
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
    if (licenseKey === 'DEV-MASTER-999') return res.json({ status: 'active', expiry: kData.expiry });
    if (!kData.workers) kData.workers = [];
    if (!kData.workers.includes(workerName)) {
        if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест исчерпан' });
        kData.workers.push(workerName); 
        await saveDatabase(keys);
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

// === API КЛЮЧЕЙ ===
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
    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔔 **ЗАПРОС ПРОДЛЕНИЯ**\n\nОбъект: ${req.body.name}\nКлюч: \`${req.body.key}\`\nСрок: ${req.body.days} дн.`, { parse_mode: 'Markdown' });
    res.json({ success: true });
});

// --- ДИЗАЙН АДМИНКИ ---
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ADMIN | LOGIST_X</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { background-color: #010409; color: #e6edf3; font-family: 'Inter', sans-serif; margin: 0; padding: 15px; }
        .card { background: #0d1117; border: 1px solid #30363d; border-radius: 16px; padding: 20px; margin-bottom: 15px; }
        .expired { border-color: #da3633 !important; box-shadow: 0 0 10px rgba(218, 54, 51, 0.2); }
        .gold-text { color: #f59e0b; }
        input { width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 8px; border: 1px solid #30363d; background: #010409; color: #fff; box-sizing: border-box; }
        .btn { padding: 12px; border-radius: 8px; border: none; font-weight: 700; cursor: pointer; width: 100%; margin-top: 5px; }
        .btn-gold { background: #f59e0b; color: #000; }
        .btn-red { background: #da3633; color: #fff; }
        .btn-small { padding: 6px; width: auto; flex: 1; font-size: 11px; }
        .row { display: flex; gap: 5px; }
    </style>
</head>
<body>
    <div style="margin-bottom:20px; font-weight:900">📦 ПАНЕЛЬ УПРАВЛЕНИЯ</div>
    <div class="card">
        <b>ДОБАВИТЬ ОБЪЕКТ</b>
        <input id="n" placeholder="Название объекта">
        <input id="l" type="number" value="5" placeholder="Лимит человек">
        <button class="btn btn-gold" onclick="add()">СОЗДАТЬ КЛЮЧ</button>
    </div>
    <div id="list"></div>
    <script>
        async function load(){
            const r = await fetch('/api/keys');
            const keys = await r.json();
            document.getElementById('list').innerHTML = keys.map(k => {
                const isExp = new Date(k.expiry) < new Date();
                return \`<div class="card \${isExp ? 'expired' : ''}">
                    <div class="gold-text" style="font-weight:900">\${k.key}</div>
                    <div style="margin:5px 0">\${k.name}</div>
                    <div style="font-size:11px; opacity:0.6">
                        Лимит: <input type="number" value="\${k.limit}" style="width:40px; border:none; background:transparent; color:#f59e0b; font-weight:700" onchange="updLimit('\${k.key}', this.value)">
                        | До: \${new Date(k.expiry).toLocaleDateString()} \${isExp ? '❌' : '✅'}
                    </div>
                    <div style="background:rgba(255,255,255,0.03); padding:8px; border-radius:8px; font-size:10px; margin:10px 0; color:#8b949e">
                        \${k.workers && k.workers.length ? k.workers.join(', ') : 'НЕТ АКТИВНЫХ ПОЛЬЗОВАТЕЛЕЙ'}
                    </div>
                    <div class="row">
                        <button class="btn btn-gold btn-small" onclick="ext('\${k.key}', 30)">+30д</button>
                        <button class="btn btn-gold btn-small" onclick="ext('\${k.key}', 90)">+90д</button>
                        <button class="btn btn-gold btn-small" onclick="ext('\${k.key}', 180)">+180д</button>
                    </div>
                    <button class="btn btn-red btn-small" style="width:100%; margin-top:10px; opacity:0.5" onclick="del('\${k.key}')">УДАЛИТЬ КЛЮЧ</button>
                </div>\`;
            }).join('');
        }
        async function add(){
            const n = document.getElementById('n').value;
            const l = document.getElementById('l').value;
            if(!n) return alert('Введите имя');
            await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,limit:l,days:30})});
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

// --- НОВЫЙ ДИЗАЙН КЛИЕНТА (С ПАПКАМИ И ПУСТЫМИ СЛОТАМИ) ---
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
        .card { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 25px; margin-bottom: 20px; position: relative; overflow: hidden; }
        .card::before { content: ""; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #f59e0b; }
        .obj-name { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 5px; }
        .status-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: rgba(245, 158, 11, 0.1); color: #f59e0b; margin-bottom: 15px; }
        .stats { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .stat-item { text-align: center; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 12px; flex: 1; margin: 0 4px; }
        .stat-val { display: block; font-weight: 800; font-size: 16px; color: #f59e0b; }
        .stat-lbl { font-size: 9px; opacity: 0.5; text-transform: uppercase; }
        
        /* Список сотрудников */
        .workers-box { background: rgba(0,0,0,0.2); border-radius: 16px; padding: 5px; margin-bottom: 20px; }
        .worker-row { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .worker-row:last-child { border-bottom: none; }
        .w-name { font-size: 14px; font-weight: 600; }
        .w-empty { font-size: 13px; opacity: 0.3; font-style: italic; }
        .btn-folder { text-decoration: none; background: rgba(245, 158, 11, 0.1); color: #f59e0b; padding: 6px 10px; border-radius: 8px; font-size: 10px; font-weight: 800; border: 1px solid rgba(245,158,11,0.2); }

        .btn-main { background: #f59e0b; color: #000; border: none; padding: 15px; border-radius: 14px; font-weight: 800; width: 100%; cursor: pointer; transition: 0.3s; margin-top: 10px; }
        .selector-box { margin-top: 20px; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 16px; border: 1px dashed rgba(255,255,255,0.1); }
        .grid-prices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .price-card { background: rgba(0,0,0,0.3); padding: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); text-align: center; cursor: pointer; }
        .sale-tag { font-size: 8px; background: #da3633; color: #fff; padding: 2px 5px; border-radius: 4px; display: inline-block; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-box">LOGIST X</div>
        <div style="font-size: 12px; opacity: 0.6">ЛИЧНЫЙ КАБИНЕТ</div>
    </div>
    <div id="root"></div>

    <script>
        async function load(){
            const params = new URLSearchParams(window.location.search);
            const r = await fetch('/api/client-keys?chatId=' + params.get('chatId'));
            const keys = await r.json();
            document.getElementById('root').innerHTML = keys.map(k => {
                const days = Math.ceil((new Date(k.expiry) - new Date()) / (1000*60*60*24));
                
                // Рендерим сотрудников + пустые слоты до лимита
                let workersHTML = '';
                // 1. Те, кто уже работает
                k.workers.forEach(w => {
                    workersHTML += \`
                        <div class="worker-row">
                            <span class="w-name">👤 \${w}</span>
                            <a href="/api/open-folder?objectName=\${encodeURIComponent(k.name)}&workerName=\${encodeURIComponent(w)}" target="_blank" class="btn-folder">📂 ОТЧЕТЫ</a>
                        </div>\`;
                });
                // 2. Свободные места
                for(let i = k.workers.length; i < k.limit; i++){
                    workersHTML += \`
                        <div class="worker-row">
                            <span class="w-empty">⚪️ Свободное место</span>
                            <span style="font-size:9px; opacity:0.1">VACANT</span>
                        </div>\`;
                }

                return \`
                <div class="card">
                    <div class="status-badge">Активный доступ</div>
                    <div class="obj-name">\${k.name}</div>
                    <div style="font-size: 11px; opacity: 0.5; margin-bottom: 20px;">Ключ: \${k.key}</div>
                    
                    <div class="stats">
                        <div class="stat-item"><span class="stat-val">\${days > 0 ? days : 0}</span><span class="stat-lbl">Дней осталось</span></div>
                        <div class="stat-item"><span class="stat-val">\${k.workers.length}/\${k.limit}</span><span class="stat-lbl">Мест занято</span></div>
                    </div>

                    <div style="font-size:10px; font-weight:800; color:#8b949e; margin-bottom:8px; text-transform:uppercase">Команда объекта:</div>
                    <div class="workers-box">
                        \${workersHTML}
                    </div>

                    <div class="selector-box">
                        <div style="font-size: 12px; font-weight: 700">🚀 ПРОДЛИТЬ ДОСТУП (\${k.limit} чел.)</div>
                        <div class="grid-prices">
                            <div class="price-card" onclick="req('\${k.key}','\${k.name}',30)">
                                <div style="font-size: 14px; font-weight: 800">30 дн.</div>
                                <div style="font-size: 10px; color: #f59e0b">\${k.limit * 1500} ₽</div>
                            </div>
                            <div class="price-card" onclick="req('\${k.key}','\${k.name}',90)">
                                <div class="sale-tag">-10%</div>
                                <div style="font-size: 14px; font-weight: 800">90 дн.</div>
                                <div style="font-size: 10px; color: #f59e0b">\${k.limit * 4050} ₽</div>
                            </div>
                            <div class="price-card" onclick="req('\${k.key}','\${k.name}',180)">
                                <div class="sale-tag">-15%</div>
                                <div style="font-size: 14px; font-weight: 800">180 дн.</div>
                                <div style="font-size: 10px; color: #f59e0b">\${k.limit * 7650} ₽</div>
                            </div>
                            <div class="price-card" onclick="req('\${k.key}','\${k.name}',365)">
                                <div class="sale-tag">+2 МЕС</div>
                                <div style="font-size: 14px; font-weight: 800">1 ГОД</div>
                                <div style="font-size: 10px; color: #f59e0b">\${k.limit * 15000} ₽</div>
                            </div>
                        </div>
                    </div>
                    <button class="btn-main" onclick="alert('Выберите период оплаты выше')">ОПЛАТИТЬ ОНЛАЙН</button>
                </div>\`;
            }).join('');
        }

        async function req(key, name, days){
            await fetch('/api/notify-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,name,days})});
            alert('Запрос на ' + days + ' дн. отправлен!');
        }
        load();
    </script>
</body>
</html>`);
});

// --- ТЕЛЕГРАМ БОТ ---
bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) return ctx.reply('👑 ПУЛЬТ УПРАВЛЕНИЯ', { reply_markup: { inline_keyboard: [[{ text: "📦 ОБЪЕКТЫ / КЛЮЧИ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    const keys = await readDatabase(); 
    const ck = keys.find(k => String(k.ownerChatId) === String(cid));
    if (ck) return ctx.reply('🏢 ВАШ КАБИНЕТ', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ДАННЫЕ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    
    const welcomeText = `👋 **Добро пожаловать в систему LOGIST X!**\n\nДля работы вам необходим ключ активации.\n\n📦 **LOGIST X** — отчеты логистики.\n📊 **MERCH** — мерчандайзинг.\n\nВведите ваш ключ ниже или обратитесь к администратору для покупки доступа.`;
    ctx.reply(welcomeText, { parse_mode: 'Markdown' });
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return; 
    const key = ctx.message.text.trim().toUpperCase();
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) { 
        if(keys[idx].ownerChatId) return ctx.reply('Этот ключ уже активирован другим пользователем.'); 
        keys[idx].ownerChatId = ctx.chat.id; await saveDatabase(keys); 
        ctx.reply('✅ КЛЮЧ УСПЕШНО АКТИВИРОВАН!', { reply_markup: { inline_keyboard: [[{ text: "📊 ОТКРЫТЬ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
    } else ctx.reply('❌ Ключ не найден. Проверьте правильность ввода или свяжитесь с поддержкой.');
});

bot.launch().then(() => console.log("READY"));
app.listen(process.env.PORT || 3000);
