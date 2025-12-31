const express = require('express');
const { google } = require('googleapis');
const { Telegraf, Markup } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// --- НАСТРОЙКИ (ТВОИ ДАННЫЕ) ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

// Настройка Google Auth
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
        const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
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
        return data.keys || [];
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

// --- ОТЧЕТЫ ---
async function appendToReport(workerId, workerName, city, dateStr, address, entrance, client, workType, price, lat, lon) {
    try {
        const reportName = `Отчет ${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
        const res = await drive.files.list({ q });
        let spreadsheetId;
        if (res.data.files.length === 0) {
            const ss = await sheets.spreadsheets.create({ resource: { properties: { title: reportName } } });
            spreadsheetId = ss.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        } else { spreadsheetId = res.data.files[0].id; }

        const sheetTitle = `${city}_${dateStr}`;
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const existingSheet = meta.data.sheets.find(s => s.properties.title === sheetTitle);
        
        if (!existingSheet) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] }
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
                resource: { values: [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GPS', 'ФОТО']] }
            });
        }
        const gps = (lat && lon) ? `=HYPERLINK("https://www.google.com/maps?q=${lat},${lon}"; "MAP")` : "No GPS";
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
            resource: { values: [[new Date().toLocaleTimeString("ru-RU"), address, entrance, client, workType, price, gps, "ЗАГРУЖЕНО"]] }
        });
    } catch (e) { console.error("Report Error:", e); }
}

// === API ===
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = req.body;
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        
        const ownerId = await getOrCreateFolder(keyData ? keyData.name : "System", MY_ROOT_ID);
        const workerId = await getOrCreateFolder(worker, ownerId);
        const cityId = await getOrCreateFolder(city, workerId);
        const today = new Date().toISOString().split('T')[0];
        const dateId = await getOrCreateFolder(today, cityId);
        const clientId = await getOrCreateFolder(client || "Общий", dateId);

        if (image) {
            const fileName = `${address || 'Адрес'} ${entrance || ''}`.trim() + ".jpg";
            const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);
            await drive.files.create({ resource: { name: fileName, parents: [clientId] }, media: { mimeType: 'image/jpeg', body: bufferStream } });
        }
        await appendToReport(workerId, worker, city, today, address, entrance, client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/keys', async (req, res) => res.json(await readDatabase()));

app.get('/api/client-keys', async (req, res) => {
    const keys = await readDatabase();
    res.json(keys.filter(k => String(k.ownerChatId) === String(req.query.chatId)));
});

// === ДЕШБОРДЫ (WEB APPS) ===
app.get('/dashboard', (req, res) => {
    // Твой оригинальный HTML Админа
    res.send(`... (твой код HTML Админа из файла) ...`);
});

app.get('/client-dashboard', (req, res) => {
    // Улучшенный HTML Клиента
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>CLIENT PANEL</title>
    <style>
        body { background: #0a0c10; color: #fff; font-family: sans-serif; padding: 15px; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 15px; margin-bottom: 15px; }
        .btn { background: #f0ad4e; color: #000; border: none; padding: 10px; border-radius: 8px; width: 100%; font-weight: bold; margin-top: 10px; cursor: pointer; }
        .worker-list { font-size: 0.8rem; color: #8b949e; background: #0d1117; padding: 10px; border-radius: 6px; margin-top: 10px; }
    </style></head>
    <body>
        <h2 style="color:#f0ad4e">Мои Объекты</h2>
        <div id="content">Загрузка...</div>
        <script>
            async function load(){
                const cid = new URLSearchParams(window.location.search).get('chatId');
                const res = await fetch('/api/client-keys?chatId=' + cid);
                const keys = await res.json();
                document.getElementById('content').innerHTML = keys.map(k => \`
                    <div class="card">
                        <h3>\${k.name}</h3>
                        <p>Ключ: <code>\${k.key}</code></p>
                        <p>Места: \${k.workers ? k.workers.length : 0} / \${k.limit}</p>
                        <div class="worker-list"><b>Сотрудники:</b><br>\${k.workers && k.workers.length ? k.workers.join(', ') : 'Нет сотрудников'}</div>
                        <button class="btn" onclick="alert('Запрос на продление отправлен!')">ПРОДЛИТЬ ЛИЦЕНЗИЮ</button>
                    </div>\`).join('');
            }
            load();
        </script>
    </body></html>`);
});

// --- БОТ ---
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    if (chatId === MY_TELEGRAM_ID) {
        return ctx.reply('👑 АДМИН-ПАНЕЛЬ', { reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    }
    const keys = await readDatabase();
    const clientKey = keys.find(k => String(k.ownerChatId) === String(chatId));
    if (clientKey) {
        return ctx.reply('🏢 ВАШ КАБИНЕТ', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ОБЪЕКТЫ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + chatId } }]] } });
    }
    ctx.reply('👋 Добро пожаловать! У вас нет лицензии.', { reply_markup: { inline_keyboard: [[{ text: "💳 КУПИТЬ", callback_data: "buy" }]] } });
});

bot.launch().then(() => console.log("SERVER LOGIST_X READY"));
app.listen(process.env.PORT || 3000);
