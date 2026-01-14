/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v149.0 | ULTRA-MODERN (QR + MULTI-SELECT)
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * БАЗА: Глубокая интеграция с server.js (Logist X & Merch X)
 * -----------------------------------------------------------------------------------------
 * НОВЫЕ ФУНКЦИИ v149.0:
 * 1. [QR TELEPORT]: Мгновенная генерация QR-кода для шеринга файла.
 * 2. [MULTI-SELECT]: Массовое выделение и удаление файлов.
 * 3. [SMART RECENTS]: Лента последних использованных файлов.
 * 4. [GLASS UI]: Интерфейс в стиле матового стекла (Glassmorphism).
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// --- НАСТРОЙКИ БЕЗОПАСНОСТИ ---
const ACCESS_PASSWORD = "admin"; // <--- ПАРОЛЬ АДМИНИСТРАТОРА
const SESSION_NAME = "titanium_session_v149";

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

    // --- НЕЙРОННОЕ ЯДРО ---
    function persistCache() { fs.writeFile(NEURAL_INDEX_PATH, JSON.stringify(NEURAL_CACHE, null, 2), () => {}); }
    function checkAuth(req) { const c = req.headers.cookie; return c && c.includes(`${SESSION_NAME}=granted`); }

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
                    if (buffer) { fs.writeFileSync(localFilePath, buffer); NEURAL_CACHE.stats.files++; }

                    NEURAL_CACHE.map[id] = { 
                        localPath: fs.existsSync(localFilePath) ? localFilePath : null, 
                        name, mimeType, parentId, isLocal: fs.existsSync(localFilePath), ts: Date.now()
                    };
                }
                NEURAL_CACHE.stats.syncs++;
                persistCache();
            } catch (e) {}
        });
    }

    // --- API ROUTES ---
    app.post('/storage/auth', express.json(), (req, res) => {
        if (req.body.password === ACCESS_PASSWORD) {
            res.setHeader('Set-Cookie', `${SESSION_NAME}=granted; Max-Age=604800; Path=/; HttpOnly`);
            res.json({ success: true });
        } else res.json({ success: false });
    });

    const apiCheck = (req, res, next) => { checkAuth(req) ? next() : res.status(401).json({ error: "Auth Required" }); };

    app.get('/storage/api/recents', apiCheck, (req, res) => {
        // Возвращает последние 5 файлов (не папок)
        const all = Object.values(NEURAL_CACHE.map)
            .filter(f => !f.mimeType.includes('folder'))
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 10);
        res.json(all);
    });

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
            const r = await drive.files.list({ q: `'${folderId}' in parents and trashed = false`, fields: 'files(id, name, mimeType, size)', orderBy: 'folder, name' });
            const files = r.data.files.map(f => ({ ...f, isLocal: !!(NEURAL_CACHE.map[f.id] && NEURAL_CACHE.map[f.id].isLocal) }));
            r.data.files.forEach(f => titaniumNeuralProcess({...f, parentId: folderId}));
            res.json({ files, parentId });
        } catch (e) { res.status(500).json({error: e.message}); }
    });

    app.get('/storage/api/download/:id', async (req, res) => { // Public download for QR
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
            const r = await drive.files.create({ resource: { name: req.file.originalname, parents: [req.body.folderId] }, media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) }, fields: 'id, name, mimeType' });
            await titaniumNeuralProcess({ ...r.data, parentId: req.body.folderId }, 'sync', fs.readFileSync(req.file.path));
            if(fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/delete', express.json(), apiCheck, async (req, res) => {
        try {
            const ids = req.body.ids || [req.body.id];
            for (let id of ids) {
                await drive.files.delete({ fileId: id });
                await titaniumNeuralProcess({ id }, 'delete');
            }
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

    app.get('/storage/manifest.json', (req, res) => {
        res.json({ "name": "Logist X", "short_name": "Logist X", "start_url": "/storage", "display": "standalone", "background_color": "#000000", "theme_color": "#000000", "icons": [{ "src": LOGO_URL, "sizes": "512x512", "type": "image/png" }] });
    });

    app.get('/storage', (req, res) => { checkAuth(req) ? res.send(APP_UI) : res.send(LOGIN_PAGE); });

    // --- FRONTEND ---
    const LOGIN_PAGE = `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>LOGIN</title>
    <style>body{background:#000;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif}.box{text-align:center;width:300px}
    input{width:100%;padding:15px;margin:10px 0;border-radius:10px;border:none;text-align:center;font-size:18px}button{width:100%;padding:15px;background:#f0b90b;border:none;border-radius:10px;font-weight:bold;cursor:pointer}</style>
    </head><body><div class="box"><img src="${LOGO_URL}" width="80" style="border-radius:15px;margin-bottom:20px"><h3>TITANIUM v149</h3>
    <input type="password" id="p" placeholder="Код доступа"><button onclick="auth()">ВОЙТИ</button></div>
    <script>async function auth(){const r=await fetch('/storage/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('p').value})});const d=await r.json();if(d.success)location.reload();else alert('Ошибка');}</script></body></html>`;

    const APP_UI = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        <link rel="manifest" href="/storage/manifest.json">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="theme-color" content="#000000">
        <link rel="apple-touch-icon" href="${LOGO_URL}">
        <title>Titanium v149</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <style>
            :root { --gold: #f0b90b; --bg: #000; --blur-bg: rgba(20,20,20,0.7); --safe-top: env(safe-area-inset-top); --safe-bot: env(safe-area-inset-bottom); }
            body { background: var(--bg); color: #fff; font-family: 'Inter', sans-serif; margin: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
            
            /* GLASS HEADER */
            .glass-header { padding: calc(10px + var(--safe-top)) 20px 10px; background: var(--blur-bg); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; z-index: 50; }
            .logo-area { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 16px; }
            .logo-area img { width: 28px; border-radius: 6px; box-shadow: 0 0 10px var(--gold); }
            
            /* RECENTS BAR */
            .recents-box { padding: 15px 0 15px 20px; overflow-x: auto; display: flex; gap: 12px; background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%); }
            .r-card { min-width: 100px; height: 80px; background: rgba(255,255,255,0.05); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px; gap: 5px; font-size: 10px; text-align: center; border: 1px solid rgba(255,255,255,0.05); }
            .r-card i { font-size: 24px; color: var(--gold); }
            .r-name { width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

            /* MAIN LIST */
            .main-area { flex: 1; overflow-y: auto; padding-bottom: 100px; }
            .toolbar { padding: 10px 20px; display: flex; gap: 10px; overflow-x: auto; }
            .pill { padding: 8px 16px; background: rgba(255,255,255,0.1); border-radius: 20px; font-size: 13px; white-space: nowrap; transition: 0.2s; border: 1px solid transparent; }
            .pill.active { background: rgba(240,185,11,0.2); color: var(--gold); border-color: var(--gold); }
            
            .list-item { display: flex; align-items: center; padding: 12px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); transition: 0.2s; gap: 15px; position: relative; }
            .list-item:active { background: rgba(255,255,255,0.05); }
            .icon-box { width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-size: 18px; color: #aaa; flex-shrink: 0; }
            .is-folder .icon-box { color: var(--gold); background: rgba(240,185,11,0.1); }
            .f-info { flex: 1; min-width: 0; }
            .f-name { font-weight: 600; font-size: 14px; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .f-meta { font-size: 11px; color: #666; }
            
            /* MULTI SELECT UI */
            .select-check { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #555; display: flex; align-items: center; justify-content: center; margin-right: 5px; transition: 0.2s; }
            .selected .select-check { background: var(--gold); border-color: var(--gold); }
            .selected .select-check::after { content: '✓'; color: #000; font-weight: 900; font-size: 12px; }
            
            .batch-bar { position: fixed; bottom: 20px; left: 20px; right: 20px; background: #222; border-radius: 15px; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center; z-index: 200; box-shadow: 0 10px 40px rgba(0,0,0,0.5); border: 1px solid #333; animation: slideUp 0.3s; }

            /* FAB & MODALS */
            .fab { position: fixed; bottom: calc(30px + var(--safe-bot)); right: 30px; width: 55px; height: 55px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #000; box-shadow: 0 0 30px rgba(240,185,11,0.4); z-index: 90; }
            
            .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; display: none; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
            .modal-card { background: #1a1a1a; width: 85%; max-width: 320px; border-radius: 20px; padding: 25px; text-align: center; border: 1px solid #333; position: relative; }
            .qr-box { background: #fff; padding: 15px; border-radius: 10px; display: inline-block; margin: 15px 0; }
            
            #viewer { position: fixed; inset: 0; background: #000; z-index: 2000; display: none; flex-direction: column; }
            .v-bar { padding: 20px; display: flex; justify-content: flex-end; position: absolute; width: 100%; z-index: 10; }
            .v-content { flex: 1; display: flex; align-items: center; justify-content: center; }
            .v-content img, .v-content video { max-width: 100%; max-height: 100%; }

        </style>
    </head>
    <body>

    <div class="glass-header">
        <div class="logo-area"><img src="${LOGO_URL}"> TITANIUM</div>
        <div style="font-size: 20px; cursor: pointer;" onclick="toggleSelectMode()"><i class="fa fa-check-double" id="sel-icon" style="color:#555"></i></div>
    </div>

    <div class="main-area">
        <div id="recents-wrap" style="display:none">
            <div style="font-size:10px; font-weight:800; color:#444; padding:10px 20px 0; letter-spacing:1px;">НЕДАВНИЕ</div>
            <div class="recents-box" id="recents"></div>
        </div>

        <div class="toolbar">
            <div class="pill" id="btn-back" onclick="goUp()"><i class="fa fa-arrow-left"></i></div>
            <div class="pill active" onclick="nav('root')">Главная</div>
            <div class="pill" onclick="nav('${MY_ROOT_ID}')">Логистика</div>
            <div class="pill" onclick="nav('${MERCH_ROOT_ID}')">Мерч</div>
        </div>

        <div style="font-size:10px; font-weight:800; color:#444; padding:10px 20px 5px; letter-spacing:1px;">ФАЙЛЫ</div>
        <div id="file-list"></div>
    </div>

    <div class="batch-bar" id="batch-bar" style="display:none">
        <div style="font-weight:700" id="sel-count">0 выбрано</div>
        <div style="color:#e53935; font-size:24px; cursor:pointer;" onclick="deleteBatch()"><i class="fa fa-trash"></i></div>
    </div>

    <div class="fab" id="main-fab" onclick="document.getElementById('upl').click()"><i class="fa fa-plus"></i></div>
    <input type="file" id="upl" style="display:none" multiple onchange="uploadFiles(this.files)">

    <div class="modal-bg" id="qr-modal" onclick="this.style.display='none'">
        <div class="modal-card" onclick="event.stopPropagation()">
            <h3 style="margin:0">QR TELEPORT</h3>
            <div class="qr-box" id="qr-target"></div>
            <div style="font-size:12px; color:#777; margin-bottom:15px;">Наведите камеру для скачивания</div>
            <button onclick="document.getElementById('qr-modal').style.display='none'" style="background:var(--gold); border:none; padding:10px 30px; border-radius:20px; font-weight:bold;">ЗАКРЫТЬ</button>
        </div>
    </div>

    <div id="viewer">
        <div class="v-bar"><i class="fa fa-times-circle" style="font-size:35px; color:#fff;" onclick="closeView()"></i></div>
        <div class="v-content" id="v-cont"></div>
    </div>

    <script>
        let curId = 'root', parentId = null;
        let isSelMode = false, selection = new Set();

        async function init() {
            loadRecents();
            nav('root');
        }

        async function loadRecents() {
            try {
                const r = await fetch('/storage/api/recents');
                const d = await r.json();
                const c = document.getElementById('recents');
                if(d.length > 0) {
                    document.getElementById('recents-wrap').style.display = 'block';
                    c.innerHTML = d.map(f => \`
                        <div class="r-card" onclick="view('\${f.id}','\${f.mimeType}')">
                            <i class="fa \${getFileIcon(f.mimeType)}"></i>
                            <div class="r-name">\${f.name}</div>
                        </div>
                    \`).join('');
                }
            } catch(e){}
        }

        async function nav(id) {
            curId = id; selection.clear(); updateBatchUI();
            document.getElementById('file-list').innerHTML = '<div style="padding:40px; text-align:center"><i class="fa fa-circle-notch fa-spin"></i></div>';
            
            try {
                const r = await fetch('/storage/api/list?folderId=' + id);
                if(r.status===401) location.reload();
                const d = await r.json();
                parentId = d.parentId;
                render(d.files);
                document.getElementById('btn-back').style.display = (id==='root') ? 'none' : 'block';
            } catch(e) {}
        }

        function goUp() { if(parentId) nav(parentId); else nav('root'); }

        function render(files) {
            const c = document.getElementById('file-list');
            c.innerHTML = '';
            files.forEach(f => {
                const isDir = f.mimeType.includes('folder');
                const div = document.createElement('div');
                div.className = \`list-item \${isDir?'is-folder':''}\`;
                div.innerHTML = \`
                    <div class="select-check" style="display:\${isSelMode?'flex':'none'}"></div>
                    <div class="icon-box"><i class="fa \${isDir?'fa-folder':getFileIcon(f.mimeType)}"></i></div>
                    <div class="f-info">
                        <div class="f-name">\${f.name}</div>
                        <div class="f-meta">\${(f.size/1024/1024||0).toFixed(2)} MB</div>
                    </div>
                    <div style="display:\${isSelMode?'none':'flex'}; gap:15px; color:#666; font-size:16px;">
                        \${!isDir ? \`<i class="fa fa-qrcode" onclick="event.stopPropagation(); showQR('\${f.id}')"></i>\` : ''}
                        <i class="fa fa-trash" onclick="event.stopPropagation(); delOne('\${f.id}')"></i>
                    </div>
                \`;
                
                // Long press
                let timer;
                div.addEventListener('touchstart', () => timer = setTimeout(() => { if(!isSelMode) toggleSelectMode(); }, 800));
                div.addEventListener('touchend', () => clearTimeout(timer));

                div.onclick = () => {
                    if(isSelMode) {
                        if(selection.has(f.id)) { selection.delete(f.id); div.classList.remove('selected'); }
                        else { selection.add(f.id); div.classList.add('selected'); }
                        updateBatchUI();
                    } else {
                        isDir ? nav(f.id) : view(f.id, f.mimeType);
                    }
                };
                c.appendChild(div);
            });
        }

        function toggleSelectMode() {
            isSelMode = !isSelMode;
            document.getElementById('sel-icon').style.color = isSelMode ? var(--gold) : '#555';
            document.getElementById('batch-bar').style.display = isSelMode ? 'flex' : 'none';
            document.getElementById('main-fab').style.display = isSelMode ? 'none' : 'flex';
            nav(curId); // Rerender to show checks
        }

        function updateBatchUI() {
            document.getElementById('sel-count').innerText = selection.size + ' выбрано';
        }

        async function deleteBatch() {
            if(!confirm('Удалить выбранные ('+selection.size+')?')) return;
            await fetch('/storage/api/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids: Array.from(selection)}) });
            toggleSelectMode();
        }

        async function delOne(id) {
            if(!confirm('Удалить?')) return;
            await fetch('/storage/api/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids:[id]}) });
            nav(curId);
        }

        function showQR(id) {
            document.getElementById('qr-modal').style.display='flex';
            document.getElementById('qr-target').innerHTML = '';
            new QRCode(document.getElementById("qr-target"), {
                text: window.location.origin + "/storage/api/download/" + id,
                width: 150, height: 150
            });
        }

        async function uploadFiles(files) {
            for(let f of files) {
                const fd = new FormData(); fd.append('file', f); fd.append('folderId', curId);
                await fetch('/storage/api/upload', {method:'POST', body:fd});
            }
            loadRecents(); nav(curId);
        }

        function view(id, mime) {
            const v = document.getElementById('viewer');
            v.style.display = 'flex';
            const u = '/storage/api/proxy/'+id;
            const c = document.getElementById('v-cont');
            if(mime.includes('image')) c.innerHTML=\`<img src="\${u}">\`;
            else if(mime.includes('video')) c.innerHTML=\`<video controls autoplay src="\${u}"></video>\`;
            else window.location.href = '/storage/api/download/'+id;
        }

        function closeView() { document.getElementById('viewer').style.display='none'; document.getElementById('v-cont').innerHTML=''; }
        function getFileIcon(m) {
            if(m.includes('image')) return 'fa-file-image';
            if(m.includes('pdf')) return 'fa-file-pdf';
            if(m.includes('video')) return 'fa-file-video';
            return 'fa-file';
        }

        init();
    </script>
    </body>
    </html>
    `;
};
