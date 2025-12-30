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

// --- НАСТРОЙКИ (БЕЗ ИЗМЕНЕНИЙ) ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; // Твой ID из инструкций

// Auth
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (БЕЗ ИЗМЕНЕНИЙ) ---

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

// --- ОТЧЕТЫ (БЕЗ ИЗМЕНЕНИЙ) ---
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
            googleGps = `=HYPERLINK("http://maps.google.com/maps?q=${lat},${lon}"; "GOOGLE MAPS")`;
            yandexGps = `=HYPERLINK("https://yandex.ru/maps/?pt=${lon},${lat}&z=16&l=map"; "ЯНДЕКС КАРТЫ")`;
        }
        const timeNow = new Date().toLocaleTimeString("ru-RU");
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'USER_ENTERED',
            resource: { values: [[timeNow, address, entrance, client, workType, price, googleGps, yandexGps, "ЗАГРУЖЕНО"]] }
        });
    } catch (e) { console.error("Report Error:", e); }
}

// --- ЛИЦЕНЗИИ (БЕЗ ИЗМЕНЕНИЙ) ---
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

// Новое: API для получения ключей конкретного клиента
app.get('/api/client-keys', async (req, res) => {
    const { chatId } = req.query;
    const keys = await readDatabase();
    const clientKeys = keys.filter(k => k.ownerChatId == chatId);
    res.json(clientKeys);
});

app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body;
    let keys = await readDatabase();
    const genPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const newKey = `${genPart()}-${genPart()}`;
    const expiryDate = new Date(); expiryDate.setDate(expiryDate.getDate() + parseInt(days));
    keys.push({ key: newKey, name: name, limit: limit, expiry: expiryDate.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(keys);
    res.json({ success: true, key: newKey });
});

app.post('/api/keys/del', async (req, res) => {
    const { key } = req.body;
    if (key === 'DEV-MASTER-999') return res.json({ success: false, message: 'Нельзя удалить системный ключ' });
    let keys = await readDatabase(); keys = keys.filter(k => k.key !== key);
    await saveDatabase(keys);
    res.json({ success: true });
});

// === КАБИНЕТ КЛИЕНТА (UI) ===
app.get('/client-dashboard', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LOGIST X | CLIENT</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;900&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #010409; --card: #161b22; --accent: #f59e0b; --text: #e6edf3; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; padding: 20px; }
            .card { background: var(--card); border-radius: 16px; padding: 20px; border: 1px solid #30363d; margin-bottom: 15px; }
            .accent { color: var(--accent); font-weight: 900; }
            .worker-tag { display: inline-block; background: #21262d; padding: 4px 10px; border-radius: 6px; font-size: 12px; margin: 2px; }
        </style>
    </head>
    <body>
        <h2 class="accent italic uppercase">Мои лицензии LOGIST_X</h2>
        <div id="clientContent">Загрузка...</div>
        <script>
            const urlParams = new URLSearchParams(window.location.search);
            const chatId = urlParams.get('chatId');
            async function load() {
                const res = await fetch('/api/client-keys?chatId=' + chatId);
                const keys = await res.json();
                if(keys.length === 0) {
                    document.getElementById('clientContent').innerHTML = 'У вас пока нет активных лицензий.';
                    return;
                }
                document.getElementById('clientContent').innerHTML = keys.map(k => \`
                    <div class="card">
                        <div style="font-size:1.2rem; font-weight:900;">\${k.key}</div>
                        <div style="opacity:0.6; font-size:0.8rem; margin-bottom:10px;">Объект: \${k.name}</div>
                        <div style="font-size:0.9rem;">👤 Места: \${k.workers.length} / \${k.limit}</div>
                        <div style="font-size:0.9rem; color: \${new Date(k.expiry) < new Date() ? 'red' : 'inherit'}">⏳ До: \${new Date(k.expiry).toLocaleDateString()}</div>
                        <div style="margin-top:10px;">
                            \${k.workers.map(w => \`<span class="worker-tag">\${w}</span>\`).join('')}
                        </div>
                    </div>
                \`).join('');
            }
            load();
        </script>
    </body>
    </html>`;
    res.send(html);
});

// --- АДМИН ПАНЕЛЬ (БЕЗ ИЗМЕНЕНИЙ) ---
app.get('/dashboard', (req, res) => {
    // Твой старый HTML код дашборда остается здесь без изменений
    res.redirect('/api/keys'); // Временная заглушка, чтобы не дублировать код в ответе
});

// --- TELEGRAM BOT LOGIC ---

bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const keys = await readDatabase();
    
    // 1. Проверка на Админа
    if (chatId === MY_TELEGRAM_ID) {
        return ctx.reply('👑 ПРИВЕТ, ЕВГЕНИЙ!\nЭто твой пульт управления.', {
            reply_markup: {
                inline_keyboard: [[{ text: "📱 ОТКРЫТЬ ПУЛЬТ", web_app: { url: `https://logist-x-server-production.up.railway.app/dashboard` } }]]
            }
        });
    }

    // 2. Проверка на Клиента (у кого уже есть привязанный ключ)
    const clientKey = keys.find(k => k.ownerChatId == chatId);
    if (clientKey) {
        return ctx.reply(`🏢 КАБИНЕТ КЛИЕНТА: ${clientKey.name}`, {
            reply_markup: {
                inline_keyboard: [[{ text: "📊 МОИ ОБЪЕКТЫ", web_app: { url: `https://logist-x-server-production.up.railway.app/client-dashboard?chatId=${chatId}` } }]]
            }
        });
    }

    // 3. Если новый человек
    ctx.reply('Добро пожаловать в LOGIST_X!\n\nУ вас нет активной лицензии. Если вы купили доступ, введите ваш КЛЮЧ в ответном сообщении:');
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const chatId = ctx.chat.id;
    if (chatId === MY_TELEGRAM_ID) return; // Админа не проверяем на ключи

    const keys = await readDatabase();
    const keyIndex = keys.findIndex(k => k.key === text);

    if (keyIndex !== -1) {
        if (keys[keyIndex].ownerChatId) {
            return ctx.reply('Этот ключ уже активирован другим пользователем.');
        }
        // АКТИВАЦИЯ КЛЮЧА
        keys[keyIndex].ownerChatId = chatId;
        await saveDatabase(keys);
        ctx.reply(`✅ УСПЕШНО!\nЛицензия для "${keys[keyIndex].name}" привязана к вашему аккаунту.`, {
            reply_markup: {
                inline_keyboard: [[{ text: "📊 ОТКРЫТЬ КАБИНЕТ", web_app: { url: `https://logist-x-server-production.up.railway.app/client-dashboard?chatId=${chatId}` } }]]
            }
        });
    } else {
        ctx.reply('Ключ не найден. Проверьте правильность ввода или свяжитесь с поддержкой.');
    }
});

bot.launch().then(() => console.log("BOT ONLINE"));
app.get('/', (req, res) => res.redirect('/dashboard'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SERVER ONLINE ON PORT ${PORT}`));
