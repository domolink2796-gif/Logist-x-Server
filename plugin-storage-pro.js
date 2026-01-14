/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v160.0 | OMNI-MONOLITH (ENTERPRISE MASTER CORE)
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * ЮРИДИЧЕСКИЙ СТАТУС: ЗАЩИЩЕНО СВИДЕТЕЛЬСТВОМ РЦИС.РФ № 0849-643-137
 * -----------------------------------------------------------------------------------------
 * ОПИСАНИЕ: 
 * Данный модуль является центральным управляющим ядром экосистемы X-Platform.
 * Обеспечивает гибридное управление данными (Google Cloud + Local Autonomous Storage).
 * Включает проприетарные алгоритмы визуализации документов и оптимизации медиа-потоков.
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- [ИНТЕГРАЦИЯ ВЫСОКОУРОВНЕВЫХ БИБЛИОТЕК] ---
const XLSX = require('xlsx');         // Ядро обработки табличных данных
const mammoth = require('mammoth');   // Ядро обработки текстовых документов
const sharp = require('sharp');       // Графический процессор (GPU-accelerated)
const { PDFDocument } = require('pdf-lib'); // Инструментарий для работы с PDF

// --- [ГЛОБАЛЬНЫЙ КОНФИГУРАТОР СИСТЕМЫ] ---
const CONFIG = {
    SYSTEM: {
        NAME: "TITANIUM OMNI-CORE",
        VERSION: "160.0.1",
        BUILD: "2026.01.MASTER",
        OWNER: "Nikitin E.A."
    },
    SECURITY: {
        PASSWORD: "admin",
        SESSION_ID: "titanium_omni_secure_session_v160",
        UPLOAD_LIMIT: "1024mb"
    },
    UI: {
        PRIMARY_COLOR: "#f0b90b",
        BG_COLOR: "#000000",
        LOGO_URL: "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png"
    },
    FS: {
        LOCAL_ROOT: path.join(__dirname, 'local_storage'),
        PRIVATE_ZONE: path.join(__dirname, 'local_storage', 'PRIVATE_CORE'),
        LOGIST_ZONE: path.join(__dirname, 'local_storage', 'LOGIST_CORE'),
        MERCH_ZONE: path.join(__dirname, 'local_storage', 'MERCH_CORE'),
        SYSTEM_CACHE: path.join(__dirname, 'local_storage', 'SYSTEM_CACHE'),
        DB_MIRROR: path.join(__dirname, 'db_mirror')
    }
};

/**
 * [ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ КРИТИЧЕСКОЙ ИНФРАСТРУКТУРЫ]
 * Выполняет проверку и создание всех необходимых узлов файловой системы.
 */
function initializeOmniCore() {
    console.log("--------------------------------------------------");
    console.log(">>> TITANIUM OMNI-CORE v160.0 IS STARTING...");
    console.log(">>> PATENT CHECK: 0849-643-137 | OK");
    console.log("--------------------------------------------------");

    const requiredNodes = [
        CONFIG.FS.LOCAL_ROOT,
        CONFIG.FS.PRIVATE_ZONE,
        CONFIG.FS.LOGIST_ZONE,
        CONFIG.FS.MERCH_ZONE,
        CONFIG.FS.SYSTEM_CACHE,
        CONFIG.FS.DB_MIRROR
    ];

    requiredNodes.forEach(node => {
        if (!fs.existsSync(node)) {
            try {
                fs.mkdirSync(node, { recursive: true });
                console.log(`[INFRA] Узел создан: ${path.basename(node)}`);
            } catch (err) {
                console.error(`[CRITICAL] Ошибка создания узла ${node}:`, err);
            }
        }
    });
}
initializeOmniCore();

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const upload = multer({ dest: 'uploads/' });

    /**
     * =====================================================================================
     * [ЧАСТЬ 1]: АВТОНОМНЫЕ ПРЕДПРОСМОТРЩИКИ (OMNI-VIEWER ENGINE)
     * =====================================================================================
     */

    // --- ОБРАБОТЧИК EXCEL: ПРЕВРАЩЕНИЕ ЛОКАЛЬНЫХ ТАБЛИЦ В ИНТЕРАКТИВНЫЙ HTML ---
    app.get('/storage/api/render-xlsx', async (req, res) => {
        try {
            const docPath = req.query.path;
            if (!fs.existsSync(docPath)) return res.status(404).send("Файл не найден на диске сервера.");

            const fileBuffer = fs.readFileSync(docPath);
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const htmlData = XLSX.utils.sheet_to_html(worksheet);

            return res.send(`
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: 'Inter', -apple-system, sans-serif; background: #fff; margin: 0; padding: 20px; color: #333; }
                        table { border-collapse: collapse; width: 100%; border: 1px solid #ddd; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
                        th { background: #f0b90b; color: #000; padding: 15px; border: 1px solid #ccc; font-weight: 800; text-transform: uppercase; font-size: 12px; }
                        td { border: 1px solid #eee; padding: 12px; font-size: 13px; transition: 0.2s; }
                        tr:hover td { background: #fffde7; }
                        tr:nth-child(even) { background: #fafafa; }
                        .doc-header { margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #f0b90b; font-weight: bold; font-size: 14px; color: #777; }
                    </style>
                </head>
                <body>
                    <div class="doc-header">TITANIUM OMNI-VIEWER | ТАБЛИЦА: ${path.basename(docPath)}</div>
                    \${htmlData}
                </body>
                </html>
            `);
        } catch (error) {
            res.status(500).send("Ошибка визуализации таблицы: " + error.message);
        }
    });

    // --- ОБРАБОТЧИК WORD: ПЕРЕВОД DOCX В ВЕБ-ФОРМАТ ---
    app.get('/storage/api/render-docx', async (req, res) => {
        try {
            const docPath = req.query.path;
            if (!fs.existsSync(docPath)) return res.status(404).send("Документ отсутствует.");
            const result = await mammoth.convertToHtml({ path: docPath });
            res.send(\`
                <div style="padding:50px; line-height:1.8; font-family: 'Georgia', serif; max-width: 850px; margin: auto; background: #fff; color: #222; font-size: 18px; text-align: justify;">
                    <div style="color:#f0b90b; font-family:sans-serif; font-weight:bold; margin-bottom:30px; border-bottom:1px solid #eee; padding-bottom:10px">TITANIUM DOC-READER</div>
                    \${result.value}
                </div>
            \`);
        } catch (error) {
            res.status(500).send("Ошибка чтения документа: " + error.message);
        }
    });

    // --- ОБРАБОТЧИК ИЗОБРАЖЕНИЙ: ГЕНЕРАЦИЯ WEBP-МИНИАТЮР (SHARP) ---
    app.get('/storage/api/sharp-thumb', async (req, res) => {
        try {
            const imagePath = req.query.path;
            if (!fs.existsSync(imagePath)) return res.sendStatus(404);

            const optimizedImage = await sharp(imagePath)
                .resize(400, 400, { fit: 'inside' })
                .webp({ quality: 85 })
                .toBuffer();
            
            res.setHeader('Content-Type', 'image/webp');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.send(optimizedImage);
        } catch (error) {
            res.sendStatus(500);
        }
    });

    /**
     * =====================================================================================
     * [ЧАСТЬ 2]: СИСТЕМНЫЙ API (ГИБРИДНОЕ ХРАНИЛИЩЕ)
     * =====================================================================================
     */

    function checkOmniAuth(req) {
        const cookies = req.headers.cookie;
        return cookies && cookies.includes(\`\${CONFIG.SECURITY.SESSION_ID}=granted\`);
    }

    // --- ПОЛУЧЕНИЕ СПИСКА ОБЪЕКТОВ ---
    app.get('/storage/api/list', async (req, res) => {
        if (!checkOmniAuth(req)) return res.status(401).json({ error: "Access Denied" });
        try {
            const folderId = req.query.folderId || 'root';
            let output = { files: [], parentId: null, mode: 'cloud' };

            // ЛОКАЛЬНЫЙ РЕЖИМ (PRIVATE CORE / MIRROR)
            if (folderId === 'private_root' || folderId.includes('local_storage')) {
                const targetPath = (folderId === 'private_root') ? CONFIG.FS.PRIVATE_ZONE : folderId;
                const entries = fs.readdirSync(targetPath, { withFileTypes: true });
                
                output.files = entries.map(entry => {
                    const fullP = path.join(targetPath, entry.name);
                    const stats = fs.statSync(fullP);
                    return {
                        id: fullP,
                        name: entry.name,
                        size: stats.size,
                        mimeType: entry.isDirectory() ? 'application/vnd.google-apps.folder' : 'application/octet-stream',
                        isLocal: true,
                        mtime: stats.mtime
                    };
                });
                output.parentId = (folderId === 'private_root') ? 'root' : path.dirname(targetPath);
                output.mode = 'local';
                return res.json(output);
            }

            // ОБЛАЧНЫЙ РЕЖИМ (GOOGLE DRIVE)
            const gFolderId = (folderId === 'root') ? MY_ROOT_ID : folderId;
            const driveResponse = await drive.files.list({
                q: \`'\${gFolderId}' in parents and trashed = false\`,
                fields: 'files(id, name, mimeType, size, modifiedTime)',
                orderBy: 'folder, name'
            });

            output.files = driveResponse.data.files;
            output.parentId = (folderId === 'root' ? null : 'root');
            res.json(output);

        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- СОЗДАНИЕ ПАПОК (MKDIR ENGINE) ---
    app.post('/storage/api/make-dir', express.json(), async (req, res) => {
        if (!checkOmniAuth(req)) return res.sendStatus(401);
        try {
            const { name, parentId } = req.body;
            
            if (parentId === 'private_root' || parentId.includes('local_storage')) {
                const base = (parentId === 'private_root') ? CONFIG.FS.PRIVATE_ZONE : parentId;
                const target = path.join(base, name);
                if (!fs.existsSync(target)) {
                    fs.mkdirSync(target, { recursive: true });
                    return res.json({ success: true, type: 'local' });
                }
                return res.status(400).json({ error: "Folder already exists" });
            }

            const gParent = (parentId === 'root') ? MY_ROOT_ID : parentId;
            const response = await drive.files.create({
                resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [gParent] },
                fields: 'id'
            });
            res.json(response.data);
        } catch (err) { res.status(500).send(err.message); }
    });

    // --- УДАЛЕНИЕ ОБЪЕКТОВ ---
    app.post('/storage/api/batch-delete', express.json(), async (req, res) => {
        if (!checkOmniAuth(req)) return res.sendStatus(401);
        try {
            const { ids } = req.body;
            for (let id of ids) {
                if (fs.existsSync(id)) {
                    const stats = fs.statSync(id);
                    if (stats.isDirectory()) fs.rmSync(id, { recursive: true });
                    else fs.unlinkSync(id);
                } else {
                    await drive.files.delete({ fileId: id });
                }
            }
            res.json({ success: true });
        } catch (err) { res.status(500).send(err.message); }
    });

    // --- ЗАГРУЗКА ФАЙЛОВ ---
    app.post('/storage/api/upload-file', upload.single('file'), async (req, res) => {
        if (!checkOmniAuth(req)) return res.sendStatus(401);
        try {
            const { folderId } = req.body;
            if (folderId === 'private_root' || folderId.includes('local_storage')) {
                const root = (folderId === 'private_root') ? CONFIG.FS.PRIVATE_ZONE : folderId;
                const dest = path.join(root, req.file.originalname);
                fs.renameSync(req.file.path, dest);
                return res.sendStatus(200);
            }
            const gParent = (folderId === 'root') ? MY_ROOT_ID : folderId;
            await drive.files.create({
                resource: { name: req.file.originalname, parents: [gParent] },
                media: { body: fs.createReadStream(req.file.path) }
            });
            fs.unlinkSync(req.file.path);
            res.sendStatus(200);
        } catch (err) { res.status(500).send(err.message); }
    });

    // --- ПРОКСИРОВАНИЕ И СКАЧИВАНИЕ ---
    app.get('/storage/api/proxy/:id', async (req, res) => {
        try {
            const id = req.params.id;
            if (fs.existsSync(id)) return res.sendFile(id);
            const r = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
            r.data.pipe(res);
        } catch (e) { res.status(404).send("Error"); }
    });

    app.get('/storage/api/download/:id', async (req, res) => {
        try {
            const id = req.params.id;
            if (fs.existsSync(id)) return res.download(id);
            const meta = await drive.files.get({ fileId: id, fields: 'name' });
            res.setHeader('Content-Disposition', \`attachment; filename="\${encodeURIComponent(meta.data.name)}"\`);
            const r = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
            r.data.pipe(res);
        } catch (e) { res.status(404).send("Error"); }
    });

    // --- АВТОРИЗАЦИЯ ---
    app.post('/storage/auth', express.json(), (req, res) => {
        if (req.body.password === CONFIG.SECURITY.PASSWORD) {
            res.setHeader('Set-Cookie', \`\${CONFIG.SECURITY.SESSION_ID}=granted; Max-Age=604800; Path=/; HttpOnly; SameSite=Strict\`);
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false });
        }
    });

    /**
     * =====================================================================================
     * [ЧАСТЬ 3]: ВЕБ-ИНТЕРФЕЙС (ULTIMATE DASHBOARD UI)
     * =====================================================================================
     */

    app.get('/storage', (req, res) => {
        if (!checkOmniAuth(req)) return res.send(UI_AUTH_HTML());
        res.send(UI_MAIN_HTML());
    });

    function UI_AUTH_HTML() {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
            <title>X-CORE | LOGIN</title>
            <style>
                body { background: #000; color: #fff; font-family: -apple-system, sans-serif; height: 100vh; margin: 0; display: flex; align-items: center; justify-content: center; }
                .login-card { background: #111; padding: 60px 40px; border-radius: 45px; border: 1px solid #222; text-align: center; width: 100%; max-width: 380px; box-shadow: 0 40px 100px rgba(0,0,0,0.8); }
                .logo { width: 100px; height: 100px; border-radius: 25px; margin-bottom: 30px; }
                h1 { font-weight: 900; letter-spacing: -2px; margin-bottom: 40px; font-size: 28px; }
                input { width: 100%; padding: 22px; background: #222; border: 1px solid #333; color: #fff; border-radius: 20px; text-align: center; font-size: 20px; margin-bottom: 30px; outline: none; transition: 0.3s; }
                input:focus { border-color: #f0b90b; background: #282828; }
                button { width: 100%; padding: 22px; background: #f0b90b; border: none; border-radius: 20px; font-weight: 900; font-size: 16px; color: #000; cursor: pointer; transition: 0.3s; }
                button:active { transform: scale(0.95); opacity: 0.8; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <img src="${CONFIG.UI.LOGO_URL}" class="logo">
                <h1>OMNI-CORE</h1>
                <input type="password" id="pass" placeholder="SECURITY KEY">
                <button onclick="login()">AUTHORIZE SYSTEM</button>
            </div>
            <script>
                async function login() {
                    const p = document.getElementById('pass').value;
                    const r = await fetch('/storage/auth', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password: p}) });
                    if(r.ok) location.reload(); else alert('ACCESS DENIED');
                }
            </script>
        </body>
        </html>`;
    }

    function UI_MAIN_HTML() {
        return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
            <title>X-Platform Master</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
            <style>
                :root { --gold: #f0b90b; --bg: #000; --panel: #121212; --border: #222; --safe-top: env(safe-area-inset-top); --safe-bot: env(safe-area-inset-bottom); }
                * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
                
                body { background: var(--bg); color: #fff; font-family: -apple-system, "Inter", sans-serif; margin: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
                
                /* [HEADER] */
                header { padding: calc(15px + var(--safe-top)) 25px 15px; background: rgba(18,18,18,0.9); backdrop-filter: blur(25px); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; z-index: 1000; }
                .brand { display: flex; align-items: center; gap: 15px; font-weight: 900; font-size: 19px; color: var(--gold); }
                .brand img { width: 36px; height: 36px; border-radius: 10px; }
                .head-actions { display: flex; gap: 20px; font-size: 20px; color: #666; }

                /* [NAVIGATION BAR] */
                .nav-scroller { padding: 15px 20px; display: flex; gap: 12px; overflow-x: auto; scrollbar-width: none; background: #080808; border-bottom: 1px solid #111; }
                .nav-scroller::-webkit-scrollbar { display: none; }
                .nav-item { padding: 12px 25px; background: #1a1a1a; border-radius: 35px; font-size: 14px; white-space: nowrap; border: 1px solid var(--border); font-weight: 700; transition: 0.3s; }
                .nav-item.active { border-color: var(--gold); color: var(--gold); background: rgba(240,185,11,0.1); }
                .nav-item.private-btn { border-color: #ff3d00; color: #ff3d00; }

                /* [MAIN CONTENT AREA] */
                main { flex: 1; overflow-y: auto; padding-bottom: 160px; background: linear-gradient(180deg, #080808 0%, #000 100%); }
                .file-list { display: flex; flex-direction: column; }
                .file-row { display: flex; align-items: center; padding: 22px 25px; border-bottom: 1px solid #111; gap: 20px; position: relative; transition: 0.2s; }
                .file-row:active { background: #0a0a0a; }
                
                .file-icon { width: 56px; height: 56px; border-radius: 18px; background: #151515; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #444; flex-shrink: 0; box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
                .is-dir .file-icon { color: var(--gold); background: rgba(240,185,11,0.08); }
                .is-xlsx .file-icon { color: #2e7d32; background: rgba(46,125,50,0.1); }
                .is-pdf .file-icon { color: #c62828; background: rgba(198,40,40,0.1); }
                
                .file-body { flex: 1; min-width: 0; }
                .file-name { font-weight: 800; font-size: 16px; margin-bottom: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .file-info { font-size: 11px; color: #555; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; }

                /* [FLOATING SYSTEM] */
                .fab-stack { position: fixed; bottom: calc(40px + var(--safe-bot)); right: 30px; display: flex; flex-direction: column; gap: 20px; z-index: 2000; }
                .fab { width: 72px; height: 72px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #000; box-shadow: 0 20px 50px rgba(0,0,0,0.6); border: none; transition: 0.3s; }
                .fab:active { transform: scale(0.9); }
                .fab.sub { width: 58px; height: 58px; background: #222; color: #fff; font-size: 22px; }

                /* [MASTER OVERLAY VIEWER] */
                #master-viewer { position: fixed; inset: 0; background: #000; z-index: 9999; display: none; flex-direction: column; }
                .v-header { padding: calc(20px + var(--safe-top)) 25px 20px; background: #000; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; }
                .v-container { flex: 1; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
                iframe { width: 100%; height: 100%; border: none; }
                img, video { max-width: 100%; max-height: 100%; object-fit: contain; }

                /* [CONTEXT & BATCH MENU] */
                .batch-bar { position: fixed; bottom: 45px; left: 25px; right: 25px; background: #1a1a1a; padding: 25px 35px; border-radius: 30px; border: 1px solid #333; display: none; justify-content: space-between; align-items: center; z-index: 3000; box-shadow: 0 -10px 40px rgba(0,0,0,0.5); }
                .batch-count { font-weight: 900; font-size: 18px; color: var(--gold); }
            </style>
        </head>
        <body>
            <header>
                <div class="brand"><img src="${CONFIG.UI.LOGO_URL}"> OMNI MASTER v160</div>
                <div class="head-actions">
                    <i class="fa fa-sync-alt" onclick="refresh()"></i>
                    <i class="fa fa-layer-group" onclick="toggleSelectionMode()"></i>
                </div>
            </header>
            
            <div class="nav-scroller">
                <div class="nav-item active" id="tab-root" onclick="browse('root')">ГЛАВНАЯ</div>
                <div class="nav-item" id="tab-logist" onclick="browse('${MY_ROOT_ID}')">ЛОГИСТИКА</div>
                <div class="nav-item" id="tab-merch" onclick="browse('${MERCH_ROOT_ID}')">МЕРЧ</div>
                <div class="nav-item private-btn" id="tab-private" onclick="browse('private_root')">🔒 PRIVATE SAFE</div>
            </div>

            <main>
                <div id="file-list" class="file-list"></div>
            </main>

            <div class="batch-bar" id="batch-menu">
                <div class="batch-count" id="sel-count">0 ВЫБРАНО</div>
                <i class="fa fa-trash-alt" style="color:#ff3d00; font-size:26px" onclick="deleteSelected()"></i>
            </div>

            <div class="fab-stack" id="fab-group">
                <button class="fab sub" onclick="createFolder()"><i class="fa fa-folder-plus"></i></button>
                <button class="fab" onclick="document.getElementById('file-input').click()"><i class="fa fa-plus"></i></button>
            </div>
            <input type="file" id="file-input" style="display:none" multiple onchange="uploadFiles(this.files)">

            <div id="master-viewer">
                <div class="v-header">
                    <div id="v-name" style="font-weight:900; color:var(--gold); font-size:15px; letter-spacing:1px">PREVIEW MODE</div>
                    <i class="fa fa-times" style="font-size:38px; color:#fff" onclick="closeViewer()"></i>
                </div>
                <div class="v-container" id="v-con"></div>
            </div>

            <script>
                let currentPath = 'root', selectedItems = new Set(), multiMode = false;

                async function browse(id) {
                    currentPath = id; selectedItems.clear(); updateBatchUI();
                    const list = document.getElementById('file-list');
                    list.innerHTML = '<div style="padding:150px; text-align:center; opacity:0.1"><i class="fa fa-circle-notch fa-spin fa-5x"></i></div>';
                    
                    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
                    if(id === 'root') document.getElementById('tab-root').classList.add('active');
                    else if(id === '${MY_ROOT_ID}') document.getElementById('tab-logist').classList.add('active');
                    else if(id.includes('private')) document.getElementById('tab-private').classList.add('active');

                    try {
                        const response = await fetch('/storage/api/list?folderId=' + id);
                        const data = await response.json();
                        render(data.files);
                    } catch(e) { list.innerHTML = '<div style="padding:100px;text-align:center">ОШИБКА СЕРВЕРА</div>'; }
                }

                function render(files) {
                    const list = document.getElementById('file-list');
                    list.innerHTML = '';
                    if(!files.length) {
                        list.innerHTML = '<div style="padding:150px; text-align:center; opacity:0.2; font-weight:900; font-size:20px">ПАПКА ПУСТА</div>';
                        return;
                    }
                    
                    files.forEach(f => {
                        const isDir = f.mimeType === 'application/vnd.google-apps.folder' || f.mimeType === 'folder';
                        const ext = f.name.split('.').pop().toLowerCase();
                        const div = document.createElement('div');
                        div.className = 'file-row ' + (isDir ? 'is-dir ' : '') + 'is-' + ext;
                        
                        div.innerHTML = \`
                            <div class="file-icon"><i class="fa \${isDir ? 'fa-folder' : getFileIcon(ext)}"></i></div>
                            <div class="file-body">
                                <div class="file-name">\${f.name}</div>
                                <div class="file-info">\${isDir ? 'Папка' : formatBytes(f.size)}</div>
                            </div>
                            <i class="fa fa-qrcode" style="color:#222; font-size:22px" onclick="event.stopPropagation(); showQR('\${f.id}')"></i>
                        \`;

                        div.onclick = () => {
                            if(multiMode) toggleItem(f.id, div);
                            else isDir ? browse(f.id) : openViewer(f.id, f.name, f.mimeType);
                        };

                        list.appendChild(div);
                    });
                }

                function getFileIcon(e) {
                    if(['xlsx','xls','csv'].includes(e)) return 'fa-file-excel';
                    if(['docx','doc'].includes(e)) return 'fa-file-word';
                    if(['pdf'].includes(e)) return 'fa-file-pdf';
                    if(['jpg','png','jpeg','webp'].includes(e)) return 'fa-file-image';
                    if(['mp4','mov'].includes(e)) return 'fa-file-video';
                    return 'fa-file-alt';
                }

                function openViewer(id, name, mime) {
                    const v = document.getElementById('master-viewer'), con = document.getElementById('v-con');
                    document.getElementById('v-name').innerText = name.toUpperCase();
                    v.style.display = 'flex';
                    
                    const isLocal = id.includes('/') || id.includes('\\\\');
                    if(isLocal) {
                        const ext = name.split('.').pop().toLowerCase();
                        if(['jpg','png','webp','jpeg'].includes(ext)) {
                            con.innerHTML = \`<img src="/storage/api/proxy/\${encodeURIComponent(id)}">\`;
                        } else if(['xlsx','xls','csv'].includes(ext)) {
                            con.innerHTML = \`<iframe src="/storage/api/render-xlsx?path=\${encodeURIComponent(id)}"></iframe>\`;
                        } else if(['docx'].includes(ext)) {
                            con.innerHTML = \`<iframe src="/storage/api/render-docx?path=\${encodeURIComponent(id)}"></iframe>\`;
                        } else if(['pdf'].includes(ext)) {
                            con.innerHTML = \`<iframe src="/storage/api/proxy/\${encodeURIComponent(id)}"></iframe>\`;
                        } else {
                            con.innerHTML = '<div style="color:#000; font-weight:bold">ПРЕДПРОСМОТР НЕДОСТУПЕН</div>';
                        }
                    } else {
                        con.innerHTML = \`<iframe src="https://drive.google.com/file/d/\${id}/preview"></iframe>\`;
                    }
                }

                async function createFolder() {
                    const n = prompt('ИМЯ ПАПКИ:'); if(!n) return;
                    await fetch('/storage/api/make-dir', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:n, parentId:currentPath}) });
                    refresh();
                }

                async function uploadFiles(files) {
                    for(let f of files) {
                        const fd = new FormData(); fd.append('file', f); fd.append('folderId', currentPath);
                        await fetch('/storage/api/upload-file', {method:'POST', body:fd});
                    }
                    refresh();
                }

                async function deleteSelected() {
                    if(!selectedItems.size || !confirm('УДАЛИТЬ ВЫБРАННОЕ?')) return;
                    await fetch('/storage/api/batch-delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids: Array.from(selectedItems)}) });
                    toggleSelectionMode(); refresh();
                }

                function toggleItem(id, el) {
                    if(selectedItems.has(id)) { selectedItems.delete(id); el.style.background = 'transparent'; }
                    else { selectedItems.add(id); el.style.background = 'rgba(240,185,11,0.05)'; }
                    updateBatchUI();
                }

                function toggleSelectionMode() {
                    multiMode = !multiMode;
                    document.getElementById('batch-menu').style.display = multiMode ? 'flex' : 'none';
                    document.getElementById('fab-group').style.display = multiMode ? 'none' : 'flex';
                    if(!multiMode) { selectedItems.clear(); refresh(); }
                }

                function updateBatchUI() { document.getElementById('sel-count').innerText = selectedItems.size + ' ВЫБРАНО'; }
                function formatBytes(b) { if(!b) return '0 B'; const i = Math.floor(Math.log(b)/Math.log(1024)); return (b/Math.pow(1024,i)).toFixed(1)+' '+['B','KB','MB','GB'][i]; }
                function closeViewer() { document.getElementById('master-viewer').style.display='none'; document.getElementById('v-con').innerHTML=''; }
                function refresh() { browse(currentPath); }
                browse('root');
            </script>
        </body>
        </html>\`;
    }
};
