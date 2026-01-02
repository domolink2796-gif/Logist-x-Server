const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');
const path = require('path');

const app = express();
app.use(cors());
// Подключаем раздачу статических файлов (для client_panel.html)
app.use(express.static(__dirname));
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

// Авторизация Google
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
async function appendToReport(workerId, workerName, city, address, entrance, client, workType, price, lat, lon) {
    try {
        const dateStr = new Date().toISOString().split('T')[0];
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
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GPS', 'СТАТУС']] } });
        }
        const gpsLink = (lat && lon) ? `=HYPERLINK("http://maps.google.com/?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        await sheets.spreadsheets.values.append({ 
            spreadsheetId, 
            range: `${sheetTitle}!A1`, 
            valueInputOption: 'USER_ENTERED', 
            resource: { values: [[new Date().toLocaleTimeString("ru-RU"), address, entrance, client, workType, price, gpsLink, "ЗАГРУЖЕНО"]] } 
        });
    } catch (e) { console.error("Logist Sheet Error:", e); }
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
        const pdfLink = `=HYPERLINK("${pdfUrl}"; "ССЫЛКА НА ФОТО")`;
        await sheets.spreadsheets.values.append({ 
            spreadsheetId, 
            range: `${sheetTitle}!A1`, 
            valueInputOption: 'USER_ENTERED', 
            resource: { values: [[new Date().toLocaleDateString("ru-RU"), startTime, endTime, duration, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdfLink, gps]] } 
        });
    } catch (e) { console.error("Merch Error:", e); }
}

// === УНИВЕРСАЛЬНЫЙ РОУТЕР UPLOAD ===
app.post('/upload', async (req, res) => {
    try {
        const { action } = req.body;
        if (action === 'check_license') {
            const { licenseKey, workerName } = req.body;
            const finalKey = (licenseKey || '').trim().toUpperCase();
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === finalKey);
            if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
            if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
            if (!kData.workers) kData.workers = [];
            if (workerName && !kData.workers.includes(workerName)) {
                if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест исчерпан' });
                kData.workers.push(workerName); 
                await saveDatabase(keys);
            }
            return res.json({ status: 'active', expiry: kData.expiry });
        }
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const mainFolderId = await getOrCreateFolder(kData ? kData.name : "Logist_Users", MY_ROOT_ID);
        const workerFolderId = await getOrCreateFolder(worker, mainFolderId);
        const dateFolderId = await getOrCreateFolder(new Date().toISOString().split('T')[0], workerFolderId);
        if (image) {
            const cleanAddr = address.replace(/[\\/:*?"<>|]/g, '');
            const fileName = `${cleanAddr}_п${entrance}_${client}.jpg`;
            const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            await drive.files.create({ 
                resource: { name: fileName, parents: [dateFolderId] }, 
                media: { mimeType: 'image/jpeg', body: Readable.from(buf) } 
            });
        }
        await appendToReport(workerFolderId, worker, city, address, entrance, client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdf, startTime, endTime, duration, lat, lon } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const mainFolderId = await getOrCreateFolder(kData ? kData.name : "Merch_Users", MERCH_ROOT_ID);
        const workerFolderId = await getOrCreateFolder(worker, mainFolderId);
        const dateFolderId = await getOrCreateFolder(new Date().toISOString().split('T')[0], workerFolderId);
        let pUrl = "Нет файла";
        if (pdf) {
            const buf = Buffer.from(pdf.split(',')[1], 'base64');
            const cleanAddr = address.replace(/[\\/:*?"<>|]/g, '');
            const f = await drive.files.create({ 
                resource: { name: `ОТЧЕТ_${cleanAddr}.jpg`, parents: [dateFolderId] }, 
                media: { mimeType: 'image/jpeg', body: Readable.from(buf) }, 
                fields: 'id, webViewLink' 
            });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }
        await appendMerchToReport(workerFolderId, worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pUrl, startTime, endTime, duration, lat, lon);
        res.json({ success: true, url: pUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// === АДМИНКА И API ===
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
        d.setDate(d.getDate() + 30); 
        keys[idx].expiry = d.toISOString(); 
        await saveDatabase(keys); 
        res.json({ success: true }); 
    } else res.json({ success: false });
});
app.post('/api/notify-admin', async (req, res) => {
    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔔 **ЗАПРОС ПРОДЛЕНИЯ**\n\nОбъект: ${req.body.name}\nКлюч: \`${req.body.key}\``, { parse_mode: 'Markdown' });
    res.json({ success: true });
});

// --- ВЕБ-ИНТЕРФЕЙСЫ ---

// Оригинальная админка (твоя личная)
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ADMIN</title><style>body{background:#0a0c10;color:#fff;font-family:sans-serif;padding:20px}.card{background:#161b22;padding:20px;margin-bottom:10px;border-radius:10px;border:1px solid #30363d}input,select,button{width:100%;padding:10px;margin-bottom:10px;background:#0d1117;color:#fff;border:1px solid #30363d;border-radius:5px}.btn{background:#f0ad4e;color:#000;font-weight:bold;cursor:pointer}</style></head><body><h3>LOGIST ADMIN</h3><div class="card"><input id="n" placeholder="Имя"><input id="l" type="number" value="5"><select id="d"><option value="30">30 Дней</option><option value="365">1 Год</option></select><button class="btn" onclick="add()">СОЗДАТЬ</button></div><div id="list"></div><script>const PASS="${ADMIN_PASS}";function auth(){if(localStorage.getItem('p')!==PASS){if(prompt('PASS')===PASS)localStorage.setItem('p',PASS);else auth();}}async function load(){const r=await fetch('/api/keys');const d=await r.json();document.getElementById('list').innerHTML=d.map(k=>'<div class="card"><b>'+k.key+'</b><br>'+k.name+' ('+k.workers.length+'/'+k.limit+')<br>'+new Date(k.expiry).toLocaleDateString()+'<br><button class="btn" onclick="ext(\\''+k.key+'\\')">ПРОДЛИТЬ</button></div>').join('')}async function add(){await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('n').value,limit:document.getElementById('l').value,days:document.getElementById('d').value})});load()}async function ext(key){if(confirm('Продлить?')){await fetch('/api/keys/extend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});load()}}auth();load()</script></body></html>`);
});

// Новый интерфейс (для клиентов)
app.get('/client-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'client_panel.html'));
});

// Совместимость со старой кнопкой клиента (на всякий случай)
app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CLIENT</title><style>body{background:#0a0c10;color:#c9d1d9;font-family:sans-serif;padding:15px}.card{background:#161b22;border-radius:16px;padding:20px;border:1px solid #30363d;margin-bottom:20px}.btn{background:#f0ad4e;color:#000;border:none;padding:14px;border-radius:10px;width:100%;font-weight:bold;cursor:pointer;display:block;margin-top:10px}</style></head><body><h2 style="text-align:center;color:#f0ad4e">МОИ ОБЪЕКТЫ</h2><div id="c">Загрузка...</div><script>async function l(){const id=new URLSearchParams(window.location.search).get('chatId');const r=await fetch('/api/client-keys?chatId='+id);const k=await r.json();document.getElementById('c').innerHTML=k.length?k.map(i=>'<div class="card"><h3>'+i.name+'</h3><code>'+i.key+'</code><p>👥 '+i.workers.length+' / '+i.limit+'</p><p>📅 до '+new Date(i.expiry).toLocaleDateString()+'</p><button class="btn" onclick="ask(\\''+i.key+'\\',\\''+i.name+'\\')">ПРОДЛИТЬ</button></div>').join(''):'<p align="center">Нет лицензий</p>'}async function ask(k,n){await fetch('/api/notify-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k,name:n})});alert('Запрос отправлен!')}l()</script></body></html>`);
});

// --- TELEGRAM BOT ---
bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    // ТВОЙ ДОСТУП
    if (cid === MY_TELEGRAM_ID) {
        return ctx.reply('👑 ADMIN PANEL', { 
            reply_markup: { 
                inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ", web_app: { url: SERVER_URL + "/dashboard" } }]] 
            } 
        });
    }
    // ДОСТУП КЛИЕНТА
    const keys = await readDatabase(); 
    if (keys.find(k => String(k.ownerChatId) === String(cid))) {
        return ctx.reply('🏢 ЛИЧНЫЙ КАБИНЕТ', { 
            reply_markup: { 
                inline_keyboard: [[{ text: "📊 МОИ ОБЪЕКТЫ", web_app: { url: SERVER_URL + "/client-panel?chatId=" + cid } }]] 
            } 
        });
    }
    ctx.reply('Введите ключ доступа для привязки:');
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return; 
    const key = ctx.message.text.trim();
    let keys = await readDatabase(); 
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) { 
        if(keys[idx].ownerChatId) return ctx.reply('Этот ключ уже занят другим пользователем.'); 
        keys[idx].ownerChatId = ctx.chat.id; 
        await saveDatabase(keys); 
        ctx.reply('✅ Ключ успешно привязан!', { 
            reply_markup: { 
                inline_keyboard: [[{ text: "📊 ОТКРЫТЬ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-panel?chatId=" + ctx.chat.id } }]] 
            } 
        });
    } else { ctx.reply('Ключ не найден.'); }
});

bot.launch();
app.listen(process.env.PORT || 3000, () => console.log("Server Started"));
