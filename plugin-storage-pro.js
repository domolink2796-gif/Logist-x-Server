/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v148.0 | THE APP EDITION (PWA + SECURITY)
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * БАЗА: Глубокая интеграция с server.js (Logist X & Merch X)
 * -----------------------------------------------------------------------------------------
 * НОВОВВЕДЕНИЯ v148.0:
 * 1. [MOBILE APP]: Полная поддержка PWA (установка на iPhone/Android как приложение).
 * 2. [SECURITY GATE]: Вход по паролю с сохранением сессии (Cookie).
 * 3. [APP ICON]: Автоматическая генерация иконки для рабочего стола телефона.
 * 4. [FULL SCREEN]: Режим работы без адресной строки браузера.
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// --- НАСТРОЙКИ БЕЗОПАСНОСТИ ---
const ACCESS_PASSWORD = "admin"; // <--- ПОМЕНЯЙ ПАРОЛЬ ЗДЕСЬ
const SESSION_NAME = "titanium_session_v1";

// --- ГЛОБАЛЬНЫЕ КОНСТАНТЫ ---
const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";
const STORAGE_ROOT = path.join(__dirname, 'local_storage');
const DB_MIRROR_ROOT = path.join(__dirname, 'db_mirror');
const NEURAL_INDEX_PATH = path.join(__dirname, 'titanium_neural_map.json');
const SYSTEM_LOGS = path.join(__dirname, 'titanium_system.log');

// --- RAM CACHE ---
let NEURAL_CACHE = { stats: { files: 0, syncs: 0, last_update: Date.now() }, map: {} };

// Инициализация
[STORAGE_ROOT, DB_MIRROR_ROOT].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

if (fs.existsSync(NEURAL_INDEX_PATH)) {
    try { NEURAL_CACHE = JSON.parse(fs.readFileSync(NEURAL_INDEX_PATH, 'utf8')); } catch(e) {}
}

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID, readDatabase } = context;
    const upload = multer({ dest: 'uploads/', limits: { fileSize: 500 * 1024 * 1024 } });

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
    function logNeural(msg) { fs.appendFileSync(SYSTEM_LOGS, `[${new Date().toISOString()}] ${msg}\n`); }
    function persistCache() { fs.writeFile(NEURAL_INDEX_PATH, JSON.stringify(NEURAL_CACHE, null, 2), () => {}); }

    // Простая проверка Cookie (без сторонних библиотек)
    function checkAuth(req) {
        const cookie = req.headers.cookie;
        if (!cookie) return false;
        return cookie.includes(`${SESSION_NAME}=granted`);
    }

    async function resolveDeepPath(folderId) {
        let chain = [];
        try {
            let current = folderId;
            const roots = [MY_ROOT_ID, MERCH_ROOT_ID, 'root', undefined, null];
            while (current && !roots.includes(current)) {
                if (NEURAL_CACHE.map[current]) {
                    chain.unshift(NEURAL_CACHE.map[current].name);
                    current = NEURAL_CACHE.map[current].parentId;
                } else {
                    const info = await drive.files.get({ fileId: current, fields: 'id, name, parents' });
                    if (!info.data.name) break;
                    chain.unshift(info.data.name);
                    current = (info.data.parents) ? info.data.parents[0] : null;
                }
                if (chain.length > 20) break; 
            }
        } catch (e) {}
        return chain;
    }

    async function titaniumNeuralProcess(asset, action = 'sync', buffer = null) {
        setImmediate(async () => {
            try {
                if (action === 'delete') {
                    const entry = NEURAL_CACHE.map[asset.id];
                    if (entry && entry.localPath && fs.existsSync(entry.localPath)) fs.unlinkSync(entry.localPath);
                    delete NEURAL_CACHE.map[asset.id];
                } else {
                    const { id, name, parentId, mimeType } = asset;
                    let folderChain = await resolveDeepPath(parentId);
                    const isMerch = (parentId === MERCH_ROOT_ID || folderChain.some(n => n && n.toLowerCase().includes('мерч')));
                    const projectNode = isMerch ? 'MERCH_CORE' : 'LOGIST_CORE';

                    const localDirPath = path.join(STORAGE_ROOT, projectNode, ...folderChain);
                    const localFilePath = path.join(localDirPath, name || `asset_${id}`);

                    if (!fs.existsSync(localDirPath)) fs.mkdirSync(localDirPath, { recursive: true });

                    if (buffer) {
                        fs.writeFileSync(localFilePath, buffer);
                        NEURAL_CACHE.stats.files++;
                    }

                    NEURAL_CACHE.map[id] = { 
                        localPath: fs.existsSync(localFilePath) ? localFilePath : null, 
                        name, mimeType, parentId,
                        isLocal: fs.existsSync(localFilePath),
                        ts: Date.now()
                    };
                }
                NEURAL_CACHE.stats.syncs++;
                persistCache();
            } catch (e) { logNeural(`Error: ${e.message}`); }
        });
    }

    // --- API ROUTES ---

    // 1. ВХОД (LOGIN)
    app.post('/storage/auth', express.json(), (req, res) => {
        const { password } = req.body;
        if (password === ACCESS_PASSWORD) {
            // Установка Cookie на 7 дней
            res.setHeader('Set-Cookie', `${SESSION_NAME}=granted; Max-Age=604800; Path=/; HttpOnly`);
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    });

    // 2. ГЕНЕРАЦИЯ MANIFEST.JSON (ДЛЯ УСТАНОВКИ НА ТЕЛЕФОН)
    app.get('/storage/manifest.json', (req, res) => {
        res.json({
            "name": "Logist X Cloud",
            "short_name": "Logist X",
            "start_url": "/storage",
            "display": "standalone",
            "background_color": "#000000",
            "theme_color": "#000000",
            "icons": [{ "src": LOGO_URL, "sizes": "512x512", "type": "image/png" }]
        });
    });

    // 3. ОСНОВНЫЕ МЕТОДЫ API (С ЗАЩИТОЙ)
    const apiCheck = (req, res, next) => {
        if (checkAuth(req)) next();
        else res.status(401).json({ error: "Unauthorized" });
    };

    app.get('/storage/api/list', apiCheck, async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            let parentId = null;
            if (folderId !== 'root') {
                try {
                    const m = await drive.files.get({ fileId: folderId, fields: 'parents' });
                    if (m.data.parents) parentId = m.data.parents[0];
                } catch(e) {}
            }
            const r = await drive.files.list({ 
                q: `'${folderId}' in parents and trashed = false`, 
                fields: 'files(id, name, mimeType, size)', orderBy: 'folder, name' 
            });
            const files = r.data.files.map(f => ({ ...f, isLocal: !!(NEURAL_CACHE.map[f.id] && NEURAL_CACHE.map[f.id].isLocal) }));
            r.data.files.forEach(f => titaniumNeuralProcess({...f, parentId: folderId}));
            res.json({ files, parentId });
        } catch (e) { res.status(500).json({error: e.message}); }
    });

    app.get('/storage/api/download/:id', apiCheck, async (req, res) => {
        try {
            const meta = await drive.files.get({ fileId: req.params.id, fields: 'name, mimeType' });
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.data.name)}"`);
            const r = await drive.files.get({ fileId: req.params.id, alt: 'media' }, { responseType: 'stream' });
            r.data.pipe(res);
        } catch (e) { res.status(500).send("Error"); }
    });

    app.get('/storage/api/proxy/:id', apiCheck, async (req, res) => {
        try {
            const r = await drive.files.get({ fileId: req.params.id, alt: 'media' }, { responseType: 'stream' });
            const m = await drive.files.get({ fileId: req.params.id, fields: 'mimeType' });
            res.setHeader('Content-Type', m.data.mimeType);
            r.data.pipe(res);
        } catch (e) { res.status(404).send("Error"); }
    });

    app.post('/storage/api/upload', upload.single('file'), apiCheck, async (req, res) => {
        try {
            const r = await drive.files.create({ 
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) }, fields: 'id, name, mimeType'
            });
            await titaniumNeuralProcess({ ...r.data, parentId: req.body.folderId }, 'sync', fs.readFileSync(req.file.path));
            if(fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/delete', express.json(), apiCheck, async (req, res) => {
        try {
            await drive.files.delete({ fileId: req.body.id });
            await titaniumNeuralProcess({ id: req.body.id }, 'delete');
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/mkdir', express.json(), apiCheck, async (req, res) => {
        try {
            const r = await drive.files.create({ resource: { name: req.body.name, mimeType: 'application/vnd.google-apps.folder', parents: [req.body.parentId] }, fields: 'id, name' });
            await titaniumNeuralProcess({ ...r.data, parentId: req.body.parentId, mimeType: 'folder' });
            res.json(r.data);
        } catch (e) { res.status(500).send(e.message); }
    });

    // --- HTML UI RENDERER ---
    app.get('/storage', (req, res) => {
        // Если нет Cookie авторизации - отдаем страницу входа
        if (!checkAuth(req)) {
            return res.send(LOGIN_PAGE);
        }
        // Если авторизован - отдаем приложение
        res.send(APP_UI);
    });

    // --- СТРАНИЦА ВХОДА (LOGIN HTML) ---
    const LOGIN_PAGE = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <title>LOGIN | TITANIUM</title>
        <style>
            body { background: #000; color: #fff; font-family: sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
            .card { background: #111; padding: 40px; border-radius: 20px; border: 1px solid #333; text-align: center; width: 300px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
            img { width: 60px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 0 20px rgba(240,185,11,0.2); }
            input { width: 100%; padding: 15px; margin: 15px 0; background: #222; border: 1px solid #444; color: #fff; border-radius: 10px; font-size: 16px; outline: none; text-align: center; box-sizing: border-box; }
            input:focus { border-color: #f0b90b; }
            button { width: 100%; padding: 15px; background: #f0b90b; border: none; border-radius: 10px; font-weight: bold; font-size: 16px; cursor: pointer; color: #000; }
            .err { color: red; font-size: 12px; margin-top: 10px; display: none; }
        </style>
    </head>
    <body>
        <div class="card">
            <img src="${LOGO_URL}">
            <h2 style="margin:0 0 20px 0; font-size: 18px; letter-spacing: 2px;">LOGIST X SECURITY</h2>
            <input type="password" id="pass" placeholder="Введите код доступа">
            <button onclick="login()">ВОЙТИ</button>
            <div class="err" id="err">Неверный пароль</div>
        </div>
        <script>
            async function login() {
                const p = document.getElementById('pass').value;
                const r = await fetch('/storage/auth', { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: p })
                });
                const d = await r.json();
                if(d.success) location.reload();
                else document.getElementById('err').style.display = 'block';
            }
        </script>
    </body>
    </html>
    `;

    // --- СТРАНИЦА ПРИЛОЖЕНИЯ (MAIN APP) ---
    const APP_UI = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        
        <link rel="manifest" href="/storage/manifest.json">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <meta name="theme-color" content="#000000">
        <link rel="apple-touch-icon" href="${LOGO_URL}">

        <title>Logist X</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
        
        <style>
            :root { --gold: #f0b90b; --bg: #000; --panel: #121212; --safe-top: env(safe-area-inset-top); --safe-bottom: env(safe-area-inset-bottom); }
            body { background: var(--bg); color: #fff; font-family: 'Inter', sans-serif; margin: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
            
            /* HEADER */
            .app-header { padding: calc(15px + var(--safe-top)) 20px 15px; background: rgba(18,18,18,0.95); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #222; z-index: 100; }
            .h-title { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 18px; }
            .h-title img { width: 30px; border-radius: 6px; }
            
            /* TOOLBAR */
            .toolbar { display: flex; gap: 10px; padding: 10px 15px; background: #080808; overflow-x: auto; -webkit-overflow-scrolling: touch; }
            .chip { background: #222; padding: 8px 15px; border-radius: 20px; font-size: 13px; white-space: nowrap; cursor: pointer; color: #aaa; border: 1px solid transparent; }
            .chip:active { background: #333; }
            .chip.active { background: rgba(240,185,11,0.15); color: var(--gold); border-color: var(--gold); }

            /* LIST */
            .list-container { flex: 1; overflow-y: auto; padding-bottom: calc(80px + var(--safe-bottom)); }
            .item { display: flex; align-items: center; padding: 15px 20px; border-bottom: 1px solid #1a1a1a; gap: 15px; active: background: #111; }
            .item:active { background: #111; }
            .i-icon { width: 42px; height: 42px; background: #1a1a1a; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #666; flex-shrink: 0; }
            .is-dir .i-icon { background: rgba(240,185,11,0.1); color: var(--gold); }
            .i-body { flex: 1; min-width: 0; }
            .i-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #eee; }
            .i-meta { font-size: 12px; color: #555; }
            .i-act { color: #444; padding: 10px; font-size: 16px; }

            /* FAB */
            .fab { position: fixed; bottom: calc(20px + var(--safe-bottom)); right: 20px; width: 60px; height: 60px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #000; box-shadow: 0 10px 30px rgba(240,185,11,0.3); z-index: 200; }
            
            /* MODAL */
            .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; display: none; align-items: flex-end; }
            .modal-sheet { background: #1a1a1a; width: 100%; border-radius: 20px 20px 0 0; padding: 25px 20px calc(20px + var(--safe-bottom)); animation: slideUp 0.3s; }
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            .sheet-btn { display: flex; align-items: center; gap: 15px; padding: 15px; color: #fff; font-size: 16px; font-weight: 600; border-bottom: 1px solid #2a2a2a; }
            .sheet-btn:last-child { border: none; color: #e53935; }
            .sheet-btn i { width: 25px; text-align: center; }

            /* VIEWER */
            #viewer { position: fixed; inset: 0; background: #000; z-index: 5000; display: none; flex-direction: column; }
            .v-bar { padding: calc(10px + var(--safe-top)) 20px 10px; display: flex; justify-content: space-between; color: #fff; background: rgba(0,0,0,0.5); position: absolute; top: 0; width: 100%; }
            .v-content { flex: 1; display: flex; align-items: center; justify-content: center; height: 100%; }
            .v-content img, .v-content video { max-width: 100%; max-height: 100%; object-fit: contain; }
            .v-content iframe { width: 100%; height: 100%; border: none; background: #fff; }

        </style>
    </head>
    <body>

    <div class="app-header">
        <div class="h-title"><img src="${LOGO_URL}"> Logist X</div>
        <div onclick="location.reload()" style="font-size:12px; color:#444;">v148.0</div>
    </div>

    <div class="toolbar">
        <div class="chip" id="btn-back" onclick="goUp()"><i class="fa fa-arrow-left"></i> Назад</div>
        <div class="chip active" onclick="nav('root')">Главная</div>
        <div class="chip" onclick="nav('${MY_ROOT_ID}')">Логистика</div>
        <div class="chip" onclick="nav('${MERCH_ROOT_ID}')">Мерч</div>
    </div>

    <div class="list-container" id="list"></div>

    <div class="fab" onclick="showCreateMenu()"><i class="fa fa-plus"></i></div>

    <div class="modal-overlay" id="sheet" onclick="this.style.display='none'">
        <div class="modal-sheet" onclick="event.stopPropagation()">
            <div style="text-align:center; color:#555; margin-bottom:10px; width:40px; height:4px; background:#333; border-radius:2px; margin: 0 auto 20px;"></div>
            <div class="sheet-btn" onclick="document.getElementById('f-up').click()"><i class="fa fa-image"></i> Загрузить фото/видео</div>
            <div class="sheet-btn" onclick="askFolder()"><i class="fa fa-folder-plus"></i> Создать папку</div>
            <div class="sheet-btn" onclick="closeSheet()">Отмена</div>
        </div>
    </div>
    <input type="file" id="f-up" style="display:none" multiple onchange="doUpload(this.files)">

    <div class="modal-overlay" id="file-opts" onclick="this.style.display='none'">
        <div class="modal-sheet" onclick="event.stopPropagation()">
            <div class="sheet-btn" onclick="downloadFile()"><i class="fa fa-download"></i> Скачать файл</div>
            <div class="sheet-btn" onclick="deleteFile()"><i class="fa fa-trash"></i> Удалить</div>
        </div>
    </div>

    <div id="viewer">
        <div class="v-bar"><i class="fa fa-times" style="font-size:24px" onclick="document.getElementById('viewer').style.display='none'"></i></div>
        <div class="v-content" id="v-cont"></div>
    </div>

    <script>
        let curId = 'root';
        let parentId = null;
        let selFile = null;

        async function nav(id) {
            curId = id;
            document.getElementById('list').innerHTML = '<div style="padding:40px; text-align:center; color:#444;"><i class="fa fa-circle-notch fa-spin"></i></div>';
            
            try {
                const r = await fetch('/storage/api/list?folderId=' + id);
                if(r.status === 401) location.reload(); // Если сессия истекла
                const d = await r.json();
                parentId = d.parentId;
                render(d.files);
                
                const backBtn = document.getElementById('btn-back');
                if(id === 'root') backBtn.style.display = 'none';
                else backBtn.style.display = 'block';

            } catch(e) { console.error(e); }
        }

        function goUp() { if(parentId) nav(parentId); else nav('root'); }

        function render(files) {
            const c = document.getElementById('list');
            c.innerHTML = '';
            if(!files.length) c.innerHTML = '<div style="padding:50px; text-align:center; color:#333;">Пусто</div>';

            files.forEach(f => {
                const isDir = f.mimeType.includes('folder');
                const div = document.createElement('div');
                div.className = \`item \${isDir?'is-dir':''}\`;
                div.innerHTML = \`
                    <div class="i-icon"><i class="fa \${isDir?'fa-folder':'fa-file'}"></i></div>
                    <div class="i-body">
                        <div class="i-name">\${f.name}</div>
                        <div class="i-meta">\${(f.size/1024/1024||0).toFixed(2)} MB</div>
                    </div>
                    <div class="i-act" onclick="event.stopPropagation(); showFileOpts('\${f.id}', '\${f.name}')">
                        <i class="fa fa-ellipsis-v"></i>
                    </div>
                \`;
                div.onclick = () => isDir ? nav(f.id) : openView(f);
                c.appendChild(div);
            });
        }

        function showCreateMenu() { document.getElementById('sheet').style.display='flex'; }
        function closeSheet() { document.getElementById('sheet').style.display='none'; }
        
        function showFileOpts(id, name) {
            selFile = id;
            document.getElementById('file-opts').style.display='flex';
        }

        async function doUpload(files) {
            closeSheet();
            for(let f of files) {
                const fd = new FormData(); fd.append('file', f); fd.append('folderId', curId);
                await fetch('/storage/api/upload', {method:'POST', body:fd});
            }
            nav(curId);
        }

        async function askFolder() {
            closeSheet();
            const n = prompt('Имя папки:');
            if(n) {
                await fetch('/storage/api/mkdir', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:n, parentId:curId})});
                nav(curId);
            }
        }

        async function deleteFile() {
            if(!confirm('Удалить?')) return;
            await fetch('/storage/api/delete', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:selFile})});
            document.getElementById('file-opts').style.display='none';
            nav(curId);
        }

        function downloadFile() {
            location.href = '/storage/api/download/' + selFile;
            document.getElementById('file-opts').style.display='none';
        }

        function openView(f) {
            const v = document.getElementById('viewer');
            const c = document.getElementById('v-cont');
            v.style.display = 'flex';
            c.innerHTML = '<div style="color:#fff">Загрузка...</div>';
            
            const url = '/storage/api/proxy/' + f.id;
            if(f.mimeType.includes('image')) c.innerHTML = \`<img src="\${url}">\`;
            else if(f.mimeType.includes('video')) c.innerHTML = \`<video controls autoplay src="\${url}"></video>\`;
            else c.innerHTML = \`<iframe src="https://drive.google.com/file/d/\${f.id}/preview"></iframe>\`;
        }

        nav('root');
    </script>
    </body>
    </html>
    `;
};
