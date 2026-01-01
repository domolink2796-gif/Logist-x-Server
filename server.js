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
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; // ПАПКА ДЛЯ МЕРЧА
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

// --- БАЗОВЫЕ ФУНКЦИИ ---
async function getOrCreateFolder(rawName, parentId) {
    try {
        const name = String(rawName).trim(); 
        const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q, fields: 'files(id, trashed)' });
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

// --- ФУНКЦИИ ОТЧЕТОВ ЛОГИСТИКИ (БЕЗ ИЗМЕНЕНИЙ) ---
async function appendToReport(workerId, workerName, city, dateStr, address, entrance, client, workType, price, lat, lon) {
    try {
        const reportName = `Отчет ${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId;
        if (res.data.files.length === 0) {
            const createRes = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } }, fields: 'spreadsheetId' });
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
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({
                spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
                resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GPS', 'ФОТО']] }
            });
        }
        let gpsValue = "Нет GPS";
        if (lat && lon) { gpsValue = `=HYPERLINK("http://maps.google.com/?q=${lat},${lon}"; "СМОТРЕТЬ НА КАРТЕ")`; }
        const timeNow = new Date().toLocaleTimeString("ru-RU");
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
            resource: { values: [[timeNow, address, entrance, client, workType, price, gpsValue, "ЗАГРУЖЕНО"]] }
        });
    } catch (e) { console.error("Report Error:", e); }
}

// --- НОВАЯ ФУНКЦИЯ ДЛЯ МЕРЧАНДАЙЗИНГА (СОХРАНЯЕМ В МЕРЧ-ТАБЛИЦУ) ---
async function appendMerchToReport(workerId, workerName, net, address, stock, shelf, pdfUrl) {
    try {
        const reportName = `Мерч_Аналитика_${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId;
        if (res.data.files.length === 0) {
            const createRes = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } }, fields: 'spreadsheetId' });
            spreadsheetId = createRes.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: (await drive.files.get({ fileId: spreadsheetId, fields: 'parents' })).data.parents.join(',') });
        } else { spreadsheetId = res.data.files[0].id; }

        const timeNow = new Date().toLocaleString("ru-RU");
        const sheetTitle = "ОТЧЕТЫ_МЕРЧ";
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if (!meta.data.sheets.find(s => s.properties.title === sheetTitle)) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [['ДАТА/ВРЕМЯ', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'PDF ОТЧЕТ']] } });
        }
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [[timeNow, net, address, stock, shelf, pdfUrl]] } });
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

// === API ===
app.post('/check-license', async (req, res) => {
    try { res.json(await handleLicenseCheck(req.body)); } 
    catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// СТАРЫЙ API ЛОГИСТИКИ (БЕЗ ИЗМЕНЕНИЙ, ПАПКА MY_ROOT_ID)
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
        let finalFolderName = client && client.trim().length > 0 ? client.trim() : "Общий";
        const finalFolderId = await getOrCreateFolder(finalFolderName, dateFolderId);
        const safeAddress = address ? address.trim() : "Без адреса";
        const fileName = `${safeAddress}${entrance ? " " + entrance : ""}.jpg`.trim();
        if (image) {
            const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            await drive.files.create({ resource: { name: fileName, parents: [finalFolderId] }, media: { mimeType: 'image/jpeg', body: bufferStream } });
        }
        await appendToReport(workerId, worker, city, todayStr, safeAddress, entrance || "-", finalFolderName, workType || "Не указан", price || 0, lat, lon);
        res.json({ success: true });
    } catch (e) { res.json({ status: 'error', message: e.message, success: false }); }
});

// НОВЫЙ API МЕРЧАНДАЙЗИНГА (СТРОГО В ПАПКУ MERCH_ROOT_ID)
app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock, shelf, pdf, city } = req.body;
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const ownerName = keyData ? keyData.name : "Мерч_Клиенты";
        
        // Создаем структуру в отдельной папке MERCH_ROOT_ID
        const ownerId = await getOrCreateFolder(ownerName, MERCH_ROOT_ID);
        const workerId = await getOrCreateFolder(worker || "Мерчандайзер", ownerId);
        const cityId = await getOrCreateFolder(city || "Орёл", workerId);
        const todayStr = new Date().toISOString().split('T')[0]; 
        const dateFolderId = await getOrCreateFolder(todayStr, cityId);
        
        const netFolderName = net && net.trim().length > 0 ? net.trim() : "Общая сеть";
        const netFolderId = await getOrCreateFolder(netFolderName, dateFolderId);

        let pdfUrl = "Нет файла";
        if (pdf) {
            const buffer = Buffer.from(pdf.replace(/^data:application\/pdf;base64,/, ""), 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            
            const cleanAddress = address.replace(/[/\\?%*:|"<>]/g, '-').trim();
            const fileName = `ОТЧЕТ_${cleanAddress}.pdf`;
            
            const file = await drive.files.create({ 
                resource: { name: fileName, parents: [netFolderId] }, 
                media: { mimeType: 'application/pdf', body: bufferStream }, 
                fields: 'webViewLink' 
            });
            pdfUrl = file.data.webViewLink;
        }

        await appendMerchToReport(workerId, worker, net, address, stock, shelf, pdfUrl);
        res.json({ success: true, url: pdfUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/keys', async (req, res) => { res.json(await readDatabase()); });

app.get('/api/client-keys', async (req, res) => {
    try {
        const keys = await readDatabase();
        const cid = req.query.chatId;
        res.json(keys.filter(k => String(k.ownerChatId) === String(cid)));
    } catch (e) { res.json([]); }
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

app.post('/api/keys/extend', async (req, res) => {
    let keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === req.body.key);
    if (idx !== -1) {
        let d = new Date(keys[idx].expiry);
        d.setDate(d.getDate() + 30);
        keys[idx].expiry = d.toISOString();
        await saveDatabase(keys);
        res.json({ success: true });
    } else res.json({ success: false });
});

app.post('/api/notify-admin', async (req, res) => {
    const { key, name } = req.body;
    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔔 **ЗАПРОС ПРОДЛЕНИЯ**\n\nОбъект: ${name}\nКлюч: \`${key}\`\n\nКлиент нажал кнопку в кабинете.`, { parse_mode: 'Markdown' });
    res.json({ success: true });
});

// === ИНТЕРФЕЙС АДМИНА ===
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ADMIN | LOGIST X</title>
    <style>
        :root { --bg: #0a0c10; --card: #161b22; --accent: #f0ad4e; --text: #f0f6fc; --green: #238636; --border: #30363d; }
        body { background: var(--bg); color: var(--text); font-family: -apple-system, system-ui, sans-serif; padding: 15px; display:none; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
        h3 { margin-top:0; color: var(--accent); letter-spacing: 1px; }
        input, select, button { width: 100%; padding: 12px; margin-bottom: 12px; border-radius: 8px; border: 1px solid var(--border); background: #010409; color: #fff; outline: none; box-sizing: border-box; }
        button { background: var(--accent); color: #000; font-weight: bold; cursor: pointer; border: none; transition: 0.2s; }
        button:active { transform: scale(0.98); }
        .key-item { background: #0d1117; padding: 15px; border-radius: 10px; margin-bottom: 10px; border-left: 5px solid var(--accent); position: relative; }
        .key-title { font-size: 1.1rem; color: #fff; font-weight: bold; }
        .key-info { font-size: 0.85rem; color: #8b949e; margin: 5px 0; }
        .btn-ext { background: var(--green); color: #fff; width: auto; padding: 6px 15px; font-size: 0.8rem; }
    </style></head>
    <body>
        <div class="card"><h3>НОВАЯ ЛИЦЕНЗИЯ</h3>
            <input type="text" id="newName" placeholder="Название объекта">
            <input type="number" id="newLimit" value="5">
            <select id="newDays"><option value="30">30 Дней</option><option value="365">1 Год</option></select>
            <button onclick="addKey()">СГЕНЕРИРОВАТЬ КЛЮЧ</button>
        </div>
        <div id="keysList"></div>
    <script>
        const PASS = "${ADMIN_PASS}";
        function auth() { if(localStorage.getItem('admin_pass')===PASS){document.body.style.display='block';load();}else{let p=prompt('PASS:');if(p===PASS){localStorage.setItem('admin_pass',PASS);location.reload();}else{alert('STOP');}}}
        async function load(){ 
            const res = await fetch('/api/keys'); const keys = await res.json(); 
            document.getElementById('keysList').innerHTML = keys.map(k => \`
                <div class="key-item">
                    <div class="key-title">\${k.key}</div>
                    <div class="key-info">🏢 \${k.name} | 👥 \${k.workers?k.workers.length:0}/\${k.limit}</div>
                    <div class="key-info">📅 До: \${new Date(k.expiry).toLocaleDateString()}</div>
                    <button class="btn-ext" onclick="extendKey('\${k.key}')">ПРОДЛИТЬ +30 ДН.</button>
                </div>\`).join(''); 
        }
        async function addKey(){ await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('newName').value,limit:document.getElementById('newLimit').value,days:document.getElementById('newDays').value})}); load(); }
        async function extendKey(key){ if(confirm('Продлить?')){ await fetch('/api/keys/extend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})}); load(); } }
        auth();
    </script></body></html>`);
});

// === ИНТЕРФЕЙС КЛИЕНТА ===
app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>CLIENT | LOGIST X</title>
    <style>
        body { background: #0a0c10; color: #c9d1d9; font-family: sans-serif; padding: 15px; }
        .header { text-align: center; padding: 10px 0 20px; }
        .accent { color: #f0ad4e; text-transform: uppercase; letter-spacing: 2px; font-size: 1.2rem; }
        .card { background: #161b22; border-radius: 16px; padding: 20px; border: 1px solid #30363d; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
        .key-code { font-family: monospace; background: #0d1117; padding: 8px; border-radius: 6px; color: #f0ad4e; font-size: 1.1rem; display: block; margin: 10px 0; border: 1px dashed #444; text-align: center; }
        .stat { font-size: 0.9rem; margin: 8px 0; color: #8b949e; }
        .worker-box { background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; margin-top: 15px; font-size: 0.8rem; }
        .btn-pay { background: #f0ad4e; color: #000; border: none; padding: 14px; border-radius: 10px; width: 100%; font-weight: bold; cursor: pointer; text-decoration: none; display: block; text-align: center; margin-top: 20px; box-shadow: 0 4px 15px rgba(240,173,78,0.2); }
    </style></head>
    <body>
        <div class="header"><div class="accent">Мои Лицензии</div></div>
        <div id="content">Загрузка...</div>
    <script>
        async function load(){ try { 
            const cid = new URLSearchParams(window.location.search).get('chatId'); 
            const res = await fetch(window.location.origin + '/api/client-keys?chatId=' + cid); 
            const keys = await res.json();
            if(!keys.length) { document.getElementById('content').innerHTML = '<div style="text-align:center; padding: 40px; color:#555;">Нет активных лицензий</div>'; return; }
            document.getElementById('content').innerHTML = keys.map(k => \`
                <div class="card">
                    <small style="color:#58a6ff">ОБЪЕКТ:</small>
                    <div style="font-size:1.3rem; font-weight:bold; margin-bottom:5px;">\${k.name}</div>
                    <span class="key-code">\${k.key}</span>
                    <div class="stat">👥 Мест занято: <b>\${k.workers?k.workers.length:0} / \${k.limit}</b></div>
                    <div class="stat">⏳ Срок до: <b>\${new Date(k.expiry).toLocaleDateString()}</b></div>
                    <div class="worker-box"><b>Сотрудники:</b><br>\${k.workers && k.workers.length ? k.workers.join(', ') : 'Места свободны'}</div>
                    <button onclick="requestExtend('\${k.key}', '\${k.name}')" class="btn-pay">ПРОДЛИТЬ СРОК</button>
                </div>\`).join('');
        } catch(e) { document.getElementById('content').innerHTML = 'Ошибка сети'; } }
        async function requestExtend(key, name) {
            if(confirm('Отправить запрос на продление администратору?')){
                await fetch('/api/notify-admin', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key, name})});
                alert('Запрос отправлен! Мы свяжемся с вами в ближайшее время.');
                window.location.href = "https://t.me/G_E_S_S_E_N";
            }
        }
        load();
    </script></body></html>`);
});

// === БОТ ===
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    if (chatId === MY_TELEGRAM_ID) {
        return ctx.reply('👑 ПАНЕЛЬ УПРАВЛЕНИЯ', { reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ КЛЮЧАМИ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    }
    const keys = await readDatabase();
    const clientKey = keys.find(k => String(k.ownerChatId) === String(chatId));
    if (clientKey) {
        return ctx.reply('🏢 ВАШ КАБИНЕТ ОБЪЕКТОВ', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ДАННЫЕ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + chatId } }]] } });
    }
    ctx.reply('👋 Привет! У вас пока нет активной лицензии Logist X.\n\nНажмите кнопку ниже, чтобы оставить заявку на подключение:', {
        reply_markup: { inline_keyboard: [
            [{ text: "💳 ОФОРМИТЬ ЛИЦЕНЗИЮ", callback_data: "buy_license" }],
            [{ text: "🔑 У МЕНЯ ЕСТЬ КЛЮЧ", callback_data: "have_key" }]
        ]}
    });
});

bot.action('buy_license', async (ctx) => {
    const from = ctx.from;
    const userLabel = from.username ? `@${from.username}` : `${from.first_name} (ID: ${from.id})`;
    const profileLink = from.username ? `https://t.me/${from.username}` : `tg://user?id=${from.id}`;
    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔥 **НОВЫЙ КЛИЕНТ ХОЧЕТ КУПИТЬ!**\n\nКлиент: ${userLabel}\nЛичка: [ПЕРЕЙТИ К КЛИЕНТУ](${profileLink})`, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery();
    await ctx.reply('✅ Запрос отправлен! Администратор свяжется с вами в ближайшее время.', {
        reply_markup: { inline_keyboard: [[{ text: "💬 НАПИСАТЬ АДМИНУ", url: "https://t.me/G_E_S_S_E_N" }]] }
    });
});

bot.action('have_key', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Введите ваш лицензионный КЛЮЧ для активации:');
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return;
    const key = ctx.message.text.trim();
    if (key.length < 5) return; 
    const keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) {
        if (keys[idx].ownerChatId) return ctx.reply('Ключ уже привязан к другому аккаунту.');
        keys[idx].ownerChatId = ctx.chat.id;
        await saveDatabase(keys);
        ctx.reply('✅ ДОСТУП АКТИВИРОВАН!', { reply_markup: { inline_keyboard: [[{ text: "📊 ОТКРЫТЬ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
    } else { ctx.reply('Ключ не найден.'); }
});

bot.launch().then(() => console.log("GS SERVER READY WITH MERCH MODULE"));
app.listen(process.env.PORT || 3000);
