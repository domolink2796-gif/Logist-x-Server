const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
// Увеличили лимит и добавили поддержку разных форматов
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
const bot = new Telegraf(BOT_TOKEN);

// --- БАЗА ДАННЫХ ---

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
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) { return []; }
        }
        return data.keys || [];
    } catch (e) { 
        console.error("Ошибка чтения БД:", e);
        return []; 
    }
}

async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        
        const dataStr = JSON.stringify({ keys: keys }, null, 2);
        const bufferStream = new Readable(); bufferStream.push(dataStr); bufferStream.push(null);
        const media = { mimeType: 'application/json', body: bufferStream };

        if (res.data.files.length > 0) {
            await drive.files.update({ fileId: res.data.files[0].id, media: media });
        } else {
            await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media: media });
        }
    } catch (e) { console.error("Ошибка записи:", e); }
}

// --- ЛОГИКА ПРОВЕРКИ ЛИЦЕНЗИИ (Вынесли в отдельную функцию) ---
async function handleLicenseCheck(body) {
    const { licenseKey, workerName } = body;
    console.log(`Проверка лицензии: ${licenseKey} от ${workerName}`);
    
    const keys = await readDatabase();
    const keyData = keys.find(k => k.key === licenseKey);

    if (!keyData) return { status: 'error', message: 'Ключ не найден' };
    
    const now = new Date();
    const expiry = new Date(keyData.expiry);
    if (expiry < now) return { status: 'error', message: 'Срок действия истек' };

    if (!keyData.workers) keyData.workers = [];
    
    // Если работника нет в списке - добавляем
    if (!keyData.workers.includes(workerName)) {
        if (keyData.workers.length >= parseInt(keyData.limit)) {
            return { status: 'error', message: 'Лимит мест исчерпан' };
        }
        keyData.workers.push(workerName);
        await saveDatabase(keys);
    }
    
    // Возвращаем дату окончания, чтобы приложение знало
    return { status: 'active', expiry: keyData.expiry };
}

// === МАРШРУТЫ ===

// 1. СПЕЦИАЛЬНЫЙ МАРШРУТ ДЛЯ ТВОЕГО ПРИЛОЖЕНИЯ (ЧТОБЫ НЕ БЫЛО ОШИБКИ СВЯЗИ)
app.post('/check-license', async (req, res) => {
    try {
        const result = await handleLicenseCheck(req.body);
        res.json(result);
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// 2. ОСНОВНОЙ ВХОД (ФОТО + ЛИЦЕНЗИЯ ЧЕРЕЗ ACTION)
app.post('/upload', async (req, res) => {
    try {
        const body = req.body;

        // Если пришло через /upload, но это проверка лицензии
        if (body.action === 'check_license') {
            const result = await handleLicenseCheck(body);
            return res.json(result);
        }

        // ЗАГРУЗКА ФОТО
        const { worker, city, address, client, image } = body;
        console.log(`Фото от ${worker}`);

        // Ищем владельца ключа
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker));
        const ownerName = keyData ? keyData.name : "Неизвестный Владелец";

        // Папки
        const ownerId = await getOrCreateFolder(ownerName, MY_ROOT_ID);
        const workerId = await getOrCreateFolder(worker || "Работник", ownerId);
        const cityId = await getOrCreateFolder(city || "Город", workerId);
        
        let finalFolderName = "Общий";
        if (client && client.trim().length > 0) finalFolderName = client.trim();
        const finalFolderId = await getOrCreateFolder(finalFolderName, cityId);

        // Файл
        const safeAddress = address && address.trim().length > 0 ? address.trim() : "Без адреса";
        const timeStr = new Date().toLocaleString("ru-RU").replace(/, /g, '_').replace(/:/g, '-');
        const fileName = `${safeAddress} ${timeStr}.jpg`;

        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const bufferStream = new Readable(); bufferStream.push(buffer); bufferStream.push(null);

        await drive.files.create({
            resource: { name: fileName, parents: [finalFolderId] },
            media: { mimeType: 'image/jpeg', body: bufferStream }
        });
        
        res.json({ success: true });

    } catch (e) {
        console.error("Critical Error:", e);
        res.json({ status: 'error', message: 'Сбой сервера: ' + e.message, success: false });
    }
});

// --- АДМИНКА ---
const ADMIN_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Logist HQ Ultimate</title>
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #010409; color: #e6edf3; font-family: sans-serif; }
        .glass { background: rgba(13, 17, 23, 0.95); border: 1px solid #30363d; border-radius: 1rem; }
        input { background: #0d1117 !important; border: 1px solid #30363d !important; color: #fff !important; padding: 10px; width: 100%; border-radius: 8px; }
        .btn { background: #1f6feb; color: white; padding: 10px; border-radius: 8px; font-weight: bold; width: 100%; }
        .tag { background: #238636; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 4px; display: inline-block; margin-top:4px;}
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const { useState, useEffect } = React;
        const App = () => {
            const [isAuth, setIsAuth] = useState(false);
            const [pass, setPass] = useState("");
            const [keys, setKeys] = useState([]);
            const [bridgeCode, setBridgeCode] = useState("");

            const login = () => pass.toLowerCase().includes('евгений') ? (setIsAuth(true), refresh()) : alert("Закрыто");
            const refresh = () => fetch('/api/list_keys').then(r=>r.json()).then(d=>setKeys(d.keys||[]));
            const addKey = (e) => {
                e.preventDefault(); const fd = new FormData(e.target);
                fetch('/api/add_key', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:fd.get('o'), days:fd.get('d'), limit:fd.get('l')}) }).then(refresh);
                e.target.reset();
            };
            const deleteKey = (key) => { if(confirm('Удалить?')) fetch('/api/delete_key', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key}) }).then(refresh); };
            
            const generateBridge = () => {
                const url = window.location.origin;
                // ГЕНЕРАТОР ТЕПЕРЬ ДАЕТ УНИВЕРСАЛЬНЫЙ КОД
                setBridgeCode(\`const MASTER_HQ = "\${url}"; // Базовый адрес

function doPost(e) {
  let p; try { p = JSON.parse(e.postData.contents); } catch(err) { p = e.parameter; }
  
  // Если это проверка лицензии - шлем на /check-license
  if (p.action === "check_license") {
      try {
        const res = UrlFetchApp.fetch(MASTER_HQ + "/check-license", { 
            method: "post", 
            contentType: "application/json", 
            payload: JSON.stringify(p), 
            muteHttpExceptions: true 
        });
        return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
      } catch(e) { return ContentService.createTextOutput(JSON.stringify({status:"error", message:"Сбой связи"})).setMimeType(ContentService.MimeType.JSON); }
  }

  // Если фото - шлем на /upload
  try {
     const res = UrlFetchApp.fetch(MASTER_HQ + "/upload", { 
        method: 'post', 
        contentType: 'application/json', 
        payload: JSON.stringify(p), 
        muteHttpExceptions: true 
     });
     return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
  } catch(e) { return ContentService.createTextOutput(JSON.stringify({status:"error", message:e.toString()})).setMimeType(ContentService.MimeType.JSON); }
}\`);
            };

            if(!isAuth) return <div className="h-screen flex items-center justify-center"><div className="glass p-8"><input type="password" onChange={e=>setPass(e.target.value)} placeholder="Пароль" /><br/><br/><button onClick={login} className="btn">ВОЙТИ</button></div></div>;

            return (
                <div className="p-4 max-w-4xl mx-auto">
                    <div className="flex justify-between mb-8"><h1 className="text-xl font-bold text-amber-500">HQ SYSTEM v100</h1><div><button onClick={generateBridge} className="text-blue-400 mr-4 font-bold text-xs uppercase">Генератор</button><button onClick={refresh} className="text-amber-500 font-bold text-xs uppercase">Обновить</button></div></div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-4">
                            {keys.map(k=>(
                                <div key={k.key} className="glass p-4">
                                    <div className="flex justify-between text-xs text-gray-500 mb-2 font-mono"><span>{k.key}</span><button onClick={()=>deleteKey(k.key)} className="text-red-500">X</button></div>
                                    <div className="font-bold text-lg mb-1 text-white">{k.name} <span className="text-xs font-normal text-gray-500">(Владелец)</span></div>
                                    <div className="text-xs text-gray-400">Срок: {k.expiry} | Мест: {k.workers?k.workers.length:0}/{k.limit}</div>
                                    <div className="mt-2">{k.workers && k.workers.map(w=><span className="tag">{w}</span>)}</div>
                                </div>
                            ))}
                        </div>
                        <form onSubmit={addKey} className="glass p-6 h-fit sticky top-4">
                            <div className="text-amber-500 font-bold mb-4 text-center text-xs uppercase tracking-widest">Новая Лицензия</div>
                            <input name="o" placeholder="Имя Владельца" className="mb-2" required />
                            <div className="grid grid-cols-2 gap-2 mb-4"><input name="d" type="number" defaultValue="30" /><input name="l" type="number" defaultValue="3" /></div>
                            <button className="btn">СОЗДАТЬ</button>
                        </form>
                    </div>
                    {bridgeCode && <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4"><div className="glass p-6 w-full max-w-lg"><h3 className="text-white font-bold mb-2">Скопируйте в Google Script:</h3><textarea readOnly value={bridgeCode} className="w-full h-64 bg-black text-green-500 text-xs p-4 rounded mb-4 font-mono"/><button onClick={()=>setBridgeCode("")} className="btn">ЗАКРЫТЬ</button></div></div>}
                </div>
            );
        };
        const root = ReactDOM.createRoot(document.getElementById('root')); root.render(<App />);
    </script>
</body>
</html>
`;

app.get('/dashboard', (req, res) => res.send(ADMIN_HTML));
app.get('/tv', (req, res) => res.redirect('/dashboard'));
app.get('/admin-panel', (req, res) => res.redirect('/dashboard'));

app.get('/api/list_keys', async (req, res) => { const keys = await readDatabase(); res.json({ keys }); });
app.post('/api/add_key', async (req, res) => { try { const { name, days, limit } = req.body; const keys = await readDatabase(); const key = "LX-" + Math.random().toString(36).substr(2, 9).toUpperCase(); const date = new Date(); date.setDate(date.getDate() + parseInt(days)); keys.push({ key, name: name || "Без названия", expiry: date.toISOString().split('T')[0], limit: parseInt(limit), workers: [] }); await saveDatabase(keys); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/delete_key', async (req, res) => { try { const { key } = req.body; let keys = await readDatabase(); keys = keys.filter(k => k.key !== key); await saveDatabase(keys); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

bot.start((ctx) => { const d = process.env.RAILWAY_STATIC_URL || "logist-x-server-production.up.railway.app"; ctx.reply('LOGIST HQ: ONLINE 🟢', { reply_markup: { inline_keyboard: [[ { text: "ОТКРЫТЬ ПУЛЬТ", web_app: { url: `https://${d}/dashboard` } } ]] } }); });
app.get('/', (req, res) => res.send("SERVER ONLINE"));
bot.launch().catch(e => console.log(e));
app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ЗАПУЩЕН"));
process.once('SIGINT', () => bot.stop('SIGINT')); process.once('SIGTERM', () => bot.stop('SIGTERM'));
