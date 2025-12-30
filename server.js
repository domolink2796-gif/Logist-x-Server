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
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; // Твоя папка на Диске
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json'; // Имя файла базы данных

// Auth
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- ФУНКЦИИ GOOGLE DRIVE ---

// 1. Поиск или создание папки
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

// 2. ЧТЕНИЕ БАЗЫ (JSON файл)
async function readDatabase() {
    try {
        // Ищем файл базы
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        
        if (res.data.files.length === 0) {
            // Если файла нет - возвращаем пустой список
            return [];
        }

        const fileId = res.data.files[0].id;
        const content = await drive.files.get({ fileId, alt: 'media' });
        
        // Если файл есть, но пустой или битый
        if (!content.data || typeof content.data !== 'object') return [];
        
        return content.data.keys || [];
    } catch (e) {
        console.error("Ошибка чтения базы:", e);
        return [];
    }
}

// 3. ЗАПИСЬ В БАЗУ (JSON файл)
async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        
        const dataStr = JSON.stringify({ keys: keys }, null, 2);
        const bufferStream = new Readable();
        bufferStream.push(dataStr);
        bufferStream.push(null);

        const media = { mimeType: 'application/json', body: bufferStream };

        if (res.data.files.length > 0) {
            // Обновляем существующий файл
            await drive.files.update({
                fileId: res.data.files[0].id,
                media: media
            });
        } else {
            // Создаем новый
            await drive.files.create({
                resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] },
                media: media
            });
        }
    } catch (e) {
        console.error("Ошибка записи базы:", e);
    }
}

// --- ТВОЙ ДИЗАЙН (КИБЕРПАНК/ЗОЛОТО) ---
const ADMIN_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>Logist Master HQ | v88.0</title>
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="theme-color" content="#010409">
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { background: #010409; color: #e6edf3; font-family: 'Inter', sans-serif; margin: 0; overflow-x: hidden; }
        .glass { background: rgba(13, 17, 23, 0.9); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); border-radius: 2.5rem; }
        .btn-gold { background: linear-gradient(135deg, #f59e0b, #b45309); color: #000; font-weight: 900; }
        input { background: #000 !important; border: 1px solid #30363d !important; color: #fff !important; border-radius: 12px !important; padding: 14px !important; width: 100%; outline: none; }
        input:focus { border-color: #f59e0b !important; }
        .clickable { cursor: pointer !important; }
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
            const [loading, setLoading] = useState(false);
            const [bridgeCode, setBridgeCode] = useState("");

            const login = () => pass.toLowerCase().includes('евгений') ? (setIsAuth(true), refresh()) : alert("Доступ закрыт");
            
            const refresh = () => {
                setLoading(true);
                fetch('/api/list_keys')
                    .then(r => r.json())
                    .then(res => { setKeys(res.keys || []); setLoading(false); })
                    .catch(() => setLoading(false));
            };

            const addKey = (name, days, limit) => {
                setLoading(true);
                fetch('/api/add_key', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name, days, limit })
                }).then(() => { refresh(); });
            };

            const deleteKey = (key) => {
                if(!confirm('Удалить?')) return;
                setLoading(true);
                fetch('/api/delete_key', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ key })
                }).then(() => refresh());
            };

            const getDaysLeft = (expiryDate) => {
                if (!expiryDate) return 0;
                const diff = new Date(expiryDate) - new Date();
                return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
            };

            const generateBridge = () => {
                const url = window.location.origin;
                const code = \`const MASTER_HQ = "\${url}/upload";
function doPost(e) {
  try {
    let p = JSON.parse(e.postData.contents);
    let res = UrlFetchApp.fetch(MASTER_HQ, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(p)
    });
    return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
  } catch(err) { return ContentService.createTextOutput(JSON.stringify({error: err.toString()})); }
}\`;
                setBridgeCode(code);
            };

            if (!isAuth) return (
                <div className="h-screen flex items-center justify-center p-6 bg-[#010409]">
                    <div className="glass p-12 w-full max-w-sm text-center shadow-2xl">
                        <h1 className="text-3xl font-black mb-8 text-amber-500 italic uppercase">Logist HQ</h1>
                        <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Мастер Пароль" 
                               className="mb-4 text-center font-bold" />
                        <button onClick={login} className="btn-gold w-full py-5 rounded-2xl uppercase font-black text-[11px]">Войти</button>
                    </div>
                </div>
            );

            return (
                <div className="p-4 md:p-10 max-w-7xl mx-auto min-h-screen">
                    <header className="flex justify-between items-center mb-10 glass p-6 shadow-xl">
                        <h1 className="text-xl font-black italic text-amber-500 uppercase">Master Control v88.0</h1>
                        <div className="flex gap-2">
                            <button onClick={generateBridge} className="bg-blue-600 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase clickable">Генератор</button>
                            <button onClick={refresh} className="bg-amber-500 text-black px-5 py-2 rounded-xl text-[10px] font-black uppercase clickable">{loading ? "..." : "Обновить"}</button>
                        </div>
                    </header>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-4">
                            {keys.map(k => {
                                const days = getDaysLeft(k.expiry);
                                return (
                                    <div key={k.key} className="glass p-6 hover:border-amber-500/30 transition-all group relative">
                                        <div className="flex justify-between items-start mb-4">
                                            <span className="font-mono text-amber-500 font-black text-xs bg-amber-500/10 px-3 py-1 rounded-full">{k.key}</span>
                                            <div className="flex items-center gap-4">
                                                <div className={\`text-[10px] font-black uppercase \${days < 5 ? 'text-red-500 animate-pulse' : 'text-emerald-500'}\`}>
                                                    {days > 0 ? \`Осталось: \${days} дн.\` : 'Истек'}
                                                </div>
                                                <button onClick={()=>deleteKey(k.key)} className="text-white/10 hover:text-red-500 transition-colors"><i className="text-xs">Удалить</i></button>
                                            </div>
                                        </div>
                                        <div className="text-2xl font-black uppercase mb-1">{k.name}</div>
                                        <div className="text-[10px] opacity-30 uppercase font-bold italic mb-6">Лимит: {k.limit}</div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="space-y-6">
                            <form onSubmit={(e)=>{
                                e.preventDefault(); const fd = new FormData(e.target);
                                addKey(fd.get('o'), fd.get('d'), fd.get('l'));
                                e.target.reset();
                            }} className="glass p-8 border-amber-500/20 shadow-2xl sticky top-10">
                                <h2 className="text-center font-black uppercase text-[11px] text-amber-500 mb-8 tracking-widest italic">Новая Лицензия</h2>
                                <input name="o" placeholder="Название компании" required className="mb-4 font-bold" />
                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    <div><label className="text-[9px] uppercase font-black opacity-30 mb-2 block ml-1">Срок (дней):</label><input name="d" type="number" defaultValue="30" className="font-bold text-center text-white" /></div>
                                    <div><label className="text-[9px] uppercase font-black opacity-30 mb-2 block ml-1">Воркеров:</label><input name="l" type="number" defaultValue="5" className="font-bold text-center text-white" /></div>
                                </div>
                                <button type="submit" className="btn-gold w-full py-5 rounded-2xl uppercase font-black text-[11px]">Выпустить ключ</button>
                            </form>
                        </div>
                    </div>

                    {bridgeCode && (
                        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-6 z-[1000] backdrop-blur-xl">
                            <div className="glass w-full max-w-3xl p-10 flex flex-col max-h-[90vh]">
                                <h2 className="text-blue-400 font-black mb-4 uppercase text-center">Код для Клиента</h2>
                                <textarea readOnly value={bridgeCode} className="flex-1 bg-black p-6 rounded-2xl font-mono text-[9px] text-emerald-400 border border-white/5 overflow-auto focus:outline-none" />
                                <button onClick={()=>setBridgeCode("")} className="mt-4 text-[10px] opacity-30 uppercase font-black text-center clickable">Закрыть</button>
                            </div>
                        </div>
                    )}
                </div>
            );
        };
        const root = ReactDOM.createRoot(document.getElementById('root')); root.render(<App />);
    </script>
</body>
</html>
`;

// --- АДРЕСА ---
app.get('/dashboard', (req, res) => res.send(ADMIN_HTML));
app.get('/tv', (req, res) => res.redirect('/dashboard'));
app.get('/admin-panel', (req, res) => res.redirect('/dashboard'));

// --- API: СПИСОК КЛЮЧЕЙ (ИЗ ФАЙЛА) ---
app.get('/api/list_keys', async (req, res) => {
    const keys = await readDatabase();
    res.json({ keys });
});

// --- API: ДОБАВИТЬ КЛЮЧ ---
app.post('/api/add_key', async (req, res) => {
    try {
        const { name, days, limit } = req.body;
        const keys = await readDatabase();
        
        const key = "LX-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        const date = new Date();
        date.setDate(date.getDate() + parseInt(days));
        const expiry = date.toISOString().split('T')[0];

        // Добавляем новый ключ
        keys.push({ key, name, expiry, limit: parseInt(limit) });
        
        // Сохраняем в файл
        await saveDatabase(keys);
        
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// --- API: УДАЛИТЬ КЛЮЧ ---
app.post('/api/delete_key', async (req, res) => {
    try {
        const { key } = req.body;
        let keys = await readDatabase();
        
        // Фильтруем (удаляем ключ)
        keys = keys.filter(k => k.key !== key);
        
        await saveDatabase(keys);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// --- ЗАГРУЗКА ФОТО ---
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, client, image } = req.body;
        const workerId = await getOrCreateFolder(worker || "Неизвестный", MY_ROOT_ID);
        const cityId = await getOrCreateFolder(city || "Город", workerId);
        
        let finalFolderName = "Общий";
        if (client && client.trim().length > 0) finalFolderName = client.trim();
        const finalFolderId = await getOrCreateFolder(finalFolderName, cityId);

        const safeAddress = address && address.trim().length > 0 ? address.trim() : "Без адреса";
        const timeStr = new Date().toLocaleString("ru-RU").replace(/, /g, '_').replace(/:/g, '-');
        const fileName = `${safeAddress} ${timeStr}.jpg`;

        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const bufferStream = new Readable();
        bufferStream.push(buffer);
        bufferStream.push(null);

        await drive.files.create({
            resource: { name: fileName, parents: [finalFolderId] },
            media: { mimeType: 'image/jpeg', body: bufferStream }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- БОТ ---
bot.start((ctx) => {
    const domain = process.env.RAILWAY_STATIC_URL || "logist-x-server-production.up.railway.app";
    const appUrl = `https://${domain}/dashboard`;
    ctx.reply('LOGIST HQ: СИСТЕМА В НОРМЕ 🟢', {
        reply_markup: {
            inline_keyboard: [[ { text: "ОТКРЫТЬ ПУЛЬТ", web_app: { url: appUrl } } ]]
        }
    });
});

app.get('/', (req, res) => res.send("SERVER ONLINE"));

bot.launch().catch(e => console.log("Бот:", e));
app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ЗАПУЩЕН"));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
