/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v144.0 | THE OMEGA-MONOLITH "ULTRA-INSTINCT"
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * БАЗА: Тотальная интеграция с Logist X & Merch X
 * СТАТУС: SUPREME AUTONOMY | FULL SYSTEM RECONSTRUCTION
 * -----------------------------------------------------------------------------------------
 * Этот файл является центральным узлом управления (Hyper-Monolith), обеспечивающим 
 * автономную работу, синхронизацию данных и визуализацию процессов.
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- ГЛОБАЛЬНЫЕ КОНСТАНТЫ И ПУТИ ХРАНЕНИЯ ---
const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";
const STORAGE_ROOT = path.join(__dirname, 'local_storage');
const DB_MIRROR_ROOT = path.join(__dirname, 'db_mirror');
const REPORT_LEDGER_DIR = path.join(__dirname, 'local_storage/reports_shadow_ledger');
const NEURAL_INDEX = path.join(__dirname, 'titanium_neural_map.json');
const SYSTEM_LOGS = path.join(__dirname, 'local_storage/system_logs.json');

// Глубокая инициализация архитектуры хранения
const dirs = [STORAGE_ROOT, DB_MIRROR_ROOT, REPORT_LEDGER_DIR];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * -------------------------------------------------------------------------------------
 * ЭКСПОРТ МОДУЛЯ ТИТАН
 * -------------------------------------------------------------------------------------
 */
module.exports = function(app, context) {
    // Деструктуризация инструментов из контекста основного сервера (Logist X Core)
    const { 
        drive, google, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, saveDatabase, getOrCreateFolder,
        readBarcodeDb, readPlanogramDb, readShopItemsDb,
        sheets
    } = context;

    // Настройка Multer для обработки сверхтяжелых медиа-данных (Ultra-High Resolution)
    const upload = multer({ 
        dest: 'uploads/',
        limits: { fileSize: 1024 * 1024 * 1024 } // 1GB Limit
    });

    /**
     * -------------------------------------------------------------------------------------
     * [БЛОК 1]: НЕЙРОННЫЙ АРХИТЕКТОР (ЛОГИКА И СИНХРОНИЗАЦИЯ)
     * -------------------------------------------------------------------------------------
     */
    
    // Функция глубокого анализа путей (Resolve Path Tree)
    async function resolveDeepPath(folderId) {
        let chain = [];
        try {
            let current = folderId;
            const roots = [MY_ROOT_ID, MERCH_ROOT_ID, 'root', undefined, null];
            while (current && !roots.includes(current)) {
                const info = await drive.files.get({ fileId: current, fields: 'id, name, parents' });
                if (!info.data.name) break;
                chain.unshift({ id: info.data.id, name: info.data.name });
                current = (info.data.parents) ? info.data.parents[0] : null;
                if (chain.length > 20) break; // Защита от бесконечных циклов
            }
        } catch (e) {
            logSystemEvent("PATH_RESOLUTION_ERROR", { folderId, error: e.message });
        }
        return chain;
    }

    // Главный процесс обучения нейронного индекса (Learning Cycle)
    async function titaniumNeuralProcess(asset, buffer = null, isDelete = false) {
        setImmediate(async () => {
            try {
                let index = { stats: { files: 0, syncs: 0, lastActivity: Date.now() }, map: {} };
                if (fs.existsSync(NEURAL_INDEX)) {
                    try { index = JSON.parse(fs.readFileSync(NEURAL_INDEX, 'utf8')); } catch(e) {}
                }
                
                if (isDelete) {
                    delete index.map[asset.id];
                } else {
                    const { id, name, parentId, mimeType } = asset;
                    const folderChain = await resolveDeepPath(parentId);
                    const isMerch = (parentId === MERCH_ROOT_ID || folderChain.some(c => c.name.toLowerCase().includes('мерч')));
                    const projectNode = isMerch ? 'MERCH_CORE' : 'LOGIST_CORE';

                    // Зеркалирование на физический диск сервера
                    if (buffer && name) {
                        const localDirPath = path.join(STORAGE_ROOT, projectNode, ...folderChain.map(c => c.name));
                        if (!fs.existsSync(localDirPath)) fs.mkdirSync(localDirPath, { recursive: true });
                        fs.writeFileSync(path.join(localDirPath, name), buffer);
                        index.stats.files++;
                    }

                    index.map[id] = {
                        name,
                        parentId,
                        mimeType,
                        path: folderChain.map(c => c.name).join('/'),
                        project: projectNode,
                        updatedAt: Date.now()
                    };
                }

                index.stats.syncs++;
                index.stats.lastActivity = Date.now();
                fs.writeFileSync(NEURAL_INDEX, JSON.stringify(index, null, 2));
                
                // Автоматическое зеркалирование баз при каждом крупном обновлении
                if (index.stats.syncs % 5 === 0) await autoMirrorDatabases();

            } catch (e) { console.error("❌ NEURAL CORE RECONSTRUCTION FAILED:", e.message); }
        });
    }

    // Функция ведения системных логов
    function logSystemEvent(type, data) {
        let logs = [];
        if (fs.existsSync(SYSTEM_LOGS)) logs = JSON.parse(fs.readFileSync(SYSTEM_LOGS, 'utf8'));
        logs.unshift({ ts: Date.now(), type, ...data });
        if (logs.length > 500) logs = logs.slice(0, 500);
        fs.writeFileSync(SYSTEM_LOGS, JSON.stringify(logs, null, 2));
    }

    // Глубокое зеркалирование всех системных JSON баз (Backup Logic)
    async function autoMirrorDatabases() {
        try {
            const keys = await readDatabase();
            fs.writeFileSync(path.join(DB_MIRROR_ROOT, 'keys_database.json'), JSON.stringify(keys, null, 2));
            
            for (let k of keys) {
                if (k.folderId) {
                    const kDir = path.join(DB_MIRROR_ROOT, k.key);
                    if (!fs.existsSync(kDir)) fs.mkdirSync(kDir, { recursive: true });
                    
                    const [bDb, pDb, sDb] = await Promise.all([
                        readBarcodeDb(k.folderId).catch(() => []),
                        readPlanogramDb(k.folderId).catch(() => []),
                        readShopItemsDb(k.folderId).catch(() => [])
                    ]);
                    
                    fs.writeFileSync(path.join(kDir, 'barcodes.json'), JSON.stringify(bDb, null, 2));
                    fs.writeFileSync(path.join(kDir, 'planograms.json'), JSON.stringify(pDb, null, 2));
                    fs.writeFileSync(path.join(kDir, 'shop_items.json'), JSON.stringify(sDb, null, 2));
                }
            }
        } catch (e) { logSystemEvent("MIRROR_ERROR", { error: e.message }); }
    }

    /**
     * -------------------------------------------------------------------------------------
     * [БЛОК 2]: PWA & MANIFEST (OFFLINE ACCESS)
     * -------------------------------------------------------------------------------------
     */
    app.get('/manifest.json', (req, res) => {
        res.json({
            "name": "TITANIUM OMEGA",
            "short_name": "Titanium",
            "description": "Supreme File Management Monolith for Logist X",
            "start_url": "/storage",
            "display": "standalone",
            "background_color": "#050505",
            "theme_color": "#f0b90b",
            "orientation": "portrait",
            "icons": [
                { "src": LOGO_URL, "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
                { "src": LOGO_URL, "sizes": "512x512", "type": "image/png" }
            ]
        });
    });

    app.get('/sw.js', (req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.send(`
            const CACHE_NAME = 'titanium-omega-v144';
            const ASSETS = ['/storage', '${LOGO_URL}'];
            self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))));
            self.addEventListener('fetch', (e) => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
        `);
    });

    /**
     * -------------------------------------------------------------------------------------
     * [БЛОК 3]: ТИТАНОВЫЙ ИНТЕРФЕЙС (ULTRA-UI v144 OMEGA)
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

    <title>TITANIUM OMEGA</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@700;900&family=Roboto:wght@300;400;500;700;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <style>
        /* --- CORE STYLES (OMEGA DESIGN SYSTEM) --- */
        :root { 
            --gold: #f0b90b; 
            --gold-dark: #b8860b;
            --bg: #050505; 
            --bg-card: #111111;
            --safe-top: env(safe-area-inset-top); 
            --safe-bottom: env(safe-area-inset-bottom);
            --glass: rgba(255, 255, 255, 0.05);
            --transition: 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
        }

        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; outline: none; }
        
        body, html { 
            height: 100%; width: 100%; font-family: 'Roboto', sans-serif; 
            background: var(--bg); color: #fff; overflow: hidden; position: fixed;
        }

        /* --- HEADER & NAVIGATION --- */
        header {
            height: calc(90px + var(--safe-top)); background: var(--bg); border-bottom: 5px solid var(--gold);
            display: flex; align-items: flex-end; justify-content: space-between; 
            padding: 0 25px 15px; z-index: 5000; position: relative;
            box-shadow: 0 10px 40px rgba(0,0,0,0.8);
        }
        .logo { display: flex; align-items: center; gap: 15px; cursor: pointer; transition: var(--transition); }
        .logo:active { transform: scale(0.95); opacity: 0.8; }
        .logo img { height: 48px; border-radius: 12px; box-shadow: 0 0 25px var(--gold); border: 2px solid var(--gold); }
        .logo b { font-family: 'Google Sans'; font-size: 26px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 900; }
        .logo span { color: var(--gold); }

        .shell { display: flex; height: calc(100% - (90px + var(--safe-top))); width: 100%; background: #fff; color: #1a1a1b; position: relative; }
        
        aside {
            width: 320px; background: #fff; border-right: 1px solid #ddd;
            display: flex; flex-direction: column; transition: var(--transition); z-index: 4000;
        }
        @media (max-width: 900px) { 
            aside { position: absolute; left: -320px; height: 100%; } 
            aside.open { left: 0; box-shadow: 30px 0 100px rgba(0,0,0,0.6); } 
        }

        .nav-link {
            height: 60px; margin: 8px 18px; border-radius: 20px; display: flex; align-items: center;
            padding: 0 22px; cursor: pointer; font-size: 16px; font-weight: 800; color: #5f6368; transition: var(--transition);
        }
        .nav-link i { width: 40px; font-size: 22px; text-align: center; }
        .nav-link.active { background: #fff8e1; color: var(--gold-dark); border: 2px solid var(--gold); box-shadow: 0 5px 15px rgba(240,185,11,0.2); }
        .nav-link:hover { background: #f1f3f4; }

        /* --- MAIN VIEWPORT --- */
        main { flex: 1; display: flex; flex-direction: column; background: #fff; overflow: hidden; position: relative; }
        
        /* Breadcrumbs (Tree Navigator) */
        .tree-nav {
            padding: 18px 25px; background: #f8f9fa; border-bottom: 1px solid #eee;
            display: flex; align-items: center; gap: 12px; overflow-x: auto; white-space: nowrap;
            scrollbar-width: none;
        }
        .tree-nav::-webkit-scrollbar { display: none; }
        .tree-step { font-weight: 900; color: var(--gold-dark); cursor: pointer; font-size: 14px; text-transform: uppercase; transition: 0.2s; }
        .tree-step:hover { color: #000; }
        .tree-step.last { color: #333; cursor: default; }
        .tree-sep { color: #ccc; font-weight: 300; }

        .dash-bar { 
            padding: 15px 25px; background: #111; color: #fff; 
            display: flex; justify-content: space-between; align-items: center;
            font-size: 11px; font-weight: 900; border-bottom: 2px solid var(--gold);
            letter-spacing: 1px;
        }
        .live-dot { width: 10px; height: 10px; background: #4caf50; border-radius: 50%; display: inline-block; margin-right: 8px; box-shadow: 0 0 12px #4caf50; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }

        .search-area { padding: 20px 25px; border-bottom: 1px solid #eee; background: #fff; }
        .search-box { display: flex; align-items: center; background: #f1f3f4; padding: 15px 22px; border-radius: 20px; gap: 15px; border: 2px solid transparent; transition: 0.3s; }
        .search-box:focus-within { border-color: var(--gold); background: #fff; box-shadow: 0 5px 20px rgba(0,0,0,0.05); }
        .search-box input { flex: 1; border: none; background: transparent; font-size: 18px; font-weight: 600; font-family: inherit; }

        /* --- DATA GRID --- */
        .content { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: calc(120px + var(--safe-bottom)); background: #fff; }
        .data-grid { width: 100%; border-collapse: collapse; }
        .data-grid tr { transition: 0.2s; }
        .data-grid tr:hover { background: #fcfcfc; }
        .data-grid td { padding: 18px 25px; border-bottom: 1px solid #f2f2f2; position: relative; }
        
        .f-item { display: flex; align-items: center; gap: 20px; }
        .f-icon-wrap { 
            width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; 
            border-radius: 15px; background: #f8f9fa; border: 1px solid #eee; overflow: hidden; 
            flex-shrink: 0; box-shadow: 0 4px 10px rgba(0,0,0,0.05);
        }
        .f-icon { font-size: 30px; }
        .f-thumb { width: 100%; height: 100%; object-fit: cover; }
        
        .f-info { flex: 1; min-width: 0; cursor: pointer; }
        .f-name { font-weight: 800; font-size: 17px; color: #222; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 4px; }
        .f-meta { font-size: 12px; color: #888; font-weight: 700; display: flex; align-items: center; gap: 15px; }
        .f-meta span { display: flex; align-items: center; gap: 5px; }

        .f-actions { display: flex; gap: 12px; }
        .btn-action { 
            width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; 
            cursor: pointer; transition: var(--transition); font-size: 18px; border: 1px solid #eee;
        }
        .btn-del { background: #fff5f5; color: #d32f2f; border-color: #ffcdd2; }
        .btn-del:active { background: #d32f2f; color: #fff; transform: scale(0.9); }
        .btn-view { background: #f0f7ff; color: #1a73e8; border-color: #c6e2ff; }

        /* --- UI COMPONENTS --- */
        .fab {
            position: fixed; bottom: calc(35px + var(--safe-bottom)); right: 30px; width: 85px; height: 85px;
            border-radius: 28px; background: var(--bg); border: 5px solid var(--gold);
            display: flex; align-items: center; justify-content: center; z-index: 6000;
            box-shadow: 0 15px 50px rgba(0,0,0,0.6); color: var(--gold); font-size: 36px;
            transition: var(--transition);
        }
        .fab:active { transform: scale(0.85) rotate(90deg); }

        #pop { 
            position: fixed; display: none; bottom: calc(140px + var(--safe-bottom)); right: 30px; 
            background: #fff; border-radius: 30px; box-shadow: 0 25px 80px rgba(0,0,0,0.4); 
            z-index: 8000; min-width: 280px; overflow: hidden; animation: popUp 0.3s ease-out;
        }
        @keyframes popUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .m-row { padding: 22px 30px; display: flex; align-items: center; gap: 20px; cursor: pointer; font-weight: 900; color: #333; border-bottom: 1px solid #f0f0f0; transition: 0.2s; }
        .m-row:hover { background: #fff9e6; color: var(--gold-dark); }
        .m-row i { font-size: 22px; width: 30px; text-align: center; }

        /* Modals & Loaders */
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: none; align-items: center; justify-content: center; padding: 25px; backdrop-filter: blur(10px); }
        .m-card { background: #fff; width: 100%; max-width: 450px; border-radius: 35px; overflow: hidden; box-shadow: 0 30px 100px rgba(0,0,0,0.8); animation: zoomIn 0.3s var(--transition); }
        @keyframes zoomIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        .m-body { padding: 40px; text-align: center; color: #333; }
        .m-body i { font-size: 60px; color: #d32f2f; margin-bottom: 25px; }
        .m-body h2 { font-weight: 900; font-size: 24px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; }
        .m-footer { display: flex; border-top: 1px solid #eee; }
        .m-btn { flex: 1; padding: 25px; text-align: center; font-weight: 900; cursor: pointer; font-size: 15px; text-transform: uppercase; transition: 0.2s; }
        .m-confirm { background: #d32f2f; color: #fff; }
        .m-btn:active { opacity: 0.7; }

        #viewer { display: none; position: fixed; inset: 0; background: #000; z-index: 9500; flex-direction: column; }
        .v-h { height: calc(85px + var(--safe-top)); display: flex; align-items: flex-end; justify-content: space-between; padding: 0 25px 18px; color: #fff; background: #111; border-bottom: 3px solid var(--gold); }
        
        .loader { 
            position: absolute; inset: 0; background: rgba(255,255,255,0.95); z-index: 300; 
            display: none; align-items: center; justify-content: center; flex-direction: column; 
            gap: 25px; font-weight: 900; color: var(--gold-dark); text-align: center;
        }
        .loader i { font-size: 60px; color: var(--gold); }
        .loader b { font-size: 18px; letter-spacing: 2px; }

        #toast { 
            position: fixed; top: 110px; left: 20px; right: 20px; background: #1a1a1a; color: #fff; 
            padding: 22px; border-radius: 20px; display: none; z-index: 10000; 
            border-left: 10px solid var(--gold); font-weight: 900; box-shadow: 0 15px 40px rgba(0,0,0,0.4); 
            animation: slideDown 0.4s ease;
        }
        @keyframes slideDown { from { transform: translateY(-50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body>

<!-- --- HEADER --- -->
<header>
    <div class="logo" onclick="toggleSidebar()">
        <img src="${LOGO_URL}"> <b>TITANIUM <span>OMEGA</span></b>
    </div>
</header>

<div class="shell">
    <!-- --- SIDEBAR --- -->
    <aside id="sidebar">
        <div style="padding: 35px 25px 15px; font-weight: 900; color: #bbb; font-size: 12px; letter-spacing: 4px; text-transform: uppercase;">Система v144.0</div>
        
        <div class="nav-link" id="n-root" onclick="nav('root')">
            <i class="fa fa-layer-group"></i> ВЕСЬ МАССИВ
        </div>
        <div class="nav-link" id="n-log" onclick="nav('${MY_ROOT_ID}')">
            <i class="fa fa-truck-fast"></i> ЛОГИСТИКА X
        </div>
        <div class="nav-link" id="n-merch" onclick="nav('${MERCH_ROOT_ID}')">
            <i class="fa fa-boxes-stacked"></i> МЕРЧАНДАЙЗИНГ
        </div>
        
        <div style="margin-top: auto; padding: 35px; border-top: 1px solid #f0f0f0; background: #fcfcfc;">
            <div style="font-size: 10px; font-weight: 900; color: #aaa; margin-bottom: 12px; letter-spacing: 2px;">NEURAL INTEGRITY</div>
            <div style="height: 8px; background: #eee; border-radius: 4px; overflow: hidden; margin-bottom: 12px; border: 1px solid #ddd;">
                <div id="progress-bar" style="width: 100%; height: 100%; background: linear-gradient(90deg, var(--gold), #ffeb3b); transition: 1.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 900; color: #2e7d32;">
                <span>STATUS: SUPREME</span>
                <span>MIRROR: ACTIVE</span>
            </div>
        </div>
    </aside>
    
    <!-- --- MAIN CONTENT --- -->
    <main>
        <div id="main-loader" class="loader">
            <i class="fa fa-atom fa-spin"></i>
            <b>СИНХРОНИЗАЦИЯ ЯДРА...<br><small style="font-size:10px; color:#999; margin-top:10px; display:block;">TITANIUM OMEGA PROCESS ACTIVE</small></b>
        </div>

        <div id="tree-box" class="tree-nav"></div>

        <div class="dash-bar">
            <div style="display:flex; align-items:center;"><div class="live-dot"></div> <span id="sync-info">NEURAL CORE: ONLINE</span></div>
            <div id="stat-count" style="color:var(--gold);">0 ОБЪЕКТОВ В ПАМЯТИ</div>
        </div>

        <div class="search-area">
            <div class="search-box">
                <i class="fa fa-magnifying-glass" style="color:#bbb"></i>
                <input type="text" id="sq" placeholder="Поиск по адресу, сотруднику или дате..." oninput="filter()">
            </div>
        </div>

        <div class="content">
            <table class="data-grid"><tbody id="f-body"></tbody></table>
        </div>
    </main>
</div>

<!-- --- UI OVERLAYS --- -->
<div class="fab" onclick="toggleP(event)"><i class="fa fa-plus"></i></div>

<div id="pop">
    <div class="m-row" onclick="mkdir()"><i class="fa fa-folder-plus" style="color:var(--gold)"></i> НОВАЯ ПАПКА</div>
    <div class="m-row" onclick="document.getElementById('fin').click()"><i class="fa fa-cloud-arrow-up" style="color:#1a73e8"></i> ЗАГРУЗИТЬ ФАЙЛЫ</div>
    <div class="m-row" onclick="location.reload()"><i class="fa fa-rotate" style="color:#2e7d32"></i> ПЕРЕЗАГРУЗКА</div>
</div>

<div id="del-modal" class="modal">
    <div class="m-card">
        <div class="m-body">
            <i class="fa fa-triangle-exclamation"></i>
            <h2>УДАЛЕНИЕ ОБЪЕКТА</h2>
            <p id="del-msg" style="font-weight:700; color:#666; font-size:16px;">Вы уверены, что хотите безвозвратно удалить этот объект из системы?</p>
        </div>
        <div class="m-footer">
            <div class="m-btn" onclick="closeDel()">ОТМЕНА</div>
            <div class="m-btn m-confirm" id="confirm-del-btn">УДАЛИТЬ НАВСЕГДА</div>
        </div>
    </div>
</div>

<div id="viewer">
    <div class="v-h">
        <span id="v-t" style="font-weight:900; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">ПРЕДПРОСМОТР</span>
        <i class="fa fa-circle-xmark" onclick="closePv()" style="font-size: 40px; color:var(--gold); cursor:pointer;"></i>
    </div>
    <iframe id="v-f" style="flex:1; border:none; background:#fff"></iframe>
</div>

<!-- --- HIDDEN INPUTS & AUDIO --- -->
<input type="file" id="fin" style="display:none" multiple accept="image/*" onchange="hUp(this.files)">
<div id="toast"></div>

<script>
    /**
     * -------------------------------------------------------------------------------------
     * [FRONTEND LOGIC]: TITANIUM CLIENT CORE
     * -------------------------------------------------------------------------------------
     */
    
    // --- NEURAL AUDIO ENGINE 2.0 (OMEGA) ---
    const AudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    function playSnd(type) {
        if (AudioCtx.state === 'suspended') AudioCtx.resume();
        const osc = AudioCtx.createOscillator();
        const g = AudioCtx.createGain();
        osc.connect(g);
        g.connect(AudioCtx.destination);
        
        const now = AudioCtx.currentTime;
        
        switch(type) {
            case 'nav':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.exponentialRampToValueAtTime(1000, now + 0.1);
                g.gain.setValueAtTime(0.05, now);
                g.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now); osc.stop(now + 0.1);
                break;
            case 'open':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
                g.gain.setValueAtTime(0.08, now);
                g.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                osc.start(now); osc.stop(now + 0.15);
                break;
            case 'del':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(50, now + 0.4);
                g.gain.setValueAtTime(0.1, now);
                g.gain.linearRampToValueAtTime(0.01, now + 0.4);
                osc.start(now); osc.stop(now + 0.4);
                break;
            case 'success':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.setValueAtTime(1200, now + 0.1);
                g.gain.setValueAtTime(0.05, now);
                g.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                osc.start(now); osc.stop(now + 0.2);
                break;
        }
    }

    let curId = 'root'; 
    let cache = []; 
    let treeStack = [{id: 'root', name: 'МАССИВ'}];

    function showL(v) { document.getElementById('main-loader').style.display = v ? 'flex' : 'none'; }
    function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
    function toggleP(e) { e.stopPropagation(); const m = document.getElementById('pop'); m.style.display = m.style.display==='block'?'none':'block'; }
    window.onclick = () => { document.getElementById('pop').style.display='none'; };

    // --- NAVIGATION CORE ---
    async function nav(id, name = null) {
        playSnd('nav');
        if (id === 'root') {
            treeStack = [{id: 'root', name: 'МАССИВ'}];
        } else if (id === '${MY_ROOT_ID}') {
            treeStack = [{id: 'root', name: 'МАССИВ'}, {id: id, name: 'ЛОГИСТИКА X'}];
        } else if (id === '${MERCH_ROOT_ID}') {
            treeStack = [{id: 'root', name: 'МАССИВ'}, {id: id, name: 'МЕРЧ X'}];
        } else if (name) {
            const idx = treeStack.findIndex(t => t.id === id);
            if (idx !== -1) treeStack = treeStack.slice(0, idx + 1);
            else treeStack.push({id, name});
        }
        
        curId = id;
        drawTree();
        await sync();
        if(window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
    }

    function drawTree() {
        const box = document.getElementById('tree-box');
        box.innerHTML = treeStack.map((t, i) => {
            const isLast = i === treeStack.length - 1;
            return \`<span class="tree-step \${isLast?'last':''}" onclick="nav('\${t.id}', '\${t.name}')">\${t.name}</span>\${isLast?'':'<span class="tree-sep">/</span>'}\`;
        }).join(' ');
    }

    async function sync() {
        showL(true);
        try {
            const r = await fetch('/storage/api/list?folderId=' + curId);
            cache = await r.json();
            document.getElementById('stat-count').innerText = cache.length + ' ОБЪЕКТОВ';
            render();
            
            // Highlight active side-nav
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            if(curId === 'root') document.getElementById('n-root').classList.add('active');
            if(curId === '${MY_ROOT_ID}') document.getElementById('n-log').classList.add('active');
            if(curId === '${MERCH_ROOT_ID}') document.getElementById('n-merch').classList.add('active');
            
        } catch(e) { 
            msg("❌ ОШИБКА СИНХРОНИЗАЦИИ"); 
        } finally { showL(false); }
    }

    // --- RENDERING CORE ---
    function getFileIcon(f) {
        if(f.mimeType.includes('folder')) return { i: 'fa-folder', c: '#fbc02d' };
        if(f.thumbnailLink) return { thumb: f.thumbnailLink };
        const n = f.name.toLowerCase();
        if(n.endsWith('.pdf')) return { i: 'fa-file-pdf', c: '#f44336' };
        if(n.includes('xls') || f.mimeType.includes('sheet')) return { i: 'fa-file-excel', c: '#4caf50' };
        if(n.includes('doc') || f.mimeType.includes('word')) return { i: 'fa-file-word', c: '#2196f3' };
        if(n.endsWith('.zip') || n.endsWith('.rar')) return { i: 'fa-file-zipper', c: '#9c27b0' };
        return { i: 'fa-file-lines', c: '#999' };
    }

    function render(data = cache) {
        const body = document.getElementById('f-body');
        body.innerHTML = data.length ? '' : '<tr><td style="text-align:center; padding:100px; color:#aaa; font-weight:900;">СЕКТОР ПУСТ</td></tr>';
        
        data.forEach(f => {
            const isD = f.mimeType.includes('folder');
            const style = getFileIcon(f);
            const tr = document.createElement('tr');
            
            tr.innerHTML = \`
                <td>
                    <div class="f-item">
                        <div class="f-icon-wrap" onclick="\${isD ? "nav('"+f.id+"', '"+f.name+"')" : "pv('"+f.id+"', '"+f.name+"')" }">
                            \${style.thumb ? \`<img src="\${style.thumb}" class="f-thumb" loading="lazy">\` : \`<i class="fa \${style.i} f-icon" style="color:\${style.c}"></i>\`}
                        </div>
                        <div class="f-info" onclick="\${isD ? "nav('"+f.id+"', '"+f.name+"')" : "pv('"+f.id+"', '"+f.name+"')" }">
                            <div class="f-name">\${f.name}</div>
                            <div class="f-meta">
                                <span><i class="fa fa-calendar-days"></i> \${new Date(f.modifiedTime).toLocaleDateString()}</span>
                                \${f.size ? \`<span><i class="fa fa-hard-drive"></i> \${(f.size/1024/1024).toFixed(2)} MB</span>\` : ''}
                            </div>
                        </div>
                        <div class="f-actions">
                            <div class="btn-action btn-del" onclick="askDel('\${f.id}', '\${f.name}')">
                                <i class="fa fa-trash-can"></i>
                            </div>
                        </div>
                    </div>
                </td>
            \`;
            body.appendChild(tr);
        });
    }

    function filter() { 
        const q = document.getElementById('sq').value.toLowerCase(); 
        render(cache.filter(f => f.name.toLowerCase().includes(q))); 
    }

    // --- PREVIEW CORE ---
    function pv(id, n) { 
        playSnd('open');
        document.getElementById('v-t').innerText = n; 
        document.getElementById('v-f').src = 'https://drive.google.com/file/d/'+id+'/preview'; 
        document.getElementById('viewer').style.display = 'flex'; 
    }
    function closePv() { 
        document.getElementById('viewer').style.display = 'none'; 
        document.getElementById('v-f').src = ''; 
    }

    // --- CRUD OPERATIONS ---
    let pendingDelId = null;
    function askDel(id, name) {
        pendingDelId = id;
        document.getElementById('del-msg').innerText = \`Удалить объект "\${name}"? Это действие переместит файл в корзину Drive.\`;
        document.getElementById('del-modal').style.display = 'flex';
    }
    function closeDel() { document.getElementById('del-modal').style.display = 'none'; pendingDelId = null; }
    
    document.getElementById('confirm-del-btn').onclick = async () => {
        if(!pendingDelId) return;
        showL(true); closeDel();
        try {
            const r = await fetch('/storage/api/delete', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({id: pendingDelId}) 
            });
            if(r.ok) { playSnd('del'); msg("🗑️ УДАЛЕНО УСПЕШНО"); await sync(); }
            else msg("❌ ОШИБКА ПРИ УДАЛЕНИИ");
        } finally { showL(false); }
    };

    async function hUp(files) { 
        showL(true); 
        for(let f of files) { 
            msg("🚀 ЗАГРУЗКА: " + f.name); 
            const fd = new FormData(); 
            fd.append('file', f); 
            fd.append('folderId', curId); 
            try {
                const r = await fetch('/storage/api/upload', {method:'POST', body:fd});
                if(r.ok) playSnd('success');
            } catch(e) { msg("❌ ОШИБКА: " + f.name); }
        } 
        msg("✅ ЗАГРУЗКА ЗАВЕРШЕНА");
        await sync(); 
    }

    function mkdir() { 
        const n = prompt("ИМЯ НОВОГО ОБЪЕКТА (УЛИЦА ДОМ ПОДЪЕЗД):"); 
        if(n) {
            showL(true);
            fetch('/storage/api/mkdir', {
                method:'POST', 
                headers:{'Content-Type':'application/json'}, 
                body:JSON.stringify({parentId:curId, name:n})
            }).then(r => {
                if(r.ok) { playSnd('success'); sync(); }
                else msg("❌ ОШИБКА ПРИ СОЗДАНИИ");
            });
        }
    }

    function msg(t) { 
        const b = document.getElementById('toast'); 
        b.innerText = t; b.style.display = 'block'; 
        setTimeout(() => b.style.display = 'none', 3500); 
    }

    // INIT SYSTEM
    nav('root');
</script>
</body>
</html>
    `;

    /**
     * -------------------------------------------------------------------------------------
     * [БЛОК 4]: API GATEWAY (SUPREME BACKEND)
     * -------------------------------------------------------------------------------------
     */
    app.get('/storage', (req, res) => res.send(UI));

    // API: Список файлов (с поддержкой миниатюр)
    app.get('/storage/api/list', async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            const r = await drive.files.list({ 
                q: `'${folderId}' in parents and trashed = false`, 
                fields: 'files(id, name, mimeType, size, modifiedTime, thumbnailLink)', 
                orderBy: 'folder, name' 
            });
            
            // Фоновая индексация в нейронное ядро
            r.data.files.forEach(f => titaniumNeuralProcess({ 
                id: f.id, name: f.name, parentId: folderId, mimeType: f.mimeType 
            }));
            
            res.json(r.data.files);
        } catch (e) { 
            logSystemEvent("API_LIST_ERROR", { error: e.message });
            res.status(500).json({error: e.message}); 
        }
    });

    // API: Загрузка файлов
    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            const filePath = req.file.path;
            const buffer = fs.readFileSync(filePath);
            
            const r = await drive.files.create({ 
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: { mimeType: req.file.mimetype, body: fs.createReadStream(filePath) },
                fields: 'id, name, mimeType'
            });
            
            await titaniumNeuralProcess({ 
                id: r.data.id, name: r.data.name, parentId: req.body.folderId, mimeType: r.data.mimeType 
            }, buffer);
            
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath); 
            res.sendStatus(200);
        } catch (e) { 
            logSystemEvent("API_UPLOAD_ERROR", { error: e.message });
            res.status(500).send(e.message); 
        }
    });

    // API: Создание папок
    app.post('/storage/api/mkdir', express.json(), async (req, res) => {
        try {
            const r = await drive.files.create({ 
                resource: { 
                    name: req.body.name, 
                    mimeType: 'application/vnd.google-apps.folder', 
                    parents: [req.body.parentId] 
                },
                fields: 'id, name'
            });
            await titaniumNeuralProcess({ 
                id: r.data.id, name: r.data.name, parentId: req.body.parentId, mimeType: 'folder' 
            });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    // API: Удаление (Перемещение в корзину)
    app.post('/storage/api/delete', express.json(), async (req, res) => {
        try {
            const { id } = req.body;
            await drive.files.update({ fileId: id, requestBody: { trashed: true } });
            await titaniumNeuralProcess({ id }, null, true);
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    console.log("🦾 TITANIUM v144.0 OMEGA-MONOLITH | SUPREME AUTONOMY ACTIVATED ON LOGIST-X.STORE");
};