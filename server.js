const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
// Лимит 150МБ для HD фото и PDF мерчандайзинга
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

// Auth Google
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- СИСТЕМНЫЕ ФУНКЦИИ ---
async function getOrCreateFolder(rawName, parentId) {
    try {
        const name = String(rawName).trim(); 
        const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
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
        const dataStr = JSON.stringify({ keys: keys }, null, 2);
        const bufferStream = new Readable(); bufferStream.push(dataStr); bufferStream.push(null);
        const media = { mimeType: 'application/json', body: bufferStream };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media: media }); } 
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media: media }); }
    } catch (e) { console.error("DB Error:", e); }
}

// --- ОТЧЕТЫ ЛОГИСТИКИ ---
async function appendToReport(workerId, workerName, city, dateStr, address, entrance, client, workType, price, lat, lon) {
    try {
        const reportName = `Отчет ${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId;
        if (res.data.files.length === 0) {
            const createRes = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } } });
            spreadsheetId = createRes.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        } else { spreadsheetId = res.data.files[0].id; }
        const sheetTitle = `${city}_${dateStr}`;
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({
                spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
                resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GPS', 'ФОТО']] }
            });
        }
        const gpsValue = (lat && lon) ? `=HYPERLINK("https://www.google.com/maps?q=${lat},${lon}"; "КАРТА")` : "Нет GPS";
        const timeNow = new Date().toLocaleTimeString("ru-RU");
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
            resource: { values: [[timeNow, address, entrance, client, workType, price, gpsValue, "ЗАГРУЖЕНО"]] }
        });
    } catch (e) { console.error("Logist Report Error:", e); }
}

// --- ОТЧЕТЫ МЕРЧА ---
async function appendMerchToReport(workerId, workerName, net, address, stock, shelf, pMy, pComp, pExp, pdfUrl) {
    try {
        const reportName = `Мерч_Аналитика_${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId;
        if (res.data.files.length === 0) {
            const createRes = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } } });
            spreadsheetId = createRes.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        } else { spreadsheetId = res.data.files[0].id; }

        const timeNow = new Date().toLocaleString("ru-RU");
        const sheetTitle = "ОТЧЕТЫ_МЕРЧ";
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', 
                resource: { values: [['ДАТА/ВРЕМЯ', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ЦЕНА(МЫ)', 'ЦЕНА(КОНК)', 'СРОК', 'PDF']] } 
            });
        }
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', 
            resource: { values: [[timeNow, net, address, stock, shelf, pMy, pComp, pExp, pdfUrl]] } 
        });
    } catch (e) { console.error("Merch Report Error:", e); }
}

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

// === API РОУТЫ ===

app.post('/check-license', async (req, res) => {
    try { res.json(await handleLicenseCheck(req.body)); } 
    catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

app.post('/upload', async (req, res) => {
    try {
        const body = req.body;
        if (body.action === 'check_license') return res.json(await handleLicenseCheck(body));
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = body;
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const ownerName = keyData ? keyData.name : "Неизвестный";
        const ownerId = await getOrCreateFolder(ownerName, MY_ROOT_ID);
        const workerId = await getOrCreateFolder(worker || "Работник", ownerId);
        const cityId = await getOrCreateFolder(city || "Город", workerId);
        const todayStr = new Date().toISOString().split('T')[0]; 
        const dateFolderId = await getOrCreateFolder(todayStr, cityId);
        let finalFolderName = (client && client.trim()) ? client.trim() : "Общий";
        const finalFolderId = await getOrCreateFolder(finalFolderName, dateFolderId);
        
        if (image) {
            const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            const fileName = `${address || "Без адреса"} ${entrance || ""}.jpg`.trim();
            await drive.files.create({ resource: { name: fileName, parents: [finalFolderId] }, media: { mimeType: 'image/jpeg', body: bufferStream } });
        }
        await appendToReport(workerId, worker, city, todayStr, address, entrance, finalFolderName, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock, shelf, priceMy, priceComp, expDate, pdf, city } = req.body;
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const ownerName = keyData ? keyData.name : "Мерч_Клиенты";
        
        const ownerId = await getOrCreateFolder(ownerName, MERCH_ROOT_ID);
        const workerId = await getOrCreateFolder(worker || "Мерчандайзер", ownerId);
        const cityId = await getOrCreateFolder(city || "Орёл", workerId);
        const todayStr = new Date().toISOString().split('T')[0]; 
        const dateFolderId = await getOrCreateFolder(todayStr, cityId);
        const netFolderId = await getOrCreateFolder(net || "Сеть", dateFolderId);

        let pdfUrl = "Нет файла";
        if (pdf) {
            const buffer = Buffer.from(pdf.replace(/^data:application\/pdf;base64,/, ""), 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            const fileName = `ОТЧЕТ_${address.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;
            const file = await drive.files.create({ resource: { name: fileName, parents: [netFolderId] }, media: { mimeType: 'application/pdf', body: bufferStream }, fields: 'id, webViewLink' });
            await drive.permissions.create({ fileId: file.data.id, resource: { role: 'reader', type: 'anyone' } });
            pdfUrl = file.data.webViewLink;
        }
        await appendMerchToReport(workerId, worker, net, address, stock, shelf, priceMy, priceComp, expDate, pdfUrl);
        res.json({ success: true, url: pdfUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- API КЛЮЧЕЙ ---
app.get('/api/keys', async (req, res) => res.json(await readDatabase()));
app.get('/api/client-keys', async (req, res) => {
    const keys = await readDatabase();
    res.json(keys.filter(k => String(k.ownerChatId) === String(req.query.chatId)));
});
app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body; let keys = await readDatabase();
    const newK = Math.random().toString(36).substring(2,7).toUpperCase() + "-" + Math.random().toString(36).substring(2,7).toUpperCase();
    const exp = new Date(); exp.setDate(exp.getDate() + parseInt(days));
    keys.push({ key: newK, name, limit, expiry: exp.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(keys); res.json({ success: true });
});
app.post('/api/keys/extend', async (req, res) => {
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === req.body.key);
    if (idx !== -1) { let d = new Date(keys[idx].expiry); d.setDate(d.getDate() + 30); keys[idx].expiry = d.toISOString(); await saveDatabase(keys); res.json({ success: true }); }
});
app.post('/api/notify-admin', async (req, res) => {
    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔔 **ЗАПРОС ПРОДЛЕНИЯ**\n\nОбъект: ${req.body.name}\nКлюч: \`${req.body.key}\``, { parse_mode: 'Markdown' });
    res.json({ success: true });
});

// --- ИНТЕРФЕЙСЫ (HTML) ---
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ADMIN</title><style>
        body { background: #0a0c10; color: #fff; font-family: sans-serif; padding: 20px; display:none; }
        .card { background: #161b22; border: 1px solid #30363d; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        input, select, button { width: 100%; padding: 10px; margin: 5px 0; border-radius: 5px; border: 1px solid #30363d; background: #0d1117; color: #fff; }
        button { background: #f0ad4e; color: #000; font-weight: bold; cursor: pointer; }
        .key-item { border-bottom: 1px solid #30363d; padding: 10px 0; }
    </style></head><body>
        <div class="card"><h3>НОВЫЙ КЛЮЧ</h3>
            <input id="n" placeholder="Объект"><input type="number" id="l" value="5">
            <select id="d"><option value="30">30 дней</option><option value="365">1 год</option></select>
            <button onclick="add()">СОЗДАТЬ</button>
        </div>
        <div id="list"></div>
    <script>
        const PASS = "${ADMIN_PASS}";
        if(localStorage.getItem('p')===PASS){ document.body.style.display='block'; load(); }
        else { let p=prompt('PASS:'); if(p===PASS){localStorage.setItem('p',PASS); location.reload();} }
        async function load(){
            const r = await fetch('/api/keys'); const data = await r.json();
            document.getElementById('list').innerHTML = data.map(k => \`
                <div class="key-item"><b>\${k.key}</b> | \${k.name} (\${k.workers.length}/\${k.limit})<br>
                <small>До: \${new Date(k.expiry).toLocaleDateString()}</small>
                <button style="width:auto; padding:5px; font-size:10px;" onclick="ext('\${k.key}')"> +30 дн.</button></div>\`).join('');
        }
        async function add(){ await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('n').value,limit:document.getElementById('l').value,days:document.getElementById('d').value})}); load(); }
        async function ext(key){ await fetch('/api/keys/extend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})}); load(); }
    </script></body></html>`);
});

app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CABINET</title><style>
        body { background: #0a0c10; color: #fff; font-family: sans-serif; padding: 15px; }
        .card { background: #161b22; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #30363d; }
        .btn { background: #f0ad4e; color: #000; padding: 10px; border-radius: 8px; text-align: center; font-weight: bold; cursor: pointer; }
    </style></head><body>
        <h3>МОИ ОБЪЕКТЫ</h3><div id="c"></div>
    <script>
        async function load(){
            const cid = new URLSearchParams(window.location.search).get('chatId');
            const r = await fetch('/api/client-keys?chatId=' + cid); const data = await r.json();
            document.getElementById('c').innerHTML = data.map(k => \`
                <div class="card"><b>\${k.name}</b><br><small>Ключ: \${k.key}</small><br>
                Мест: \${k.workers.length}/\${k.limit}<br>До: \${new Date(k.expiry).toLocaleDateString()}<br><br>
                <div class="btn" onclick="req('\${k.key}','\${k.name}')">ПРОДЛИТЬ</div></div>\`).join('');
        }
        async function req(key,name){ await fetch('/api/notify-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,name})}); alert('Запрос отправлен'); }
        load();
    </script></body></html>`);
});

// --- ТЕЛЕГРАМ БОТ ---
bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) {
        return ctx.reply('👑 АДМИН-ПАНЕЛЬ', { reply_markup: { inline_keyboard: [[{ text: "🔑 УПРАВЛЕНИЕ КЛЮЧАМИ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    }
    const keys = await readDatabase();
    const myK = keys.find(k => String(k.ownerChatId) === String(cid));
    if (myK) {
        return ctx.reply('🏢 ВАШ КАБИНЕТ', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ОБЪЕКТЫ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    }
    ctx.reply('Привет! Для доступа введите лицензионный ключ:');
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return;
    const txt = ctx.message.text.trim(); if (txt.length < 5) return;
    const keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === txt);
    if (idx !== -1) {
        if (keys[idx].ownerChatId) return ctx.reply('Ключ уже занят.');
        keys[idx].ownerChatId = ctx.chat.id; await saveDatabase(keys);
        ctx.reply('✅ ДОСТУП ОТКРЫТ!', { reply_markup: { inline_keyboard: [[{ text: "📊 ВОЙТИ В КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
    } else { ctx.reply('Ключ не найден.'); }
});

bot.launch().then(() => console.log("SERVER ONLINE"));
app.listen(process.env.PORT || 3000);
