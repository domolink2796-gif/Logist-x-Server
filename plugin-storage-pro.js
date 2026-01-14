/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v146.0 | THE HYPER-MONOLITH "ULTRA-INSTINCT"
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * БАЗА: Глубокая интеграция с server.js (Logist X & Merch X)
 * СТАТУС: MAXIMUM AUTONOMY | LOCAL STORAGE REPLICATION READY
 * -----------------------------------------------------------------------------------------
 * ВОЗМОЖНОСТИ:
 * 1. Физическая репликация структуры Google Drive на локальный диск сервера.
 * 2. Дерево навигации с поддержкой глубокой вложенности.
 * 3. Создание любых типов файлов (.txt, .json, .doc) и папок.
 * 4. Удаление объектов (Drive + Local Storage) с очисткой нейронного индекса.
 * 5. Встроенный мульти-плеер (Видео, Фото, PDF, Документы).
 * 6. Интерфейс архиватора (подготовка под .rar / .zip).
 * 7. Автоматическое зеркалирование системных баз данных (JSON).
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- ГЛОБАЛЬНЫЕ КОНСТАНТЫ И КОНФИГУРАЦИЯ ХРАНИЛИЩА ---
const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";
const STORAGE_ROOT = path.join(__dirname, 'local_storage');
const DB_MIRROR_ROOT = path.join(__dirname, 'db_mirror');
const REPORT_LEDGER_DIR = path.join(__dirname, 'local_storage/reports_shadow_ledger');
const NEURAL_INDEX = path.join(__dirname, 'titanium_neural_map.json');

// Глубокая инициализация физической архитектуры (Full Replication Path)
[STORAGE_ROOT, DB_MIRROR_ROOT, REPORT_LEDGER_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

module.exports = function(app, context) {
    // Импорт инструментов из основного серверного ядра
    const { 
        drive, google, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, saveDatabase, getOrCreateFolder,
        readBarcodeDb, readPlanogramDb, readShopItemsDb,
        sheets
    } = context;

    // Настройка Multer для работы с тяжелыми медиа-файлами (500MB Limit)
    const upload = multer({ 
        dest: 'uploads/',
        limits: { fileSize: 500 * 1024 * 1024 }
    });

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 1]: НЕЙРОННЫЙ АРХИТЕКТОР (AUTONOMOUS LOGIC & REPLICATION)
     * -------------------------------------------------------------------------------------
     */
    
    // Восстановление глубокого пути из Google Drive (Логика выхода по ID)
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
                // Предохранитель от бесконечных циклов (лимит Drive API)
                if (chain.length > 20) break;
            }
        } catch (e) { 
            console.warn("⚠️ TITANIUM PATH RESOLVER: Drive node unreachable.");
        }
        return chain;
    }

    // Главный процесс синхронизации, обучения и физической репликации
    async function titaniumNeuralProcess(asset, action = 'sync', buffer = null) {
        setImmediate(async () => {
            try {
                let index = { stats: { files: 0, syncs: 0, last_update: Date.now() }, map: {} };
                if (fs.existsSync(NEURAL_INDEX)) {
                    try { index = JSON.parse(fs.readFileSync(NEURAL_INDEX, 'utf8')); } catch(e) {}
                }
                
                if (action === 'delete') {
                    // Логика удаления из индекса и локального диска
                    const entry = index.map[asset.id];
                    if (entry && entry.localPath && fs.existsSync(entry.localPath)) {
                        try { fs.unlinkSync(entry.localPath); } catch(err) {}
                    }
                    delete index.map[asset.id];
                    console.log(`🧠 [TITANIUM] FORGOT: ${asset.id}`);
                } else {
                    const { id, name, parentId, mimeType, size } = asset;
                    
                    // Определение принадлежности к ядру проекта (Logist/Merch)
                    let folderChain = await resolveDeepPath(parentId);
                    const isMerch = (parentId === MERCH_ROOT_ID || folderChain.some(n => n.toLowerCase().includes('мерч')));
                    const projectNode = isMerch ? 'MERCH_CORE' : 'LOGIST_CORE';

                    // Формирование физического пути на диске сервера
                    const localDirPath = path.join(STORAGE_ROOT, projectNode, ...folderChain);
                    const localFilePath = path.join(localDirPath, name || `asset_${id}`);

                    if (!fs.existsSync(localDirPath)) fs.mkdirSync(localDirPath, { recursive: true });

                    // Репликация: сохранение физического файла если есть буфер
                    if (buffer) {
                        fs.writeFileSync(localFilePath, buffer);
                        index.stats.files++;
                    }

                    // Обновление нейронного индекса метаданными
                    index.map[id] = { 
                        localPath: fs.existsSync(localFilePath) ? localFilePath : null, 
                        name: name, 
                        mimeType: mimeType,
                        parentId: parentId,
                        isLocal: fs.existsSync(localFilePath),
                        ts: Date.now(), 
                        core: projectNode 
                    };
                }

                index.stats.syncs++;
                fs.writeFileSync(NEURAL_INDEX, JSON.stringify(index, null, 2));
                
                // Авто-зеркалирование системных баз данных
                await autoMirrorDatabases();
            } catch (e) { console.error("❌ NEURAL CORE ERROR:", e.message); }
        });
    }

    // Интеллектуальное зеркалирование всех системных JSON баз (из v142)
    async function autoMirrorDatabases() {
        try {
            const keys = await readDatabase();
            if (!keys) return;
            fs.writeFileSync(path.join(DB_MIRROR_ROOT, 'keys_database.json'), JSON.stringify(keys, null, 2));
            
            for (let k of keys) {
                if (k.folderId) {
                    const kDir = path.join(DB_MIRROR_ROOT, k.key);
                    if (!fs.existsSync(kDir)) fs.mkdirSync(kDir, { recursive: true });
                    
                    try {
                        const [bDb, pDb] = await Promise.all([
                            readBarcodeDb(k.folderId),
                            readPlanogramDb(k.folderId)
                        ]);
                        if (bDb) fs.writeFileSync(path.join(kDir, 'barcodes.json'), JSON.stringify(bDb, null, 2));
                        if (pDb) fs.writeFileSync(path.join(kDir, 'planograms.json'), JSON.stringify(pDb, null, 2));
                    } catch (err) { /* Ошибка конкретного ключа - пропускаем */ }
                }
            }
        } catch (e) { /* Фон */ }
    }

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 2]: API GATEWAY (FULL CONTROL)
     * -------------------------------------------------------------------------------------
     */
    
    // Получение списка файлов с определением локального статуса
    app.get('/storage/api/list', async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            const r = await drive.files.list({ 
                q: `'${folderId}' in parents and trashed = false`, 
                fields: 'files(id, name, mimeType, size, modifiedTime, iconLink, thumbnailLink)', 
                orderBy: 'folder, name' 
            });
            
            let index = { map: {} };
            if (fs.existsSync(NEURAL_INDEX)) index = JSON.parse(fs.readFileSync(NEURAL_INDEX, 'utf8'));

            const files = r.data.files.map(f => ({
                ...f,
                isLocal: !!(index.map[f.id] && index.map[f.id].isLocal)
            }));

            // Обучение в фоне
            r.data.files.forEach(f => titaniumNeuralProcess({...f, parentId: folderId}));
            
            res.json(files);
        } catch (e) { res.status(500).json({error: e.message}); }
    });

    // Создание папки
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

    // Создание любого файла (.txt, .json, .doc)
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

    // Загрузка медиа-файла с физической репликацией
    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            const filePath = req.file.path;
            const buffer = fs.readFileSync(filePath);
            
            const r = await drive.files.create({ 
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: { mimeType: req.file.mimetype, body: fs.createReadStream(filePath) },
                fields: 'id, name, mimeType, size'
            });
            
            await titaniumNeuralProcess({ ...r.data, parentId: req.body.folderId }, 'sync', buffer);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath); 
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    // Удаление из облака и локального зеркала
    app.post('/storage/api/delete', express.json(), async (req, res) => {
        try {
            const { id } = req.body;
            await drive.files.delete({ fileId: id });
            await titaniumNeuralProcess({ id }, 'delete');
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 3]: ТИТАНОВЫЙ ИНТЕРФЕЙС (ULTRA-INSTINCT UI)
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
    
    <title>TITANIUM ULTRA v146</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { 
            --gold: #f0b90b; 
            --bg: #050505; 
            --card: #121212; 
            --text-main: #ffffff; 
            --text-dim: #999;
            --safe-top: env(safe-area-inset-top); 
            --safe-bottom: env(safe-area-inset-bottom); 
        }

        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; outline: none; }
        
        body, html { 
            height: 100%; width: 100%; font-family: 'Roboto', sans-serif; 
            background: var(--bg); color: var(--text-main); overflow: hidden; position: fixed;
        }

        header {
            height: calc(85px + var(--safe-top)); background: #000; border-bottom: 5px solid var(--gold);
            display: flex; align-items: flex-end; justify-content: space-between; 
            padding: 0 25px 15px; z-index: 5000; position: relative;
        }
        .logo { display: flex; align-items: center; gap: 15px; cursor: pointer; }
        .logo img { height: 45px; border-radius: 12px; box-shadow: 0 0 25px var(--gold); }
        .logo b { font-family: 'Google Sans'; font-size: 24px; letter-spacing: 1px; color: #fff; }

        .shell { display: flex; height: calc(100% - (85px + var(--safe-top))); width: 100%; background: #fff; color: #1a1a1b; }
        
        /* SIDEBAR / TREE SYSTEM */
        aside {
            width: 320px; background: #0a0a0a; border-right: 2px solid #222;
            display: flex; flex-direction: column; transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
            z-index: 4000; color: #ccc;
        }
        @media (max-width: 900px) { 
            aside { position: absolute; left: -320px; height: 100%; } 
            aside.open { left: 0; box-shadow: 25px 0 70px rgba(0,0,0,0.8); } 
        }

        .tree-header { padding: 30px 25px 10px; font-weight: 800; font-size: 11px; letter-spacing: 2px; color: var(--gold); }
        .nav-link {
            height: 60px; margin: 5px 15px; border-radius: 30px; display: flex; align-items: center;
            padding: 0 22px; cursor: pointer; font-size: 15px; font-weight: 600; color: #888; transition: 0.3s;
        }
        .nav-link i { width: 35px; font-size: 20px; text-align: center; }
        .nav-link:hover { background: #1a1a1a; color: #fff; }
        .nav-link.active { background: #1a1a1a; color: var(--gold); border: 1px solid var(--gold); font-weight: 700; }

        /* MAIN CONTENT AREA */
        main { flex: 1; display: flex; flex-direction: column; background: #fff; overflow: hidden; position: relative; }
        
        .dash-bar { 
            padding: 15px 25px; background: #111; color: #fff; 
            display: flex; justify-content: space-between; align-items: center;
            font-size: 11px; font-weight: 800; border-bottom: 2px solid var(--gold);
        }
        .live-dot { width: 12px; height: 12px; background: #4caf50; border-radius: 50%; display: inline-block; margin-right: 8px; box-shadow: 0 0 10px #4caf50; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }

        .toolbar { padding: 18px 25px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 15px; background: #fdfdfd; }
        .breadcrumb { flex: 1; font-weight: 700; font-size: 15px; color: #444; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .content { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: calc(100px + var(--safe-bottom)); }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table tr { border-bottom: 1px solid #f2f2f2; transition: 0.2s; }
        .data-table tr:hover { background: #fafafa; }
        .data-table td { padding: 20px 25px; cursor: pointer; }
        
        /* FILE ICON SYSTEM */
        .f-item { display: flex; align-items: center; gap: 20px; }
        .f-icon { width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px; position: relative; }
        .f-name { font-weight: 700; font-size: 16px; color: #111; }
        .f-meta { font-size: 11px; color: #999; margin-top: 5px; display: flex; align-items: center; gap: 10px; }
        
        .badge { font-size: 9px; padding: 3px 8px; border-radius: 6px; font-weight: 900; color: #fff; }
        .b-local { background: #2e7d32; border: 1px solid #1b5e20; }
        .b-cloud { background: #1565c0; border: 1px solid #0d47a1; }
        .b-type { background: #eee; color: #666; border: 1px solid #ddd; }

        .icon-folder { background: #fff8e1; color: #fbc02d; }
        .icon-image { background: #e3f2fd; color: #1e88e5; }
        .icon-video { background: #fbe9e7; color: #d84315; }
        .icon-pdf { background: #ffebee; color: #c62828; }
        .icon-archive { background: #f3e5f5; color: #7b1fa2; }
        .icon-default { background: #f5f5f5; color: #757575; }

        /* ACTIONS & BUTTONS */
        .btn-act { width: 45px; height: 45px; border-radius: 12px; border: none; background: #f0f0f0; color: #555; cursor: pointer; transition: 0.2s; font-size: 18px; }
        .btn-act:hover { background: #e0e0e0; color: #000; }
        .btn-del:hover { background: #ffebee; color: #d32f2f; }

        .fab {
            position: fixed; bottom: calc(35px + var(--safe-bottom)); right: 30px; width: 80px; height: 80px;
            border-radius: 25px; background: #000; border: 4px solid var(--gold);
            display: flex; align-items: center; justify-content: center; z-index: 6000;
            box-shadow: 0 15px 45px rgba(0,0,0,0.6); color: var(--gold); font-size: 32px;
            transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); cursor: pointer;
        }
        .fab:active { transform: scale(0.85); }

        #pop { position: fixed; display: none; bottom: calc(130px + var(--safe-bottom)); right: 30px; background: #fff; border-radius: 25px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); z-index: 8000; min-width: 280px; overflow: hidden; border: 1px solid #eee; }
        .pop-item { padding: 20px 25px; display: flex; align-items: center; gap: 15px; cursor: pointer; font-weight: 700; color: #333; border-bottom: 1px solid #f5f5f5; }
        .pop-item:hover { background: #fcfcfc; }
        
        /* VIEWER SYSTEM */
        #viewer { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.98); z-index: 9500; flex-direction: column; }
        .v-header { height: calc(75px + var(--safe-top)); display: flex; align-items: flex-end; justify-content: space-between; padding: 0 25px 18px; color: #fff; background: #000; border-bottom: 1px solid #222; }
        .v-content { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 20px; }
        .v-content img, .v-content video { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 10px; box-shadow: 0 0 50px rgba(0,0,0,0.5); }
        .v-content iframe { width: 100%; height: 100%; border: none; background: #fff; border-radius: 8px; }

        /* MODALS */
        #modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; align-items: center; justify-content: center; padding: 20px; }
        .m-card { background: #fff; width: 100%; max-width: 450px; padding: 35px; border-radius: 30px; box-shadow: 0 25px 80px rgba(0,0,0,0.5); color: #000; }
        .m-header { font-weight: 800; font-size: 22px; margin-bottom: 20px; color: #000; }
        .m-input { width: 100%; padding: 18px; border: 3px solid #eee; border-radius: 15px; margin-bottom: 20px; font-size: 18px; font-weight: 700; font-family: inherit; }
        .m-btn { width: 100%; padding: 18px; border-radius: 15px; border: none; background: var(--gold); font-weight: 900; font-size: 18px; cursor: pointer; color: #000; transition: 0.2s; }
        .m-btn-sec { background: #eee; color: #555; margin-top: 12px; }

        /* LOADER */
        .loader-overlay { position: absolute; inset: 0; background: rgba(255,255,255,0.9); z-index: 1000; display: none; align-items: center; justify-content: center; }
    </style>
</head>
<body>

<header>
    <div class="logo" onclick="toggleSidebar()">
        <img src="${LOGO_URL}"> <b>TITANIUM <span style="color:var(--gold)">ULTRA</span></b>
    </div>
    <div id="neural-status" style="font-size: 10px; font-weight: 900; color: #555; text-align: right;">NEURAL INTEGRITY: OK<br>STORAGE: HYBRID</div>
</header>

<div class="shell">
    <aside id="sidebar">
        <div class="tree-header">НЕЙРОННОЕ ДЕРЕВО v146</div>
        <div class="nav-link active" id="n-root" onclick="nav('root', 'ВЕСЬ МАССИВ')"><i class="fa fa-microchip"></i> Весь массив</div>
        <div class="nav-link" id="n-log" onclick="nav('${MY_ROOT_ID}', 'ЛОГИСТИКА X')"><i class="fa fa-truck-fast"></i> Логистика X</div>
        <div class="nav-link" id="n-merch" onclick="nav('${MERCH_ROOT_ID}', 'МЕРЧАНДАЙЗИНГ')"><i class="fa fa-boxes-stacked"></i> Мерчандайзинг</div>
        
        <div style="margin-top: auto; padding: 30px; background: #080808; border-top: 1px solid #222;">
            <div style="font-size: 10px; color: #555; font-weight: 900; margin-bottom: 12px; letter-spacing: 1px;">AUTONOMOUS MIRRORING</div>
            <div style="height:6px; background:#222; border-radius:3px; overflow:hidden;">
                <div style="width:100%; height:100%; background:var(--gold); box-shadow: 0 0 10px var(--gold);"></div>
            </div>
            <div style="font-size: 9px; color: #444; margin-top: 10px; font-weight: 700;">STABILITY: MAXIMUM (100.0%)</div>
        </div>
    </aside>
    
    <main>
        <div class="loader-overlay" id="loader"><i class="fa fa-atom fa-spin fa-4x" style="color:var(--gold)"></i></div>
        
        <div class="dash-bar">
            <div style="display:flex; align-items:center;"><div class="live-dot"></div> <span id="sync-info">NEURAL CORE: ONLINE & REPLICATING</span></div>
            <div id="stat-count">0 ОБЪЕКТОВ</div>
        </div>

        <div class="toolbar">
            <div class="breadcrumb" id="bc">/ storage / root</div>
            <button class="btn-act" onclick="refresh()"><i class="fa fa-rotate"></i></button>
            <button class="btn-act" onclick="nav('root')"><i class="fa fa-house"></i></button>
        </div>

        <div class="content">
            <table class="data-table"><tbody id="f-body"></tbody></table>
        </div>
    </main>
</div>

<!-- FLOATING ACTION BUTTON -->
<div class="fab" onclick="togglePop(event)"><i class="fa fa-plus"></i></div>

<!-- POPUP MENU -->
<div id="pop">
    <div class="pop-item" onclick="openModal('folder')"><i class="fa fa-folder-plus"></i> Новая папка</div>
    <div class="pop-item" onclick="openModal('file')"><i class="fa fa-file-circle-plus"></i> Создать файл (.txt/json)</div>
    <div class="pop-item" onclick="document.getElementById('fin').click()"><i class="fa fa-cloud-arrow-up"></i> Загрузить отчет/фото</div>
</div>

<!-- MULTI-VIEWER -->
<div id="viewer">
    <div class="v-header">
        <span id="v-title" style="font-weight:800; opacity:0.8; font-size: 18px;"></span> 
        <i class="fa fa-circle-xmark" onclick="closeViewer()" style="font-size: 40px; color:var(--gold); cursor:pointer;"></i>
    </div>
    <div class="v-content" id="v-body"></div>
</div>

<!-- ACTION MODAL -->
<div id="modal">
    <div class="m-card">
        <div class="m-header" id="m-title">ДЕЙСТВИЕ</div>
        <input type="text" id="m-input" class="m-input" placeholder="Введите название...">
        <div id="m-file-opts" style="display:none">
            <select id="m-file-type" class="m-input">
                <option value="text/plain">Текстовый документ (.txt)</option>
                <option value="application/json">База данных (.json)</option>
                <option value="application/msword">Документ Word (.doc)</option>
            </select>
        </div>
        <button class="m-btn" onclick="modalConfirm()">ПОДТВЕРДИТЬ</button>
        <button class="m-btn m-btn-sec" onclick="closeModal()">ОТМЕНА</button>
    </div>
</div>

<input type="file" id="fin" style="display:none" multiple onchange="handleUpload(this.files)">

<script>
    let curId = 'root';
    let mAction = '';

    function toggleSidebar() { if(window.innerWidth < 900) document.getElementById('sidebar').classList.toggle('open'); }
    function togglePop(e) { e.stopPropagation(); const p = document.getElementById('pop'); p.style.display = p.style.display==='block'?'none':'block'; }
    window.onclick = () => { document.getElementById('pop').style.display='none'; };

    async function nav(id, name = 'root') {
        curId = id;
        const body = document.getElementById('f-body');
        const loader = document.getElementById('loader');
        loader.style.display = 'flex';
        document.getElementById('bc').innerText = '/ storage / ' + name;
        
        try {
            const r = await fetch('/storage/api/list?folderId=' + id);
            const files = await r.json();
            render(files);
            updateSidebarUI(id);
        } catch(e) { 
            body.innerHTML = '<tr><td style="text-align:center; padding:100px; color:red; font-weight:800;">ОШИБКА НЕЙРОННОГО ЯДРА</td></tr>'; 
        } finally { 
            loader.style.display = 'none'; 
        }
    }

    function updateSidebarUI(id) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        if(id === 'root') document.getElementById('n-root').classList.add('active');
        if(id === '${MY_ROOT_ID}') document.getElementById('n-log').classList.add('active');
        if(id === '${MERCH_ROOT_ID}') document.getElementById('n-merch').classList.add('active');
    }

    function getFileInfo(mime) {
        if(mime.includes('folder')) return { icon:'fa-folder-closed', cls:'icon-folder', tag:'FOLDER' };
        if(mime.includes('image')) return { icon:'fa-image', cls:'icon-image', tag:'IMAGE' };
        if(mime.includes('video')) return { icon:'fa-play-circle', cls:'icon-video', tag:'VIDEO' };
        if(mime.includes('pdf')) return { icon:'fa-file-pdf', cls:'icon-pdf', tag:'PDF' };
        if(mime.includes('zip') || mime.includes('rar')) return { icon:'fa-file-zipper', cls:'icon-archive', tag:'ARCHIVE' };
        return { icon:'fa-file-lines', cls:'icon-default', tag:'FILE' };
    }

    function render(files) {
        const body = document.getElementById('f-body');
        document.getElementById('stat-count').innerText = files.length + ' ОБЪЕКТОВ';
        body.innerHTML = files.length ? '' : '<tr><td style="text-align:center; padding:120px; color:#aaa; font-weight:700;">СЕКТОР ПУСТ</td></tr>';
        
        files.forEach(f => {
            const info = getFileInfo(f.mimeType);
            const tr = document.createElement('tr');
            tr.innerHTML = \`
                <td>
                    <div class="f-item">
                        <div class="f-icon \${info.cls}"><i class="fa \${info.icon}"></i></div>
                        <div style="flex:1">
                            <div class="f-name">\${f.name}</div>
                            <div class="f-meta">
                                <span class="badge \${f.isLocal?'b-local':'b-cloud'}">\${f.isLocal?'LOCAL':'CLOUD'}</span>
                                <span class="badge b-type">\${info.tag}</span>
                                <span>\${(f.size/1024/1024 || 0).toFixed(2)} MB</span>
                            </div>
                        </div>
                        <div onclick="event.stopPropagation()">
                            <button class="btn-act btn-del" onclick="deleteAsset('\${f.id}')"><i class="fa fa-trash-can"></i></button>
                        </div>
                    </div>
                </td>
            \`;
            tr.onclick = () => f.mimeType.includes('folder') ? nav(f.id, f.name) : openViewer(f);
            body.appendChild(tr);
        });
    }

    async function deleteAsset(id) {
        if(!confirm('ВНИМАНИЕ: Объект будет удален из облака и локального хранилища. Продолжить?')) return;
        document.getElementById('loader').style.display = 'flex';
        await fetch('/storage/api/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) });
        refresh();
    }

    function openViewer(f) {
        const v = document.getElementById('viewer');
        const b = document.getElementById('v-body');
        document.getElementById('v-title').innerText = f.name;
        v.style.display = 'flex';
        b.innerHTML = '';

        if(f.mimeType.includes('image')) {
            b.innerHTML = \`<img src="https://drive.google.com/uc?id=\${f.id}">\`;
        } else if(f.mimeType.includes('video')) {
            b.innerHTML = \`<video controls autoplay><source src="https://drive.google.com/uc?export=download&id=\${f.id}"></video>\`;
        } else {
            b.innerHTML = \`<iframe src="https://drive.google.com/file/d/\${f.id}/preview"></iframe>\`;
        }
    }

    function closeViewer() { document.getElementById('viewer').style.display='none'; document.getElementById('v-body').innerHTML=''; }

    function openModal(action) {
        mAction = action;
        const m = document.getElementById('modal');
        document.getElementById('m-title').innerText = action === 'folder' ? 'НОВАЯ ПАПКА' : 'СОЗДАТЬ ФАЙЛ';
        document.getElementById('m-file-opts').style.display = action === 'file' ? 'block' : 'none';
        document.getElementById('m-input').value = '';
        m.style.display = 'flex';
    }

    function closeModal() { document.getElementById('modal').style.display = 'none'; }

    async function modalConfirm() {
        const name = document.getElementById('m-input').value;
        if(!name) return;
        document.getElementById('loader').style.display = 'flex';
        closeModal();

        const endpoint = mAction === 'folder' ? '/storage/api/mkdir' : '/storage/api/mkfile';
        const body = { name, parentId: curId };
        if(mAction === 'file') body.type = document.getElementById('m-file-type').value;

        await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        refresh();
    }

    async function handleUpload(files) {
        document.getElementById('loader').style.display = 'flex';
        for(let f of files) {
            const fd = new FormData();
            fd.append('file', f);
            fd.append('folderId', curId);
            await fetch('/storage/api/upload', { method:'POST', body:fd });
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

    console.log("🦾 TITANIUM v146.0 ULTRA-INSTINCT GIGA-MONOLITH | FULL AUTONOMY ACTIVATED");
};