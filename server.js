const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(bodyParser.json({ limit: '150mb' }));

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

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
        return content.data.keys || [];
    } catch (e) { return []; }
}

async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const media = { mimeType: 'application/json', body: JSON.stringify({ keys }, null, 2) };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); } 
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media }); }
    } catch (e) { console.error("DB Error", e); }
}

// --- ОТЧЕТ ЛОГИСТИКИ (В ТАБЛИЦУ) ---
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
            await sheets.spreadsheets.values.update({ 
                spreadsheetId, range: `${sheetTitle}!A1`, 
                valueInputOption: 'USER_ENTERED', 
                resource: { values: [['ВРЕМЯ', 'ГОРОД', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА (₽)', 'GPS']] } 
            });
        }
        const gpsLink = (lat && lon) ? `=HYPERLINK("https://www.google.com/maps?q=${lat},${lon}"; "ОТКРЫТЬ")` : "Нет GPS";
        await sheets.spreadsheets.values.append({ 
            spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED', 
            resource: { values: [[new Date().toLocaleTimeString("ru-RU"), city, address, entrance, client, workType, price, gpsLink]] } 
        });
    } catch (e) { console.error("Sheet Error", e); }
}

// === API ДЛЯ ЛОГИСТИКИ И ЛИЦЕНЗИЙ ===
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, entrance, client, image, lat, lon, workType, price } = req.body;
        const dateStr = new Date().toISOString().split('T')[0];
        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        const oId = await getOrCreateFolder(kData ? kData.name : "Logist_Users", MY_ROOT_ID);
        
        const cityId = await getOrCreateFolder(city || "Без города", oId);
        const dateId = await getOrCreateFolder(dateStr, cityId);
        const wId = await getOrCreateFolder(worker, dateId);

        if (image) {
            const base64Data = image.includes(',') ? image.split(',')[1] : image;
            const photoName = `${address} ${entrance || ""}`.trim();
            await drive.files.create({ 
                resource: { name: `${photoName}.jpg`, parents: [wId] }, 
                media: { mimeType: 'image/jpeg', body: Readable.from(Buffer.from(base64Data, 'base64')) } 
            });
        }
        await appendToReport(oId, worker, city, dateStr, address, entrance, client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

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

// === TELEGRAM БОТ: УПРАВЛЕНИЕ И ПАНЕЛЬ ===
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const keys = await readDatabase();
    const isOwner = (chatId === MY_TELEGRAM_ID);
    const clientKey = keys.find(k => k.ownerId === chatId);

    if (isOwner) {
        return ctx.reply('👑 ДОБРО ПОЖАЛОВАТЬ, АДМИН!\nТвоя панель управления готова.', {
            reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ КЛЮЧАМИ (WEB)", web_app: { url: SERVER_URL + "/dashboard" } }]] }
        });
    }

    if (clientKey) {
        return ctx.reply(`👋 ПРИВЕТ, ${clientKey.name}!\nЭто твой кабинет управления мерчами и логистами.`, {
            reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ОТЧЕТЫ", web_app: { url: SERVER_URL + "/client-panel?key=" + clientKey.key } }]] }
        });
    }

    ctx.reply('👋 Logist X активен. Если вы купили ключ, активируйте его через команду /activate [ключ]');
});

// Команда для активации ключа покупателем
bot.command('activate', async (ctx) => {
    const keyToAct = ctx.message.text.split(' ')[1];
    if (!keyToAct) return ctx.reply('Введите ключ через пробел: /activate КЛЮЧ');
    
    let keys = await readDatabase();
    const kIdx = keys.findIndex(k => k.key === keyToAct);
    
    if (kIdx === -1) return ctx.reply('❌ Ключ не найден.');
    if (keys[kIdx].ownerId) return ctx.reply('⚠️ Этот ключ уже активирован другим владельцем.');
    
    keys[kIdx].ownerId = ctx.chat.id;
    await saveDatabase(keys);
    ctx.reply('✅ КЛЮЧ АКТИВИРОВАН! Теперь вы Начальник этого объекта. Нажмите /start, чтобы открыть кабинет.');
});

// Страница админки (заглушка для WebApp)
app.get('/dashboard', (req, res) => {
    res.send(`<html><body style="background:#000;color:#fff;font-family:sans-serif;text-align:center;"><h2>ADMIN PANEL</h2><p>Здесь ты сможешь создавать и удалять ключи.</p></body></html>`);
});

bot.launch();
app.listen(process.env.PORT || 3000, () => console.log("SERVER READY"));
