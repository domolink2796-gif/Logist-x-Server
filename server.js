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
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

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

async function appendToReport(workerId, workerName, city, dateStr, address, entrance, client, workType, price, lat, lon) {
    try {
        const reportName = `Отчет ${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId;
        if (res.data.files.length === 0) {
            const createRes = await sheets.spreadsheets.create({
                resource: { properties: { title: reportName } },
                fields: 'spreadsheetId'
            });
            spreadsheetId = createRes.data.spreadsheetId;
            const fileId = spreadsheetId; 
            const getFile = await drive.files.get({ fileId, fields: 'parents' });
            const previousParents = getFile.data.parents.join(',');
            await drive.files.update({ fileId: fileId, addParents: workerId, removeParents: previousParents });
        } else { spreadsheetId = res.data.files[0].id; }

        const sheetTitle = `${city}_${dateStr}`;
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const existingSheet = meta.data.sheets.find(s => s.properties.title === sheetTitle);

        if (!existingSheet) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] }
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
                resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GOOGLE GPS', 'YANDEX GPS', 'ФОТО']] }
            });
        }
        let googleGps = "Нет GPS"; let yandexGps = "Нет GPS";
        if (lat && lon) {
            googleGps = `=HYPERLINK("http://maps.google.com/?q=${lat},${lon}"; "GOOGLE MAPS")`;
            yandexGps = `=HYPERLINK("https://yandex.ru/maps/?pt=${lon},${lat}&z=16&l=map"; "ЯНДЕКС КАРТЫ")`;
        }
        const timeNow = new Date().toLocaleTimeString("ru-RU");
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
            resource: { values: [[timeNow, address, entrance, client, workType, price, googleGps, yandexGps, "ЗАГРУЖЕНО"]] }
        });
    } catch (e) { console.error("Report Error:", e); }
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

// === МАРШРУТЫ API ===
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
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = body;
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const ownerName = keyData ? keyData.name : "Неизвестный";
        const ownerId = await getOrCreateFolder(ownerName, MY_ROOT_ID);
        const workerId = await getOrCreateFolder(worker || "Работник", ownerId);
        const cityId = await getOrCreateFolder(city || "Город", workerId);
        const todayStr = new Date().toISOString().split('T')[0]; 
        const dateFolderId = await getOrCreateFolder(todayStr, cityId);
        let finalFolderName = client && client.trim().length > 0 ? client.trim() : "Общий";
        const finalFolderId = await getOrCreateFolder(finalFolderName, dateFolderId);
        const safeAddress = address ? address.trim() : "Без адреса";
        const fileName = `${safeAddress}${entrance ? " " + entrance : ""}.jpg`.trim();
        if (image) {
            const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            await drive.files.create({
                resource: { name: fileName, parents: [finalFolderId] },
                media: { mimeType: 'image/jpeg', body: bufferStream }
            });
        }
        await appendToReport(workerId, worker, city, todayStr, safeAddress, entrance || "-", finalFolderName, workType || "Не указан", price || 0, lat, lon);
        res.json({ success: true });
    } catch (e) { res.json({ status: 'error', message: e.message, success: false }); }
});

app.get('/api/keys', async (req, res) => { const keys = await readDatabase(); res.json(keys); });

app.get('/api/client-keys', async (req, res) => {
    const keys = await readDatabase();
    const clientKeys = keys.filter(k => k.ownerChatId == req.query.chatId);
    res.json(clientKeys);
});

app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body;
    let keys = await readDatabase();
    const genPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const newKey = `${genPart()}-${genPart()}`;
    const expiryDate = new Date(); expiryDate.setDate(expiryDate.getDate() + parseInt(days));
    keys.push({ key: newKey, name, limit, expiry: expiryDate.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(keys);
    res.json({ success: true });
});

app.post('/api/keys/del', async (req, res) => {
    if (req.body.key === 'DEV-MASTER-999') return res.json({ success: false });
    let keys = await readDatabase(); keys = keys.filter(k => k.key !== req.body.key);
    await saveDatabase(keys);
    res.json({ success: true });
});

// === UI: ПУЛЬТ АДМИНИСТРАТОРА ===
app.get('/dashboard', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>LOGIST X ADMIN</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono&family=Inter:wght@400;900&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --accent: #d29922; --text: #c9d1d9; --green: #238636; --red: #da3633; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; padding: 15px; display:none; }
            .container { max-width: 800px; margin: 0 auto; }
            .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
            input, select, button { width: 100%; padding: 14px; margin-bottom: 10px; border-radius: 8px; border: 1px solid var(--border); background: #010409; color: #fff; font-family: 'JetBrains Mono'; box-sizing: border-box; }
            button { background: var(--accent); color: #000; font-weight: 900; cursor: pointer; border: none; text-transform: uppercase; }
            .key-item { background: #010409; padding: 15px; border: 1px solid var(--border); margin-bottom: 10px; border-radius: 8px; border-left: 4px solid var(--green); }
            .k-code { font-size: 1.1rem; font-weight: bold; color: #fff; }
        </style>
    </head>
    <body>
    <div class="container">
        <h2 style="color:var(--accent);">LOGIST X // ADMIN</h2>
        <div class="card">
            <input type="text" id="newName" placeholder="Название объекта">
            <input type="number" id="newLimit" value="5" placeholder="Лимит">
            <select id="newDays"><option value="30">30 Дней</option><option value="365">1 Год</option></select>
            <button onclick="addKey()">СОЗДАТЬ КЛЮЧ</button>
        </div>
        <div id="keysList"></div>
    </div>
    <script>
        const PASS = "${ADMIN_PASS}";
        function auth() {
            if (localStorage.getItem('admin_pass') === PASS) { document.body.style.display = 'block'; load(); }
            else {
                let p = prompt('ПАРОЛЬ:');
                if (p === PASS) { localStorage.setItem('admin_pass', PASS); location.reload(); }
                else { alert('ОТКАЗАНО'); }
            }
        }
        async function load() {
            const res = await fetch('/api/keys'); const keys = await res.json();
            document.getElementById('keysList').innerHTML = keys.map(k => \`
                <div class="key-item" style="border-left-color: \${k.ownerChatId ? '#238636' : '#d29922'}">
                    <div class="k-code">\${k.key}</div>
                    <div style="font-size:0.9rem;">\${k.name} | 👤 \${k.workers?k.workers.length:0}/\${k.limit}</div>
                    <div style="font-size:0.7rem; color:gray;">До: \${new Date(k.expiry).toLocaleDateString()}</div>
                    \${k.key !== 'DEV-MASTER-999' ? \`<button onclick="delKey('\${k.key}')" style="background:none; color:var(--red); width:auto; border:none; font-size:10px; padding:0;">УДАЛИТЬ</button>\` : ''}
                </div>\`).join('');
        }
        async function addKey() {
            const n = document.getElementById('newName').value;
            if(!n) return;
            await fetch('/api/keys/add', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
                name:n, limit:document.getElementById('newLimit').value, days:document.getElementById('newDays').value
            })}); 
            load();
        }
        async function delKey(key) { if(confirm('Удалить?')) { await fetch('/api/keys/del', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key}) }); load(); } }
        auth();
    </script>
    </body>
    </html>
    `);
});

// === UI: КАБИНЕТ КЛИЕНТА ===
app.get('/client-dashboard', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LOGIST X CLIENT</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;900&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #0d1117; --card: #161b22; --accent: #d29922; --text: #c9d1d9; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; padding: 15px; }
            .card { background: var(--card); border-radius: 12px; padding: 20px; border: 1px solid #30363d; margin-bottom: 15px; }
            .accent { color: var(--accent); font-weight: 900; }
        </style>
    </head>
    <body>
        <h2 class="accent">МОЙ LOGIST_X</h2>
        <div id="content">Загрузка...</div>
        <script>
            async function load() {
                const cid = new URLSearchParams(window.location.search).get('chatId');
                const res = await fetch('/api/client-keys?chatId=' + cid);
                const keys = await res.json();
                document.getElementById('content').innerHTML = keys.length ? keys.map(k => \`
                    <div class="card">
                        <div style="font-weight:bold;">Ключ: \${k.key}</div>
                        <div>Объект: \${k.name}</div>
                        <div>Воркеры: \${k.workers.length} / \${k.limit}</div>
                        <div style="font-size:0.8rem; color:gray;">Срок: \${new Date(k.expiry).toLocaleDateString()}</div>
                    </div>\`).join('') : 'Нет активных лицензий.';
            }
            load();
        </script>
    </body>
    </html>
    `);
});

// --- TELEGRAM BOT ---
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const keys = await readDatabase();
    
    if (chatId === MY_TELEGRAM_ID) {
        return ctx.reply('👑 АДМИН-ПУЛЬТ', {
            reply_markup: { inline_keyboard: [[{ text: "📱 ОТКРЫТЬ", web_app: { url: SERVER_URL + "/dashboard" } }]] }
        });
    }

    const clientKey = keys.find(k => k.ownerChatId == chatId);
    if (clientKey) {
        return ctx.reply('🏢 ВАШ КАБИНЕТ', {
            reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ДАННЫЕ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + chatId } }]] }
        });
    }
    ctx.reply('Введите лицензионный КЛЮЧ:');
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return;
    const key = ctx.message.text.trim();
    const keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === key);

    if (idx !== -1) {
        if (keys[idx].ownerChatId) return ctx.reply('Ключ уже занят!');
        keys[idx].ownerChatId = ctx.chat.id;
        await saveDatabase(keys);
        ctx.reply('✅ ДОСТУП ОТКРЫТ!', {
            reply_markup: { inline_keyboard: [[{ text: "📊 КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] }
        });
    } else { ctx.reply('Ключ не найден.'); }
});

bot.launch();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('SERVER ONLINE'));
