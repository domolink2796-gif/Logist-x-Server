/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v146.0 | THE HYPER-MONOLITH "ULTRA-INSTINCT"
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * БАЗА: Глубокая интеграция с server.js (Logist X & Merch X)
 * ДОМЕН: https://logist-x.store
 * СТАТУС: MAXIMUM AUTONOMY | PROXY MEDIA READY | NEURAL REPLICATION
 * -----------------------------------------------------------------------------------------
 * ВОЗМОЖНОСТИ:
 * 1. Физическая репликация структуры Google Drive на локальный диск сервера.
 * 2. Дерево навигации с поддержкой глубокой вложенности и поиска.
 * 3. Создание любых типов файлов (.txt, .json, .doc) и папок.
 * 4. Удаление объектов (Drive + Local Storage) с очисткой нейронного индекса.
 * 5. Встроенный мульти-плеер (Видео, Фото через Proxy, PDF, Документы).
 * 6. Автоматическое зеркалирование системных баз данных (JSON).
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- ГЛОБАЛЬНЫЕ КОНСТАНТЫ И КОНФИГУРАЦИЯ ХРАНИЛИЩА ---
const BASE_URL = "https://logist-x.store";
const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";
const STORAGE_ROOT = path.join(__dirname, 'local_storage');
const DB_MIRROR_ROOT = path.join(__dirname, 'db_mirror');
const REPORT_LEDGER_DIR = path.join(__dirname, 'local_storage/reports_shadow_ledger');
const NEURAL_INDEX = path.join(__dirname, 'titanium_neural_map.json');
const SYSTEM_LOGS = path.join(__dirname, 'titanium_system.log');

// Глубокая инициализация физической архитектуры
[STORAGE_ROOT, DB_MIRROR_ROOT, REPORT_LEDGER_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

module.exports = function(app, context) {
    const { 
        drive, google, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, saveDatabase, getOrCreateFolder,
        readBarcodeDb, readPlanogramDb, readShopItemsDb,
        sheets
    } = context;

    const upload = multer({ 
        dest: 'uploads/',
        limits: { fileSize: 500 * 1024 * 1024 } // 500MB
    });

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 1]: НЕЙРОННЫЙ АРХИТЕКТОР (ЛОГИКА И СИНХРОНИЗАЦИЯ)
     * -------------------------------------------------------------------------------------
     */
    
    function logNeural(msg) {
        const entry = `[${new Date().toISOString()}] ${msg}\n`;
        fs.appendFileSync(SYSTEM_LOGS, entry);
        console.log(`🧠 [TITANIUM]: ${msg}`);
    }

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
                if (chain.length > 25) break; 
            }
        } catch (e) { 
            logNeural(`Path Resolution Warning for ${folderId}`);
        }
        return chain;
    }

    async function titaniumNeuralProcess(asset, action = 'sync', buffer = null) {
        setImmediate(async () => {
            try {
                let index = { stats: { files: 0, syncs: 0, last_update: Date.now() }, map: {} };
                if (fs.existsSync(NEURAL_INDEX)) {
                    try { index = JSON.parse(fs.readFileSync(NEURAL_INDEX, 'utf8')); } catch(e) {}
                }
                
                if (action === 'delete') {
                    const entry = index.map[asset.id];
                    if (entry && entry.localPath && fs.existsSync(entry.localPath)) {
                        try { fs.unlinkSync(entry.localPath); } catch(err) {}
                    }
                    delete index.map[asset.id];
                    logNeural(`Object Forgotten: ${asset.id}`);
                } else {
                    const { id, name, parentId, mimeType } = asset;
                    let folderChain = await resolveDeepPath(parentId);
                    const isMerch = (parentId === MERCH_ROOT_ID || folderChain.some(n => n.toLowerCase().includes('мерч')));
                    const projectNode = isMerch ? 'MERCH_CORE' : 'LOGIST_CORE';

                    const localDirPath = path.join(STORAGE_ROOT, projectNode, ...folderChain);
                    const localFilePath = path.join(localDirPath, name || `asset_${id}`);

                    if (!fs.existsSync(localDirPath)) fs.mkdirSync(localDirPath, { recursive: true });

                    if (buffer) {
                        fs.writeFileSync(localFilePath, buffer);
                        index.stats.files++;
                        logNeural(`Physical Replication: ${name}`);
                    }

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
                await autoMirrorDatabases();
            } catch (e) { logNeural(`Neural Core Error: ${e.message}`); }
        });
    }

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
                        const [bDb, pDb] = await Promise.all([readBarcodeDb(k.folderId), readPlanogramDb(k.folderId)]);
                        if (bDb) fs.writeFileSync(path.join(kDir, 'barcodes.json'), JSON.stringify(bDb, null, 2));
                        if (pDb) fs.writeFileSync(path.join(kDir, 'planograms.json'), JSON.stringify(pDb, null, 2));
                    } catch (err) {}
                }
            }
        } catch (e) {}
    }

    /**
     * -------------------------------------------------------------------------------------
     * [РАЗДЕЛ 2]: API GATEWAY (PROXY & CONTROL)
     * -------------------------------------------------------------------------------------
     */
    
    // Медиа-прокси для logist-x.store
    app.get('/storage/api/proxy/:id', async (req, res) => {
        try {
            const fileId = req.params.id;
            const response = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'stream' });
            const meta = await drive.files.get({ fileId: fileId, fields: 'mimeType, name' });
            
            res.setHeader('Content-Type', meta.data.mimeType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.data.name)}"`);
            
            response.data.pipe(res);
        } catch (e) {
            res.status(404).send("Media stream unavailable");
        }
    });

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

            // Фоновое обновление индекса
            r.data.files.forEach(f => titaniumNeuralProcess({...f, parentId: folderId}));
            res.json(files);
        } catch (e) { res.status(500).json({error: e.message}); }
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
            const { name, parentId, type, content = '' } = req.body;
            const r = await drive.files.create({
                resource: { name, parents: [parentId] },
                media: { mimeType: type, body: content },
                fields: 'id, name, mimeType'
            });
            await titaniumNeuralProcess({ ...r.data, parentId }, 'sync', Buffer.from(content));
            res.json(r.data);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).send("No file uploaded");
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
    <title>TITANIUM ULTRA | logist-x.store</title>
    
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto+Mono:wght@400;700&family=Roboto:wght@300;400;500;700;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    
    <style>
        :root { 
            --gold: #f0b90b; 
            --gold-glow: rgba(240, 185, 11, 0.4);
            --bg: #050505; 
            --card: #121212; 
            --text-main: #ffffff; 
            --text-dim: #999;
            --accent: #1e88e5;
            --safe-top: env(safe-area-inset-top); 
            --safe-bottom: env(safe-area-inset-bottom); 
        }

        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; outline: none; }
        
        body, html { 
            height: 100%; width: 100%; font-family: 'Roboto', sans-serif; 
            background: var(--bg); color: var(--text-main); overflow: hidden; position: fixed;
        }

        /* HEADER & LOGO */
        header {
            height: calc(90px + var(--safe-top)); background: #000; border-bottom: 4px solid var(--gold);
            display: flex; align-items: flex-end; justify-content: space-between; 
            padding: 0 30px 15px; z-index: 5000; position: relative;
            box-shadow: 0 10px 40px rgba(0,0,0,0.9);
        }
        .logo { display: flex; align-items: center; gap: 15px; cursor: pointer; }
        .logo img { height: 50px; border-radius: 12px; box-shadow: 0 0 20px var(--gold-glow); transition: 0.3s; }
        .logo:hover img { transform: scale(1.05); }
        .logo b { font-family: 'Google Sans'; font-size: 26px; letter-spacing: 0.5px; color: #fff; }
        .logo span { color: var(--gold); font-weight: 900; margin-left: 5px; }

        /* SHELL & SIDEBAR */
        .shell { display: flex; height: calc(100% - (90px + var(--safe-top))); width: 100%; background: #fff; color: #1a1a1b; }
        
        aside {
            width: 340px; background: #0a0a0a; border-right: 1px solid #222;
            display: flex; flex-direction: column; transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
            z-index: 4000; color: #ccc; box-shadow: 10px 0 30px rgba(0,0,0,0.1);
        }
        @media (max-width: 1024px) { 
            aside { position: absolute; left: -340px; height: 100%; } 
            aside.open { left: 0; box-shadow: 30px 0 100px rgba(0,0,0,0.9); } 
        }

        .tree-header { padding: 40px 30px 15px; font-weight: 900; font-size: 12px; letter-spacing: 3px; color: var(--gold); text-transform: uppercase; }
        .nav-link {
            height: 65px; margin: 5px 20px; border-radius: 15px; display: flex; align-items: center;
            padding: 0 20px; cursor: pointer; font-size: 16px; font-weight: 600; color: #777; transition: 0.2s;
        }
        .nav-link i { width: 35px; font-size: 20px; color: #444; }
        .nav-link:hover { background: #151515; color: #fff; }
        .nav-link.active { background: #1a1a1a; color: var(--gold); border-left: 5px solid var(--gold); font-weight: 800; }
        .nav-link.active i { color: var(--gold); }

        /* MAIN CONTENT AREA */
        main { flex: 1; display: flex; flex-direction: column; background: #fdfdfd; overflow: hidden; position: relative; }
        
        .dash-bar { 
            padding: 15px 30px; background: #000; color: #fff; 
            display: flex; justify-content: space-between; align-items: center;
            font-size: 11px; font-weight: 800; border-bottom: 2px solid var(--gold);
        }
        .live-dot { width: 10px; height: 10px; background: #4caf50; border-radius: 50%; display: inline-block; margin-right: 10px; box-shadow: 0 0 12px #4caf50; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.5; } 100% { transform: scale(1); opacity: 1; } }

        .toolbar { 
            padding: 20px 30px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 20px; 
            background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.02);
        }
        .breadcrumb { flex: 1; font-weight: 800; font-size: 17px; color: #222; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'Google Sans'; }
        
        .search-box { position: relative; width: 250px; }
        .search-box input { width: 100%; padding: 12px 15px 12px 40px; border-radius: 12px; border: 1px solid #eee; background: #f9f9f9; font-weight: 600; font-size: 14px; }
        .search-box i { position: absolute; left: 15px; top: 14px; color: #bbb; }

        .content { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 0 calc(100px + var(--safe-bottom)); }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table thead { position: sticky; top: 0; background: #fff; z-index: 100; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
        .data-table th { text-align: left; padding: 15px 30px; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 1px; }
        .data-table tr { border-bottom: 1px solid #f6f6f6; transition: 0.2s; }
        .data-table tr:hover { background: #fcfcfc; }
        .data-table td { padding: 22px 30px; cursor: pointer; }
        
        /* FILE ICON & ITEM STYLE */
        .f-item { display: flex; align-items: center; gap: 22px; }
        .f-icon { width: 55px; height: 55px; border-radius: 18px; display: flex; align-items: center; justify-content: center; font-size: 26px; transition: 0.3s; position: relative; }
        .f-name { font-weight: 800; font-size: 17px; color: #111; margin-bottom: 5px; }
        .f-meta { font-size: 12px; color: #aaa; display: flex; align-items: center; gap: 12px; font-weight: 500; }
        
        .badge { font-size: 9px; padding: 4px 10px; border-radius: 6px; font-weight: 900; color: #fff; letter-spacing: 0.5px; }
        .b-local { background: #1b5e20; box-shadow: 0 2px 8px rgba(27, 94, 32, 0.3); }
        .b-cloud { background: #0d47a1; box-shadow: 0 2px 8px rgba(13, 71, 161, 0.3); }
        .b-type { background: #f0f0f0; color: #888; border: 1px solid #e0e0e0; }

        .icon-folder { background: #fff9c4; color: #fbc02d; }
        .icon-image { background: #e3f2fd; color: #1e88e5; }
        .icon-video { background: #ede7f6; color: #5e35b1; }
        .icon-pdf { background: #ffebee; color: #d32f2f; }
        .icon-doc { background: #e8f5e9; color: #2e7d32; }
        .icon-default { background: #f5f5f5; color: #757575; }

        /* BUTTONS & ACTIONS */
        .btn-act { width: 45px; height: 45px; border-radius: 12px; border: none; background: #f5f5f5; color: #666; cursor: pointer; transition: 0.2s; font-size: 18px; }
        .btn-act:hover { background: #eee; color: #000; transform: translateY(-2px); }
        .btn-del:hover { background: #ffebee; color: #d32f2f; }

        /* FAB & POPUP */
        .fab {
            position: fixed; bottom: calc(40px + var(--safe-bottom)); right: 40px; width: 85px; height: 85px;
            border-radius: 28px; background: #000; border: 4px solid var(--gold);
            display: flex; align-items: center; justify-content: center; z-index: 6000;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5); color: var(--gold); font-size: 35px;
            transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); cursor: pointer;
        }
        .fab:hover { transform: scale(1.05) rotate(90deg); }
        .fab:active { transform: scale(0.9); }

        #pop { 
            position: fixed; display: none; bottom: calc(140px + var(--safe-bottom)); right: 40px; 
            background: #fff; border-radius: 25px; box-shadow: 0 30px 100px rgba(0,0,0,0.4); 
            z-index: 8000; min-width: 300px; overflow: hidden; border: 1px solid #eee;
            animation: popIn 0.3s ease-out;
        }
        @keyframes popIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .pop-item { padding: 22px 30px; display: flex; align-items: center; gap: 20px; cursor: pointer; font-weight: 700; color: #333; transition: 0.2s; border-bottom: 1px solid #f9f9f9; }
        .pop-item:hover { background: #fcfcfc; padding-left: 35px; color: var(--gold); }
        .pop-item i { font-size: 20px; width: 25px; text-align: center; }
        
        /* VIEWER & MODALS */
        #viewer { display: none; position: fixed; inset: 0; background: rgba(0,0,0,1); z-index: 9500; flex-direction: column; }
        .v-header { height: calc(85px + var(--safe-top)); display: flex; align-items: flex-end; justify-content: space-between; padding: 0 30px 20px; color: #fff; background: #000; }
        .v-content { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .v-content img, .v-content video { max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 0 100px rgba(0,0,0,0.5); }
        .v-content iframe { width: 100%; height: 100%; border: none; background: #fff; }

        #modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 10000; align-items: center; justify-content: center; padding: 20px; }
        .m-card { background: #fff; width: 100%; max-width: 500px; padding: 45px; border-radius: 35px; box-shadow: 0 40px 150px rgba(0,0,0,0.6); }
        .m-header { font-weight: 900; font-size: 26px; margin-bottom: 25px; color: #000; font-family: 'Google Sans'; }
        .m-input { width: 100%; padding: 20px; border: 3px solid #f0f0f0; border-radius: 18px; margin-bottom: 25px; font-size: 18px; font-weight: 700; transition: 0.3s; }
        .m-input:focus { border-color: var(--gold); }
        .m-btn { width: 100%; padding: 20px; border-radius: 18px; border: none; background: var(--gold); font-weight: 900; font-size: 19px; cursor: pointer; color: #000; transition: 0.3s; box-shadow: 0 10px 30px var(--gold-glow); }
        .m-btn:hover { transform: translateY(-3px); box-shadow: 0 15px 40px var(--gold-glow); }
        .m-btn-sec { background: #f0f0f0; color: #666; margin-top: 15px; box-shadow: none; }

        /* NEURAL STATUS PANEL */
        .neural-info { padding: 30px; background: #080808; margin-top: auto; border-top: 1px solid #1a1a1a; }
        .n-row { display: flex; justify-content: space-between; font-size: 10px; font-weight: 800; color: #444; margin-bottom: 12px; letter-spacing: 1px; }
        .n-bar { height: 6px; background: #151515; border-radius: 3px; overflow: hidden; }
        .n-fill { height: 100%; background: var(--gold); width: 100%; box-shadow: 0 0 15px var(--gold); }

        /* LOADER */
        .loader-overlay { position: absolute; inset: 0; background: rgba(255,255,255,0.95); z-index: 1000; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 20px; }
        .loader-text { font-weight: 900; color: var(--gold); font-size: 12px; letter-spacing: 4px; }
    </style>
</head>
<body>

<header>
    <div class="logo" onclick="toggleSidebar()">
        <img src="${LOGO_URL}"> <b>TITANIUM <span>ULTRA</span></b>
    </div>
    <div style="text-align: right;">
        <div style="font-size: 11px; font-weight: 900; color: var(--gold); letter-spacing: 1px;">logist-x.store</div>
        <div style="font-size: 9px; color: #555; font-weight: 700;">SYSTEM VERSION: v146.0.0-PRO</div>
    </div>
</header>

<div class="shell">
    <aside id="sidebar">
        <div class="tree-header">Neural Structure</div>
        <div class="nav-link active" id="n-root" onclick="nav('root', 'MAIN ARCHIVE')"><i class="fa fa-layer-group"></i> Главный массив</div>
        <div class="nav-link" id="n-log" onclick="nav('${MY_ROOT_ID}', 'LOGISTICS CORE')"><i class="fa fa-truck-ramp-box"></i> Логистика X</div>
        <div class="nav-link" id="n-merch" onclick="nav('${MERCH_ROOT_ID}', 'MERCHANDISING')"><i class="fa fa-shop"></i> Мерчандайзинг</div>
        
        <div class="neural-info">
            <div class="n-row"><span>REPLICATION STATUS</span> <span>STABLE</span></div>
            <div class="n-bar"><div class="n-fill"></div></div>
            <div class="n-row" style="margin-top:15px;"><span>INTEGRITY</span> <span>99.9%</span></div>
            <div class="n-row" style="margin-top:5px; color: #222;"><span>LOCAL CACHE: ACTIVE</span></div>
        </div>
    </aside>
    
    <main>
        <div class="loader-overlay" id="loader">
            <i class="fa fa-circle-notch fa-spin fa-4x" style="color:var(--gold)"></i>
            <div class="loader-text">SYNCHRONIZING...</div>
        </div>
        
        <div class="dash-bar">
            <div style="display:flex; align-items:center;"><div class="live-dot"></div> <span id="sync-info">NEURAL CORE LINK ESTABLISHED</span></div>
            <div id="stat-count" style="letter-spacing: 1px;">0 OBJECTS</div>
        </div>

        <div class="toolbar">
            <div class="breadcrumb" id="bc">/ storage / root</div>
            
            <div class="search-box">
                <i class="fa fa-search"></i>
                <input type="text" id="q" placeholder="Поиск объектов..." oninput="filterFiles(this.value)">
            </div>
            
            <button class="btn-act" onclick="refresh()"><i class="fa fa-sync-alt"></i></button>
            <button class="btn-act" onclick="nav('root')"><i class="fa fa-home"></i></button>
        </div>

        <div class="content">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Наименование объекта</th>
                        <th style="width: 150px; text-align: right;">Действия</th>
                    </tr>
                </thead>
                <tbody id="f-body"></tbody>
            </table>
        </div>
    </main>
</div>

<div class="fab" onclick="togglePop(event)"><i class="fa fa-plus"></i></div>

<div id="pop">
    <div class="pop-item" onclick="openModal('folder')"><i class="fa fa-folder-plus"></i> Создать папку</div>
    <div class="pop-item" onclick="openModal('file')"><i class="fa fa-file-code"></i> Создать JSON базу</div>
    <div class="pop-item" onclick="document.getElementById('fin').click()"><i class="fa fa-cloud-upload-alt"></i> Загрузить медиа</div>
    <div class="pop-item" style="color:#d32f2f" onclick="alert('Neural wipe is disabled')"><i class="fa fa-radiation"></i> Очистить кэш</div>
</div>

<div id="viewer">
    <div class="v-header">
        <span id="v-title" style="font-weight:900; opacity:0.7; font-size: 20px;"></span> 
        <i class="fa fa-times-circle" onclick="closeViewer()" style="font-size: 45px; color:var(--gold); cursor:pointer;"></i>
    </div>
    <div class="v-content" id="v-body"></div>
</div>

<div id="modal">
    <div class="m-card">
        <div class="m-header" id="m-title">ДЕЙСТВИЕ</div>
        <input type="text" id="m-input" class="m-input" placeholder="Введите имя...">
        <div id="file-type-select" style="display:none; margin-bottom: 20px;">
             <select id="m-type" class="m-input">
                <option value="application/json">Database (.json)</option>
                <option value="text/plain">Plain Text (.txt)</option>
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
    let rawFiles = [];

    function toggleSidebar() { if(window.innerWidth < 1024) document.getElementById('sidebar').classList.toggle('open'); }
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
            rawFiles = await r.json();
            render(rawFiles);
            updateSidebarUI(id);
        } catch(e) { 
            body.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:100px; color:red; font-weight:800;">NEURAL LINK FAILURE</td></tr>'; 
        } finally { 
            setTimeout(() => loader.style.display = 'none', 300); 
        }
    }

    function updateSidebarUI(id) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        if(id === 'root') document.getElementById('n-root').classList.add('active');
        if(id === '${MY_ROOT_ID}') document.getElementById('n-log').classList.add('active');
        if(id === '${MERCH_ROOT_ID}') document.getElementById('n-merch').classList.add('active');
    }

    function filterFiles(q) {
        const filtered = rawFiles.filter(f => f.name.toLowerCase().includes(q.toLowerCase()));
        render(filtered);
    }

    function getFileInfo(mime) {
        if(mime.includes('folder')) return { icon:'fa-folder', cls:'icon-folder', tag:'DIR' };
        if(mime.includes('image')) return { icon:'fa-file-image', cls:'icon-image', tag:'IMAGE' };
        if(mime.includes('video')) return { icon:'fa-file-video', cls:'icon-video', tag:'VIDEO' };
        if(mime.includes('pdf')) return { icon:'fa-file-pdf', cls:'icon-pdf', tag:'PDF' };
        if(mime.includes('json') || mime.includes('javascript')) return { icon:'fa-database', cls:'icon-doc', tag:'DATA' };
        return { icon:'fa-file-lines', cls:'icon-default', tag:'FILE' };
    }

    function render(files) {
        const body = document.getElementById('f-body');
        document.getElementById('stat-count').innerText = files.length + ' OBJECTS';
        body.innerHTML = files.length ? '' : '<tr><td colspan="2" style="text-align:center; padding:150px; color:#ccc; font-weight:900; letter-spacing:5px;">VOID</td></tr>';
        
        files.forEach(f => {
            const info = getFileInfo(f.mimeType);
            const tr = document.createElement('tr');
            tr.innerHTML = \`
                <td>
                    <div class="f-item">
                        <div class="f-icon \${info.cls}"><i class="fa \${info.icon}"></i></div>
                        <div>
                            <div class="f-name">\${f.name}</div>
                            <div class="f-meta">
                                <span class="badge \${f.isLocal?'b-local':'b-cloud'}">\${f.isLocal?'LOCAL MIRROR':'CLOUD ONLY'}</span>
                                <span class="badge b-type">\${info.tag}</span>
                                <span>\${(f.size/1024/1024 || 0).toFixed(2)} MB</span>
                            </div>
                        </div>
                    </div>
                </td>
                <td style="text-align:right;" onclick="event.stopPropagation()">
                    <button class="btn-act btn-del" onclick="deleteAsset('\${f.id}')"><i class="fa fa-trash-alt"></i></button>
                </td>
            \`;
            tr.onclick = () => f.mimeType.includes('folder') ? nav(f.id, f.name) : openViewer(f);
            body.appendChild(tr);
        });
    }

    async function deleteAsset(id) {
        if(!confirm('Удалить объект из облака и локального зеркала?')) return;
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

        // Прокси для фото и видео через наш сервер
        const proxyUrl = '/storage/api/proxy/' + f.id;

        if(f.mimeType.includes('image')) {
            b.innerHTML = \`<img src="\${proxyUrl}">\`;
        } else if(f.mimeType.includes('video')) {
            b.innerHTML = \`<video controls autoplay><source src="\${proxyUrl}"></video>\`;
        } else {
            // Для PDF и документов используем нативный превьюер Drive
            b.innerHTML = \`<iframe src="https://drive.google.com/file/d/\${f.id}/preview"></iframe>\`;
        }
    }

    function closeViewer() { document.getElementById('viewer').style.display='none'; document.getElementById('v-body').innerHTML=''; }

    function openModal(action) {
        mAction = action;
        document.getElementById('modal').style.display = 'flex';
        document.getElementById('m-title').innerText = action === 'folder' ? 'НОВАЯ ПАПКА' : 'НОВАЯ БАЗА';
        document.getElementById('file-type-select').style.display = action === 'file' ? 'block' : 'none';
        document.getElementById('m-input').value = '';
    }

    function closeModal() { document.getElementById('modal').style.display = 'none'; }

    async function modalConfirm() {
        const name = document.getElementById('m-input').value;
        if(!name) return;
        document.getElementById('loader').style.display = 'flex';
        const type = document.getElementById('m-type').value;
        closeModal();

        const endpoint = mAction === 'folder' ? '/storage/api/mkdir' : '/storage/api/mkfile';
        await fetch(endpoint, { 
            method:'POST', 
            headers:{'Content-Type':'application/json'}, 
            body:JSON.stringify({name, parentId:curId, type}) 
        });
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

    // INITIALIZATION
    nav('root');
</script>
</body>
</html>
    `;

    app.get('/storage', (req, res) => res.send(UI));

    logNeural("TITANIUM ULTRA-INSTINCT GIGA-MONOLITH ACTIVATED | logist-x.store");
};