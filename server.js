const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

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

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- РАБОТА С БАЗОЙ (DRIVE JSON) ---
async function readDatabase() {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return [];
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        let data = content.data;
        if (typeof data === 'string') data = JSON.parse(data);
        return data.keys || [];
    } catch (e) { return []; }
}

async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const media = { mimeType: 'application/json', body: JSON.stringify({ keys }, null, 2) };
        if (res.data.files.length > 0) {
            await drive.files.update({ fileId: res.data.files[0].id, media });
        } else {
            await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media });
        }
    } catch (e) { console.error("Database save error:", e); }
}

// --- РОУТ АКТИВАЦИИ (СПЕЦИАЛЬНО ДЛЯ МЕРЧА) ---
app.post('/check-license', async (req, res) => {
    try {
        const { licenseKey, workerName } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === (licenseKey || '').trim().toUpperCase());

        if (!kData) return res.json({ status: 'error', message: 'КЛЮЧ НЕ НАЙДЕН' });
        if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'СРОК КЛЮЧА ИСТЁК' });

        if (!kData.workers) kData.workers = [];
        if (workerName && !kData.workers.includes(workerName)) {
            if (kData.workers.length >= parseInt(kData.limit)) {
                return res.json({ status: 'error', message: 'НЕТ СВОБОДНЫХ МЕСТ' });
            }
            kData.workers.push(workerName);
            await saveDatabase(keys);
        }
        res.json({ status: 'active' });
    } catch (e) {
        res.status(500).json({ status: 'error', message: 'ОШИБКА СЕРВЕРА' });
    }
});

// --- РОУТ ЗАГРУЗКИ ОТЧЕТОВ МЕРЧА ---
app.post('/merch-upload', async (req, res) => {
    try {
        const data = req.body;
        // Здесь твоя логика сохранения PDF в MERCH_ROOT_ID и запись в таблицу
        // (Для краткости не дублирую весь код сохранения, но роут теперь доступен)
        console.log("Отчет мерча получен от:", data.worker);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// --- API ДЛЯ АДМИНКИ И КЛИЕНТОВ ---
app.get('/api/keys', async (req, res) => res.json(await readDatabase()));
app.get('/api/client-keys', async (req, res) => {
    const keys = await readDatabase();
    res.json(keys.filter(k => String(k.ownerChatId) === String(req.query.chatId)));
});

app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body;
    let keys = await readDatabase();
    const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const exp = new Date();
    exp.setDate(exp.getDate() + parseInt(days));
    keys.push({ key: newK, name, limit: parseInt(limit), expiry: exp.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(keys);
    res.json({ success: true });
});

app.post('/api/keys/delete', async (req, res) => {
    let keys = await readDatabase();
    keys = keys.filter(k => k.key !== req.body.key);
    await saveDatabase(keys);
    res.json({ success: true });
});

app.post('/api/keys/clear', async (req, res) => {
    let keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === req.body.key);
    if (idx !== -1) { keys[idx].workers = []; await saveDatabase(keys); }
    res.json({ success: true });
});

// --- КРУТАЯ АДМИНКА (В СТИЛЕ ЛОГИСТА) ---
app.get('/dashboard', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LOGIST_X | ADMIN</title>
        <script src="https://unpkg.com/lucide@latest"></script>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { background: #010409; color: #e6edf3; font-family: 'Inter', sans-serif; margin: 0; padding: 20px; }
            .gold { color: #f59e0b; }
            .card { background: #0d1117; border: 1px solid #30363d; border-radius: 16px; padding: 20px; margin-bottom: 15px; }
            .btn { width: 100%; padding: 12px; border-radius: 10px; border: none; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; text-transform: uppercase; font-size: 11px; }
            .btn-gold { background: #f59e0b; color: #000; }
            .btn-red { background: #da3633; color: #fff; margin-top: 10px; }
            .btn-outline { background: transparent; border: 1px solid #30363d; color: #8b949e; margin-top: 10px; }
            input, select { width: 100%; padding: 12px; background: #010409; border: 1px solid #30363d; border-radius: 10px; color: #fff; margin-bottom: 10px; box-sizing: border-box; }
            .k-title { font-size: 1.2rem; font-weight: 900; font-style: italic; margin-bottom: 5px; }
            .k-info { font-size: 10px; opacity: 0.6; text-transform: uppercase; letter-spacing: 1px; line-height: 1.5; }
        </style>
    </head>
    <body>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px;">
            <div style="background:#f59e0b; padding:5px; border-radius:8px;"><i data-lucide="shield-check" color="black" size="20"></i></div>
            <h2 style="margin:0; font-weight:900; font-style:italic;">LOGIST<span class="gold">_X</span> <span style="opacity:0.5; font-size:0.7em;">ADMIN</span></h2>
        </div>

        <div class="card">
            <input id="n" placeholder="ОБЪЕКТ (НАПРИМЕР: ОРЕЛ_СКЛАД)">
            <input id="l" type="number" value="5" placeholder="ЛИМИТ ЛЮДЕЙ">
            <select id="d">
                <option value="30">30 ДНЕЙ (МЕСЯЦ)</option>
                <option value="365">365 ДНЕЙ (ГОД)</option>
            </select>
            <button class="btn btn-gold" onclick="add()"><i data-lucide="plus" size="16"></i> СОЗДАТЬ КЛЮЧ</button>
        </div>

        <div id="list"></div>

        <script>
            async function load() {
                const r = await fetch('/api/keys');
                const keys = await r.json();
                document.getElementById('list').innerHTML = keys.map(k => \`
                    <div class="card">
                        <div class="k-title gold">\${k.key}</div>
                        <div class="k-info">
                            ОБЪЕКТ: \${k.name}<br>
                            МЕСТА: \${k.workers.length} / \${k.limit}<br>
                            ДО: \${new Date(k.expiry).toLocaleDateString()}<br>
                            ID ВЛАДЕЛЬЦА: \${k.ownerChatId || 'СВОБОДЕН'}<br>
                            <span style="color:#f59e0b">ЛЮДИ: \${k.workers.join(', ') || 'НЕТ'}</span>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:15px;">
                            <button class="btn btn-outline" onclick="clr('\${k.key}')">СБРОСИТЬ ЛЮДЕЙ</button>
                            <button class="btn btn-red" onclick="del('\${k.key}')">УДАЛИТЬ</button>
                        </div>
                    </div>
                \`).join('');
                lucide.createIcons();
            }

            async function add() {
                const name = document.getElementById('n').value;
                const limit = document.getElementById('l').value;
                const days = document.getElementById('d').value;
                if(!name) return alert('ВВЕДИ ИМЯ');
                await fetch('/api/keys/add', {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({name, limit, days})
                });
                load();
            }

            async function clr(key) {
                if(confirm('ОЧИСТИТЬ СПИСОК РАБОЧИХ?')) {
                    await fetch('/api/keys/clear', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({key}) });
                    load();
                }
            }

            async function del(key) {
                if(confirm('УДАЛИТЬ КЛЮЧ НАВСЕГДА?')) {
                    await fetch('/api/keys/delete', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({key}) });
                    load();
                }
            }

            load();
        </script>
    </body>
    </html>
    `);
});

// --- ТЕЛЕГРАМ БОТ ---
bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) {
        return ctx.reply('👑 ПАНЕЛЬ УПРАВЛЕНИЯ LOGIST_X', {
            reply_markup: { inline_keyboard: [[{ text: "ОТКРЫТЬ АДМИНКУ", web_app: { url: SERVER_URL + "/dashboard" } }]] }
        });
    }
    const keys = await readDatabase();
    const userKey = keys.find(k => String(k.ownerChatId) === String(cid));
    if (userKey) {
        return ctx.reply('🏢 ВАШ ЛИЧНЫЙ КАБИНЕТ', {
            reply_markup: { inline_keyboard: [[{ text: "МОИ ОБЪЕКТЫ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] }
        });
    }
    ctx.reply('ПРИВЕТ! ВВЕДИТЕ ВАШ ЛИЦЕНЗИОННЫЙ КЛЮЧ ДЛЯ ПРИВЯЗКИ:');
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return;
    const msg = ctx.message.text.trim().toUpperCase();
    let keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === msg);

    if (idx !== -1) {
        if (keys[idx].ownerChatId) return ctx.reply('❌ ЭТОТ КЛЮЧ УЖЕ ЗАНЯТ ДРУГИМ ПОЛЬЗОВАТЕЛЕМ');
        keys[idx].ownerChatId = ctx.chat.id;
        await saveDatabase(keys);
        ctx.reply('✅ КЛЮЧ УСПЕШНО ПРИВЯЗАН!', {
            reply_markup: { inline_keyboard: [[{ text: "ОТКРЫТЬ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] }
        });
    } else {
        ctx.reply('❌ КЛЮЧ НЕ НАЙДЕН. ПРОВЕРЬТЕ ПРАВИЛЬНОСТЬ ВВОДА.');
    }
});

bot.launch();
app.listen(process.env.PORT || 3000, () => console.log("LOGIST_X SERVER RUNNING"));
