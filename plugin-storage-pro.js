/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v156.0 | MONOLITH EDITION (MAXIMUM FUNCTIONALITY)
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * СТАТУС: ЗАЩИЩЕНО СВИДЕТЕЛЬСТВОМ № 0849-643-137 (РЦИС.РФ)
 * -----------------------------------------------------------------------------------------
 * ДАННЫЙ МОДУЛЬ ЯВЛЯЕТСЯ ПОЛНОРАЗМЕРНЫМ ЯДРОМ ФАЙЛОВОЙ СИСТЕМЫ.
 * ВКЛЮЧАЕТ В СЕБЯ:
 * - ГИБРИДНОЕ ОБЛАКО (GOOGLE DRIVE + LOCAL STORAGE)
 * - АВТОНОМНЫЙ ЛИЧНЫЙ СЕЙФ (PRIVATE CORE)
 * - СИСТЕМУ СОЗДАНИЯ СТРУКТУРЫ ПАПОК (MKDIR)
 * - ИНТЕЛЛЕКТУАЛЬНЫЙ ПРОСМОТРЩИК (OMNI-VIEWER)
 * - СИСТЕМУ ЛОКАЛЬНОЙ ПАМЯТИ (NEURAL ARCHITECT)
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- [1] ГЛОБАЛЬНАЯ КОНФИГУРАЦИЯ И ПУТИ ---
const CONFIG = {
    VERSION: "156.0 MONOLITH",
    PASSWORD: "admin",
    SESSION_KEY: "titanium_monolith_v156",
    LOGO: "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png",
    PATHS: {
        ROOT: __dirname,
        STORAGE: path.join(__dirname, 'local_storage'),
        PRIVATE: path.join(__dirname, 'local_storage', 'PRIVATE_CORE'),
        DB_MIRROR: path.join(__dirname, 'db_mirror'),
        NEURAL_MAP: path.join(__dirname, 'titanium_neural_map.json'),
        LOGS: path.join(__dirname, 'titanium_system.log')
    },
    MIME_TYPES: {
        EXCEL: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
        WORD: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        PDF: ['application/pdf'],
        IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        VIDEO: ['video/mp4', 'video/quicktime', 'video/x-msvideo']
    }
};

// --- [2] ИНИЦИАЛИЗАЦИЯ ФАЙЛОВОЙ СИСТЕМЫ ---
function initFileSystem() {
    const dirs = [
        CONFIG.PATHS.STORAGE, 
        CONFIG.PATHS.PRIVATE, 
        CONFIG.PATHS.DB_MIRROR,
        path.join(CONFIG.PATHS.STORAGE, 'LOGIST_CORE'),
        path.join(CONFIG.PATHS.STORAGE, 'MERCH_CORE')
    ];
    
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[INIT] Created directory: ${dir}`);
        }
    });
}
initFileSystem();

// Загрузка нейронной памяти
let NEURAL_MEMORY = { map: {}, lastUpdate: Date.now() };
if (fs.existsSync(CONFIG.PATHS.NEURAL_MAP)) {
    try {
        NEURAL_MEMORY = JSON.parse(fs.readFileSync(CONFIG.PATHS.NEURAL_MAP, 'utf8'));
    } catch (e) {
        console.error("[NEURAL] Memory corrupted. Resetting...");
    }
}

module.exports = function(app, context) {
    const { 
        drive, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, readBarcodeDb, readPlanogramDb 
    } = context;

    const upload = multer({ dest: 'uploads/' });

    // Вспомогательная функция сохранения памяти
    const persistMemory = () => {
        fs.writeFile(CONFIG.PATHS.NEURAL_MAP, JSON.stringify(NEURAL_MEMORY, null, 2), (err) => {
            if (err) console.error("[NEURAL] Save Error:", err);
        });
    };

    /**
     * =====================================================================================
     * [3] MIDDLEWARE И БЕЗОПАСНОСТЬ
     * =====================================================================================
     */
    function isAuthorized(req) {
        const cookies = req.headers.cookie;
        return cookies && cookies.includes(`${CONFIG.SESSION_KEY}=granted`);
    }

    const authGuard = (req, res, next) => {
        if (isAuthorized(req)) return next();
        res.status(401).json({ error: "Unauthorized access" });
    };

    /**
     * =====================================================================================
     * [4] CORE API GATEWAY
     * =====================================================================================
     */

    // --- АВТОРИЗАЦИЯ ---
    app.post('/storage/auth', express.json(), (req, res) => {
        const { password } = req.body;
        if (password === CONFIG.PASSWORD) {
            res.setHeader('Set-Cookie', `${CONFIG.SESSION_KEY}=granted; Max-Age=604800; Path=/; HttpOnly; SameSite=Strict`);
            return res.json({ success: true });
        }
        res.status(401).json({ success: false, message: "Invalid Password" });
    });

    // --- ПОЛУЧЕНИЕ СПИСКА (HYBRID LISTING) ---
    app.get('/storage/api/list', authGuard, async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            let results = { files: [], parentId: null, isPrivate: false };

            // А) ПРОВЕРКА НА ЛИЧНОЕ ХРАНИЛИЩЕ
            if (folderId === 'private_root' || folderId.includes('PRIVATE_CORE')) {
                const targetDir = folderId === 'private_root' ? CONFIG.PATHS.PRIVATE : folderId;
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                
                const items = fs.readdirSync(targetDir, { withFileTypes: true });
                results.files = items.map(item => {
                    const fullPath = path.join(targetDir, item.name);
                    const stats = fs.statSync(fullPath);
                    return {
                        id: fullPath,
                        name: item.name,
                        mimeType: item.isDirectory() ? 'application/vnd.google-apps.folder' : 'application/octet-stream',
                        size: stats.size,
                        modifiedTime: stats.mtime,
                        isLocal: true
                    };
                });
                results.parentId = (folderId === 'private_root') ? 'root' : 'private_root';
                results.isPrivate = true;
                return res.json(results);
            }

            // Б) СТАНДАРТНАЯ ЛОГИКА GOOGLE DRIVE
            const actualFolderId = (folderId === 'root') ? MY_ROOT_ID : folderId;
            
            // Получаем родителя для навигации
            if (folderId !== 'root') {
                const meta = await drive.files.get({ fileId: actualFolderId, fields: 'parents' });
                if (meta.data.parents) results.parentId = meta.data.parents[0];
            }

            const response = await drive.files.list({
                q: `'${actualFolderId}' in parents and trashed = false`,
                fields: 'files(id, name, mimeType, size, modifiedTime, thumbnailLink)',
                orderBy: 'folder, name',
                pageSize: 100
            });

            results.files = response.data.files;
            
            // Фоновое обучение системы
            setImmediate(() => {
                results.files.forEach(f => {
                    NEURAL_MEMORY.map[f.id] = { ...f, parentId: actualFolderId, lastSeen: Date.now() };
                });
                persistMemory();
            });

            res.json(results);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // --- СОЗДАНИЕ ПАПОК (MKDIR ENGINE) ---
    app.post('/storage/api/mkdir', express.json(), authGuard, async (req, res) => {
        try {
            const { name, parentId } = req.body;
            
            // Если создаем в личной папке
            if (parentId === 'private_root' || parentId.includes('PRIVATE_CORE')) {
                const base = (parentId === 'private_root') ? CONFIG.PATHS.PRIVATE : parentId;
                const newDirPath = path.join(base, name);
                if (!fs.existsSync(newDirPath)) fs.mkdirSync(newDirPath, { recursive: true });
                return res.json({ success: true, path: newDirPath });
            }

            // Если создаем в Google
            const googleParentId = (parentId === 'root') ? MY_ROOT_ID : parentId;
            const folderMetadata = {
                name: name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [googleParentId]
            };

            const folder = await drive.files.create({
                resource: folderMetadata,
                fields: 'id, name'
            });

            res.json(folder.data);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // --- ЗАГРУЗКА ФАЙЛОВ (UPLOAD ENGINE) ---
    app.post('/storage/api/upload', upload.single('file'), authGuard, async (req, res) => {
        try {
            const { folderId } = req.body;
            const file = req.file;

            if (folderId === 'private_root' || folderId.includes('PRIVATE_CORE')) {
                const base = (folderId === 'private_root') ? CONFIG.PATHS.PRIVATE : folderId;
                const dest = path.join(base, file.originalname);
                fs.renameSync(file.path, dest);
                return res.json({ success: true, local: true });
            }

            const googleParentId = (folderId === 'root') ? MY_ROOT_ID : folderId;
            const media = {
                mimeType: file.mimetype,
                body: fs.createReadStream(file.path)
            };

            const response = await drive.files.create({
                resource: { name: file.originalname, parents: [googleParentId] },
                media: media,
                fields: 'id, name'
            });

            fs.unlinkSync(file.path); // Чистим временный файл
            res.json(response.data);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // --- УДАЛЕНИЕ ОБЪЕКТОВ (DELETE ENGINE) ---
    app.post('/storage/api/delete', express.json(), authGuard, async (req, res) => {
        try {
            const ids = req.body.ids || [req.body.id];
            for (let id of ids) {
                // Если это локальный путь (Private Core)
                if (id.includes(path.sep) || id.includes('/') || id.includes('\\')) {
                    if (fs.existsSync(id)) {
                        const stats = fs.statSync(id);
                        if (stats.isDirectory()) fs.rmSync(id, { recursive: true });
                        else fs.unlinkSync(id);
                    }
                } else {
                    // Если это Google ID
                    await drive.files.delete({ fileId: id });
                }
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // --- ПРОКСИРОВАНИЕ КОНТЕНТА (STREAMING PROXY) ---
    app.get('/storage/api/proxy/:id', authGuard, async (req, res) => {
        try {
            const fileId = req.params.id;

            // Локальный файл
            if (fs.existsSync(fileId)) {
                return res.sendFile(fileId);
            }

            // Google файл (Stream)
            const response = await drive.files.get(
                { fileId: fileId, alt: 'media' },
                { responseType: 'stream' }
            );
            
            const meta = await drive.files.get({ fileId: fileId, fields: 'mimeType, size' });
            res.setHeader('Content-Type', meta.data.mimeType);
            if (meta.data.size) res.setHeader('Content-Length', meta.data.size);
            
            response.data.pipe(res);
        } catch (e) {
            res.status(404).send("File not found or access denied");
        }
    });

    // --- СКАЧИВАНИЕ ФАЙЛОВ ---
    app.get('/storage/api/download/:id', async (req, res) => {
        try {
            const id = req.params.id;
            if (fs.existsSync(id)) return res.download(id);

            const meta = await drive.files.get({ fileId: id, fields: 'name, mimeType' });
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.data.name)}"`);
            res.setHeader('Content-Type', meta.data.mimeType);

            const stream = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
            stream.data.pipe(res);
        } catch (e) {
            res.status(500).send("Download error");
        }
    });

    /**
     * =====================================================================================
     * [5] ВЕБ-ИНТЕРФЕЙС (ULTIMATE DASHBOARD)
     * =====================================================================================
     */
    
    app.get('/storage', (req, res) => {
        if (!isAuthorized(req)) return res.send(RENDER_LOGIN());
        res.send(RENDER_MAIN_UI());
    });

    // РЕНДЕР СТРАНИЦЫ ВХОДА
    function RENDER_LOGIN() {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
            <title>LOGIN | TITANIUM</title>
            <style>
                body { background: #000; color: #fff; font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #111; padding: 40px; border-radius: 30px; border: 1px solid #333; text-align: center; width: 320px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
                .logo { width: 80px; height: 80px; border-radius: 20px; margin-bottom: 25px; box-shadow: 0 0 20px rgba(240,185,11,0.2); }
                h2 { font-weight: 800; margin-bottom: 30px; letter-spacing: -1px; }
                input { width: 100%; padding: 18px; background: #222; border: 1px solid #444; color: #fff; border-radius: 15px; text-align: center; font-size: 18px; margin-bottom: 20px; box-sizing: border-box; }
                button { width: 100%; padding: 18px; background: #f0b90b; border: none; border-radius: 15px; font-weight: 900; font-size: 16px; cursor: pointer; transition: 0.3s; }
                button:active { transform: scale(0.96); }
            </style>
        </head>
        <body>
            <div class="card">
                <img src="${CONFIG.LOGO}" class="logo">
                <h2>TITANIUM MONOLITH</h2>
                <input type="password" id="pass" placeholder="Код доступа">
                <button onclick="doLogin()">АВТОРИЗАЦИЯ</button>
            </div>
            <script>
                async function doLogin() {
                    const p = document.getElementById('pass').value;
                    const r = await fetch('/storage/auth', { 
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ password: p })
                    });
                    if(r.ok) location.reload();
                    else alert('ДОСТУП ЗАПРЕЩЕН');
                }
                document.getElementById('pass').onkeydown = (e) => { if(e.key === 'Enter') doLogin(); };
            </script>
        </body>
        </html>`;
    }

    // РЕНДЕР ОСНОВНОГО ИНТЕРФЕЙСА (САМЫЙ ЖИРНЫЙ БЛОК)
    function RENDER_MAIN_UI() {
        return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
            <title>Logist X</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
            <style>
                :root { 
                    --gold: #f0b90b; --bg: #000; --card: #121212; 
                    --safe-top: env(safe-area-inset-top); --safe-bot: env(safe-area-inset-bottom); 
                }
                * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
                body { background: var(--bg); color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
                
                /* HEADER */
                .header { padding: calc(15px + var(--safe-top)) 20px 15px; background: rgba(15,15,15,0.9); backdrop-filter: blur(20px); border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; z-index: 100; }
                .brand { display: flex; align-items: center; gap: 12px; font-weight: 900; font-size: 17px; }
                .brand img { width: 32px; border-radius: 8px; }
                .head-btns { display: flex; gap: 20px; font-size: 18px; color: #888; }

                /* CONTENT */
                .main { flex: 1; overflow-y: auto; padding-bottom: 120px; }
                .nav-scroller { padding: 15px 20px; display: flex; gap: 10px; overflow-x: auto; scrollbar-width: none; }
                .nav-scroller::-webkit-scrollbar { display: none; }
                .pill { padding: 10px 20px; background: #1a1a1a; border-radius: 25px; font-size: 13px; font-weight: 700; white-space: nowrap; border: 1px solid #333; transition: 0.2s; }
                .pill.active { border-color: var(--gold); color: var(--gold); background: rgba(240,185,11,0.1); }
                .pill.private-pill { border-color: #9c27b0; color: #9c27b0; }

                /* FILE ROWS */
                .file-item { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid #151515; gap: 15px; transition: 0.2s; }
                .file-item:active { background: #111; }
                .file-icon { width: 46px; height: 46px; border-radius: 14px; background: #151515; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
                
                /* ЦВЕТОВЫЕ СХЕМЫ ИКОНОК */
                .folder .file-icon { color: var(--gold); background: rgba(240,185,11,0.1); }
                .i-excel .file-icon { color: #2e7d32; background: rgba(46,125,50,0.1); }
                .i-word .file-icon { color: #1565c0; background: rgba(21,101,192,0.1); }
                .i-pdf .file-icon { color: #c62828; background: rgba(198,40,40,0.1); }
                .i-img .file-icon { color: #ad1457; background: rgba(173,20,87,0.1); }
                .i-vid .file-icon { color: #ff8f00; background: rgba(255,143,0,0.1); }

                .file-info { flex: 1; min-width: 0; }
                .file-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .file-meta { font-size: 11px; color: #555; font-weight: 600; text-transform: uppercase; }

                /* FLOATING ACTIONS */
                .fab-group { position: fixed; bottom: calc(30px + var(--safe-bot)); right: 25px; display: flex; flex-direction: column; gap: 15px; z-index: 1000; }
                .fab { width: 64px; height: 64px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #000; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: none; }
                .fab.mini { width: 52px; height: 52px; background: #222; color: #fff; font-size: 20px; }
                
                /* SELECTION MODE */
                .check-box { width: 24px; height: 24px; border: 2px solid #333; border-radius: 50%; display: none; align-items: center; justify-content: center; transition: 0.2s; }
                .sel-mode .check-box { display: flex; }
                .is-selected .check-box { background: var(--gold); border-color: var(--gold); }
                .is-selected .check-box::after { content: '✓'; color: #000; font-weight: 900; font-size: 14px; }
                .batch-bar { position: fixed; bottom: 30px; left: 20px; right: 20px; background: #1a1a1a; border-radius: 20px; padding: 15px 25px; display: none; justify-content: space-between; align-items: center; border: 1px solid #333; z-index: 2000; }

                /* VIEWER PRO */
                #viewer { position: fixed; inset: 0; background: #000; z-index: 5000; display: none; flex-direction: column; }
                .v-header { padding: calc(20px + var(--safe-top)) 20px 20px; display: flex; justify-content: space-between; align-items: center; }
                .v-content { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
                .v-content iframe { width: 100%; height: 100%; border: none; background: #fff; }
                .v-content img, .v-content video { max-width: 100%; max-height: 100%; object-fit: contain; }

                /* MODAL */
                .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); z-index: 4000; display: none; align-items: center; justify-content: center; }
                .modal { background: #111; width: 85%; max-width: 340px; border-radius: 30px; padding: 30px; text-align: center; border: 1px solid #222; }
            </style>
        </head>
        <body>

        <div class="header">
            <div class="brand"><img src="${CONFIG.LOGO}"> TITANIUM MONOLITH</div>
            <div class="head-btns">
                <i class="fa fa-sync-alt" onclick="reload()"></i>
                <i class="fa fa-check-double" id="sel-btn" onclick="toggleSelMode()"></i>
            </div>
        </div>

        <div class="main">
            <div class="nav-scroller">
                <div class="pill" id="up-btn" onclick="goUp()" style="display:none"><i class="fa fa-arrow-left"></i></div>
                <div class="pill active" onclick="navigate('root')">Главная</div>
                <div class="pill" onclick="navigate('${MY_ROOT_ID}')">Логистика</div>
                <div class="pill" onclick="navigate('${MERCH_ROOT_ID}')">Мерч</div>
                <div class="pill private-pill" onclick="navigate('private_root')">🔒 ЛИЧНОЕ</div>
            </div>
            <div id="file-list"></div>
        </div>

        <div class="batch-bar" id="batch-bar">
            <span id="sel-count" style="font-weight:800">0 выбрано</span>
            <i class="fa fa-trash" style="color:#f44336; font-size:24px" onclick="deleteBatch()"></i>
        </div>

        <div class="fab-group" id="fab-group">
            <button class="fab mini" onclick="createFolder()"><i class="fa fa-folder-plus"></i></button>
            <button class="fab" onclick="document.getElementById('file-input').click()"><i class="fa fa-plus"></i></button>
        </div>
        <input type="file" id="file-input" style="display:none" multiple onchange="handleUpload(this.files)">

        <div id="viewer">
            <div class="v-header">
                <span id="v-title" style="font-weight:700; opacity:0.6">Просмотр</span>
                <i class="fa fa-times" style="font-size:28px" onclick="closeViewer()"></i>
            </div>
            <div class="v-content" id="v-content"></div>
        </div>

        <div class="overlay" id="qr-modal" onclick="this.style.display='none'">
            <div class="modal" onclick="event.stopPropagation()">
                <h3 style="margin-top:0">QR ТЕЛЕПОРТ</h3>
                <div id="qr-target" style="background:#fff; padding:15px; border-radius:15px; display:inline-block; margin:20px 0"></div>
                <div style="font-size:12px; opacity:0.5">Наведите камеру для скачивания</div>
            </div>
        </div>

        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <script>
            let curFolder = 'root', parFolder = null, selection = new Set(), isSelMode = false;

            async function navigate(id) {
                curFolder = id;
                selection.clear(); updateSelectionUI();
                const list = document.getElementById('file-list');
                list.innerHTML = '<div style="padding:100px 0; text-align:center; opacity:0.3"><i class="fa fa-circle-notch fa-spin fa-3x"></i></div>';
                
                try {
                    const r = await fetch('/storage/api/list?folderId=' + id);
                    if(r.status === 401) return location.reload();
                    const d = await r.json();
                    parFolder = d.parentId;
                    render(d.files);
                    document.getElementById('up-btn').style.display = (id === 'root') ? 'none' : 'block';
                } catch(e) { list.innerHTML = 'Ошибка соединения'; }
            }

            function render(files) {
                const list = document.getElementById('file-list');
                list.innerHTML = '';
                if(!files.length) {
                    list.innerHTML = '<div style="padding:100px 20px; text-align:center; color:#444; font-weight:700">ПАПКА ПУСТА</div>';
                    return;
                }

                files.forEach(f => {
                    const isD = f.mimeType.includes('folder');
                    const icon = getFileIcon(f.mimeType, isD);
                    const div = document.createElement('div');
                    div.className = 'file-item ' + (isD ? 'folder ' : ' ') + icon.cls;
                    if(selection.has(f.id)) div.classList.add('is-selected');
                    
                    div.innerHTML = \`
                        <div class="check-box"></div>
                        <div class="file-icon"><i class="fa \${icon.ico}"></i></div>
                        <div class="file-info">
                            <div class="file-name">\${f.name}</div>
                            <div class="file-meta">\${isD ? 'Папка' : formatSize(f.size)}</div>
                        </div>
                        \${!isD ? \`<i class="fa fa-qrcode" style="color:#333" onclick="event.stopPropagation(); showQR('\${f.id}')"></i>\` : ''}
                    \`;

                    div.onclick = () => {
                        if(isSelMode) toggleItem(f.id, div);
                        else isD ? navigate(f.id) : openViewer(f.id, f.name, f.mimeType);
                    };

                    // Long press for selection
                    let timer;
                    div.ontouchstart = () => timer = setTimeout(() => { if(!isSelMode) toggleSelMode(); }, 600);
                    div.ontouchend = () => clearTimeout(timer);

                    list.appendChild(div);
                });
            }

            function getFileIcon(m, isD) {
                if(isD) return {ico:'fa-folder', cls:''};
                if(m.includes('excel') || m.includes('spreadsheet') || m.includes('csv')) return {ico:'fa-file-excel', cls:'i-excel'};
                if(m.includes('word') || m.includes('document')) return {ico:'fa-file-word', cls:'i-word'};
                if(m.includes('pdf')) return {ico:'fa-file-pdf', cls:'i-pdf'};
                if(m.includes('image')) return {ico:'fa-file-image', cls:'i-img'};
                if(m.includes('video')) return {ico:'fa-file-video', cls:'i-vid'};
                return {ico:'fa-file', cls:''};
            }

            function toggleSelMode() {
                isSelMode = !isSelMode;
                document.body.classList.toggle('sel-mode', isSelMode);
                document.getElementById('sel-btn').style.color = isSelMode ? 'var(--gold)' : '#888';
                document.getElementById('batch-bar').style.display = isSelMode ? 'flex' : 'none';
                document.getElementById('fab-group').style.display = isSelMode ? 'none' : 'flex';
                selection.clear(); updateSelectionUI();
                renderCurrent();
            }

            function toggleItem(id, el) {
                if(selection.has(id)) { selection.delete(id); el.classList.remove('is-selected'); }
                else { selection.add(id); el.classList.add('is-selected'); }
                updateSelectionUI();
            }

            function updateSelectionUI() { document.getElementById('sel-count').innerText = selection.size + ' выбрано'; }

            async function createFolder() {
                const name = prompt('Назовите новую папку:');
                if(!name) return;
                await fetch('/storage/api/mkdir', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name, parentId: curFolder })
                });
                reload();
            }

            async function handleUpload(files) {
                for(let f of files) {
                    const fd = new FormData(); fd.append('file', f); fd.append('folderId', curFolder);
                    await fetch('/storage/api/upload', { method: 'POST', body: fd });
                }
                reload();
            }

            async function deleteBatch() {
                if(!selection.size || !confirm('Удалить выбранное?')) return;
                await fetch('/storage/api/delete', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ids: Array.from(selection) })
                });
                toggleSelMode(); reload();
            }

            function openViewer(id, name, mime) {
                const v = document.getElementById('viewer'), c = document.getElementById('v-content');
                document.getElementById('v-title').innerText = name;
                v.style.display = 'flex';
                
                const url = '/storage/api/proxy/' + encodeURIComponent(id);
                if(mime.includes('image')) c.innerHTML = \`<img src="\${url}">\`;
                else if(mime.includes('video')) c.innerHTML = \`<video controls autoplay src="\${url}"></video>\`;
                else c.innerHTML = \`<iframe src="https://drive.google.com/file/d/\${id}/preview"></iframe>\`;
            }

            function showQR(id) {
                document.getElementById('qr-modal').style.display = 'flex';
                const target = document.getElementById('qr-target');
                target.innerHTML = '';
                new QRCode(target, { text: window.location.origin + '/storage/api/download/' + id, width: 200, height: 200 });
            }

            function formatSize(b) {
                if(!b) return '0 B';
                const k = 1024, dm = 2, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(b) / Math.log(k));
                return parseFloat((b / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
            }

            function closeViewer() { document.getElementById('viewer').style.display='none'; document.getElementById('v-content').innerHTML=''; }
            function goUp() { if(parFolder) navigate(parFolder); else navigate('root'); }
            function reload() { navigate(curFolder); }
            function renderCurrent() { reload(); }

            navigate('root');
        </script>
        </body>
        </html>`;
    }
};
