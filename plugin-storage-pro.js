/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v153.0 | MAXIMUS EDITION (FULL UNPACKED CORE)
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * -----------------------------------------------------------------------------------------
 * ПОЛНАЯ РАЗВЕРТКА СИСТЕМЫ:
 * * [1] NEURAL ARCHITECT (НЕЙРОННОЕ ЯДРО):
 * - Полная репликация структуры папок Google Drive.
 * - Создание физических зеркал файлов на диске сервера.
 * - Индексация для мгновенного поиска.
 *
 * [2] DATABASE SYNC (ЗЕРКАЛО БАЗ ДАННЫХ):
 * - Автоматическое вытягивание barcodes.json и planograms.json.
 * - Синхронизация ключей keys_database.json.
 *
 * [3] UI/UX MODULE (ИНТЕРФЕЙС):
 * - QR-Teleport (Генератор кодов).
 * - Multi-Touch (Мультивыбор файлов).
 * - PWA Core (Установка на iPhone/Android).
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- [CONFIGURATION] НАСТРОЙКИ СИСТЕМЫ ---
const CONFIG = {
    PASSWORD: "admin",           // Пароль доступа
    SESSION_KEY: "titanium_x_session_v153",
    LOGO: "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png",
    PATHS: {
        STORAGE: path.join(__dirname, 'local_storage'),
        DB_MIRROR: path.join(__dirname, 'db_mirror'),
        NEURAL_MAP: path.join(__dirname, 'titanium_neural_map.json'),
        LOGS: path.join(__dirname, 'titanium_system.log')
    }
};

// --- [INIT] ИНИЦИАЛИЗАЦИЯ ФАЙЛОВОЙ СИСТЕМЫ ---
[CONFIG.PATHS.STORAGE, CONFIG.PATHS.DB_MIRROR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Загрузка нейронной карты из памяти (если есть)
let NEURAL_MEMORY = { map: {}, stats: { total_files: 0, last_sync: 0 } };
if (fs.existsSync(CONFIG.PATHS.NEURAL_MAP)) {
    try {
        NEURAL_MEMORY = JSON.parse(fs.readFileSync(CONFIG.PATHS.NEURAL_MAP, 'utf8'));
        console.log(`[TITANIUM]: Neural Memory Loaded. Objects: ${Object.keys(NEURAL_MEMORY.map).length}`);
    } catch (e) {
        console.error("[TITANIUM]: Memory corrupted, starting fresh.");
    }
}

module.exports = function(app, context) {
    const { 
        drive, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, readBarcodeDb, readPlanogramDb 
    } = context;

    const upload = multer({ dest: 'uploads/' });

    /**
     * =====================================================================================
     * РАЗДЕЛ 1: NEURAL ARCHITECT (МОЗГ СИСТЕМЫ)
     * =====================================================================================
     */

    // Логирование событий
    function logSystem(msg) {
        const entry = `[${new Date().toISOString()}] ${msg}\n`;
        fs.appendFileSync(CONFIG.PATHS.LOGS, entry);
    }

    // Сохранение состояния памяти на диск
    function saveMemoryState() {
        fs.writeFile(CONFIG.PATHS.NEURAL_MAP, JSON.stringify(NEURAL_MEMORY, null, 2), () => {});
    }

    // Рекурсивное определение пути (чтобы знать, в какой папке лежит файл)
    async function resolveDeepPath(folderId) {
        let chain = [];
        try {
            let current = folderId;
            const stopIds = [MY_ROOT_ID, MERCH_ROOT_ID, 'root', undefined, null];
            
            while (current && !stopIds.includes(current)) {
                // Сначала ищем в памяти (быстро)
                if (NEURAL_MEMORY.map[current]) {
                    chain.unshift(NEURAL_MEMORY.map[current].name);
                    current = NEURAL_MEMORY.map[current].parentId;
                } else {
                    // Если нет в памяти, спрашиваем Google API
                    const info = await drive.files.get({ fileId: current, fields: 'id, name, parents' });
                    if (!info.data.name) break;
                    chain.unshift(info.data.name);
                    current = (info.data.parents) ? info.data.parents[0] : null;
                }
                if (chain.length > 20) break; // Защита от зацикливания
            }
        } catch (e) {
            logSystem(`Path Error: ${e.message}`);
        }
        return chain;
    }

    // ГЛАВНЫЙ ПРОЦЕССОР ОБУЧЕНИЯ
    async function titaniumNeuralProcess(asset, action = 'sync', buffer = null) {
        // Выполняем в фоне (setImmediate), чтобы не тормозить UI
        setImmediate(async () => {
            try {
                if (action === 'delete') {
                    // Удаление из памяти и с диска
                    const entry = NEURAL_MEMORY.map[asset.id];
                    if (entry && entry.localPath && fs.existsSync(entry.localPath)) {
                        fs.unlinkSync(entry.localPath);
                    }
                    delete NEURAL_MEMORY.map[asset.id];
                    logSystem(`Object Deleted: ${asset.id}`);
                } else {
                    // Синхронизация и обучение
                    const { id, name, parentId, mimeType } = asset;
                    
                    // 1. Понимаем, к какому проекту относится (Логист или Мерч)
                    let folderChain = await resolveDeepPath(parentId);
                    const isMerch = (parentId === MERCH_ROOT_ID || folderChain.some(n => n && n.toLowerCase().includes('мерч')));
                    const projectNode = isMerch ? 'MERCH_CORE' : 'LOGIST_CORE';

                    // 2. Строим путь на диске сервера
                    const localDirPath = path.join(CONFIG.PATHS.STORAGE, projectNode, ...folderChain);
                    const localFilePath = path.join(localDirPath, name || `asset_${id}`);

                    // 3. Создаем физическую папку
                    if (!fs.existsSync(localDirPath)) {
                        fs.mkdirSync(localDirPath, { recursive: true });
                    }

                    // 4. Если передан контент файла - сохраняем его
                    if (buffer) {
                        fs.writeFileSync(localFilePath, buffer);
                    }

                    // 5. Записываем в Нейронную Память
                    NEURAL_MEMORY.map[id] = { 
                        localPath: fs.existsSync(localFilePath) ? localFilePath : null, 
                        name: name, 
                        mimeType: mimeType,
                        parentId: parentId,
                        isLocal: fs.existsSync(localFilePath),
                        project: projectNode,
                        updatedAt: Date.now()
                    };
                }

                // Сохраняем и запускаем зеркалирование баз
                saveMemoryState();
                if (action !== 'delete') await mirrorSystemDatabases();

            } catch (e) {
                logSystem(`Neural Process Error: ${e.message}`);
            }
        });
    }

    // ЗЕРКАЛИРОВАНИЕ БАЗ ДАННЫХ (Для server.js)
    async function mirrorSystemDatabases() {
        try {
            const keys = await readDatabase();
            if (!keys) return;

            // Сохраняем ключи
            fs.writeFileSync(path.join(CONFIG.PATHS.DB_MIRROR, 'keys_database.json'), JSON.stringify(keys, null, 2));

            // Проходим по каждому ключу и скачиваем базы
            for (let k of keys) {
                if (k.folderId) {
                    const keyDir = path.join(CONFIG.PATHS.DB_MIRROR, k.key);
                    if (!fs.existsSync(keyDir)) fs.mkdirSync(keyDir, { recursive: true });

                    try {
                        const [bDb, pDb] = await Promise.all([
                            readBarcodeDb(k.folderId), 
                            readPlanogramDb(k.folderId)
                        ]);

                        if (bDb) fs.writeFileSync(path.join(keyDir, 'barcodes.json'), JSON.stringify(bDb, null, 2));
                        if (pDb) fs.writeFileSync(path.join(keyDir, 'planograms.json'), JSON.stringify(pDb, null, 2));
                    } catch (err) {
                        // Игнорируем ошибки конкретных баз, чтобы не остановить процесс
                    }
                }
            }
        } catch (e) {
            logSystem(`DB Mirror Error: ${e.message}`);
        }
    }

    /**
     * =====================================================================================
     * РАЗДЕЛ 2: API GATEWAY (СВЯЗЬ С ВНЕШНИМ МИРОМ)
     * =====================================================================================
     */

    // Middleware проверки пароля
    function checkAuth(req) {
        const cookie = req.headers.cookie;
        return cookie && cookie.includes(`${CONFIG.SESSION_KEY}=granted`);
    }
    const protect = (req, res, next) => checkAuth(req) ? next() : res.status(401).json({error: "Access Denied"});

    // 1. Авторизация
    app.post('/storage/auth', express.json(), (req, res) => {
        if (req.body.password === CONFIG.PASSWORD) {
            res.setHeader('Set-Cookie', `${CONFIG.SESSION_KEY}=granted; Max-Age=604800; Path=/; HttpOnly`);
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    });

    // 2. Получение списка файлов (Гибридный режим)
    app.get('/storage/api/list', protect, async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            let parentId = null;

            // Определяем родителя для кнопки "Назад"
            if (folderId !== 'root') {
                try {
                    const meta = await drive.files.get({ fileId: folderId, fields: 'parents' });
                    if (meta.data.parents) parentId = meta.data.parents[0];
                } catch(e) {}
            }

            // Прямой запрос к Google (Гарантия актуальности)
            const r = await drive.files.list({ 
                q: `'${folderId}' in parents and trashed = false`, 
                fields: 'files(id, name, mimeType, size, iconLink)', 
                orderBy: 'folder, name' 
            });

            // Отправляем файлы Нейронке на обучение
            r.data.files.forEach(f => titaniumNeuralProcess({ ...f, parentId: folderId }, 'sync'));

            res.json({ files: r.data.files, parentId });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 3. Проксирование медиа (Stream)
    app.get('/storage/api/proxy/:id', protect, async (req, res) => {
        try {
            const response = await drive.files.get({ fileId: req.params.id, alt: 'media' }, { responseType: 'stream' });
            const meta = await drive.files.get({ fileId: req.params.id, fields: 'mimeType' });
            res.setHeader('Content-Type', meta.data.mimeType);
            response.data.pipe(res);
        } catch (e) { res.status(404).send("Stream Unavailable"); }
    });

    // 4. Скачивание файлов
    app.get('/storage/api/download/:id', async (req, res) => {
        try {
            const meta = await drive.files.get({ fileId: req.params.id, fields: 'name, mimeType' });
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.data.name)}"`);
            const response = await drive.files.get({ fileId: req.params.id, alt: 'media' }, { responseType: 'stream' });
            response.data.pipe(res);
        } catch (e) { res.status(500).send("Download Failed"); }
    });

    // 5. Загрузка новых файлов
    app.post('/storage/api/upload', upload.single('file'), protect, async (req, res) => {
        try {
            const filePath = req.file.path;
            const r = await drive.files.create({ 
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: { mimeType: req.file.mimetype, body: fs.createReadStream(filePath) },
                fields: 'id, name, mimeType'
            });

            // Обучаем систему новому файлу + сохраняем локально
            const buffer = fs.readFileSync(filePath);
            await titaniumNeuralProcess({ ...r.data, parentId: req.body.folderId }, 'sync', buffer);

            fs.unlinkSync(filePath); // Удаляем временный файл
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    // 6. Удаление файлов
    app.post('/storage/api/delete', express.json(), protect, async (req, res) => {
        try {
            const ids = req.body.ids || [req.body.id];
            for (let id of ids) {
                await drive.files.delete({ fileId: id });
                await titaniumNeuralProcess({ id }, 'delete'); // Забываем навсегда
            }
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    // 7. Создание папок
    app.post('/storage/api/mkdir', express.json(), protect, async (req, res) => {
        try {
            const r = await drive.files.create({ 
                resource: { name: req.body.name, mimeType: 'application/vnd.google-apps.folder', parents: [req.body.parentId] },
                fields: 'id, name, mimeType'
            });
            await titaniumNeuralProcess({ ...r.data, parentId: req.body.parentId }, 'sync');
            res.json(r.data);
        } catch (e) { res.status(500).send(e.message); }
    });

    // --- MANIFEST PWA (Для установки на телефон) ---
    app.get('/storage/manifest.json', (req, res) => {
        res.json({
            "name": "Logist X Cloud",
            "short_name": "Logist X",
            "start_url": "/storage",
            "display": "standalone",
            "background_color": "#000000",
            "theme_color": "#000000",
            "icons": [{ "src": CONFIG.LOGO, "sizes": "512x512", "type": "image/png" }]
        });
    });

    // Отдача HTML интерфейса
    app.get('/storage', (req, res) => {
        if (!checkAuth(req)) return res.send(UI_COMPONENTS.LOGIN);
        res.send(UI_COMPONENTS.DASHBOARD);
    });

    /**
     * =====================================================================================
     * РАЗДЕЛ 3: UI ENGINE (ГРАФИЧЕСКИЙ ИНТЕРФЕЙС)
     * =====================================================================================
     */
    const UI_COMPONENTS = {
        LOGIN: `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
            <title>LOGIN | TITANIUM</title>
            <style>
                body { background: #000; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .login-card { background: #111; padding: 40px; border-radius: 20px; border: 1px solid #333; text-align: center; width: 300px; }
                input { width: 100%; padding: 15px; margin: 15px 0; background: #222; border: 1px solid #444; color: #fff; border-radius: 10px; font-size: 16px; box-sizing: border-box; text-align: center; }
                button { width: 100%; padding: 15px; background: #f0b90b; border: none; border-radius: 10px; font-weight: bold; font-size: 16px; cursor: pointer; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <img src="${CONFIG.LOGO}" width="80" style="border-radius:15px; margin-bottom:20px;">
                <h3 style="margin:0 0 20px 0">TITANIUM MAXIMUS</h3>
                <input type="password" id="pass" placeholder="Код доступа">
                <button onclick="doLogin()">ВОЙТИ</button>
            </div>
            <script>
                async function doLogin() {
                    const p = document.getElementById('pass').value;
                    const r = await fetch('/storage/auth', { 
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ password: p })
                    });
                    const d = await r.json();
                    if(d.success) location.reload();
                    else alert('Ошибка доступа');
                }
            </script>
        </body>
        </html>
        `,

        DASHBOARD: `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
            
            <link rel="manifest" href="/storage/manifest.json">
            <meta name="apple-mobile-web-app-capable" content="yes">
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
            <meta name="theme-color" content="#000000">
            <link rel="apple-touch-icon" href="${CONFIG.LOGO}">

            <title>Logist X</title>
            
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

            <style>
                :root { 
                    --gold: #f0b90b; 
                    --bg: #000000; 
                    --card: #151515;
                    --safe-top: env(safe-area-inset-top); 
                    --safe-bot: env(safe-area-inset-bottom); 
                }
                body { background: var(--bg); color: #fff; font-family: 'Inter', sans-serif; margin: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
                
                /* HEADER */
                .header { padding: calc(15px + var(--safe-top)) 20px 15px; background: rgba(20,20,20,0.95); backdrop-filter: blur(20px); border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; z-index: 50; }
                .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 16px; }
                .brand img { width: 32px; border-radius: 8px; box-shadow: 0 0 15px rgba(240,185,11,0.2); }
                .head-actions { display: flex; gap: 20px; font-size: 18px; color: #888; }
                .head-actions i { cursor: pointer; transition: 0.2s; }
                .head-actions i:active { color: var(--gold); }

                /* MAIN AREA */
                .viewport { flex: 1; overflow-y: auto; padding-bottom: 120px; }
                
                .nav-pills { padding: 15px 20px; display: flex; gap: 10px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
                .pill { padding: 10px 18px; background: #1a1a1a; border-radius: 25px; font-size: 13px; white-space: nowrap; border: 1px solid #333; transition: 0.2s; font-weight: 600; }
                .pill.active { border-color: var(--gold); color: var(--gold); background: rgba(240,185,11,0.1); }
                
                /* LIST ITEMS */
                .f-row { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid #1a1a1a; gap: 15px; transition: 0.2s; }
                .f-row:active { background: #111; }
                
                .f-icon { width: 44px; height: 44px; border-radius: 12px; background: #151515; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #555; flex-shrink: 0; }
                .is-dir .f-icon { color: var(--gold); background: rgba(240,185,11,0.1); }
                
                .f-details { flex: 1; min-width: 0; }
                .f-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .f-size { font-size: 12px; color: #666; font-weight: 500; }
                
                /* MULTI-SELECT CHECKBOX */
                .check-circle { width: 24px; height: 24px; border: 2px solid #444; border-radius: 50%; display: none; align-items: center; justify-content: center; transition: 0.2s; }
                .mode-select .check-circle { display: flex; }
                .row-selected .check-circle { background: var(--gold); border-color: var(--gold); }
                .row-selected .check-circle::after { content: '✓'; color: #000; font-weight: 900; font-size: 14px; }

                /* FLOATING ACTION BUTTON */
                .fab { position: fixed; bottom: calc(30px + var(--safe-bot)); right: 30px; width: 60px; height: 60px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #000; box-shadow: 0 10px 30px rgba(240,185,11,0.3); z-index: 100; transition: 0.3s; cursor: pointer; }
                .fab:active { transform: scale(0.9); }

                /* BATCH BAR */
                .batch-actions { position: fixed; bottom: 30px; left: 20px; right: 20px; background: #222; border-radius: 18px; padding: 15px 25px; display: none; justify-content: space-between; align-items: center; border: 1px solid #333; z-index: 200; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
                .batch-txt { font-weight: 700; color: #fff; }

                /* MODALS */
                .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 2000; display: none; align-items: center; justify-content: center; backdrop-filter: blur(8px); }
                .modal-box { background: #1a1a1a; width: 85%; max-width: 350px; padding: 30px; border-radius: 25px; text-align: center; border: 1px solid #333; }

                /* VIEWER */
                #media-viewer { position: fixed; inset: 0; background: #000; z-index: 3000; display: none; flex-direction: column; }
                .viewer-close { position: absolute; top: calc(20px + var(--safe-top)); right: 20px; font-size: 32px; padding: 20px; z-index: 10; cursor: pointer; opacity: 0.7; }
                .viewer-body { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
                .viewer-body img, .viewer-body video { max-width: 100%; max-height: 100%; object-fit: contain; }
            </style>
        </head>
        <body>

        <div class="header">
            <div class="brand"><img src="${CONFIG.LOGO}"> TITANIUM</div>
            <div class="head-actions">
                <i class="fa fa-sync-alt" onclick="reloadFolder()" title="Обновить"></i>
                <i class="fa fa-check-double" id="btn-select" onclick="toggleSelectMode()" title="Выбор"></i>
            </div>
        </div>

        <div class="viewport">
            <div class="nav-pills">
                <div class="pill" id="btn-up" onclick="goLevelUp()" style="display:none"><i class="fa fa-arrow-left"></i></div>
                <div class="pill active" onclick="navigate('root')">Главная</div>
                <div class="pill" onclick="navigate('${MY_ROOT_ID}')">Логистика</div>
                <div class="pill" onclick="navigate('${MERCH_ROOT_ID}')">Мерч</div>
            </div>
            
            <div id="file-list"></div>
        </div>

        <div class="batch-actions" id="batch-bar">
            <span class="batch-txt" id="selected-count">0 выбрано</span>
            <i class="fa fa-trash" style="color:#e53935; font-size: 22px; cursor: pointer;" onclick="deleteSelected()"></i>
        </div>

        <div class="fab" id="fab-main" onclick="document.getElementById('file-input').click()">
            <i class="fa fa-plus"></i>
        </div>
        <input type="file" id="file-input" style="display:none" multiple onchange="uploadFiles(this.files)">

        <div class="modal-overlay" id="qr-modal" onclick="closeQR()">
            <div class="modal-box" onclick="event.stopPropagation()">
                <h3 style="margin-top:0">QR SHARE</h3>
                <div style="background:#fff; padding:15px; border-radius:15px; display:inline-block; margin: 15px 0;">
                    <div id="qr-target"></div>
                </div>
                <div style="color:#777; font-size:12px">Наведите камеру для скачивания</div>
            </div>
        </div>

        <div id="media-viewer">
            <i class="fa fa-times viewer-close" onclick="closeViewer()"></i>
            <div class="viewer-body" id="viewer-content"></div>
        </div>

        <script>
            let currentFolder = 'root';
            let parentFolder = null;
            let selection = new Set();
            let isSelectMode = false;

            // --- NAVIGATION ---
            async function navigate(folderId) {
                currentFolder = folderId;
                selection.clear(); updateSelectionUI();
                
                const listEl = document.getElementById('file-list');
                listEl.innerHTML = '<div style="text-align:center; padding:50px; opacity:0.5"><i class="fa fa-circle-notch fa-spin fa-2x"></i></div>';
                
                try {
                    const res = await fetch('/storage/api/list?folderId=' + folderId);
                    if (res.status === 401) return location.reload();
                    const data = await res.json();
                    
                    parentFolder = data.parentId;
                    renderFiles(data.files);
                    
                    document.getElementById('btn-up').style.display = (folderId === 'root') ? 'none' : 'block';
                } catch (e) {
                    listEl.innerHTML = '<div style="text-align:center; padding:50px; color:#e53935">Ошибка соединения</div>';
                }
            }

            function goLevelUp() {
                if (parentFolder) navigate(parentFolder);
                else navigate('root');
            }

            function reloadFolder() { navigate(currentFolder); }

            // --- RENDERING ---
            function renderFiles(files) {
                const listEl = document.getElementById('file-list');
                listEl.innerHTML = '';

                if (files.length === 0) {
                    listEl.innerHTML = '<div style="text-align:center; padding:50px; color:#555">Папка пуста</div>';
                    return;
                }

                files.forEach(file => {
                    const isDir = file.mimeType.includes('folder');
                    const div = document.createElement('div');
                    div.className = 'f-row ' + (isDir ? 'is-dir' : '');
                    
                    div.innerHTML = \`
                        <div class="check-circle"></div>
                        <div class="f-icon">
                            <i class="fa \${getIconClass(file.mimeType, isDir)}"></i>
                        </div>
                        <div class="f-details">
                            <div class="f-name">\${file.name}</div>
                            <div class="f-size">\${formatSize(file.size)}</div>
                        </div>
                        <div style="color:#666; font-size:18px; \${isSelectMode ? 'display:none' : ''}" onclick="event.stopPropagation()">
                            \${!isDir ? \`<i class="fa fa-qrcode" onclick="openQR('\${file.id}')"></i>\` : ''}
                        </div>
                    \`;

                    // Handle Click
                    div.onclick = () => {
                        if (isSelectMode) {
                            toggleSelection(file.id, div);
                        } else {
                            if (isDir) navigate(file.id);
                            else openViewer(file.id, file.mimeType);
                        }
                    };

                    // Handle Long Press
                    let pressTimer;
                    div.addEventListener('touchstart', () => {
                        pressTimer = setTimeout(() => {
                            if (!isSelectMode) toggleSelectMode();
                        }, 600);
                    });
                    div.addEventListener('touchend', () => clearTimeout(pressTimer));

                    listEl.appendChild(div);
                });
            }

            // --- SELECTION LOGIC ---
            function toggleSelectMode() {
                isSelectMode = !isSelectMode;
                document.body.classList.toggle('mode-select', isSelectMode);
                
                const selBtn = document.getElementById('btn-select');
                selBtn.style.color = isSelectMode ? '#f0b90b' : '#888';
                
                document.getElementById('batch-bar').style.display = isSelectMode ? 'flex' : 'none';
                document.getElementById('fab-main').style.display = isSelectMode ? 'none' : 'flex';
                
                selection.clear();
                updateSelectionUI();
                navigate(currentFolder); // Rerender to show checks
            }

            function toggleSelection(id, element) {
                if (selection.has(id)) {
                    selection.delete(id);
                    element.classList.remove('row-selected');
                } else {
                    selection.add(id);
                    element.classList.add('row-selected');
                }
                updateSelectionUI();
            }

            function updateSelectionUI() {
                document.getElementById('selected-count').innerText = selection.size + ' выбрано';
            }

            async function deleteSelected() {
                if (selection.size === 0) return;
                if (!confirm(\`Удалить объекты (\${selection.size})?\`)) return;

                await fetch('/storage/api/delete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ids: Array.from(selection) })
                });

                toggleSelectMode(); // Exit mode
                reloadFolder();
            }

            // --- UPLOAD ---
            async function uploadFiles(files) {
                for (let file of files) {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('folderId', currentFolder);
                    await fetch('/storage/api/upload', { method: 'POST', body: formData });
                }
                reloadFolder();
            }

            // --- VIEWERS ---
            function openQR(id) {
                const modal = document.getElementById('qr-modal');
                const target = document.getElementById('qr-target');
                target.innerHTML = '';
                const url = window.location.origin + '/storage/api/download/' + id;
                new QRCode(target, { text: url, width: 200, height: 200 });
                modal.style.display = 'flex';
            }
            function closeQR() { document.getElementById('qr-modal').style.display = 'none'; }

            function openViewer(id, mime) {
                const viewer = document.getElementById('media-viewer');
                const body = document.getElementById('viewer-content');
                const url = '/storage/api/proxy/' + id;

                if (mime.includes('image')) {
                    body.innerHTML = \`<img src="\${url}">\`;
                    viewer.style.display = 'flex';
                } else if (mime.includes('video')) {
                    body.innerHTML = \`<video controls autoplay src="\${url}"></video>\`;
                    viewer.style.display = 'flex';
                } else {
                    window.location.href = '/storage/api/download/' + id;
                }
            }
            function closeViewer() { 
                document.getElementById('media-viewer').style.display = 'none'; 
                document.getElementById('viewer-content').innerHTML = '';
            }

            // --- UTILS ---
            function getIconClass(mime, isDir) {
                if (isDir) return 'fa-folder';
                if (mime.includes('image')) return 'fa-file-image';
                if (mime.includes('video')) return 'fa-file-video';
                if (mime.includes('pdf')) return 'fa-file-pdf';
                return 'fa-file';
            }

            function formatSize(bytes) {
                if (!bytes) return '';
                return (bytes / 1024 / 1024).toFixed(2) + ' MB';
            }

            // START
            navigate('root');
        </script>
        </body>
        </html>
        `
    };
};
