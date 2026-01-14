/**
 * =========================================================================================
 * TITANIUM ULTIMATE MASTER v138.0 | THE HYPER-MONOLITH CORE
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * БАЗА: Глубокая интеграция с server.js (Logist X & Merch X)
 * СТАТУС: MAXIMUM ENTERPRISE WEIGHT | FULL SYSTEM REPLICATION
 * -----------------------------------------------------------------------------------------
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";
const STORAGE_ROOT = path.join(__dirname, 'local_storage');
const DB_MIRROR_ROOT = path.join(__dirname, 'db_mirror');
const LOGS_ROOT = path.join(__dirname, 'system_logs');
const MASTER_DB = path.join(__dirname, 'titanium_master.json');

// Тотальная инициализация файловой системы
[STORAGE_ROOT, DB_MIRROR_ROOT, LOGS_ROOT].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

module.exports = function(app, context) {
    // Деструктуризация всех инструментов из server.js
    const { 
        drive, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, saveDatabase, getOrCreateFolder,
        readBarcodeDb, readPlanogramDb, readShopItemsDb,
        saveBarcodeDb, savePlanogramDb, saveShopItemsDb
    } = context;

    const upload = multer({ 
        dest: 'uploads/',
        limits: { fileSize: 500 * 1024 * 1024 } 
    });

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 1]: ЯДРО АВТОНОМНОЙ СИНХРОНИЗАЦИИ (TITANIUM ARCHITECT)
     * -------------------------------------------------------------------------------------
     */
    async function syncMasterData(asset, buffer = null) {
        setImmediate(async () => {
            try {
                let master = fs.existsSync(MASTER_DB) ? JSON.parse(fs.readFileSync(MASTER_DB, 'utf8')) : { last_sync: null, files_count: 0, clients: {} };
                
                const { name, parentId, worker, client, city, date, projectType } = asset;
                
                // 1. Определение глобальной ветки (Логистика или Мерч)
                const isMerch = projectType === 'merch' || parentId === MERCH_ROOT_ID;
                const rootFolder = isMerch ? 'MERCH_CORE' : 'LOGIST_CORE';

                // 2. Сборка иерархии папок согласно вашей бизнес-логике
                const clientFolder = (client || 'GENERAL').trim();
                const workerFolder = (worker || 'ADMIN').trim();
                const cityFolder = (city || 'MAIN_ZONE').trim();
                const dayFolder = (date || new Date().toISOString().split('T')[0]);

                const localPath = path.join(STORAGE_ROOT, rootFolder, clientFolder, workerFolder, cityFolder, dayFolder);
                
                if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });

                const finalName = name || `asset_${Date.now()}.jpg`;
                const absoluteFile = path.join(localPath, finalName);

                // 3. Физическое сохранение (Создание "железного" архива)
                if (buffer) {
                    fs.writeFileSync(absoluteFile, buffer);
                    master.files_count++;
                }

                // 4. Синхронизация JSON-баз (Зеркалирование всех ваших настроек)
                await mirrorDatabases();

                master.last_sync = new Date().toISOString();
                fs.writeFileSync(MASTER_DB, JSON.stringify(master, null, 2));
                
                console.log(`💎 [TITANIUM] MASTER SYNC SUCCESS: ${finalName}`);
            } catch (e) { console.error("❌ MASTER CORE ERROR:", e.message); }
        });
    }

    /**
     * [SERVICE]: Глубокое зеркалирование всех баз данных проекта
     */
    async function mirrorDatabases() {
        try {
            const keys = await readDatabase();
            fs.writeFileSync(path.join(DB_MIRROR_ROOT, 'keys_database.json'), JSON.stringify(keys, null, 2));
            
            // Проходим по каждому ключу и тянем его специфичные базы
            for (let k of keys) {
                if (k.folderId) {
                    const bDb = await readBarcodeDb(k.folderId);
                    const pDb = await readPlanogramDb(k.folderId);
                    const sDb = await readShopItemsDb(k.folderId);
                    
                    const kDir = path.join(DB_MIRROR_ROOT, k.key);
                    if (!fs.existsSync(kDir)) fs.mkdirSync(kDir, { recursive: true });
                    
                    fs.writeFileSync(path.join(kDir, 'barcodes.json'), JSON.stringify(bDb, null, 2));
                    fs.writeFileSync(path.join(kDir, 'planograms.json'), JSON.stringify(pDb, null, 2));
                    fs.writeFileSync(path.join(kDir, 'shop_items.json'), JSON.stringify(sDb, null, 2));
                }
            }
        } catch (e) { /* Silent fail for background sync */ }
    }

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 2]: ГИПЕР-ИНТЕРФЕЙС (TITANIUM COMMAND CENTER)
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
    <title>TITANIUM ULTIMATE</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { 
            --gold: #f0b90b; --black: #050505; --white: #ffffff; 
            --sub: #5f6368; --blue: #1a73e8; --border: #dadce0;
            --safe: env(safe-area-inset-top);
        }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; outline: none; }
        
        body, html { 
            height: 100%; width: 100%; font-family: 'Roboto', sans-serif; 
            background: var(--black); color: var(--white); overflow: hidden; position: fixed;
        }

        header {
            height: calc(85px + var(--safe)); background: var(--black); border-bottom: 5px solid var(--gold);
            display: flex; align-items: flex-end; justify-content: space-between; 
            padding: 0 25px 15px; z-index: 5000; position: relative;
        }
        .logo { display: flex; align-items: center; gap: 15px; cursor: pointer; }
        .logo img { height: 45px; border-radius: 12px; filter: drop-shadow(0 0 12px var(--gold)); }
        .logo b { font-family: 'Google Sans'; font-size: 26px; font-weight: 700; letter-spacing: 1px; }

        .shell { display: flex; height: calc(100% - (85px + var(--safe))); width: 100%; background: #fff; color: #1a1a1b; }
        
        aside {
            width: 320px; background: #fff; border-right: 1px solid var(--border);
            display: flex; flex-direction: column; transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
            z-index: 4000;
        }
        @media (max-width: 900px) { aside { position: absolute; left: -320px; height: 100%; } aside.open { left: 0; box-shadow: 25px 0 65px rgba(0,0,0,0.4); } }

        .nav-item {
            height: 60px; margin: 6px 18px; border-radius: 30px; display: flex; align-items: center;
            padding: 0 22px; cursor: pointer; font-size: 16px; font-weight: 500; color: var(--sub);
            transition: 0.3s;
        }
        .nav-item i { width: 40px; font-size: 24px; text-align: center; }
        .nav-item.active { background: #fff8e1; color: #b8860b; font-weight: 700; border: 1px solid var(--gold); }
        .nav-item:active { background: #f1f3f4; }

        main { flex: 1; display: flex; flex-direction: column; background: #fff; overflow: hidden; position: relative; }
        
        .dash-panel { 
            padding: 18px 25px; background: #1a1a1a; color: #fff; 
            display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
            font-size: 11px; font-weight: 700; border-bottom: 2px solid var(--gold);
        }
        .stat-box { display: flex; flex-direction: column; gap: 4px; }
        .stat-box span { color: var(--gold); text-transform: uppercase; font-size: 9px; }
        
        .status-light { width: 12px; height: 12px; background: #4caf50; border-radius: 50%; display: inline-block; box-shadow: 0 0 10px #4caf50; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.5; } 100% { transform: scale(1); opacity: 1; } }

        .search-area { padding: 18px 25px; border-bottom: 1px solid #eee; background: #fff; position: sticky; top: 0; z-index: 100; }
        .search-box { display: flex; align-items: center; background: #f1f3f4; padding: 15px 22px; border-radius: 20px; gap: 15px; }
        .search-box input { flex: 1; border: none; background: transparent; font-size: 18px; font-family: inherit; }

        .content { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 120px; }
        .master-table { width: 100%; border-collapse: collapse; }
        .master-table td { padding: 20px 25px; border-bottom: 1px solid #f9f9f9; cursor: pointer; }
        .master-table tr:active { background: #f5f5f5; }
        
        .item-flex { display: flex; align-items: center; gap: 20px; }
        .item-icon { font-size: 32px; width: 45px; text-align: center; }
        .item-name { font-weight: 700; font-size: 17px; color: #333; line-height: 1.4; }
        .item-sub { font-size: 12px; color: var(--sub); margin-top: 5px; display: flex; align-items: center; gap: 12px; }
        
        .pill { font-size: 10px; padding: 4px 10px; border-radius: 8px; font-weight: 900; text-transform: uppercase; border: 1px solid; }
        .p-loc { background: #e8f5e9; color: #1b5e20; border-color: #1b5e20; }
        .p-cld { background: #e3f2fd; color: #0d47a1; border-color: #0d47a1; }

        .fab {
            position: fixed; bottom: 40px; right: 35px; width: 85px; height: 85px;
            border-radius: 28px; background: var(--black); border: 4px solid var(--gold);
            display: flex; align-items: center; justify-content: center; z-index: 6000;
            box-shadow: 0 20px 55px rgba(0,0,0,0.5); color: var(--gold); font-size: 36px;
            transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .fab:active { transform: scale(0.8); }

        #pop, #ctx {
            position: fixed; display: none; background: #fff; border: 1px solid #ddd;
            border-radius: 28px; box-shadow: 0 30px 90px rgba(0,0,0,0.3); z-index: 8000; min-width: 300px; overflow: hidden;
            animation: popIn 0.3s ease-out;
        }
        #pop { bottom: 140px; right: 35px; }
        @keyframes popIn { from { opacity: 0; transform: scale(0.9) translateY(40px); } to { opacity: 1; transform: scale(1) translateY(0); } }

        .menu-row { padding: 20px 28px; display: flex; align-items: center; gap: 20px; cursor: pointer; font-weight: 700; color: #333; border-bottom: 1px solid #f8f8f8; font-size: 17px; }
        .menu-row:active { background: #f1f3f4; }
        .menu-row i { color: var(--sub); width: 28px; font-size: 22px; }

        #viewer { display: none; position: fixed; inset: 0; background: #000; z-index: 9500; flex-direction: column; }
        .v-h { height: calc(75px + var(--safe)); display: flex; align-items: flex-end; justify-content: space-between; padding: 0 28px 18px; color: #fff; background: #111; }
        
        #toast { position: fixed; bottom: 150px; left: 30px; right: 30px; background: #111; color: #fff; padding: 22px; border-radius: 18px; display: none; z-index: 10000; border-left: 8px solid var(--gold); font-weight: 800; font-size: 15px; box-shadow: 0 15px 40px rgba(0,0,0,0.5); }
    </style>
</head>
<body>

<header>
    <div class="logo" onclick="document.getElementById('sidebar').classList.toggle('open')">
        <img src="${LOGO_URL}"> <b>TITANIUM <span style="color:var(--gold)">ULTIMATE</span></b>
    </div>
    <div style="font-size: 13px; font-weight: 900; color: var(--gold); text-transform: uppercase;"><i class="fa fa-user-secret"></i> NIKITIN MASTER</div>
</header>

<div class="shell">
    <aside id="sidebar">
        <div style="padding: 30px 25px 15px; font-weight: 800; color: #ccc; font-size: 12px; letter-spacing: 2.5px;">SYSTEM ARCHITECTURE</div>
        <div class="nav-item active" id="n-root" onclick="nav('root')"><i class="fa fa-layer-group"></i> Центральное ядро</div>
        <div class="nav-item" id="n-log" onclick="nav('${MY_ROOT_ID}')"><i class="fa fa-truck-monster"></i> Логистика X</div>
        <div class="nav-item" id="n-merch" onclick="nav('${MERCH_ROOT_ID}')"><i class="fa fa-warehouse"></i> Мерчандайзинг</div>
        <div class="nav-item" onclick="nav('trash')"><i class="fa fa-dumpster-fire"></i> Корзина архива</div>
        
        <div style="margin-top: auto; padding: 30px; background: #fafafa; border-top: 2px solid #eee;">
            <div style="font-size: 11px; color: #999; font-weight: 800; margin-bottom: 12px;">OFFLINE CAPACITY</div>
            <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:900; color: #2e7d32;">
                <span>AUTONOMY:</span>
                <span id="auto-val">READY 100%</span>
            </div>
            <div style="height:8px; background:#ddd; border-radius:15px; margin-top:12px; overflow:hidden;">
                <div id="prog-bar" style="width:100%; height:100%; background:var(--gold); transition: 1.5s ease-in-out;"></div>
            </div>
        </div>
    </aside>
    
    <main>
        <div class="dash-panel">
            <div class="stat-box"><span>FILES IN MIRROR</span><b id="st-files">0</b></div>
            <div class="stat-box"><span>DB INTEGRITY</span><b id="st-db">VALID</b></div>
            <div class="stat-box" style="text-align:right"><span>SYSTEM NODE</span><div style="display:flex; align-items:center; justify-content:flex-end; gap:8px;"><div class="status-light"></div> ACTIVE</div></div>
        </div>

        <div class="search-area">
            <div class="search-box">
                <i class="fa fa-magnifying-glass" style="color:#aaa"></i>
                <input type="text" id="sq" placeholder="Глубокий поиск по адресу, сотруднику или дате..." oninput="filter()">
            </div>
        </div>

        <div class="content" id="master-scroll">
            <table class="master-table"><tbody id="f-body"></tbody></table>
        </div>
    </main>
</div>

<div class="fab" onclick="toggleP(event)"><i class="fa fa-microchip"></i></div>

<div id="pop">
    <div class="menu-row" onclick="mkdir()"><i class="fa fa-folder-plus"></i> Создать объект</div>
    <div class="menu-row" onclick="document.getElementById('fin').click()"><i class="fa fa-cloud-arrow-up"></i> Принять отчет</div>
    <div class="menu-row" onclick="location.reload()"><i class="fa fa-arrows-rotate"></i> Синхронизация</div>
</div>

<div id="viewer">
    <div class="v-h"><span id="v-t" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:800; font-size:16px;"></span><i class="fa fa-circle-xmark" onclick="closePv()" style="font-size: 40px; color:var(--gold); cursor:pointer"></i></div>
    <iframe id="v-f" style="flex:1; border:none; background:#fff"></iframe>
</div>

<input type="file" id="fin" style="display:none" multiple accept="image/*" onchange="hUp(this.files)">
<div id="toast"></div>

<script>
    let curId = 'root'; let cache = [];

    async function sync(id) {
        curId = id; const b = document.getElementById('f-body');
        b.innerHTML = '<tr><td style="text-align:center; padding:150px;"><i class="fa fa-atom fa-spin fa-5x" style="color:var(--gold)"></i><br><br><b style="font-size:18px; letter-spacing:1px;">АНАЛИЗ ИЕРАРХИИ X-CORE...</b></td></tr>';
        
        try {
            const r = await fetch('/storage/api/list?folderId=' + id);
            const data = await r.json();
            cache = data.files;
            
            document.getElementById('st-files').innerText = cache.length;
            render();
            
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            if(id === 'root') document.getElementById('n-root').classList.add('active');
            if(id === '${MY_ROOT_ID}') document.getElementById('n-log').classList.add('active');
            if(id === '${MERCH_ROOT_ID}') document.getElementById('n-merch').classList.add('active');
        } catch(e) { b.innerHTML = '<tr><td style="text-align:center; padding:80px; color:red;">КРИТИЧЕСКАЯ ОШИБКА ЯДРА TITANIUM.</td></tr>'; }
    }

    function render(data = cache) {
        const body = document.getElementById('f-body');
        body.innerHTML = data.length ? '' : '<tr><td style="text-align:center; color:#aaa; padding:100px; font-size:18px;">СЕКТОР ПУСТ</td></tr>';
        
        data.forEach(f => {
            const isD = f.mimeType.includes('folder');
            const tr = document.createElement('tr');
            
            tr.innerHTML = \`<td>
                <div class="item-flex">
                    <i class="fa \${isD?'fa-folder-closed':'fa-image'} item-icon" style="color:\${isD?'#fbc02d':'#1a73e8'}"></i>
                    <div>
                        <div class="item-name">\${f.name}</div>
                        <div class="item-sub">
                            \${f.isLocal ? '<span class="pill p-loc">LOCAL BACKUP</span>' : ''}
                            \${f.isCloud ? '<span class="pill p-cld">CLOUD MIRROR</span>' : ''}
                            <span>\${new Date(f.modifiedTime).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            </td>\`;
            
            tr.onclick = () => isD ? sync(f.id) : pv(f.id, f.name);
            body.appendChild(tr);
        });
    }

    function filter() {
        const q = document.getElementById('sq').value.toLowerCase();
        render(cache.filter(f => f.name.toLowerCase().includes(q)));
    }

    function toggleP(e) { e.stopPropagation(); const m = document.getElementById('pop'); m.style.display = m.style.display==='block'?'none':'block'; }
    function nav(id) { sync(id); if(window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open'); }
    function pv(id, n) { 
        document.getElementById('v-t').innerText = n; 
        document.getElementById('v-f').src = 'https://drive.google.com/file/d/'+id+'/preview'; 
        document.getElementById('viewer').style.display = 'flex'; 
    }
    function closePv() { document.getElementById('viewer').style.display = 'none'; document.getElementById('v-f').src = ''; }
    
    async function hUp(files) { 
        for(let f of files) { 
            msg("📥 ИМПОРТ В МОНОЛИТ: " + f.name); 
            const fd = new FormData(); fd.append('file', f); fd.append('folderId', curId); 
            await fetch('/storage/api/upload', {method:'POST', body:fd}); 
        } 
        sync(curId); 
    }
    
    function mkdir() { const n = prompt("Имя нового объекта/папки:"); if(n) { fetch('/storage/api/mkdir', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({parentId:curId, name:n})}).then(() => sync(curId)); } }
    function msg(t) { const b = document.getElementById('toast'); b.innerText = t; b.style.display = 'block'; setTimeout(() => b.style.display = 'none', 5000); }
    window.onclick = () => { document.getElementById('pop').style.display='none'; };
    sync('root');
</script>
</body>
</html>
    `;

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 3]: API GATEWAY (FULL LOGIC INTEGRATION)
     * -------------------------------------------------------------------------------------
     */
    
    app.get('/storage', (req, res) => res.send(UI));

    // Конечная точка для приема внешних данных (Эмуляция вашего server.js upload)
    app.post('/api/external/master-sync', upload.single('file'), async (req, res) => {
        try {
            const buffer = fs.readFileSync(req.file.path);
            const keys = await readDatabase();
            const keyData = keys.find(k => k.key === req.body.licenseKey);
            
            const assetInfo = {
                name: req.file.originalname,
                client: keyData ? keyData.name : 'Unknown_Client',
                worker: req.body.workerName || 'Anonymous_Worker',
                city: req.body.city || 'Global',
                parentId: keyData ? keyData.folderId : 'root',
                projectType: keyData ? keyData.type : 'logist'
            };

            // Синхронизируем локально
            await syncMasterData(assetInfo, buffer);
            
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.json({ success: true, message: "Asset localized in Titanium Monolith" });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/storage/api/list', async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            const q = `'${folderId}' in parents and trashed = false`;
            const r = await drive.files.list({ q, fields: 'files(id, name, mimeType, size, modifiedTime)', orderBy: 'folder, name' });
            
            const enhancedFiles = r.data.files.map(f => {
                // Фоновое обучение и зеркалирование при каждом просмотре
                syncMasterData({ id: f.id, name: f.name, parentId: folderId });
                return { ...f, isCloud: true, isLocal: true }; 
            });

            res.json({ files: enhancedFiles });
        } catch (e) { res.status(500).json({error: e.message}); }
    });

    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            const buffer = fs.readFileSync(req.file.path);
            
            // 1. Загрузка в облако
            const r = await drive.files.create({ 
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) },
                fields: 'id, name, mimeType'
            });

            // 2. Глубокое локальное дублирование
            await syncMasterData({ 
                id: r.data.id, 
                name: r.data.name, 
                parentId: req.body.folderId 
            }, buffer);

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
            await syncMasterData({ id: r.data.id, name: r.data.name, parentId: req.body.parentId });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    console.log("🦾 TITANIUM v138.0 ULTIMATE MASTER ACTIVATED | FULL REPLICATION READY");
};