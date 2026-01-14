/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v144.0 | THE HYPER-MONOLITH "NEURAL RECONSTRUCTION"
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * БАЗА: Интеграция с server.js (Logist X & Merch X)
 * СТАТУС: MAXIMUM AUTONOMY | NEURAL TREE & MULTI-VIEWER INTEGRATED
 * -----------------------------------------------------------------------------------------
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- ГЛОБАЛЬНЫЕ КОНСТАНТЫ СИСТЕМЫ ---
const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";
const STORAGE_ROOT = path.join(__dirname, 'local_storage');
const DB_MIRROR_ROOT = path.join(__dirname, 'db_mirror');
const REPORT_LEDGER_DIR = path.join(__dirname, 'local_storage/reports_shadow_ledger');
const NEURAL_INDEX = path.join(__dirname, 'titanium_neural_map.json');

// Глубокая инициализация архитектуры хранения (из v142)
[STORAGE_ROOT, DB_MIRROR_ROOT, REPORT_LEDGER_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

module.exports = function(app, context) {
    // Импорт инструментов из основного server.js
    const { 
        drive, google, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, saveDatabase, getOrCreateFolder,
        readBarcodeDb, readPlanogramDb, readShopItemsDb,
        sheets
    } = context;

    // Настройка Multer для тяжелых медиа-файлов
    const upload = multer({ 
        dest: 'uploads/',
        limits: { fileSize: 500 * 1024 * 1024 }
    });

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 1]: НЕЙРОННЫЙ АРХИТЕКТОР (AUTONOMOUS LOGIC)
     * -------------------------------------------------------------------------------------
     */
    
    // Восстановление глубокого пути (Логика из v142)
    async function resolveDeepPath(folderId) {
        let chain = [];
        try {
            let current = folderId;
            const roots = [MY_ROOT_ID, MERCH_ROOT_ID, 'root', undefined, null];
            while (current && !roots.includes(current)) {
                const info = await drive.files.get({ fileId: current, fields: 'id, name, parents' });
                if (!info.data.name) break;
                chain.unshift(info.data.name);
                current = (info.data.parents) ? info.data.parents[0] : null;
                if (chain.length > 10) break;
            }
        } catch (e) { console.warn("⚠️ Path Resolution Warning."); }
        return chain;
    }

    // Главный процесс синхронизации, обучения и удаления
    async function titaniumNeuralProcess(asset, action = 'sync', buffer = null) {
        setImmediate(async () => {
            try {
                let index = { stats: { files: 0, syncs: 0 }, map: {} };
                if (fs.existsSync(NEURAL_INDEX)) {
                    try { index = JSON.parse(fs.readFileSync(NEURAL_INDEX, 'utf8')); } catch(e) {}
                }
                
                if (action === 'delete') {
                    if (index.map[asset.id]) {
                        // Попытка удалить локальную копию если есть
                        const local = index.map[asset.id].local;
                        if (local && fs.existsSync(local)) {
                            try { fs.unlinkSync(local); } catch(err) {}
                        }
                        delete index.map[asset.id];
                    }
                } else {
                    const { id, name, parentId, mimeType } = asset;
                    let folderChain = await resolveDeepPath(parentId);
                    const isMerch = (parentId === MERCH_ROOT_ID || folderChain.some(n => n.toLowerCase().includes('мерч')));
                    const projectNode = isMerch ? 'MERCH_CORE' : 'LOGIST_CORE';
                    const localPath = path.join(STORAGE_ROOT, projectNode, ...folderChain);

                    if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });

                    if (buffer) {
                        fs.writeFileSync(path.join(localPath, name || 'unknown'), buffer);
                        index.stats.files++;
                    }

                    index.map[id] = { 
                        local: localPath, 
                        name: name, 
                        type: mimeType, 
                        parentId: parentId, 
                        ts: Date.now(), 
                        core: projectNode 
                    };
                }

                index.stats.syncs++;
                fs.writeFileSync(NEURAL_INDEX, JSON.stringify(index, null, 2));
                
                // Авто-зеркалирование баз при каждом процессе
                await autoMirrorDatabases();
            } catch (e) { console.error("❌ NEURAL CORE ERROR:", e.message); }
        });
    }

    // Автоматическое зеркалирование JSON баз (из v142)
    async function autoMirrorDatabases() {
        try {
            const keys = await readDatabase();
            fs.writeFileSync(path.join(DB_MIRROR_ROOT, 'keys_database.json'), JSON.stringify(keys, null, 2));
            for (let k of keys) {
                if (k.folderId) {
                    const kDir = path.join(DB_MIRROR_ROOT, k.key);
                    if (!fs.existsSync(kDir)) fs.mkdirSync(kDir, { recursive: true });
                    try {
                        const [bDb, pDb] = await Promise.all([readBarcodeDb(k.folderId), readPlanogramDb(k.folderId)]);
                        fs.writeFileSync(path.join(kDir, 'barcodes.json'), JSON.stringify(bDb, null, 2));
                        fs.writeFileSync(path.join(kDir, 'planograms.json'), JSON.stringify(pDb, null, 2));
                    } catch (err) {}
                }
            }
        } catch (e) {}
    }

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 2]: API GATEWAY (FULL AUTONOMY)
     * -------------------------------------------------------------------------------------
     */
    
    app.get('/storage/api/list', async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            const r = await drive.files.list({ 
                q: `'${folderId}' in parents and trashed = false`, 
                fields: 'files(id, name, mimeType, size, modifiedTime, iconLink, thumbnailLink)', 
                orderBy: 'folder, name' 
            });
            // Обучение системы новым файлам в фоне
            r.data.files.forEach(f => titaniumNeuralProcess({...f, parentId: folderId}));
            res.json(r.data.files);
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
            await titaniumNeuralProcess({ ...r.data, parentId: req.body.folderId }, 'sync', buffer);
            fs.unlinkSync(req.file.path);
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/delete', express.json(), async (req, res) => {
        try {
            const { id } = req.body;
            await drive.files.delete({ fileId: id });
            await titaniumNeuralProcess({ id }, 'delete');
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/mkdir', express.json(), async (req, res) => {
        try {
            const r = await drive.files.create({ 
                resource: { name: req.body.name, mimeType: 'application/vnd.google-apps.folder', parents: [req.body.parentId] },
                fields: 'id, name'
            });
            await titaniumNeuralProcess({ ...r.data, parentId: req.body.parentId, mimeType: 'folder' });
            res.json(r.data);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/mkfile', express.json(), async (req, res) => {
        try {
            const { name, parentId, type } = req.body;
            const r = await drive.files.create({
                resource: { name, parents: [parentId] },
                media: { mimeType: type, body: '' },
                fields: 'id, name, mimeType'
            });
            await titaniumNeuralProcess({ ...r.data, parentId }, 'sync');
            res.json(r.data);
        } catch (e) { res.status(500).send(e.message); }
    });

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 3]: ТИТАНОВЫЙ ИНТЕРФЕЙС (ULTRA-UI v144)
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
    
    <title>TITANIUM ULTRA v144</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --gold: #f0b90b; --bg: #050505; --safe-top: env(safe-area-inset-top); --safe-bottom: env(safe-area-inset-bottom); }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; outline: none; }
        
        body, html { 
            height: 100%; width: 100%; font-family: 'Roboto', sans-serif; 
            background: var(--bg); color: #fff; overflow: hidden; position: fixed;
        }

        header {
            height: calc(80px + var(--safe-top)); background: #000; border-bottom: 4px solid var(--gold);
            display: flex; align-items: flex-end; justify-content: space-between; 
            padding: 0 25px 15px; z-index: 5000; position: relative;
        }
        .logo { display: flex; align-items: center; gap: 15px; cursor: pointer; }
        .logo img { height: 40px; border-radius: 10px; box-shadow: 0 0 20px var(--gold); }
        .logo b { font-family: 'Google Sans'; font-size: 22px; letter-spacing: 1px; }

        .shell { display: flex; height: calc(100% - (80px + var(--safe-top))); width: 100%; background: #fff; color: #1a1a1b; }
        
        /* SIDEBAR TREE */
        aside {
            width: 300px; background: #0a0a0a; border-right: 2px solid #222;
            display: flex; flex-direction: column; transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
            z-index: 4000; color: #ccc;
        }
        @media (max-width: 900px) { aside { position: absolute; left: -300px; height: 100%; } aside.open { left: 0; box-shadow: 20px 0 60px rgba(0,0,0,0.8); } }

        .tree-header { padding: 25px; font-weight: 800; font-size: 11px; letter-spacing: 2px; color: var(--gold); border-bottom: 1px solid #222; }
        .nav-link {
            padding: 15px 25px; display: flex; align-items: center; gap: 15px; cursor: pointer; 
            font-size: 14px; font-weight: 500; transition: 0.2s; border-left: 4px solid transparent;
        }
        .nav-link:hover { background: #1a1a1a; color: #fff; }
        .nav-link.active { background: #1a1a1a; color: var(--gold); border-left-color: var(--gold); font-weight: 700; }
        .nav-link i { font-size: 18px; width: 25px; text-align: center; }

        main { flex: 1; display: flex; flex-direction: column; background: #fff; overflow: hidden; position: relative; }
        
        /* DASH BAR */
        .dash-bar { 
            padding: 12px 25px; background: #111; color: #fff; 
            display: flex; justify-content: space-between; align-items: center;
            font-size: 10px; font-weight: 800; border-bottom: 1px solid var(--gold);
        }
        .live-dot { width: 10px; height: 10px; background: #4caf50; border-radius: 50%; display: inline-block; margin-right: 8px; box-shadow: 0 0 10px #4caf50; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }

        .toolbar { padding: 15px 25px; display: flex; align-items: center; gap: 15px; border-bottom: 1px solid #eee; background: #fcfcfc; }
        .breadcrumb { flex: 1; font-weight: 700; font-size: 14px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .content { flex: 1; overflow-y: auto; padding-bottom: 100px; }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table tr { border-bottom: 1px solid #f9f9f9; transition: 0.2s; }
        .data-table tr:hover { background: #fdfdfd; }
        .data-table td { padding: 18px 25px; cursor: pointer; }
        
        /* ICONS & TYPES */
        .f-row { display: flex; align-items: center; gap: 20px; }
        .f-icon { width: 45px; height: 45px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
        .f-name { font-weight: 700; font-size: 15px; color: #333; }
        .f-meta { font-size: 11px; color: #999; margin-top: 4px; display: flex; gap: 10px; align-items: center; }
        .tag { font-size: 9px; padding: 2px 6px; border-radius: 4px; border: 1px solid; font-weight: 900; }
        
        .type-folder { background: #fff9c4; color: #fbc02d; }
        .type-image { background: #e3f2fd; color: #1e88e5; }
        .type-video { background: #fbe9e7; color: #d84315; }
        .type-pdf { background: #ffebee; color: #c62828; }
        .type-archive { background: #f3e5f5; color: #7b1fa2; }
        .type-default { background: #f5f5f5; color: #757575; }

        /* ACTIONS */
        .btn-action { width: 38px; height: 38px; border-radius: 10px; border: none; background: #eee; color: #555; cursor: pointer; transition: 0.2s; }
        .btn-action:hover { background: #ddd; color: #000; }
        .btn-del:hover { background: #ffebee; color: #c62828; }

        .fab {
            position: fixed; bottom: calc(30px + var(--safe-bottom)); right: 30px; width: 70px; height: 70px;
            border-radius: 22px; background: #000; border: 3px solid var(--gold);
            display: flex; align-items: center; justify-content: center; z-index: 6000;
            box-shadow: 0 15px 45px rgba(0,0,0,0.4); color: var(--gold); font-size: 28px;
            transition: 0.3s;
        }
        .fab:active { transform: scale(0.9); }

        /* MODALS & VIEWER */
        #pop { position: fixed; display: none; bottom: calc(110px + var(--safe-bottom)); right: 30px; background: #fff; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); z-index: 8000; min-width: 250px; overflow: hidden; border: 1px solid #eee; }
        .pop-item { padding: 18px 25px; display: flex; align-items: center; gap: 15px; cursor: pointer; font-weight: 700; color: #333; border-bottom: 1px solid #f5f5f5; transition: 0.2s; }
        .pop-item:hover { background: #f9f9f9; }
        
        #viewer { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 9500; flex-direction: column; }
        .v-h { height: calc(70px + var(--safe-top)); display: flex; align-items: flex-end; justify-content: space-between; padding: 0 25px 15px; color: #fff; background: #000; border-bottom: 1px solid #333; }
        .v-body { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .v-body img, .v-body video { max-width: 100%; max-height: 100%; object-fit: contain; }
        .v-body iframe { width: 100%; height: 100%; border: none; background: #fff; }

        #modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 10000; align-items: center; justify-content: center; }
        .m-card { background: #fff; width: 90%; max-width: 400px; padding: 30px; border-radius: 25px; color: #000; }
        .m-input { width: 100%; padding: 15px; border: 2px solid #eee; border-radius: 12px; margin: 15px 0; font-family: inherit; font-size: 16px; font-weight: 600; }
        .m-btn { width: 100%; padding: 15px; border-radius: 12px; border: none; background: var(--gold); font-weight: 900; cursor: pointer; font-size: 16px; }

        .loader { position: absolute; inset: 0; background: rgba(255,255,255,0.9); z-index: 100; display: flex; align-items: center; justify-content: center; display: none; }
    </style>
</head>
<body>

<header>
    <div class="logo" onclick="toggleSidebar()">
        <img src="${LOGO_URL}"> <b>TITANIUM <span style="color:var(--gold)">X-144</span></b>
    </div>
    <div id="sync-status" style="font-size: 9px; font-weight: 900; color: #666;">AUTONOMOUS INTEGRITY: OK</div>
</header>

<div class="shell">
    <aside id="sidebar">
        <div class="tree-header">НЕЙРОННОЕ ДЕРЕВО</div>
        <div class="nav-link active" id="n-root" onclick="nav('root', 'ВЕСЬ МАССИВ')"><i class="fa fa-layer-group"></i> Весь массив</div>
        <div class="nav-link" id="n-log" onclick="nav('${MY_ROOT_ID}', 'ЛОГИСТИКА X')"><i class="fa fa-truck-fast"></i> Логистика X</div>
        <div class="nav-link" id="n-merch" onclick="nav('${MERCH_ROOT_ID}', 'МЕРЧАНДАЙЗИНГ')"><i class="fa fa-boxes-packing"></i> Мерчандайзинг</div>
        
        <div style="margin-top: auto; padding: 25px; border-top: 1px solid #222;">
            <div style="font-size: 10px; color: #555; font-weight: 800; margin-bottom: 10px;">HYPER-MONOLITH ENGINE</div>
            <div style="height:4px; background:#222; border-radius:2px; overflow:hidden;">
                <div style="width:100%; height:100%; background:var(--gold);"></div>
            </div>
        </div>
    </aside>
    
    <main>
        <div class="loader" id="loading"><i class="fa fa-atom fa-spin fa-3x" style="color:var(--gold)"></i></div>
        
        <div class="dash-bar">
            <div style="display:flex; align-items:center;"><div class="live-dot"></div> <span id="node-info">CORE: STABLE</span></div>
            <div id="file-stats">0 ОБЪЕКТОВ</div>
        </div>

        <div class="toolbar">
            <div class="breadcrumb" id="bc">/ storage / root</div>
            <button class="btn-action" onclick="nav('root')"><i class="fa fa-house"></i></button>
            <button class="btn-action" onclick="refresh()"><i class="fa fa-rotate"></i></button>
        </div>

        <div class="content"><table class="data-table"><tbody id="f-body"></tbody></table></div>
    </main>
</div>

<div class="fab" onclick="togglePop(event)"><i class="fa fa-plus"></i></div>

<div id="pop">
    <div class="pop-item" onclick="openModal('folder')"><i class="fa fa-folder-plus"></i> Новая папка</div>
    <div class="pop-item" onclick="openModal('file')"><i class="fa fa-file-circle-plus"></i> Создать файл</div>
    <div class="pop-item" onclick="document.getElementById('fin').click()"><i class="fa fa-cloud-arrow-up"></i> Загрузить медиа</div>
</div>

<div id="viewer">
    <div class="v-h"><span id="v-title" style="font-weight:800; opacity:0.8;"></span> <i class="fa fa-circle-xmark" onclick="closeViewer()" style="font-size: 32px; color:var(--gold); cursor:pointer;"></i></div>
    <div class="v-body" id="v-content"></div>
</div>

<div id="modal">
    <div class="m-card">
        <h3 id="m-title">Действие</h3>
        <input type="text" id="m-input" class="m-input" placeholder="...">
        <select id="m-select" class="m-input" style="display:none">
            <option value="text/plain">Текстовый (.txt)</option>
            <option value="application/json">JSON (.json)</option>
            <option value="application/msword">Документ (.doc)</option>
        </select>
        <button class="m-btn" onclick="modalConfirm()">ПОДТВЕРДИТЬ</button>
        <button class="m-btn" onclick="closeModal()" style="background:#eee; margin-top:10px; color:#555;">ОТМЕНА</button>
    </div>
</div>

<input type="file" id="fin" style="display:none" multiple onchange="uploadFiles(this.files)">

<script>
    let curId = 'root'; 
    let mType = '';

    function toggleSidebar() { if(window.innerWidth < 900) document.getElementById('sidebar').classList.toggle('open'); }
    function togglePop(e) { e.stopPropagation(); const p = document.getElementById('pop'); p.style.display = p.style.display==='block'?'none':'block'; }
    window.onclick = () => document.getElementById('pop').style.display='none';

    async function nav(id, name = 'root') {
        curId = id;
        const body = document.getElementById('f-body');
        const loader = document.getElementById('loading');
        loader.style.display = 'flex';
        document.getElementById('bc').innerText = '/ storage / ' + name;
        
        try {
            const r = await fetch('/storage/api/list?folderId=' + id);
            const files = await r.json();
            render(files);
            updateNavUI(id);
        } catch(e) { body.innerHTML = '<tr><td style="text-align:center; padding:50px; color:red;">Ошибка соединения</td></tr>'; }
        finally { loader.style.display = 'none'; }
    }

    function updateNavUI(id) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        if(id === 'root') document.getElementById('n-root').classList.add('active');
        if(id === '${MY_ROOT_ID}') document.getElementById('n-log').classList.add('active');
        if(id === '${MERCH_ROOT_ID}') document.getElementById('n-merch').classList.add('active');
    }

    function getFileInfo(mime) {
        if(mime.includes('folder')) return {icon:'fa-folder', cls:'type-folder', tag:'FOLDER'};
        if(mime.includes('image')) return {icon:'fa-image', cls:'type-image', tag:'IMAGE'};
        if(mime.includes('video')) return {icon:'fa-play-circle', cls:'type-video', tag:'VIDEO'};
        if(mime.includes('pdf')) return {icon:'fa-file-pdf', cls:'type-pdf', tag:'PDF'};
        if(mime.includes('zip') || mime.includes('rar')) return {icon:'fa-file-zipper', cls:'type-archive', tag:'ARCHIVE'};
        return {icon:'fa-file-lines', cls:'type-default', tag:'FILE'};
    }

    function render(files) {
        const body = document.getElementById('f-body');
        document.getElementById('file-stats').innerText = files.length + ' ОБЪЕКТОВ';
        body.innerHTML = files.length ? '' : '<tr><td style="text-align:center; padding:100px; color:#aaa;">Сектор пуст</td></tr>';
        
        files.forEach(f => {
            const info = getFileInfo(f.mimeType);
            const tr = document.createElement('tr');
            tr.innerHTML = \`
                <td>
                    <div class="f-row">
                        <div class="f-icon \${info.cls}"><i class="fa \${info.icon}"></i></div>
                        <div style="flex:1">
                            <div class="f-name">\${f.name}</div>
                            <div class="f-meta">
                                <span class="tag" style="border-color:currentColor">\${info.tag}</span>
                                <span>\${(f.size/1024/1024 || 0).toFixed(1)} MB</span>
                                <span>\${new Date(f.modifiedTime).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div onclick="event.stopPropagation()">
                            <button class="btn-action btn-del" onclick="delAsset('\${f.id}')"><i class="fa fa-trash-can"></i></button>
                        </div>
                    </div>
                </td>
            \`;
            tr.onclick = () => f.mimeType.includes('folder') ? nav(f.id, f.name) : viewFile(f);
            body.appendChild(tr);
        });
    }

    async function delAsset(id) {
        if(!confirm('Удалить объект безвозвратно?')) return;
        await fetch('/storage/api/delete', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})});
        refresh();
    }

    function viewFile(f) {
        const v = document.getElementById('viewer');
        const c = document.getElementById('v-content');
        document.getElementById('v-title').innerText = f.name;
        v.style.display = 'flex';
        c.innerHTML = '';

        if(f.mimeType.includes('image')) {
            c.innerHTML = \`<img src="https://drive.google.com/uc?id=\${f.id}">\`;
        } else if(f.mimeType.includes('video')) {
            c.innerHTML = \`<video controls autoplay><source src="https://drive.google.com/uc?export=download&id=\${f.id}"></video>\`;
        } else {
            c.innerHTML = \`<iframe src="https://drive.google.com/file/d/\${f.id}/preview"></iframe>\`;
        }
    }

    function closeViewer() { 
        document.getElementById('viewer').style.display = 'none'; 
        document.getElementById('v-content').innerHTML = ''; 
    }

    function openModal(type) {
        mType = type;
        const m = document.getElementById('modal');
        document.getElementById('m-title').innerText = type === 'folder' ? 'НОВАЯ ПАПКА' : 'СОЗДАТЬ ФАЙЛ';
        document.getElementById('m-select').style.display = type === 'file' ? 'block' : 'none';
        document.getElementById('m-input').value = '';
        m.style.display = 'flex';
    }

    function closeModal() { document.getElementById('modal').style.display = 'none'; }

    async function modalConfirm() {
        const name = document.getElementById('m-input').value;
        if(!name) return;
        const loader = document.getElementById('loading');
        loader.style.display = 'flex';
        closeModal();

        const endpoint = mType === 'folder' ? '/storage/api/mkdir' : '/storage/api/mkfile';
        const body = { name, parentId: curId };
        if(mType === 'file') body.type = document.getElementById('m-select').value;

        await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        refresh();
    }

    async function uploadFiles(files) {
        const loader = document.getElementById('loading');
        loader.style.display = 'flex';
        for(let f of files) {
            const fd = new FormData();
            fd.append('file', f);
            fd.append('folderId', curId);
            await fetch('/storage/api/upload', {method:'POST', body:fd});
        }
        refresh();
    }

    function refresh() { nav(curId, document.getElementById('bc').innerText.split('/').pop().trim()); }

    nav('root');
</script>
</body>
</html>
    `;

    app.get('/storage', (req, res) => res.send(UI));

    console.log("🦾 TITANIUM v144.0 HYPER-MONOLITH | NEURAL CORE ONLINE");
};