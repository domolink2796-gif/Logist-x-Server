/**
 * =========================================================================================
 * TITANIUM OMNIPOTENT SUPREME v145.0 | THE HYPER-MONOLITH MASTER
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * БАЗА: Полная интеграция с server.js (Логистика X & Мерч X)
 * СТАТУС: ENTERPRISE SUPREME | FULL FILE MANAGEMENT | PWA INSTALLABLE
 * -----------------------------------------------------------------------------------------
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- ГЛОБАЛЬНЫЕ КОНСТАНТЫ СИСТЕМЫ ---
const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";
const FS_CONFIG = {
    root: path.join(__dirname, 'local_storage'),
    db: path.join(__dirname, 'db_mirror'),
    ledger: path.join(__dirname, 'local_storage/shadow_reports'),
    index: path.join(__dirname, 'titanium_master_v145.json')
};

// Инициализация файловой структуры
Object.values(FS_CONFIG).forEach(dir => {
    if (dir.endsWith('.json')) return;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

module.exports = function(app, context) {
    const { 
        drive, sheets, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, readBarcodeDb, readPlanogramDb, readShopItemsDb 
    } = context;

    const upload = multer({ 
        dest: 'uploads/', 
        limits: { fileSize: 500 * 1024 * 1024 } 
    });

    /**
     * -------------------------------------------------------------------------------------
     * [БЛОК 1]: НЕЙРОННОЕ ЗЕРКАЛИРОВАНИЕ (AUTONOMOUS CORE)
     * -------------------------------------------------------------------------------------
     */
    
    // Получение полной цепочки папок от Google Drive
    async function getChain(folderId) {
        let chain = [];
        try {
            let currentId = folderId;
            while (currentId && ![MY_ROOT_ID, MERCH_ROOT_ID, 'root'].includes(currentId)) {
                const res = await drive.files.get({ fileId: currentId, fields: 'id, name, parents' });
                chain.unshift({ id: res.data.id, name: res.data.name });
                currentId = (res.data.parents) ? res.data.parents[0] : null;
            }
        } catch (e) { /* Фоновая навигация */ }
        return chain;
    }

    // Синхронизация файла и структуры
    async function titaniumSync(file, parentId, buffer = null) {
        setImmediate(async () => {
            try {
                const chain = await getChain(parentId);
                const projectNode = (parentId === MERCH_ROOT_ID || chain.some(c => c.name.includes('МЕРЧ'))) ? 'MERCH' : 'LOGIST';
                
                const pathParts = chain.map(c => c.name);
                const localDirPath = path.join(FS_CONFIG.root, projectNode, ...pathParts);
                
                if (!fs.existsSync(localDirPath)) fs.mkdirSync(localDirPath, { recursive: true });

                if (buffer) {
                    fs.writeFileSync(path.join(localDirPath, file.name || 'asset.jpg'), buffer);
                }

                // Зеркалирование баз данных JSON
                await mirrorDatabases();
                
                console.log(`🧠 [TITANIUM v145] SYNCED: ${file.name}`);
            } catch (e) { console.error("❌ SYNC ERROR:", e.message); }
        });
    }

    async function mirrorDatabases() {
        try {
            const keys = await readDatabase();
            fs.writeFileSync(path.join(FS_CONFIG.db, 'keys_database.json'), JSON.stringify(keys, null, 2));
            for (let k of keys) {
                if (k.folderId) {
                    const kDir = path.join(FS_CONFIG.db, k.key);
                    if (!fs.existsSync(kDir)) fs.mkdirSync(kDir, { recursive: true });
                    const [b, p, s] = await Promise.all([readBarcodeDb(k.folderId), readPlanogramDb(k.folderId), readShopItemsDb(k.folderId)]);
                    fs.writeFileSync(path.join(kDir, 'barcodes.json'), JSON.stringify(b, null, 2));
                    fs.writeFileSync(path.join(kDir, 'planograms.json'), JSON.stringify(p, null, 2));
                    fs.writeFileSync(path.join(kDir, 'stock.json'), JSON.stringify(s, null, 2));
                }
            }
        } catch (e) { }
    }

    /**
     * -------------------------------------------------------------------------------------
     * [БЛОК 2]: PWA ASSETS (MANIFEST & SERVICE WORKER)
     * -------------------------------------------------------------------------------------
     */
    app.get('/manifest.json', (req, res) => {
        res.json({
            "name": "TITANIUM SUPREME",
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
            self.addEventListener('install', e => e.waitUntil(caches.open('v145').then(c => c.addAll(['/storage', '${LOGO_URL}']))));
            self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
        `);
    });

    /**
     * -------------------------------------------------------------------------------------
     * [БЛОК 3]: ТИТАНОВЫЙ ИНТЕРФЕЙС (SUPREME UI)
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
    <title>TITANIUM SUPREME</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --g: #f0b90b; --b: #050505; --safe: env(safe-area-inset-top); }
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
        
        aside { width: 320px; background: #fff; border-right: 1px solid #ddd; display: flex; flex-direction: column; transition: 0.4s; z-index: 4000; }
        @media (max-width: 900px) { aside { position: absolute; left: -320px; height: 100%; } aside.open { left: 0; box-shadow: 20px 0 70px rgba(0,0,0,0.4); } }

        .nav-link { height: 60px; margin: 5px 15px; border-radius: 30px; display: flex; align-items: center; padding: 0 22px; cursor: pointer; font-size: 16px; font-weight: 600; color: #5f6368; }
        .nav-link.active { background: #fff8e1; color: #b8860b; border: 1px solid var(--g); font-weight: 700; }

        main { flex: 1; display: flex; flex-direction: column; background: #fff; overflow: hidden; position: relative; }
        
        .breadcrumbs { padding: 12px 25px; background: #1a1a1a; color: var(--g); font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 8px; overflow-x: auto; white-space: nowrap; border-bottom: 2px solid var(--g); }
        .breadcrumbs span { cursor: pointer; opacity: 0.7; }
        .breadcrumbs span:last-child { opacity: 1; color: #fff; }

        .search-area { padding: 18px 25px; border-bottom: 1px solid #eee; }
        .search-box { display: flex; align-items: center; background: #f1f3f4; padding: 15px 22px; border-radius: 20px; gap: 12px; }
        .search-box input { flex: 1; border: none; background: transparent; font-size: 18px; width: 100%; }

        .content { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 120px; }
        .grid { width: 100%; border-collapse: collapse; }
        .grid td { padding: 20px 25px; border-bottom: 1px solid #f8f8f8; cursor: pointer; }
        .grid tr:active { background: #f5f5f5; }
        
        .f-item { display: flex; align-items: center; gap: 20px; }
        .f-icon { font-size: 32px; width: 45px; text-align: center; }
        .f-name { font-weight: 700; font-size: 16px; color: #333; line-height: 1.3; }
        .f-meta { font-size: 11px; color: #999; margin-top: 4px; display: flex; align-items: center; gap: 10px; }
        
        .badge { font-size: 9px; padding: 3px 10px; border-radius: 6px; font-weight: 900; text-transform: uppercase; border: 1px solid; }
        .b-xls { background: #e8f5e9; color: #2e7d32; border-color: #2e7d32; }

        .fab {
            position: fixed; bottom: 35px; right: 30px; width: 85px; height: 85px;
            border-radius: 28px; background: var(--b); border: 4px solid var(--g);
            display: flex; align-items: center; justify-content: center; z-index: 6000;
            box-shadow: 0 15px 45px rgba(0,0,0,0.5); color: var(--g); font-size: 32px;
        }

        #pop { position: fixed; display: none; bottom: 130px; right: 30px; background: #fff; border-radius: 28px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); z-index: 8000; min-width: 280px; overflow: hidden; }
        .m-row { padding: 22px 28px; display: flex; align-items: center; gap: 20px; cursor: pointer; font-weight: 700; color: #333; border-bottom: 1px solid #f0f0f0; }
        
        #viewer { display: none; position: fixed; inset: 0; background: #000; z-index: 9500; flex-direction: column; }
        .v-h { height: calc(75px + var(--safe)); display: flex; align-items: flex-end; justify-content: space-between; padding: 0 25px 18px; color: #fff; background: #111; }
        
        #toast { position: fixed; top: 100px; left: 20px; right: 20px; background: #333; color: #fff; padding: 20px; border-radius: 15px; display: none; z-index: 10000; border-left: 8px solid var(--g); font-weight: 800; }

        /* Контекстное меню */
        #ctx { position: fixed; display: none; background: #fff; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 9000; min-width: 200px; overflow: hidden; }
        .ctx-row { padding: 15px 20px; font-weight: 700; font-size: 14px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 12px; }
        .ctx-row:last-child { border: none; color: red; }
    </style>
</head>
<body>

<header>
    <div class="logo" onclick="document.getElementById('sidebar').classList.toggle('open')">
        <img src="${LOGO_URL}"> <b>TITANIUM <span style="color:var(--g)">SUPREME</span></b>
    </div>
    <button id="install" style="background:var(--g); color:#000; border:none; padding:10px 20px; border-radius:10px; font-weight:900; font-size:12px; display:none;">УСТАНОВИТЬ</button>
</header>

<div class="shell">
    <aside id="sidebar">
        <div style="padding: 35px 25px 15px; font-weight: 800; color: #ccc; font-size: 12px; letter-spacing: 2px;">АРХИТЕКТУРА v145</div>
        <div class="nav-link active" id="n-root" onclick="nav('root')"><i class="fa fa-layer-group"></i> Весь сектор</div>
        <div class="nav-link" id="n-log" onclick="nav('${MY_ROOT_ID}')"><i class="fa fa-truck-fast"></i> Логистика X</div>
        <div class="nav-link" id="n-merch" onclick="nav('${MERCH_ROOT_ID}')"><i class="fa fa-boxes-packing"></i> Мерчандайзинг</div>
        <div style="margin-top: auto; padding: 35px; background: #fcfcfc; border-top: 2px solid #eee;">
            <div style="font-size: 10px; color: #999; font-weight: 800; margin-bottom: 10px;">DEEP SYSTEM MIRROR</div>
            <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:900; color: #2e7d32;">
                <span>STABILITY:</span> <span>100% READY</span>
            </div>
        </div>
    </aside>
    
    <main>
        <div class="breadcrumbs" id="crumbs">
            <i class="fa fa-folder-open"></i> <span onclick="nav('root')">ROOT</span>
        </div>

        <div class="search-area">
            <div class="search-box">
                <i class="fa fa-search" style="color:#aaa"></i>
                <input type="text" id="sq" placeholder="Поиск по адресу, сотруднику или дате..." oninput="filter()">
            </div>
        </div>

        <div class="content"><table class="grid"><tbody id="f-body"></tbody></table></div>
    </main>
</div>

<div class="fab" onclick="toggleP(event)"><i class="fa fa-plus"></i></div>

<div id="pop">
    <div class="m-row" onclick="mkdir()"><i class="fa fa-folder-plus"></i> Новый объект</div>
    <div class="m-row" onclick="document.getElementById('fin').click()"><i class="fa fa-camera"></i> Загрузить отчет</div>
    <div class="m-row" onclick="location.reload()"><i class="fa fa-rotate"></i> Обновить сектор</div>
</div>

<div id="ctx">
    <div class="ctx-row" onclick="renameItem()"><i class="fa fa-pen"></i> Переименовать</div>
    <div class="ctx-row" onclick="deleteItem()"><i class="fa fa-trash"></i> Удалить</div>
</div>

<div id="viewer">
    <div class="v-h"><span id="v-t" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:800;"></span><i class="fa fa-circle-xmark" onclick="closePv()" style="font-size: 40px; color:var(--g)"></i></div>
    <iframe id="v-f" style="flex:1; border:none; background:#fff"></iframe>
</div>

<input type="file" id="fin" style="display:none" multiple accept="image/*" onchange="hUp(this.files)">
<div id="toast"></div>

<script>
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
    let defP; window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); defP = e; document.getElementById('install').style.display='block'; });
    document.getElementById('install').onclick = async () => { if(defP) { defP.prompt(); defP=null; } };

    let curId = 'root'; let cache = []; let selectedId = null;

    async function sync(id) {
        curId = id; const b = document.getElementById('f-body');
        b.innerHTML = '<tr><td style="text-align:center; padding:150px;"><i class="fa fa-atom fa-spin fa-5x" style="color:var(--g)"></i><br><br><b style="font-size:18px;">ЧТЕНИЕ X-CORE...</b></td></tr>';
        try {
            const r = await fetch('/storage/api/list?folderId=' + id);
            const data = await r.json();
            cache = data.files;
            
            // Хлебные крошки
            const cr = document.getElementById('crumbs');
            cr.innerHTML = '<i class="fa fa-folder-open"></i> <span onclick="nav(\\'root\\')">ROOT</span>';
            data.chain.forEach(c => {
                cr.innerHTML += \` / <span onclick="nav('\${c.id}')">\${c.name}</span>\`;
            });

            render();
            document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
            if(id === 'root') document.getElementById('n-root').classList.add('active');
            if(id === '${MY_ROOT_ID}') document.getElementById('n-log').classList.add('active');
            if(id === '${MERCH_ROOT_ID}') document.getElementById('n-merch').classList.add('active');
        } catch(e) { b.innerHTML = '<tr><td style="text-align:center; padding:80px; color:red;">Ошибка ядра.</td></tr>'; }
    }

    function render(data = cache) {
        const body = document.getElementById('f-body');
        body.innerHTML = data.length ? '' : '<tr><td style="text-align:center; color:#aaa; padding:100px;">Сектор пуст</td></tr>';
        data.forEach(f => {
            const isD = f.mimeType.includes('folder');
            const isXls = f.name.includes('Отчет') || f.name.includes('Мерч');
            const tr = document.createElement('tr');
            tr.innerHTML = \`<td><div class="f-item"><i class="fa \${isD?'fa-folder-closed':(isXls?'fa-file-excel':'fa-image')} f-icon" style="color:\${isD?'#fbc02d':(isXls?'#2e7d32':'#1a73e8')}"></i><div><div class="f-name">\${f.name}</div><div class="f-meta"><span class="badge">MIRROR</span> \${isXls?'<span class="badge b-xls">TABLE</span>':''} <span>\${new Date(f.modifiedTime).toLocaleDateString()}</span></div></div></div></td>\`;
            
            tr.onclick = () => isD ? sync(f.id) : pv(f.id, f.name, isXls);
            tr.oncontextmenu = (e) => { e.preventDefault(); showCtx(e, f.id); };
            
            // Долгое нажатие для телефона
            let timer;
            tr.ontouchstart = () => timer = setTimeout(() => showCtx({pageX: 100, pageY: 100}, f.id), 800);
            tr.ontouchend = () => clearTimeout(timer);

            body.appendChild(tr);
        });
    }

    function showCtx(e, id) {
        selectedId = id; const m = document.getElementById('ctx');
        m.style.display = 'block'; m.style.left = e.pageX + 'px'; m.style.top = e.pageY + 'px';
    }

    async function deleteItem() {
        if(confirm("Удалить объект навсегда?")) {
            await fetch('/storage/api/delete', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:selectedId})});
            sync(curId);
        }
    }

    async function renameItem() {
        const n = prompt("Новое имя:");
        if(n) {
            await fetch('/storage/api/rename', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:selectedId, name:n})});
            sync(curId);
        }
    }

    function filter() { const q = document.getElementById('sq').value.toLowerCase(); render(cache.filter(f => f.name.toLowerCase().includes(q))); }
    function toggleP(e) { e.stopPropagation(); const m = document.getElementById('pop'); m.style.display = m.style.display==='block'?'none':'block'; }
    function nav(id) { sync(id); if(window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open'); }
    function pv(id, n, isXls) { document.getElementById('v-t').innerText = n; document.getElementById('v-f').src = isXls ? 'https://docs.google.com/spreadsheets/d/'+id+'/edit' : 'https://drive.google.com/file/d/'+id+'/preview'; document.getElementById('viewer').style.display = 'flex'; }
    function closePv() { document.getElementById('viewer').style.display = 'none'; document.getElementById('v-f').src = ''; }
    async function hUp(files) { for(let f of files) { msg("🚀 СИНХРОНИЗАЦИЯ: " + f.name); const fd = new FormData(); fd.append('file', f); fd.append('folderId', curId); await fetch('/storage/api/upload', {method:'POST', body:fd}); } sync(curId); }
    function mkdir() { const n = prompt("Имя объекта (Улица Дом Подъезд):"); if(n) { fetch('/storage/api/mkdir', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({parentId:curId, name:n})}).then(() => sync(curId)); } }
    function msg(t) { const b = document.getElementById('toast'); b.innerText = t; b.style.display = 'block'; setTimeout(() => b.style.display = 'none', 3000); }
    window.onclick = () => { document.getElementById('pop').style.display='none'; document.getElementById('ctx').style.display='none'; };
    sync('root');
</script>
</body>
</html>
    `;

    // --- API GATEWAY: ПОЛНОЕ УПРАВЛЕНИЕ ---
    
    app.get('/storage', (req, res) => res.send(UI));

    app.get('/storage/api/list', async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            const [chain, filesRes] = await Promise.all([
                getChain(folderId),
                drive.files.list({ 
                    q: `'${folderId}' in parents and trashed = false`, 
                    fields: 'files(id, name, mimeType, size, modifiedTime)', 
                    orderBy: 'folder, name' 
                })
            ]);
            
            // Фоновое зеркалирование
            filesRes.data.files.forEach(f => titaniumSync(f, folderId));

            res.json({ files: filesRes.data.files, chain });
        } catch (e) { res.status(500).json({error: e.message}); }
    });

    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            const buffer = fs.readFileSync(req.file.path);
            const r = await drive.files.create({ 
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) },
                fields: 'id, name, mimeType'
            });
            await titaniumSync(r.data, req.body.folderId, buffer);
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
            await titaniumSync(r.data, req.body.parentId);
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/delete', express.json(), async (req, res) => {
        try {
            await drive.files.delete({ fileId: req.body.id });
            // Локально удаление можно добавить через поиск в индексе
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/rename', express.json(), async (req, res) => {
        try {
            await drive.files.update({ fileId: req.body.id, resource: { name: req.body.name } });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    console.log("🦾 TITANIUM v145.0 SUPREME | FULL FILE SYSTEM MASTER READY");
};