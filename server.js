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
        } else {
            spreadsheetId = res.data.files[0].id;
        }

        const sheetTitle = `${city}_${dateStr}`;
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const existingSheet = meta.data.sheets.find(s => s.properties.title === sheetTitle);

        if (!existingSheet) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] }
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetTitle}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GOOGLE GPS', 'YANDEX GPS', 'ФОТО']] }
            });
        }

        // --- БЛОК GPS ССЫЛОК ---
        let googleGps = "Нет GPS";
        let yandexGps = "Нет GPS";

        if (lat && lon) {
            const gLink = `https://www.google.com/maps?q=${lat},${lon}`;
            const yLink = `https://yandex.ru/maps/?pt=${lon},${lat}&z=16&l=map`;
            
            googleGps = `=HYPERLINK("${gLink}"; "GOOGLE MAPS")`;
            yandexGps = `=HYPERLINK("${yLink}"; "ЯНДЕКС КАРТЫ")`;
        }

        const timeNow = new Date().toLocaleTimeString("ru-RU");
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetTitle}!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: { 
                values: [[timeNow, address, entrance, client, workType, price, googleGps, yandexGps, "ЗАГРУЖЕНО"]] 
            }
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

// === МАРШРУТЫ ===

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
        const safeEntrance = entrance ? " " + entrance : ""; 
        const fileName = `${safeAddress}${safeEntrance}.jpg`.trim();
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

app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body;
    let keys = await readDatabase();
    const genPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const newKey = `${genPart()}-${genPart()}`;
    const expiryDate = new Date(); expiryDate.setDate(expiryDate.getDate() + parseInt(days));
    keys.push({ key: newKey, name: name, limit: limit, expiry: expiryDate.toISOString(), workers: [] });
    await saveDatabase(keys);
    res.json({ success: true });
});

app.post('/api/keys/del', async (req, res) => {
    const { key } = req.body;
    if (key === 'DEV-MASTER-999') return res.json({ success: false, message: 'Нельзя удалить системный ключ' });
    let keys = await readDatabase(); keys = keys.filter(k => k.key !== key);
    await saveDatabase(keys);
    res.json({ success: true });
});

app.get('/dashboard', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>LOGIST X | COMMAND</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;800;900&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --accent: #d29922; --text: #c9d1d9; --green: #238636; --red: #da3633; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; padding: 15px; display:none; }
            .container { max-width: 800px; margin: 0 auto; }
            .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
            input, select, button { width: 100%; padding: 14px; margin-bottom: 10px; border-radius: 8px; border: 1px solid var(--border); background: #010409; color: #fff; font-family: 'JetBrains Mono'; box-sizing: border-box; }
            button { background: var(--accent); color: #000; font-weight: 900; cursor: pointer; border: none; text-transform: uppercase; }
            .key-item { background: #010409; padding: 15px; border: 1px solid var(--border); margin-bottom: 10px; border-radius: 8px; border-left: 4px solid var(--green); }
            .k-code { font-size: 1.1rem; font-weight: bold; color: #fff; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        </style>
    </head>
    <body>
    <div class="container">
        <div class="header">
            <h2 style="color:var(--accent); margin:0; font-size:1.2rem;">LOGIST X // ADMIN</h2>
            <button onclick="localStorage.removeItem('admin_pass'); location.reload();" style="width:auto; padding:5px 10px; font-size:10px;">ВЫХОД</button>
        </div>
        <div class="card">
            <h3 style="margin-top:0; font-size:1rem;">СОЗДАТЬ ЛИЦЕНЗИЮ</h3>
            <input type="text" id="newName" placeholder="Имя Владельца">
            <input type="number" id="newLimit" value="5" placeholder="Лимит">
            <select id="newDays"><option value="30">30 Дней</option><option value="365">1 Год</option></select>
            <button onclick="addKey()">СГЕНЕРИРОВАТЬ</button>
        </div>
        <div id="keysList"></div>
    </div>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
        const PASS = "${ADMIN_PASS}";
        const tg = window.Telegram.WebApp;
        tg.expand(); 

        function auth() {
            let userPass = localStorage.getItem('admin_pass');
            if (!userPass) {
                userPass = prompt('ВВЕДИТЕ ПАРОЛЬ АДМИНИСТРАТОРА:');
                if (userPass === PASS) {
                    localStorage.setItem('admin_pass', PASS);
                    document.body.style.display = 'block';
                    load();
                } else {
                    alert('ОТКАЗАНО В ДОСТУПЕ');
                    location.reload();
                }
            } else if (userPass === PASS) {
                document.body.style.display = 'block';
                load();
            } else {
                localStorage.removeItem('admin_pass');
                location.reload();
            }
        }

        async function load() {
            const res = await fetch('/api/keys'); const keys = await res.json();
            document.getElementById('keysList').innerHTML = keys.map(k => 
                \`<div class="key-item" style="border-left-color: \${k.key === 'DEV-MASTER-999' ? 'var(--accent)' : 'var(--green)'}">
                    <div class="k-code">\${k.key}</div>
                    <div style="margin-top:5px; opacity:0.8; font-size:0.9rem;">📂 \${k.name} | 👤 \${k.workers?k.workers.length:0}/\${k.limit}</div>
                    <div style="font-size:0.7rem; color:gray;">До: \${new Date(k.expiry).toLocaleDateString()}</div>
                    \${k.key !== 'DEV-MASTER-999' ? \`<button onclick="delKey('\${k.key}')" style="background:none; color:var(--red); text-align:left; padding:0; margin-top:10px; width:auto; border:none; font-size:11px;">УДАЛИТЬ ЛИЦЕНЗИЮ</button>\` : ''}
                </div>\`
            ).join('');
        }
        async function addKey() {
            const n = document.getElementById('newName').value;
            if(!n) return alert('Введите имя');
            await fetch('/api/keys/add', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
                name:n, limit:document.getElementById('newLimit').value, days:document.getElementById('newDays').value
            })}); 
            document.getElementById('newName').value = '';
            load();
        }
        async function delKey(key) { if(confirm('Удалить лицензию?')) { await fetch('/api/keys/del', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key}) }); load(); } }
        auth();
    </script>
    </body>
    </html>
    `;
    res.send(html);
});

// --- TELEGRAM BOT ---
bot.start((ctx) => {
    ctx.reply('🔧 ПУЛЬТ УПРАВЛЕНИЯ LOGIST X', {
        reply_markup: {
            inline_keyboard: [
                [{ 
                    text: "📱 ОТКРЫТЬ ПАНЕЛЬ", 
                    web_app: { url: `https://logist-x-server-production.up.railway.app/dashboard` } 
                }]
            ]
        }
    });
});

bot.launch().then(() => console.log("BOT ONLINE"));

app.get('/', (req, res) => res.redirect('/dashboard'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SERVER ONLINE ON PORT ${PORT}`));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
