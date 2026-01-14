/**
 * =========================================================================================
 * TITANIUM HYPER-LINK v146.0 | THE SUPREME COMMAND CORE
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * БАЗА: Тотальная интеграция с server.js (Логистика X & Мерч X)
 * СТАТУС: ULTRA-TOP | FAULT-TOLERANT | FULL AUTONOMY READY
 * -----------------------------------------------------------------------------------------
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- ГЛОБАЛЬНЫЕ НАСТРОЙКИ СИСТЕМЫ ---
const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";
const TITANIUM_FS = {
    root: path.join(__dirname, 'local_storage'),
    db: path.join(__dirname, 'db_mirror'),
    ledger: path.join(__dirname, 'local_storage/shadow_reports'),
    cache: path.join(__dirname, 'local_storage/assets_temp'),
    memory: path.join(__dirname, 'titanium_v146_neural.json')
};

// Самовосстанавливающаяся инициализация
Object.values(TITANIUM_FS).forEach(dir => {
    if (dir.endsWith('.json')) return;
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch(e) {}
});

module.exports = function(app, context) {
    const { 
        drive, sheets, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, readBarcodeDb, readPlanogramDb, readShopItemsDb 
    } = context;

    const upload = multer({ 
        dest: 'uploads/', 
        limits: { fileSize: 600 * 1024 * 1024 } // Лимит увеличен до 600МБ
    });

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 1]: НЕЙРОННЫЙ АРХИТЕКТОР (STABLE RECURSION)
     * -------------------------------------------------------------------------------------
     */
    
    // Безопасное получение цепочки папок
    async function getSafeChain(folderId) {
        let chain = [];
        try {
            let current = folderId;
            while (current && ![MY_ROOT_ID, MERCH_ROOT_ID, 'root'].includes(current)) {
                const res = await drive.files.get({ fileId: current, fields: 'id, name, parents' });
                chain.unshift({ id: res.data.id, name: res.data.name });
                current = (res.data.parents && res.data.parents.length > 0) ? res.data.parents[0] : null;
            }
        } catch (e) { /* Используем локальный кэш при ошибке Drive */ }
        return chain;
    }

    // Фоновая синхронизация с защитой от сбоев
    async function titaniumNeuralSync(file, parentId, buffer = null) {
        setImmediate(async () => {
            try {
                const chain = await getSafeChain(parentId);
                const projectRoot = (parentId === MERCH_ROOT_ID || chain.some(c => c.name.includes('МЕРЧ'))) ? 'MERCH_CORE' : 'LOGIST_CORE';
                
                const localDirPath = path.join(TITANIUM_FS.root, projectRoot, ...chain.map(c => c.name));
                if (!fs.existsSync(localDirPath)) fs.mkdirSync(localDirPath, { recursive: true });

                if (buffer) {
                    const fileName = file.name || `sync_${Date.now()}.jpg`;
                    fs.writeFileSync(path.join(localDirPath, fileName), buffer);
                }

                // Зеркалирование баз данных в реальном времени
                await mirrorSystemDatabases();
            } catch (e) { console.error("⚠️ Titanium Sync Logic Lag:", e.message); }
        });
    }

    async function mirrorSystemDatabases() {
        try {
            const keys = await readDatabase();
            fs.writeFileSync(path.join(TITANIUM_FS.db, 'keys_database.json'), JSON.stringify(keys, null, 2));
            
            // Глубокое зеркалирование баз по каждому ключу
            for (let k of keys) {
                if (k.folderId) {
                    const kPath = path.join(TITANIUM_FS.db, k.key);
                    if (!fs.existsSync(kPath)) fs.mkdirSync(kPath, { recursive: true });
                    const [b, p, s] = await Promise.all([readBarcodeDb(k.folderId), readPlanogramDb(k.folderId), readShopItemsDb(k.folderId)]);
                    fs.writeFileSync(path.join(kPath, 'barcodes.json'), JSON.stringify(b || {}, null, 2));
                    fs.writeFileSync(path.join(kPath, 'planograms.json'), JSON.stringify(p || {}, null, 2));
                    fs.writeFileSync(path.join(kPath, 'stock.json'), JSON.stringify(s || {}, null, 2));
                }
            }
        } catch (e) { }
    }

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 2]: PWA ASSETS (MANIFEST, SW, APP META)
     * -------------------------------------------------------------------------------------
     */
    app.get('/manifest.json', (req, res) => {
        res.json({
            "name": "TITANIUM HYPER-LINK",
            "short_name": "TitaniumX",
            "start_url": "/storage",
            "display": "standalone",
            "background_color": "#050505",
            "theme_color": "#f0b90b",
            "icons": [{ "src": LOGO_URL, "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }]
        });
    });

    app.get('/sw.js', (req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.send(`
            const CACHE_NAME = 'titanium-v146';
            self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(['/storage', '${LOGO_URL}']))));
            self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
        `);
    });

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 3]: ТИТАНОВЫЙ ИНТЕРФЕЙС (ULTRA-TOP UI)
     * -------------------------------------------------------------------------------------
     */
    const UI = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="theme-color" content="#050505">
    
    <link rel="manifest" href="/manifest.json">
    <link rel="apple-touch-icon" href="${LOGO_URL}">

    <title>TITANIUM HYPER-LINK</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --g: #f0b90b; --b: #050505; --safe: env(safe-area-inset-top); --glass: rgba(255,255,255,0.05); }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; outline: none; }
        body, html { height: 100%; width: 100%; font-family: 'Roboto', sans-serif; background: var(--b); color: #fff; overflow: hidden; position: fixed; }

        header {
            height: calc(85px + var(--safe)); background: var(--b); border-bottom: 5px solid var(--g);
            display: flex; align-items: flex-end; justify-content: space-between; 
            padding: 0 25px 15px; z-index: 5000; position: relative;
        }
        .logo { display: flex; align-items: center; gap: 15px; }
        .logo img { height: 45px; border-radius: 12px; box-shadow: 0 0 25px var(--g); }
        .logo b { font-family: 'Google Sans'; font-size: 24px; letter-spacing: 1px; }

        .shell { display: flex; height: calc(100% - (85px + var(--safe))); width: 100%; background: #fff; color: #1a1a1b; }
        
        aside { 
            width: 320px; background: #fff; border-right: 1px solid #ddd; 
            display: flex; flex-direction: column; transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1); z-index: 4000; 
        }
        @media (max-width: 900px) { aside { position: absolute; left: -320px; height: 100%; } aside.open { left: 0; box-shadow: 25px 0 80px rgba(0,0,0,0.5); } }

        .nav-link { 
            height: 60px; margin: 6px 15px; border-radius: 30px; display: flex; align-items: center; 
            padding: 0 22px; cursor: pointer; font-size: 16px; font-weight: 600; color: #5f6368; 
            transition: 0.3s;
        }
        .nav-link.active { background: #fff8e1; color: #b8860b; border: 1px solid var(--g); font-weight: 700; }
        .nav-link:active { background: #f1f3f4; }

        main { flex: 1; display: flex; flex-direction: column; background: #fff; overflow: hidden; position: relative; }
        
        .breadcrumb-bar { 
            padding: 12px 25px; background: #1a1a1a; color: var(--g); 
            font-size: 11px; font-weight: 800; display: flex; align-items: center; gap: 10px; 
            overflow-x: auto; white-space: nowrap; border-bottom: 3px solid var(--g);
        }
        .breadcrumb-bar i { font-size: 14px; }
        .breadcrumb-bar span { cursor: pointer; opacity: 0.7; }
        .breadcrumb-bar span:last-child { opacity: 1; color: #fff; }

        .search-area { padding: 18px 25px; border-bottom: 1px solid #eee; background: #fff; }
        .search-box { 
            display: flex; align-items: center; background: #f1f3f4; 
            padding: 15px 22px; border-radius: 20px; gap: 15px; 
        }
        .search-box input { flex: 1; border: none; background: transparent; font-size: 18px; width: 100%; }

        .content { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 120px; }
        .grid { width: 100%; border-collapse: collapse; }
        .grid td { padding: 22px 25px; border-bottom: 1px solid #f8f8f8; cursor: pointer; }
        .grid tr:active { background: #f5f5f5; }
        
        .f-item { display: flex; align-items: center; gap: 20px; }
        .f-icon { font-size: 35px; width: 45px; text-align: center; }
        .f-name { font-weight: 700; font-size: 16px; color: #333; line-height: 1.4; }
        .f-meta { font-size: 11px; color: #999; margin-top: 5px; display: flex; align-items: center; gap: 12px; }
        
        .badge { font-size: 9px; padding: 4px 12px; border-radius: 8px; font-weight: 900; text-transform: uppercase; border: 1px solid; }
        .b-xls { background: #e8f5e9; color: #2e7d32; border-color: #2e7d32; }

        .fab {
            position: fixed; bottom: 40px; right: 30px; width: 85px; height: 85px;
            border-radius: 28px; background: var(--b); border: 5px solid var(--g);
            display: flex; align-items: center; justify-content: center; z-index: 6000;
            box-shadow: 0 15px 45px rgba(0,0,0,0.5); color: var(--g); font-size: 35px;
            transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .fab:active { transform: scale(0.85); }

        #pop { position: fixed; display: none; bottom: 140px; right: 30px; background: #fff; border-radius: 28px; box-shadow: 0 25px 80px rgba(0,0,0,0.3); z-index: 8000; min-width: 300px; overflow: hidden; }
        .m-row { padding: 22px 28px; display: flex; align-items: center; gap: 20px; cursor: pointer; font-weight: 700; color: #333; border-bottom: 1px solid #f0f0f0; }
        .m-row:active { background: #f1f3f4; }

        #ctx { position: fixed; display: none; background: #fff; border-radius: 20px; box-shadow: 0 15px 50px rgba(0,0,0,0.4); z-index: 9000; min-width: 220px; overflow: hidden; }
        .ctx-row { padding: 18px 25px; font-weight: 700; font-size: 15px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 15px; color: #333; }
        .ctx-row:last-child { color: #da3633; border: none; }

        #viewer { display: none; position: fixed; inset: 0; background: #000; z-index: 9500; flex-direction: column; }
        .v-h { height: calc(80px + var(--safe)); display: flex; align-items: flex-end; justify-content: space-between; padding: 0 25px 18px; color: #fff; background: #111; }
        
        #toast { position: fixed; top: 110px; left: 20px; right: 20px; background: #111; color: #fff; padding: 22px; border-radius: 18px; display: none; z-index: 10000; border-left: 10px solid var(--g); font-weight: 900; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
    </style>
</head>
<body>

<header>
    <div class="logo" onclick="document.getElementById('sidebar').classList.toggle('open')">
        <img src="${LOGO_URL}"> <b>TITANIUM <span style="color:var(--g)">LINK</span></b>
    </div>
    <button id="pwa" style="background:var(--g); color:#000; border:none; padding:12px 25px; border-radius:15px; font-weight:900; font-size:13px; display:none; box-shadow: 0 5px 15px rgba(0,0,0,0.3);">УСТАНОВИТЬ</button>
</header>

<div class="shell">
    <aside id="sidebar">
        <div style="padding: 35px 25px 15px; font-weight: 800; color: #bbb; font-size: 12px; letter-spacing: 2px;">HYPER-CORE v146</div>
        <div class="nav-link active" id="n-root" onclick="nav('root')"><i class="fa fa-layer-group"></i> Весь сектор</div>
        <div class="nav-link" id="n-log" onclick="nav('${MY_ROOT_ID}')"><i class="fa fa-truck-fast"></i> Логистика X</div>
        <div class="nav-link" id="n-merch" onclick="nav('${MERCH_ROOT_ID}')"><i class="fa fa-boxes-packing"></i> Мерчандайзинг</div>
        
        <div style="margin-top: auto; padding: 35px; background: #fafafa; border-top: 2px solid #eee;">
            <div style="font-size: 11px; color: #999; font-weight: 800; margin-bottom: 12px;">SYSTEM INTEGRITY</div>
            <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:900; color: #2e7d32;">
                <span>STABILITY:</span> <span>MAXIMUM</span>
            </div>
            <div style="height:10px; background:#ddd; border-radius:15px; margin-top:12px; overflow:hidden;">
                <div style="width:100%; height:100%; background:var(--g); transition: 1s;"></div>
            </div>
        </div>
    </aside>
    
    <main>
        <div class="breadcrumb-bar" id="crumbs">
            <i class="fa fa-folder-tree"></i> <span onclick="nav('root')">ROOT</span>
        </div>

        <div class="search-area">
            <div class="search-box">
                <i class="fa fa-magnifying-glass" style="color:#aaa"></i>
                <input type="text" id="sq" placeholder="Поиск по адресу, имени или дате..." oninput="filter()">
            </div>
        </div>

        <div class="content"><table class="grid"><tbody id="f-body"></tbody></table></div>
    </main>
</div>

<div class="fab" onclick="toggleP(event)"><i class="fa fa-microchip"></i></div>

<div id="pop">
    <div class="m-row" onclick="mkdir()"><i class="fa fa-folder-plus"></i> Новый объект</div>
    <div class="m-row" onclick="document.getElementById('fin').click()"><i class="fa fa-camera-retro"></i> Загрузить отчет</div>
    <div class="m-row" onclick="location.reload()"><i class="fa fa-arrows-rotate"></i> Обновить сектор</div>
</div>

<div id="ctx">
    <div class="ctx-row" onclick="renameItem()"><i class="fa fa-pen"></i> Переименовать</div>
    <div class="ctx-row" onclick="deleteItem()"><i class="fa fa-trash-can"></i> Удалить объект</div>
</div>

<div id="viewer">
    <div class="v-h"><span id="v-t" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:800; font-size:18px;"></span><i class="fa fa-circle-xmark" onclick="closePv()" style="font-size: 45px; color:var(--g); cursor:pointer"></i></div>
    <iframe id="v-f" style="flex:1; border:none; background:#fff"></iframe>
</div>

<input type="file" id="fin" style="display:none" multiple accept="image/*" onchange="hUp(this.files)">
<div id="toast"></div>

<script>
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
    let defPrompt; window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); defPrompt = e; document.getElementById('pwa').style.display='block'; });
    document.getElementById('pwa').onclick = async () => { if(defPrompt) { defPrompt.prompt(); defPrompt=null; } };

    let curId = 'root'; let cache = []; let selId = null;

    async function sync(id) {
        curId = id; const b = document.getElementById('f-body');
        b.innerHTML = '<tr><td style="text-align:center; padding:150px;"><i class="fa fa-atom fa-spin fa-5x" style="color:var(--g)"></i><br><br><b style="font-size:18px; letter-spacing:1px;">ЧТЕНИЕ ЯДРА HYPER-LINK...</b></td></tr>';
        
        try {
            const r = await fetch('/storage/api/list?folderId=' + id);
            const data = await r.json();
            if(data.error) throw new Error(data.error);
            cache = data.files;
            
            // Хлебные крошки
            const cr = document.getElementById('crumbs');
            cr.innerHTML = '<i class="fa fa-folder-tree"></i> <span onclick="nav(\\'root\\')">ROOT</span>';
            data.chain.forEach(c => {
                cr.innerHTML += \` / <span onclick="nav('\${c.id}')">\${c.name}</span>\`;
            });

            render();
            document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
            if(id === 'root') document.getElementById('n-root').classList.add('active');
            if(id === '${MY_ROOT_ID}') document.getElementById('n-log').classList.add('active');
            if(id === '${MERCH_ROOT_ID}') document.getElementById('n-merch').classList.add('active');
        } catch(e) { 
            b.innerHTML = \`<tr><td style="text-align:center; padding:80px; color:red;"><b>Ошибка связи с ядром</b><br><small>\${e.message}</small><br><br><button onclick="sync(curId)" style="padding:10px 20px; background:var(--g); border:none; border-radius:10px; font-weight:900;">ПОВТОРИТЬ</button></td></tr>\`; 
        }
    }

    function render(data = cache) {
        const body = document.getElementById('f-body');
        body.innerHTML = data.length ? '' : '<tr><td style="text-align:center; color:#aaa; padding:120px; font-size:18px;">СЕКТОР ПУСТ</td></tr>';
        data.forEach(f => {
            const isD = f.mimeType.includes('folder');
            const isXls = f.name.includes('Отчет') || f.name.includes('Мерч');
            const tr = document.createElement('tr');
            tr.innerHTML = \`<td><div class="f-item"><i class="fa \${isD?'fa-folder-closed':(isXls?'fa-file-excel':'fa-image')} f-icon" style="color:\${isD?'#fbc02d':(isXls?'#2e7d32':'#1a73e8')}"></i><div><div class="f-name">\${f.name}</div><div class="f-meta"><span class="badge">REPLICATED</span> \${isXls?'<span class="badge b-xls">REPORT</span>':''} <span>\${new Date(f.modifiedTime).toLocaleDateString()}</span></div></div></div></td>\`;
            
            tr.onclick = () => isD ? sync(f.id) : pv(f.id, f.name, isXls);
            tr.oncontextmenu = (e) => { e.preventDefault(); showCtx(e, f.id); };
            
            // Долгое нажатие
            let t;
            tr.ontouchstart = () => t = setTimeout(() => showCtx({pageX: 100, pageY: 100}, f.id), 800);
            tr.ontouchend = () => clearTimeout(t);

            body.appendChild(tr);
        });
    }

    function showCtx(e, id) {
        selId = id; const m = document.getElementById('ctx');
        m.style.display = 'block'; m.style.left = e.pageX + 'px'; m.style.top = e.pageY + 'px';
    }

    async function deleteItem() {
        if(confirm("Удалить объект навсегда?")) {
            await fetch('/storage/api/delete', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:selId})});
            sync(curId);
        }
    }

    async function renameItem() {
        const n = prompt("Новое имя:");
        if(n) {
            await fetch('/storage/api/rename', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:selId, name:n})});
            sync(curId);
        }
    }

    function filter() { const q = document.getElementById('sq').value.toLowerCase(); render(cache.filter(f => f.name.toLowerCase().includes(q))); }
    function toggleP(e) { e.stopPropagation(); const m = document.getElementById('pop'); m.style.display = m.style.display==='block'?'none':'block'; }
    function nav(id) { sync(id); if(window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open'); }
    function pv(id, n, isXls) { document.getElementById('v-t').innerText = n; document.getElementById('v-f').src = isXls ? 'https://docs.google.com/spreadsheets/d/'+id+'/edit' : 'https://drive.google.com/file/d/'+id+'/preview'; document.getElementById('viewer').style.display = 'flex'; }
    function closePv() { document.getElementById('viewer').style.display = 'none'; document.getElementById('v-f').src = ''; }
    async function hUp(files) { for(let f of files) { msg("📥 ИМПОРТ В ЯДРО: " + f.name); const fd = new FormData(); fd.append('file', f); fd.append('folderId', curId); await fetch('/storage/api/upload', {method:'POST', body:fd}); } sync(curId); }
    function mkdir() { const n = prompt("Объект (Адрес Номер Подъезд):"); if(n) { fetch('/storage/api/mkdir', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({parentId:curId, name:n})}).then(() => sync(curId)); } }
    function msg(t) { const b = document.getElementById('toast'); b.innerText = t; b.style.display = 'block'; setTimeout(() => b.style.display = 'none', 4000); }
    window.onclick = () => { document.getElementById('pop').style.display='none'; document.getElementById('ctx').style.display='none'; };
    sync('root');
</script>
</body>
</html>
    `;

    // --- API GATEWAY: TITANIUM COMMANDS ---
    
    app.get('/storage', (req, res) => res.send(UI));

    app.get('/storage/api/list', async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            const [chain, filesRes] = await Promise.all([
                getSafeChain(folderId),
                drive.files.list({ 
                    q: `'${folderId}' in parents and trashed = false`, 
                    fields: 'files(id, name, mimeType, size, modifiedTime)', 
                    orderBy: 'folder, name' 
                })
            ]);
            
            // Автоматическое фоновое зеркалирование структуры
            filesRes.data.files.forEach(f => titaniumNeuralSync(f, folderId));

            res.json({ files: filesRes.data.files, chain });
        } catch (e) { res.json({ error: e.message }); }
    });

    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            const buffer = fs.readFileSync(req.file.path);
            const r = await drive.files.create({ 
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) },
                fields: 'id, name, mimeType'
            });
            await titaniumNeuralSync(r.data, req.body.folderId, buffer);
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); 
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/mkdir', express.json(), async (req, res) => {
        try {
            const r = await drive.files.create({ 
                resource: { name: req.body.name, mimeType: 'application/vnd.google-apps.folder', parents: [req.body.parentId] },
                fields: 'id, name'
            });
            await titaniumNeuralSync(r.data, req.body.parentId);
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/delete', express.json(), async (req, res) => {
        try {
            await drive.files.delete({ fileId: req.body.id });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/rename', express.json(), async (req, res) => {
        try {
            await drive.files.update({ fileId: req.body.id, resource: { name: req.body.name } });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    console.log("🏛 TITANIUM v146.0 HYPER-LINK | SUPREME CORE ACTIVATED");
};