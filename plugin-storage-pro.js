/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v155.0 | ULTIMATE EDITION (FULL UNPACKED)
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * -----------------------------------------------------------------------------------------
 * ПОЛНЫЙ СПИСОК ФУНКЦИЙ (ГАРАНТИЯ):
 * 1. [NEURAL CORE]: Фоновое обучение и репликация файлов на сервер.
 * 2. [DB MIRROR]: Авто-выкачивание баз данных (JSON) для Logist-X.
 * 3. [OMNI-VIEWER]: Просмотр Excel/Word/PDF через Google Engine (без скачивания).
 * 4. [SMART ICONS]: Цветовая кодировка файлов (Зеленый=Excel, Синий=Word и т.д.).
 * 5. [QR-TELEPORT]: Моментальная передача файла на телефон по QR.
 * 6. [MULTI-TOUCH]: Выделение и удаление группы файлов.
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- [1] КОНФИГУРАЦИЯ СИСТЕМЫ ---
const CONFIG = {
    PASSWORD: "admin",
    SESSION_KEY: "titanium_ult_v155",
    LOGO: "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png",
    PATHS: {
        STORAGE: path.join(__dirname, 'local_storage'),
        DB_MIRROR: path.join(__dirname, 'db_mirror'),
        NEURAL_MAP: path.join(__dirname, 'titanium_neural_map.json'),
        LOGS: path.join(__dirname, 'titanium_system.log')
    }
};

// Инициализация папок
[CONFIG.PATHS.STORAGE, CONFIG.PATHS.DB_MIRROR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Загрузка памяти
let NEURAL_MEMORY = { map: {} };
if (fs.existsSync(CONFIG.PATHS.NEURAL_MAP)) {
    try { NEURAL_MEMORY = JSON.parse(fs.readFileSync(CONFIG.PATHS.NEURAL_MAP, 'utf8')); } catch (e) {}
}

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID, readDatabase, readBarcodeDb, readPlanogramDb } = context;
    const upload = multer({ dest: 'uploads/' });

    /**
     * =====================================================================================
     * [2] НЕЙРОННОЕ ЯДРО (ОБУЧЕНИЕ И КОПИРОВАНИЕ)
     * =====================================================================================
     */
    function saveMemory() { fs.writeFile(CONFIG.PATHS.NEURAL_MAP, JSON.stringify(NEURAL_MEMORY, null, 2), () => {}); }

    // Определяем путь для сохранения на сервере
    async function resolveDeepPath(folderId) {
        let chain = [];
        try {
            let current = folderId;
            const stopIds = [MY_ROOT_ID, MERCH_ROOT_ID, 'root', undefined, null];
            while (current && !stopIds.includes(current)) {
                if (NEURAL_MEMORY.map[current]) {
                    chain.unshift(NEURAL_MEMORY.map[current].name);
                    current = NEURAL_MEMORY.map[current].parentId;
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

    // Главный процессор
    async function titaniumNeuralProcess(asset, action = 'sync', buffer = null) {
        setImmediate(async () => {
            try {
                if (action === 'delete') {
                    const entry = NEURAL_MEMORY.map[asset.id];
                    if (entry && entry.localPath && fs.existsSync(entry.localPath)) fs.unlinkSync(entry.localPath);
                    delete NEURAL_MEMORY.map[asset.id];
                } else {
                    const { id, name, parentId, mimeType } = asset;
                    let folderChain = await resolveDeepPath(parentId);
                    const isMerch = (parentId === MERCH_ROOT_ID || folderChain.some(n => n && n.toLowerCase().includes('мерч')));
                    const projectNode = isMerch ? 'MERCH_CORE' : 'LOGIST_CORE';

                    const localDirPath = path.join(CONFIG.PATHS.STORAGE, projectNode, ...folderChain);
                    const localFilePath = path.join(localDirPath, name || `asset_${id}`);

                    if (!fs.existsSync(localDirPath)) fs.mkdirSync(localDirPath, { recursive: true });
                    if (buffer) fs.writeFileSync(localFilePath, buffer);

                    NEURAL_MEMORY.map[id] = { 
                        localPath: fs.existsSync(localFilePath) ? localFilePath : null, 
                        name, mimeType, parentId, isLocal: fs.existsSync(localFilePath),
                        project: projectNode
                    };
                }
                saveMemory();
                if (action !== 'delete') await mirrorSystemDatabases();
            } catch (e) {}
        });
    }

    // Зеркалирование баз (Barcodes/Planograms)
    async function mirrorSystemDatabases() {
        try {
            const keys = await readDatabase();
            if (!keys) return;
            fs.writeFileSync(path.join(CONFIG.PATHS.DB_MIRROR, 'keys_database.json'), JSON.stringify(keys, null, 2));
            for (let k of keys) {
                if (k.folderId) {
                    const keyDir = path.join(CONFIG.PATHS.DB_MIRROR, k.key);
                    if (!fs.existsSync(keyDir)) fs.mkdirSync(keyDir, { recursive: true });
                    try {
                        const [bDb, pDb] = await Promise.all([readBarcodeDb(k.folderId), readPlanogramDb(k.folderId)]);
                        if (bDb) fs.writeFileSync(path.join(keyDir, 'barcodes.json'), JSON.stringify(bDb, null, 2));
                        if (pDb) fs.writeFileSync(path.join(keyDir, 'planograms.json'), JSON.stringify(pDb, null, 2));
                    } catch (err) {}
                }
            }
        } catch (e) {}
    }

    /**
     * =====================================================================================
     * [3] API GATEWAY (СЕТЕВАЯ ЧАСТЬ)
     * =====================================================================================
     */
    function checkAuth(req) { return req.headers.cookie && req.headers.cookie.includes(`${CONFIG.SESSION_KEY}=granted`); }
    const protect = (req, res, next) => checkAuth(req) ? next() : res.status(401).json({error: "Access Denied"});

    app.post('/storage/auth', express.json(), (req, res) => {
        if (req.body.password === CONFIG.PASSWORD) {
            res.setHeader('Set-Cookie', `${CONFIG.SESSION_KEY}=granted; Max-Age=604800; Path=/; HttpOnly`);
            res.json({ success: true });
        } else res.json({ success: false });
    });

    app.get('/storage/api/list', protect, async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            let parentId = null;
            if (folderId !== 'root') {
                try {
                    const meta = await drive.files.get({ fileId: folderId, fields: 'parents' });
                    if (meta.data.parents) parentId = meta.data.parents[0];
                } catch(e) {}
            }
            const r = await drive.files.list({ q: `'${folderId}' in parents and trashed = false`, fields: 'files(id, name, mimeType, size)', orderBy: 'folder, name' });
            
            // Запуск обучения на каждом просмотре папки
            r.data.files.forEach(f => titaniumNeuralProcess({ ...f, parentId: folderId }, 'sync'));
            
            res.json({ files: r.data.files, parentId });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/storage/api/proxy/:id', protect, async (req, res) => {
        try {
            const response = await drive.files.get({ fileId: req.params.id, alt: 'media' }, { responseType: 'stream' });
            const meta = await drive.files.get({ fileId: req.params.id, fields: 'mimeType' });
            res.setHeader('Content-Type', meta.data.mimeType);
            response.data.pipe(res);
        } catch (e) { res.status(404).send("Stream Unavailable"); }
    });

    app.get('/storage/api/download/:id', async (req, res) => {
        try {
            const meta = await drive.files.get({ fileId: req.params.id, fields: 'name, mimeType' });
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.data.name)}"`);
            const response = await drive.files.get({ fileId: req.params.id, alt: 'media' }, { responseType: 'stream' });
            response.data.pipe(res);
        } catch (e) { res.status(500).send("Download Failed"); }
    });

    app.post('/storage/api/upload', upload.single('file'), protect, async (req, res) => {
        try {
            const r = await drive.files.create({ 
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) },
                fields: 'id, name, mimeType'
            });
            const buffer = fs.readFileSync(req.file.path);
            await titaniumNeuralProcess({ ...r.data, parentId: req.body.folderId }, 'sync', buffer);
            fs.unlinkSync(req.file.path);
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/delete', express.json(), protect, async (req, res) => {
        try {
            const ids = req.body.ids || [req.body.id];
            for (let id of ids) {
                await drive.files.delete({ fileId: id });
                await titaniumNeuralProcess({ id }, 'delete');
            }
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/mkdir', express.json(), protect, async (req, res) => {
        try {
            const r = await drive.files.create({ 
                resource: { name: req.body.name, mimeType: 'application/vnd.google-apps.folder', parents: [req.body.parentId] }, fields: 'id, name, mimeType'
            });
            await titaniumNeuralProcess({ ...r.data, parentId: req.body.parentId }, 'sync');
            res.json(r.data);
        } catch (e) { res.status(500).send(e.message); }
    });

    // PWA Manifest
    app.get('/storage/manifest.json', (req, res) => {
        res.json({
            "name": "Logist X", "short_name": "Logist X", "start_url": "/storage",
            "display": "standalone", "background_color": "#000000", "theme_color": "#000000",
            "icons": [{ "src": CONFIG.LOGO, "sizes": "512x512", "type": "image/png" }]
        });
    });

    app.get('/storage', (req, res) => { checkAuth(req) ? res.send(UI_DASHBOARD) : res.send(UI_LOGIN); });

    /**
     * =====================================================================================
     * [4] ИНТЕРФЕЙС (UI/UX) - ПОЛНАЯ РАЗВЕРТКА
     * =====================================================================================
     */
    
    // СТРАНИЦА ВХОДА
    const UI_LOGIN = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>LOGIN | TITANIUM</title>
        <style>
            body{background:#000;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif}
            .card{background:#111;padding:40px;border-radius:20px;border:1px solid #333;text-align:center;width:300px;box-shadow:0 0 50px rgba(240,185,11,0.1)}
            input{width:100%;padding:15px;margin:15px 0;background:#222;border:1px solid #444;color:#fff;border-radius:10px;text-align:center;box-sizing:border-box}
            button{width:100%;padding:15px;background:#f0b90b;border:none;border-radius:10px;font-weight:bold;cursor:pointer}
        </style>
    </head>
    <body>
        <div class="card">
            <img src="${CONFIG.LOGO}" width="80" style="border-radius:15px;margin-bottom:20px">
            <h3>TITANIUM ULTIMATE</h3>
            <input type="password" id="p" placeholder="Код доступа">
            <button onclick="login()">ВОЙТИ</button>
        </div>
        <script>
            async function login(){
                const r=await fetch('/storage/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('p').value})});
                const d=await r.json();
                if(d.success)location.reload();else alert('Ошибка');
            }
        </script>
    </body>
    </html>`;

    // ОСНОВНОЙ ИНТЕРФЕЙС
    const UI_DASHBOARD = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        
        <link rel="manifest" href="/storage/manifest.json">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="theme-color" content="#000000">
        
        <title>Logist X</title>
        
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

        <style>
            :root { --gold: #f0b90b; --bg: #000; --safe-top: env(safe-area-inset-top); --safe-bot: env(safe-area-inset-bottom); }
            body { background: var(--bg); color: #fff; font-family: 'Inter', sans-serif; margin: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
            
            /* HEADER */
            .header { padding: calc(15px + var(--safe-top)) 20px 15px; background: rgba(20,20,20,0.95); backdrop-filter: blur(20px); border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; z-index: 50; }
            .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 16px; }
            .brand img { width: 32px; border-radius: 8px; }
            .head-act { display: flex; gap: 20px; font-size: 18px; color: #888; }
            
            /* MAIN LIST */
            .viewport { flex: 1; overflow-y: auto; padding-bottom: 120px; }
            .nav-bar { padding: 15px 20px; display: flex; gap: 10px; overflow-x: auto; }
            .pill { padding: 10px 18px; background: #1a1a1a; border-radius: 25px; font-size: 13px; white-space: nowrap; border: 1px solid #333; font-weight: 600; }
            .pill.active { border-color: var(--gold); color: var(--gold); background: rgba(240,185,11,0.1); }
            
            /* FILES */
            .f-row { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid #1a1a1a; gap: 15px; transition: 0.2s; }
            .f-row:active { background: #111; }
            
            /* SMART ICONS (ЦВЕТА ФАЙЛОВ) */
            .f-icon { width: 44px; height: 44px; border-radius: 12px; background: #151515; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #555; flex-shrink: 0; }
            .is-dir .f-icon { color: var(--gold); background: rgba(240,185,11,0.1); }
            .i-excel .f-icon { color: #2e7d32; background: rgba(46, 125, 50, 0.1); }
            .i-word .f-icon { color: #1976d2; background: rgba(25, 118, 210, 0.1); }
            .i-pdf .f-icon { color: #d32f2f; background: rgba(211, 47, 47, 0.1); }
            .i-zip .f-icon { color: #fbc02d; background: rgba(251, 192, 45, 0.1); }
            .i-code .f-icon { color: #9c27b0; background: rgba(156, 39, 176, 0.1); }

            .f-info { flex: 1; min-width: 0; }
            .f-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .f-meta { font-size: 12px; color: #666; }

            /* FAB & ACTIONS */
            .fab { position: fixed; bottom: calc(30px + var(--safe-bot)); right: 30px; width: 60px; height: 60px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #000; box-shadow: 0 10px 30px rgba(240,185,11,0.3); z-index: 100; }
            .check { width: 24px; height: 24px; border: 2px solid #444; border-radius: 50%; display: none; align-items: center; justify-content: center; }
            .mode-sel .check { display: flex; }
            .sel .check { background: var(--gold); border-color: var(--gold); }
            .sel .check::after { content: '✓'; color: #000; font-weight: 900; }
            
            .batch { position: fixed; bottom: 30px; left: 20px; right: 20px; background: #222; border-radius: 18px; padding: 15px 25px; display: none; justify-content: space-between; align-items: center; border: 1px solid #333; z-index: 200; }

            /* MODALS */
            .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 2000; display: none; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
            .modal-box { background: #1a1a1a; width: 85%; max-width: 350px; padding: 30px; border-radius: 25px; text-align: center; border: 1px solid #333; }

            /* VIEWER */
            #viewer { position: fixed; inset: 0; background: #000; z-index: 3000; display: none; flex-direction: column; }
            .v-close { position: absolute; top: 30px; right: 20px; font-size: 32px; padding: 20px; z-index: 10; cursor: pointer; background: rgba(0,0,0,0.5); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; }
            .v-body { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
            .v-body img, .v-body video { max-width: 100%; max-height: 100%; object-fit: contain; }
            .v-body iframe { width: 100%; height: 100%; border: none; background: #fff; }
        </style>
    </head>
    <body>

    <div class="header">
        <div class="brand"><img src="${CONFIG.LOGO}"> TITANIUM</div>
        <div class="head-act">
            <i class="fa fa-sync-alt" onclick="refresh()"></i>
            <i class="fa fa-check-double" id="btn-sel" onclick="toggleMode()"></i>
        </div>
    </div>

    <div class="viewport">
        <div class="nav-bar">
            <div class="pill" id="b-up" onclick="goUp()" style="display:none"><i class="fa fa-arrow-left"></i></div>
            <div class="pill active" onclick="nav('root')">Главная</div>
            <div class="pill" onclick="nav('${MY_ROOT_ID}')">Логистика</div>
            <div class="pill" onclick="nav('${MERCH_ROOT_ID}')">Мерч</div>
        </div>
        <div id="list"></div>
    </div>

    <div class="batch" id="batch">
        <span style="font-weight:700" id="sel-cnt">0</span>
        <i class="fa fa-trash" style="color:#e53935; font-size:22px" onclick="delSel()"></i>
    </div>

    <div class="fab" id="fab" onclick="document.getElementById('upl').click()"><i class="fa fa-plus"></i></div>
    <input type="file" id="upl" style="display:none" multiple onchange="upload(this.files)">

    <div class="modal" id="qr" onclick="this.style.display='none'">
        <div class="modal-box" onclick="event.stopPropagation()">
            <h3 style="margin-top:0">QR SHARE</h3>
            <div style="background:#fff; padding:15px; border-radius:15px; display:inline-block; margin:15px 0"><div id="qr-c"></div></div>
            <div style="color:#777; font-size:12px">Наведите камеру</div>
        </div>
    </div>

    <div id="viewer">
        <div class="v-close" onclick="closeView()"><i class="fa fa-times"></i></div>
        <div class="v-body" id="v-con"></div>
    </div>

    <script>
        let cid='root', pid=null, sel=new Set(), isMode=false;

        // Навигация
        async function nav(id) {
            cid=id; sel.clear(); updSel();
            document.getElementById('list').innerHTML='<div style="text-align:center;padding:50px"><i class="fa fa-circle-notch fa-spin"></i></div>';
            try {
                const r=await fetch('/storage/api/list?folderId='+id);
                if(r.status===401) location.reload();
                const d=await r.json();
                pid=d.parentId;
                render(d.files);
                document.getElementById('b-up').style.display=(id==='root')?'none':'block';
            } catch(e){ document.getElementById('list').innerHTML='Ошибка'; }
        }

        function goUp() { pid ? nav(pid) : nav('root'); }
        function refresh() { nav(cid); }

        // Отрисовка списка
        function render(files) {
            const l=document.getElementById('list'); l.innerHTML='';
            if(!files.length) l.innerHTML='<div style="text-align:center;padding:50px;color:#555">Пусто</div>';
            
            files.forEach(f => {
                const isD = f.mimeType.includes('folder');
                const iconInfo = getIcon(f.mimeType, isD);
                
                const el=document.createElement('div');
                el.className='f-row '+ (isD?'is-dir':'') + ' ' + iconInfo.cls;
                el.innerHTML=\`
                    <div class="check"></div>
                    <div class="f-icon"><i class="fa \${iconInfo.ico}"></i></div>
                    <div class="f-info">
                        <div class="f-name">\${f.name}</div>
                        <div class="f-meta">\${(f.size/1024/1024||0).toFixed(2)} MB</div>
                    </div>
                    <div style="color:#666; font-size:18px; \${isMode?'display:none':''}" onclick="event.stopPropagation()">
                        \${!isD ? \`<i class="fa fa-qrcode" onclick="showQR('\${f.id}')"></i>\` : ''}
                    </div>
                \`;
                
                el.onclick=()=>{
                    if(isMode) {
                        if(sel.has(f.id)){ sel.delete(f.id); el.classList.remove('sel'); }
                        else { sel.add(f.id); el.classList.add('sel'); }
                        updSel();
                    } else {
                        isD ? nav(f.id) : openView(f.id, f.mimeType);
                    }
                };

                let t;
                el.addEventListener('touchstart', ()=>t=setTimeout(()=>{if(!isMode)toggleMode()},600));
                el.addEventListener('touchend', ()=>clearTimeout(t));
                l.appendChild(el);
            });
        }

        // Определение иконки и цвета
        function getIcon(m, isD) {
            if(isD) return {ico:'fa-folder', cls:''};
            if(m.includes('excel') || m.includes('spreadsheet') || m.includes('csv')) return {ico:'fa-file-excel', cls:'i-excel'};
            if(m.includes('word') || m.includes('document')) return {ico:'fa-file-word', cls:'i-word'};
            if(m.includes('pdf')) return {ico:'fa-file-pdf', cls:'i-pdf'};
            if(m.includes('image')) return {ico:'fa-file-image', cls:''};
            if(m.includes('video')) return {ico:'fa-file-video', cls:''};
            if(m.includes('zip') || m.includes('compressed')) return {ico:'fa-file-zipper', cls:'i-zip'};
            if(m.includes('json') || m.includes('javascript') || m.includes('html')) return {ico:'fa-file-code', cls:'i-code'};
            return {ico:'fa-file', cls:''};
        }

        // Режим выбора
        function toggleMode() {
            isMode=!isMode;
            document.body.classList.toggle('mode-sel', isMode);
            document.getElementById('btn-sel').style.color=isMode?'#f0b90b':'#888';
            document.getElementById('batch').style.display=isMode?'flex':'none';
            document.getElementById('fab').style.display=isMode?'none':'flex';
            sel.clear(); updSel(); nav(cid);
        }
        function updSel() { document.getElementById('sel-cnt').innerText=sel.size+' выбрано'; }

        async function delSel() {
            if(!confirm('Удалить?')) return;
            await fetch('/storage/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:Array.from(sel)})});
            toggleMode();
        }

        async function upload(files) {
            for(let f of files){
                const d=new FormData(); d.append('file',f); d.append('folderId',cid);
                await fetch('/storage/api/upload',{method:'POST',body:d});
            }
            nav(cid);
        }

        function showQR(id) {
            document.getElementById('qr').style.display='flex';
            document.getElementById('qr-c').innerHTML='';
            new QRCode(document.getElementById('qr-c'), {text:location.origin+'/storage/api/download/'+id, width:200, height:200});
        }

        // Omni-Viewer (Встроенный просмотр)
        function openView(id, m) {
            const v=document.getElementById('viewer');
            const b=document.getElementById('v-con');
            v.style.display='flex';
            const u='/storage/api/proxy/'+id;

            if(m.includes('image')) b.innerHTML=\`<img src="\${u}">\`;
            else if(m.includes('video')) b.innerHTML=\`<video controls autoplay src="\${u}"></video>\`;
            else {
                // Магия Google Preview для офисных файлов
                b.innerHTML = \`<iframe src="https://drive.google.com/file/d/\${id}/preview"></iframe>\`;
            }
        }
        function closeView() { document.getElementById('viewer').style.display='none'; document.getElementById('v-con').innerHTML=''; }

        nav('root');
    </script>
    </body>
    </html>`;
};
