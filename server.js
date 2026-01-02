const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
// Увеличенные лимиты для тяжелых фото и PDF
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; // Папка Логиста
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; // Папка Мерча
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x.ru'; // ТВОЙ ОСНОВНОЙ ДОМЕН

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

// === ГЛАВНАЯ СТРАНИЦА (УБИРАЕМ 404) ===
app.get('/', (req, res) => {
    res.send(`<html><body style="background:#010409;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><h1>LOGIST_X Server is Active</h1></body></html>`);
});

// === ПЕРЕХВАТ ПАРТНЕРА ===
app.get('/reg', (req, res) => {
    const ref = req.query.ref || '';
    res.send(`<html><body style="background:#010409;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
        <div style="text-align:center;"><h2>Загрузка системы...</h2>
        <script>localStorage.setItem('partnerRef', '${ref}'); setTimeout(() => { window.location.href = '/'; }, 800);</script>
        </div></body></html>`);
});

// === УНИВЕРСАЛЬНЫЙ РОУТЕР UPLOAD ===
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
                if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест исчерпан' });
                kData.workers.push(workerName);
                if (referrerId && !kData.partnerId) {
                    kData.partnerId = referrerId;
                    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔥 **ПАРТНЕРСКАЯ ПРОДАЖА!**\n\nОбъект: ${kData.name}\nПартнер ID: \`${referrerId}\`\nБонус: **15%**`);
                }
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

// --- API ---
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
app.post('/api/notify-admin', async (req, res) => {
    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔔 **ЗАПРОС ПРОДЛЕНИЯ**\n\nОбъект: ${req.body.name}\nКлюч: \`${req.body.key}\``, { parse_mode: 'Markdown' });
    res.json({ success: true });
});

// --- ВЕБ-ИНТЕРФЕЙСЫ ---
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>LOGIST_X | ADMIN</title><script src="https://unpkg.com/lucide@latest"></script><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;900&display=swap');body{background:#010409;color:#e6edf3;font-family:'Inter',sans-serif;margin:0;padding:20px;display:flex;flex-direction:column;align-items:center}.card{background:#0d1117;border:1px solid #30363d;border-radius:16px;padding:20px;margin-bottom:15px;width:100%;max-width:400px;box-sizing:border-box}.btn{width:100%;padding:14px;border-radius:10px;border:none;font-weight:900;cursor:pointer;text-transform:uppercase;font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px;transition:0.2s}.btn-gold{background:#f59e0b;color:#000}.btn-gold:hover{background:#d97706}.gold{color:#f59e0b}input,select{width:100%;padding:12px;background:#000;border:1px solid #30363d;color:#fff;margin-bottom:10px;border-radius:8px;box-sizing:border-box;font-family:inherit}</style></head><body><h2 style="font-style:italic;letter-spacing:-1px">LOGIST<span class="gold">_X</span> ADMIN</h2><div class="card"><input id="n" placeholder="НАЗВАНИЕ ОБЪЕКТА"><input id="l" type="number" value="5" placeholder="ЛИМИТ МЕСТ"><select id="d"><option value="30">30 ДНЕЙ (МЕСЯЦ)</option><option value="365">365 ДНЕЙ (ГОД)</option></select><button class="btn btn-gold" onclick="add()"><i data-lucide="plus-circle"></i> СОЗДАТЬ КЛЮЧ</button></div><div id="list" style="width:100%;max-width:400px"></div><script>const PASS="${ADMIN_PASS}";function auth(){if(localStorage.getItem('p')!==PASS){let p=prompt('ACCESS PASSWORD');if(p===PASS)localStorage.setItem('p',PASS);else auth();}}async function load(){const r=await fetch('/api/keys');const d=await r.json();document.getElementById('list').innerHTML=d.data?d.data.map(k=>'<div class="card">...</div>').join(''):d.map(k=>'<div class="card"><div style="display:flex;justify-content:space-between;align-items:start"><b class="gold" style="font-size:18px">'+k.key+'</b><span style="font-size:10px;background:#21262d;padding:4px 8px;border-radius:10px">'+(k.workers?k.workers.length:0)+'/'+k.limit+'</span></div><div style="font-size:13px;margin:10px 0;color:#8b949e">ОБЪЕКТ: <span style="color:#fff">'+k.name+'</span><br>ДО: <span style="color:#fff">'+new Date(k.expiry).toLocaleDateString()+'</span>'+(k.partnerId ? '<br>ПАРТНЕР: <span class="gold">'+k.partnerId+'</span>' : '')+'</div><button class="btn btn-gold" style="height:35px;font-size:10px;opacity:0.8" onclick="ext(\\''+k.key+'\\')"><i data-lucide="calendar-plus" style="width:14px"></i> ПРОДЛИТЬ</button></div>').join('');lucide.createIcons();}async function add(){await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('n').value,limit:document.getElementById('l').value,days:document.getElementById('d').value})});load()}async function ext(key){if(confirm('Продлить?')){await fetch('/api/keys/extend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});load()}}auth();load();</script></body></html>`);
});

app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>MY OBJECTS</title><script src="https://unpkg.com/lucide@latest"></script><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;900&display=swap');body{background:#010409;color:#e6edf3;font-family:'Inter',sans-serif;margin:0;padding:15px}.card{background:#0d1117;border:1px solid #30363d;border-radius:20px;padding:20px;margin-bottom:15px;position:relative;overflow:hidden}.btn-action{background:#f59e0b;color:#000;border:none;padding:15px;border-radius:12px;width:100%;font-weight:900;cursor:pointer;text-transform:uppercase;font-size:12px;display:flex;align-items:center;justify-content:center;gap:10px;margin-top:15px}.gold{color:#f59e0b}.status{font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:900;margin-bottom:5px;display:block}</style></head><body><h2 style="text-align:center;font-style:italic">МОИ <span class="gold">ОБЪЕКТЫ</span></h2><div id="c"></div><script>async function l(){const id=new URLSearchParams(window.location.search).get('chatId');const r=await fetch('/api/client-keys?chatId='+id);const k=await r.json();document.getElementById('c').innerHTML=k.length?k.map(i=>'<div class="card"><span class="status gold">Активен</span><h3 style="margin:5px 0">'+i.name+'</h3><code style="background:#000;padding:5px 10px;border-radius:8px;display:inline-block;margin:10px 0;border:1px solid #30363d">'+i.key+'</code><div style="display:flex;gap:20px;font-size:12px;opacity:0.7"><span><i data-lucide="users" style="width:12px;vertical-align:middle"></i> '+i.workers.length+' / '+i.limit+'</span><span><i data-lucide="calendar" style="width:12px;vertical-align:middle"></i> до '+new Date(i.expiry).toLocaleDateString()+'</span></div><button class="btn-action" onclick="ask(\\''+i.key+'\\',\\''+i.name+'\\')"><i data-lucide="zap"></i> Продлить</button></div>').join(''):'<p align="center" style="margin-top:50px;opacity:0.5">Пусто</p>';lucide.createIcons();}async function ask(k,n){await fetch('/api/notify-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k,name:n})});alert('Отправлено!');}l();</script></body></html>`);
});

// --- BOT ---
bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) return ctx.reply('👑 АДМИН-ПАНЕЛЬ', { reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    ctx.reply('ВЫБЕРИТЕ РОЛЬ:', { reply_markup: { inline_keyboard: [[{ text: "💼 Я КЛИЕНТ", callback_data: "role_user" }], [{ text: "💰 ПАРТНЕР (15%)", callback_data: "role_partner" }]] } });
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data === 'role_user') {
        const keys = await readDatabase(); 
        if (keys.find(k => String(k.ownerChatId) === String(ctx.chat.id))) {
            return ctx.reply('🏢 ЛИЧНЫЙ КАБИНЕТ:', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ОБЪЕКТЫ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
        }
        ctx.reply('Введите лицензионный ключ:');
    }
    if (data === 'role_partner') {
        const refLink = `${SERVER_URL}/reg?ref=${ctx.chat.id}`;
        ctx.reply(`🤝 **ПАРТНЕРКА LOGIST_X**\n\nСсылка:\n\`${refLink}\`\n\nСтавка: **15%**`, { parse_mode: 'Markdown' });
    }
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return; 
    const key = ctx.message.text.trim();
    let keys = await readDatabase(); 
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) { 
        if(keys[idx].ownerChatId) return ctx.reply('Занято.'); 
        keys[idx].ownerChatId = ctx.chat.id; 
        await saveDatabase(keys); 
        ctx.reply('✅ Готово!', { reply_markup: { inline_keyboard: [[{ text: "📊 КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
    } else { ctx.reply('Не найден.'); }
});

bot.launch();
app.listen(process.env.PORT || 3000, () => console.log("Server Started"));
