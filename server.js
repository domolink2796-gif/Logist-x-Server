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

// --- НАСТРОЙКИ (ТВОИ ДАННЫЕ) ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

const MY_TG_NICK = 'gena_krokodi';
const MY_EMAIL = 'Evgeny_orel@mail.ru';

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- ФУНКЦИИ GOOGLE ---
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
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleTimeString("ru-RU"), address, entrance, client, workType, price, gpsLink, "ЗАГРУЖЕНО"]] } });
    } catch (e) { console.error("Logist Sheet Error:", e); }
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
        const pdfLink = `=HYPERLINK("${pdfUrl}"; "ССЫЛКА НА ФОТО")`;
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleDateString("ru-RU"), startTime, endTime, duration, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdfLink, gps]] } });
    } catch (e) { console.error("Merch Error:", e); }
}

// === API ===
app.post('/upload', async (req, res) => {
    try {
        const { action } = req.body;
        if (action === 'check_license') {
            const { licenseKey, workerName, referrerId } = req.body;
            const finalKey = (licenseKey || '').trim().toUpperCase();
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === finalKey);
            if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
            if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
            if (!kData.workers) kData.workers = [];
            if (workerName && !kData.workers.includes(workerName)) {
                if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест' });
                kData.workers.push(workerName); 
                if (referrerId && !kData.partnerId) { kData.partnerId = referrerId; await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔥 **ПАРТНЕР!**\nОбъект: ${kData.name}`); }
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
            await drive.files.create({ resource: { name: fileName, parents: [dateFolderId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) } });
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
            const f = await drive.files.create({ resource: { name: `ОТЧЕТ_${cleanAddr}.jpg`, parents: [dateFolderId] }, media: { mimeType: 'image/jpeg', body: Readable.from(buf) }, fields: 'id, webViewLink' });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }
        await appendMerchToReport(workerFolderId, worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pUrl, startTime, endTime, duration, lat, lon);
        res.json({ success: true, url: pUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// API УПРАВЛЕНИЯ
app.get('/api/keys', async (req, res) => { res.json(await readDatabase()); });
app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body; let keys = await readDatabase();
    const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const exp = new Date(); exp.setDate(exp.getDate() + parseInt(days));
    keys.push({ key: newK, name, limit, expiry: exp.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(keys); res.json({ success: true });
});
app.post('/api/keys/update', async (req, res) => {
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === req.body.key);
    if (idx !== -1) {
        if (req.body.clearOwner) keys[idx].ownerChatId = null;
        else { keys[idx].name = req.body.name || keys[idx].name; keys[idx].limit = req.body.limit || keys[idx].limit; }
        await saveDatabase(keys); res.json({ success: true });
    } else res.json({ success: false });
});
app.post('/api/keys/extend', async (req, res) => {
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === req.body.key);
    if (idx !== -1) { let d = new Date(keys[idx].expiry); d.setDate(d.getDate() + 30); keys[idx].expiry = d.toISOString(); await saveDatabase(keys); res.json({ success: true }); } else res.json({ success: false });
});
app.post('/api/keys/delete', async (req, res) => {
    let keys = await readDatabase(); keys = keys.filter(k => k.key !== req.body.key);
    await saveDatabase(keys); res.json({ success: true });
});
app.get('/api/client-keys', async (req, res) => {
    try { const keys = await readDatabase(); const cid = String(req.query.chatId); res.json(keys.filter(k => String(k.ownerChatId) === cid)); } catch (e) { res.json([]); }
});

// --- АДМИНКА (ТВОЙ ОБРАЗ + СОВРЕМЕННЫЙ СТИЛЬ) ---
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LOGIST_X | ADMIN</title>
    <style>
        body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,sans-serif;margin:0;padding:20px}
        .container{max-width:1000px;margin:0 auto}
        .gold{color:#f0ad4e;font-weight:900;font-style:italic;text-transform:uppercase}
        .card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px;margin-bottom:20px}
        .key-item{background:#0d1117;border:1px solid #30363d;padding:15px;border-radius:10px;margin-top:10px;display:flex;justify-content:space-between;align-items:center}
        input{background:#010409;border:1px solid #30363d;color:#fff;padding:8px;border-radius:6px;margin:5px}
        .btn{padding:10px 20px;border-radius:6px;border:none;cursor:pointer;font-weight:bold;text-transform:uppercase;font-size:11px}
        .btn-gold{background:#f0ad4e;color:#000}
        .btn-red{background:#da3633;color:#fff}
        .btn-outline{background:transparent;border:1px solid #30363d;color:#8b949e}
    </style></head>
    <body>
        <div class="container">
            <h1>LOGIST<span class="gold">_X</span> ПУЛЬТ</h1>
            <div class="card">
                <h3 class="gold">+ СОЗДАТЬ КЛЮЧ</h3>
                <input id="n" placeholder="Имя объекта">
                <input id="l" type="number" value="5" style="width:60px">
                <button class="btn btn-gold" onclick="add()">ДОБАВИТЬ</button>
            </div>
            <div id="list"></div>
        </div>
        <script>
            const PASS = "${ADMIN_PASS}";
            function auth(){ if(localStorage.getItem('p')!==PASS){ let p=prompt('ВВОД'); if(p===PASS)localStorage.setItem('p',PASS); else auth(); } }
            async function load(){
                const r = await fetch('/api/keys');
                const keys = await r.json();
                // ТВОЙ ОРИГИНАЛЬНЫЙ ОБРАЗ ВЫВОДА ДАННЫХ
                document.getElementById('list').innerHTML = keys.map(k => \`
                    <div class="key-item">
                        <div style="flex-grow:1">
                            <span class="gold" style="font-size:12px">\${k.key}</span><br>
                            <input value="\${k.name}" onchange="upd('\${k.key}','name',this.value)" style="font-weight:bold;font-size:16px;border:none;background:none;width:200px">
                            <div style="font-size:11px;color:#8b949e">
                                Лимит: <input type="number" value="\${k.limit}" style="width:40px" onchange="upd('\${k.key}','limit',this.value)"> 
                                | До: \${new Date(k.expiry).toLocaleDateString()}
                                | Владелец: \${k.ownerChatId || 'НЕТ'}
                            </div>
                        </div>
                        <div>
                            <button class="btn btn-gold" onclick="ext('\${k.key}')">ПРОДЛИТЬ</button>
                            <button class="btn btn-red" onclick="del('\${k.key}')">УДАЛИТЬ</button>
                            \${k.ownerChatId ? \`<br><button class="btn btn-outline" style="margin-top:5px" onclick="upd('\${k.key}','clearOwner',true)">СБРОС ВЛАДЕЛЬЦА</button>\` : ''}
                        </div>
                    </div>
                \`).join('');
            }
            async function add(){
                const n=document.getElementById('n').value; const l=document.getElementById('l').value;
                await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,limit:l,days:30})});
                load();
            }
            async function upd(key,f,v){
                const b={key}; if(f==='clearOwner')b.clearOwner=true; else b[f]=v;
                await fetch('/api/keys/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
                load();
            }
            async function ext(key){ await fetch('/api/keys/extend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})}); load(); }
            async function del(key){ if(confirm('УДАЛИТЬ?')){ await fetch('/api/keys/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})}); load(); }}
            auth(); load();
        </script>
    </body></html>`);
});

// КЛИЕНТСКИЙ КАБИНЕТ (Стиль Logist_X)
app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>LOGIST_X</title>
    <style>body{background:#010409;color:#fff;font-family:sans-serif;padding:20px}.card{background:#161b22;border-radius:20px;padding:20px;margin-bottom:15px;border:1px solid #30363d}.gold{color:#f59e0b;font-weight:900}</style></head>
    <body><h2>LOGIST<span class="gold">_X</span></h2><div id="c"></div>
    <script>async function load(){const r=await fetch('/api/client-keys?chatId='+new URLSearchParams(window.location.search).get('chatId'));const d=await r.json();
    document.getElementById('c').innerHTML=d.map(k=>\`<div class="card"><h3>\${k.name}</h3><p>Лимит: \${k.workers.length} / \${k.limit}</p><p>До: \${new Date(k.expiry).toLocaleDateString()}</p></div>\`).join('')}load()</script></body></html>`);
});

// --- TELEGRAM BOT ---
bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) {
        return ctx.reply('💎 LOGIST_X ADMIN', { reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ КЛЮЧАМИ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    }
    ctx.reply('Введите ключ активации:');
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return;
    const key = ctx.message.text.trim().toUpperCase(); let keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) {
        if(keys[idx].ownerChatId) return ctx.reply('Ключ уже занят.');
        keys[idx].ownerChatId = ctx.chat.id; await saveDatabase(keys);
        ctx.reply('✅ Активировано!', { reply_markup: { inline_keyboard: [[{ text: "📊 МОЙ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
    } else ctx.reply('Ключ не найден.');
});

bot.launch();
app.listen(process.env.PORT || 3000, () => console.log("SERVER UP"));
