const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- ТВОИ НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';

// Google Auth
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- РАБОТА С ДИСКОМ И БАЗОЙ ---

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
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
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
        if (res.data.files.length > 0) await drive.files.update({ fileId: res.data.files[0].id, media: media });
        else await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media: media });
    } catch (e) { console.error("Save Error:", e); }
}

// --- ЛОГИКА ЗАГРУЗКИ ---
app.post('/upload', async (req, res) => {
    try {
        const body = req.body;

        // 1. АКТИВАЦИЯ КЛЮЧА
        if (body.action === 'check_license') {
            const { licenseKey, workerName } = body;
            const keys = await readDatabase();
            const keyData = keys.find(k => k.key === licenseKey);

            if (!keyData) return res.json({ status: 'error', message: 'Неверный ключ' });
            if (new Date(keyData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истек' });

            if (!keyData.workers) keyData.workers = [];
            if (!keyData.workers.includes(workerName)) {
                if (keyData.workers.length >= parseInt(keyData.limit)) return res.json({ status: 'error', message: 'Лимит мест исчерпан' });
                keyData.workers.push(workerName);
                await saveDatabase(keys);
            }
            return res.json({ status: 'active' });
        }

        // 2. ЗАГРУЗКА ФОТО (НОВАЯ ИЕРАРХИЯ)
        const { worker, city, address, client, image } = body;
        
        // --- ПОИСК ВЛАДЕЛЬЦА ---
        // Ищем в базе, к какому ключу привязан этот Работник
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(worker));
        
        // Если нашли ключ - берем Имя Владельца (название ключа). Если нет - кидаем в "Чужие"
        const ownerName = keyData ? keyData.name : "Неизвестный Владелец";

        // ШАГ 1: ПАПКА ВЛАДЕЛЬЦА (ГЛАВНАЯ)
        const ownerId = await getOrCreateFolder(ownerName, MY_ROOT_ID);

        // ШАГ 2: ПАПКА РАБОТНИКА (ВНУТРИ ВЛАДЕЛЬЦА)
        const workerId = await getOrCreateFolder(worker || "Работник", ownerId);
        
        // ШАГ 3: ПАПКА ГОРОДА
        const cityId = await getOrCreateFolder(city || "Город", workerId);

        // ШАГ 4: ПАПКА КЛИЕНТА
        let finalFolderName = "Общий";
        if (client && client.trim().length > 0) finalFolderName = client.trim();
        const finalFolderId = await getOrCreateFolder(finalFolderName, cityId);

        // ФАЙЛ
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
        console.error("Upload Error:", e);
        res.json({ status: 'error', message: e.message, success: false });
    }
});

// --- АДМИНКА ---
const ADMIN_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Logist HQ v95</title>
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #010409; color: #e6edf3; font-family: sans-serif; }
        .glass { background: rgba(13, 17, 23, 0.95); border: 1px solid #30363d; border-radius: 1rem; }
        input { background: #0d1117 !important; border: 1px solid #30363d !important; color: #fff !important; padding: 10px; width: 100%; border-radius: 8px; }
        .btn { background: #1f6feb; color: white; padding: 10px; border-radius: 8px; font-weight: bold; width: 100%; }
        .worker-tag { border: 1px solid #3fb950; color: #3fb950; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 4px; display: inline-block; margin-top: 4px;}
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

            const login = () => pass.toLowerCase().includes('евгений') ? (setIsAuth(true), refresh()) : alert("Доступ запрещен");
            const refresh = () => fetch('/api/list_keys').then(r=>r.json()).then(d=>setKeys(d.keys||[]));
            
            const addKey = (e) => {
                e.preventDefault(); const fd = new FormData(e.target);
                // Тут 'o' - это ИМЯ ВЛАДЕЛЬЦА (Название главной папки)
                fetch('/api/add_key', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:fd.get('o'), days:fd.get('d'), limit:fd.get('l')}) }).then(refresh);
                e.target.reset();
            };
            
            const deleteKey = (key) => { if(confirm('Удалить лицензию?')) fetch('/api/delete_key', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key}) }).then(refresh); };
            
            const generateBridge = () => {
                const url = window.location.origin;
                setBridgeCode(\`const MASTER_HQ = "\${url}/upload";
function doPost(e) {
  let p; try { p = JSON.parse(e.postData.contents); } catch(err) { p = e.parameter; }
  
  if (p.action === "check_license") {
      try {
        const res = UrlFetchApp.fetch(MASTER_HQ, { method: "post", contentType: "application/json", payload: JSON.stringify(p) });
        return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
      } catch(e) { return ContentService.createTextOutput(JSON.stringify({status:"error", message:"Сбой связи"})).setMimeType(ContentService.MimeType.JSON); }
  }

  try {
     const res = UrlFetchApp.fetch(MASTER_HQ, { method: 'post', contentType: 'application/json', payload: JSON.stringify(p) });
     return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
  } catch(e) { return ContentService.createTextOutput(JSON.stringify({status:"error", message:e.toString()})).setMimeType(ContentService.MimeType.JSON); }
}\`);
            };

            if(!isAuth) return <div className="h-screen flex items-center justify-center"><div className="glass p-8"><input type="password" onChange={e=>setPass(e.target.value)} placeholder="Пароль администратора" /><br/><br/><button onClick={login} className="btn">ВОЙТИ</button></div></div>;

            return (
                <div className="p-4 max-w-4xl mx-auto">
                    <div className="flex justify-between mb-8"><h1 className="text-xl font-bold text-amber-500">HQ v95</h1><div><button onClick={generateBridge} className="text-blue-400 mr-4 font-bold text-xs uppercase">Генератор Моста</button><button onClick={refresh} className="text-amber-500 font-bold text-xs uppercase">Обновить</button></div></div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-4">
                            {keys.map(k=>(
                                <div key={k.key} className="glass p-4 relative overflow-hidden">
                                    <div className="flex justify-between text-xs text-gray-500 mb-2 font-mono"><span>{k.key}</span><button onClick={()=>deleteKey(k.key)} className="text-red-500 font-bold">УДАЛИТЬ</button></div>
                                    <div className="font-bold text-lg mb-1 text-white">{k.name} <span className="text-xs text-gray-500 font-normal">(Владелец)</span></div>
                                    <div className="text-xs text-gray-400">Истекает: {k.expiry} | Мест занято: {k.workers?k.workers.length:0} из {k.limit}</div>
                                    <div className="mt-3 border-t border-white/10 pt-2">
                                        <div className="text-[10px] uppercase text-gray-500 mb-1">Работники:</div>
                                        <div>{k.workers && k.workers.map(w=><span className="worker-tag">{w}</span>)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <form onSubmit={addKey} className="glass p-6 h-fit sticky top-4">
                            <div className="text-amber-500 font-bold mb-4 text-center text-xs uppercase tracking-widest">НОВАЯ ЛИЦЕНЗИЯ</div>
                            <label className="text-[10px] text-gray-400 uppercase">Имя Владельца (Название папки)</label>
                            <input name="o" placeholder="Например: ИП Смирнов" required className="mb-4 mt-1" />
                            
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <div><label className="text-[10px] text-gray-400 uppercase">Дней</label><input name="d" type="number" defaultValue="30" /></div>
                                <div><label className="text-[10px] text-gray-400 uppercase">Воркеров</label><input name="l" type="number" defaultValue="3" /></div>
                            </div>
                            <button className="btn">СОЗДАТЬ КЛЮЧ</button>
                        </form>
                    </div>
                    {bridgeCode && <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4"><div className="glass p-6 w-full max-w-lg"><h3 className="text-white font-bold mb-2">Код для Google Apps Script</h3><textarea readOnly value={bridgeCode} className="w-full h-64 bg-black text-green-500 text-xs p-4 rounded mb-4 font-mono"/><button onClick={()=>setBridgeCode("")} className="btn">ЗАКРЫТЬ</button></div></div>}
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

bot.start((ctx) => { const d = process.env.RAILWAY_STATIC_URL || "logist-x-server-production.up.railway.app"; ctx.reply('LOGIST HQ: ГОТОВО 🟢', { reply_markup: { inline_keyboard: [[ { text: "ОТКРЫТЬ ПУЛЬТ", web_app: { url: `https://${d}/dashboard` } } ]] } }); });
app.get('/', (req, res) => res.send("SERVER ONLINE"));
bot.launch().catch(e => console.log(e));
app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ЗАПУЩЕН"));
process.once('SIGINT', () => bot.stop('SIGINT')); process.once('SIGTERM', () => bot.stop('SIGTERM'));
