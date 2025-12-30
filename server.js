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

// Auth
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client }); // Нужно для отчетов
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
    } catch (e) { console.error("DB Save Error:", e); }
}

// --- ФУНКЦИЯ ОТЧЕТОВ (EXCEL) ---
async function appendToReport(workerId, workerName, dateStr, address, entrance, client, gpsLink) {
    try {
        const reportName = `Отчет ${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
        const res = await drive.files.list({ q });
        
        let spreadsheetId;

        if (res.data.files.length === 0) {
            // Создаем новую таблицу, если её нет
            const createRes = await sheets.spreadsheets.create({
                resource: { properties: { title: reportName } },
                fields: 'spreadsheetId'
            });
            spreadsheetId = createRes.data.spreadsheetId;
            
            // Перемещаем в папку работника
            const fileId = spreadsheetId; 
            const getFile = await drive.files.get({ fileId, fields: 'parents' });
            const previousParents = getFile.data.parents.join(',');
            await drive.files.update({ fileId: fileId, addParents: workerId, removeParents: previousParents });

            // Заголовки
            await sheets.spreadsheets.values.append({
                spreadsheetId, range: 'A1', valueInputOption: 'USER_ENTERED',
                resource: { values: [['ДАТА', 'ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'GPS', 'СТАТУС']] }
            });
        } else {
            spreadsheetId = res.data.files[0].id;
        }

        const timeNow = new Date().toLocaleTimeString("ru-RU");
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: 'A1', valueInputOption: 'USER_ENTERED',
            resource: { values: [[dateStr, timeNow, address, entrance, client, gpsLink, "ЗАГРУЖЕНО"]] }
        });
    } catch (e) { console.error("Report Error:", e); }
}

// --- ЛОГИКА ПРОВЕРКИ ЛИЦЕНЗИИ ---
async function handleLicenseCheck(body) {
    const { licenseKey, workerName } = body;
    const keys = await readDatabase();
    const keyData = keys.find(k => k.key === licenseKey);
    if (!keyData) return { status: 'error', message: 'Ключ не найден' };
    const now = new Date();
    const expiry = new Date(keyData.expiry);
    if (expiry < now) return { status: 'error', message: 'Срок истёк' };
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

        const { worker, city, address, entrance, client, image, lat, lon } = body;
        
        // 1. Ищем владельца
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker));
        const ownerName = keyData ? keyData.name : "Неизвестный";

        // 2. Строим путь: Владелец -> Работник -> Город -> ДАТА -> Клиент
        const ownerId = await getOrCreateFolder(ownerName, MY_ROOT_ID);
        const workerId = await getOrCreateFolder(worker || "Работник", ownerId);
        const cityId = await getOrCreateFolder(city || "Город", workerId);
        
        // --- НОВАЯ ЛОГИКА: ПАПКА ДАТЫ ---
        const todayStr = new Date().toISOString().split('T')[0]; // Формат 2025-12-30
        const dateFolderId = await getOrCreateFolder(todayStr, cityId);
        
        // Папка клиента внутри папки даты
        let finalFolderName = client && client.trim().length > 0 ? client.trim() : "Общий";
        const finalFolderId = await getOrCreateFolder(finalFolderName, dateFolderId);

        // 3. Имя файла: Улица Дом Подъезд
        const safeAddress = address ? address.trim() : "Без адреса";
        const safeEntrance = entrance ? "п " + entrance : ""; 
        const fileName = `${safeAddress} ${safeEntrance}.jpg`.trim();

        // 4. Загрузка
        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);

        await drive.files.create({
            resource: { name: fileName, parents: [finalFolderId] },
            media: { mimeType: 'image/jpeg', body: bufferStream }
        });

        // 5. Запись в отчет (Google Таблица)
        const gpsLink = (lat && lon) ? `http://maps.google.com/maps?q=${lat},${lon}` : "Нет GPS";
        await appendToReport(workerId, worker, todayStr, safeAddress, entrance || "-", finalFolderName, gpsLink);
        
        res.json({ success: true });

    } catch (e) {
        console.error("Critical Error:", e);
        res.json({ status: 'error', message: e.message, success: false });
    }
});

// API ДЛЯ АДМИНКИ
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
    let keys = await readDatabase(); keys = keys.filter(k => k.key !== key);
    await saveDatabase(keys);
    res.json({ success: true });
});

// --- НОВЫЙ ДИЗАЙН АДМИНКИ (COMMAND CENTER) ---
app.get('/dashboard', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LOGIST X | COMMAND</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;800;900&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --accent: #d29922; --text: #c9d1d9; --green: #238636; --red: #da3633; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; padding: 20px; }
            * { box-sizing: border-box; }
            
            h1, h2, h3 { text-transform: uppercase; font-weight: 900; margin: 0 0 10px 0; letter-spacing: 1px; }
            .brand { color: var(--accent); font-style: italic; font-size: 1.5rem; margin-bottom: 30px; border-bottom: 2px solid var(--border); padding-bottom: 15px; display:flex; justify-content:space-between; align-items:center; }
            
            .container { max-width: 800px; margin: 0 auto; }
            
            .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 25px; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            
            /* Кнопки и поля */
            label { display: block; font-size: 0.75rem; font-weight: bold; color: #8b949e; margin-bottom: 8px; text-transform: uppercase; }
            input, select { width: 100%; background: #010409; border: 1px solid var(--border); color: #fff; padding: 16px; font-size: 1.1rem; border-radius: 8px; margin-bottom: 20px; font-family: 'JetBrains Mono', monospace; outline: none; transition: 0.2s; }
            input:focus { border-color: var(--accent); box-shadow: 0 0 10px rgba(210, 153, 34, 0.2); }
            
            button { width: 100%; padding: 18px; font-size: 1rem; font-weight: 900; text-transform: uppercase; border: none; border-radius: 8px; cursor: pointer; transition: 0.2s; }
            .btn-main { background: var(--accent); color: #000; }
            .btn-main:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(210, 153, 34, 0.4); }
            
            .btn-del { background: rgba(218, 54, 51, 0.1); color: var(--red); border: 1px solid var(--red); padding: 8px 12px; font-size: 0.8rem; width: auto; }
            .btn-del:hover { background: var(--red); color: #fff; }

            /* Список ключей */
            .key-item { background: #010409; border: 1px solid var(--border); padding: 20px; border-radius: 8px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px; position: relative; overflow: hidden; }
            .key-item::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--green); }
            .key-item.expired::before { background: var(--red); }
            
            .k-header { display: flex; justify-content: space-between; align-items: flex-start; }
            .k-code { font-family: 'JetBrains Mono', monospace; font-size: 1.4rem; font-weight: bold; color: #fff; letter-spacing: 2px; }
            .k-meta { font-size: 0.8rem; color: #8b949e; margin-top: 5px; }
            .k-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; margin-left: 10px; background: rgba(56, 139, 253, 0.15); color: #58a6ff; }
            
            .workers-list { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 0.9rem; }
            .w-tag { background: #21262d; padding: 4px 8px; border-radius: 4px; margin-right: 5px; display: inline-block; margin-bottom: 5px; border: 1px solid var(--border); }

        </style>
    </head>
    <body>

    <div class="container">
        <div class="brand">
            <span>LOGIST X <span style="font-size:0.8rem; color:#fff; opacity:0.5;">// ADMIN</span></span>
            <button onclick="loadKeys()" style="width:auto; padding:10px 20px; background:#21262d; color:#fff; font-size:0.8rem;">↻ ОБНОВИТЬ</button>
        </div>

        <div class="card">
            <h2>⚡ СОЗДАТЬ ЛИЦЕНЗИЮ</h2>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <label>Владелец (Имя для папки)</label>
                    <input type="text" id="newName" placeholder="Например: ИП ИВАНОВ">
                </div>
                <div>
                    <label>Лимит работников</label>
                    <input type="number" id="newLimit" value="5">
                </div>
            </div>
            <label>Срок действия</label>
            <select id="newDays">
                <option value="30">1 Месяц (30 дней)</option>
                <option value="90">3 Месяца</option>
                <option value="365">1 Год</option>
                <option value="7">Тест (7 дней)</option>
            </select>
            <button class="btn-main" onclick="addKey()">СГЕНЕРИРОВАТЬ КЛЮЧ</button>
        </div>

        <h2 style="margin-left: 10px; color: #8b949e;">АКТИВНЫЕ КЛЮЧИ</h2>
        <div id="keysList">ЗАГРУЗКА...</div>
    </div>

    <script>
        async function loadKeys() {
            const res = await fetch('/api/keys');
            const keys = await res.json();
            const cont = document.getElementById('keysList');
            cont.innerHTML = '';

            keys.forEach(k => {
                const isExp = new Date(k.expiry) < new Date();
                const expDate = new Date(k.expiry).toLocaleDateString('ru-RU');
                
                let workersHtml = k.workers && k.workers.length > 0 
                    ? k.workers.map(w => \`<span class="w-tag">👤 \${w}</span>\`).join('') 
                    : '<span style="opacity:0.3">Нет работников</span>';

                const html = \`
                <div class="key-item \${isExp ? 'expired' : ''}">
                    <div class="k-header">
                        <div>
                            <div class="k-code">\${k.key}</div>
                            <div class="k-meta">
                                📂 \${k.name} 
                                <span class="k-badge">Лимит: \${k.workers ? k.workers.length : 0} / \${k.limit}</span>
                                <span class="k-badge" style="\${isExp ? 'color:#da3633' : 'color:#238636'}">До: \${expDate}</span>
                            </div>
                        </div>
                        <button class="btn-del" onclick="delKey('\${k.key}')">УДАЛИТЬ</button>
                    </div>
                    <div class="workers-list">\${workersHtml}</div>
                </div>
                \`;
                cont.insertAdjacentHTML('beforeend', html);
            });
        }

        async function addKey() {
            const name = document.getElementById('newName').value;
            const limit = document.getElementById('newLimit').value;
            const days = document.getElementById('newDays').value;
            
            if(!name) return alert('Введите имя владельца!');

            await fetch('/api/keys/add', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name, limit, days })
            });
            
            document.getElementById('newName').value = '';
            loadKeys();
        }

        async function delKey(key) {
            if(!confirm('Удалить этот ключ? Работники потеряют доступ.')) return;
            await fetch('/api/keys/del', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ key })
            });
            loadKeys();
        }

        loadKeys();
    </script>
    </body>
    </html>
    `;
    res.send(html);
});

app.get('/', (req, res) => res.redirect('/dashboard'));

app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ЗАПУЩЕН"));
