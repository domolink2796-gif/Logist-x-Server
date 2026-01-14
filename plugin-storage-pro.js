/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v162.0 | GIGANT-STATION (ULTIMATE ENTERPRISE CORE)
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * ПАТЕНТ: № 0849-643-137 (РЦИС.РФ)
 * -----------------------------------------------------------------------------------------
 * СТРУКТУРА:
 * 1. [CORE INFRASTRUCTURE]: Управление локальными и облачными узлами.
 * 2. [DOCUMENT PROCESSORS]: Автономная визуализация XLSX, DOCX, PDF.
 * 3. [IMAGE OPTIMIZER]: Sharp-движок для мгновенной генерации превью.
 * 4. [HYBRID UI SYSTEM]: Высокоуровневый интерфейс управления.
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- [ПОДКЛЮЧЕНИЕ ТЯЖЕЛОВЕСНЫХ МОДУЛЕЙ] ---
let XLSX, mammoth, sharp, PDFDocument;
try { XLSX = require('xlsx'); } catch(e) { console.warn("[WARN] XLSX не найден"); }
try { mammoth = require('mammoth'); } catch(e) { console.warn("[WARN] MAMMOTH не найден"); }
try { sharp = require('sharp'); } catch(e) { console.warn("[WARN] SHARP не найден"); }

// --- [ГЛОБАЛЬНАЯ КОНФИГУРАЦИЯ БИЗНЕС-ЛОГИКИ] ---
const CONFIG = {
    CORE: {
        NAME: "X-PLATFORM GIGANT",
        VERSION: "162.0.1",
        OWNER: "Nikitin E.A.",
        PATENT: "0849-643-137"
    },
    SECURITY: {
        ADMIN_PASS: "admin",
        AUTH_KEY: "titanium_gigant_session_v162",
        UPLOAD_LIMIT: 1024 * 1024 * 1024 // 1 Гигабайт
    },
    PATHS: {
        ROOT: __dirname,
        STORAGE: path.join(__dirname, 'local_storage'),
        PRIVATE: path.join(__dirname, 'local_storage', 'PRIVATE_CORE'),
        LOGIST: path.join(__dirname, 'local_storage', 'LOGIST_CORE'),
        MERCH: path.join(__dirname, 'local_storage', 'MERCH_CORE'),
        CACHE: path.join(__dirname, 'local_storage', 'SYSTEM_CACHE'),
        LOGS: path.join(__dirname, 'local_storage', 'SYSTEM_LOGS')
    },
    UI: {
        GOLD: "#f0b90b",
        DARK_BG: "#000000",
        LOGO: "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png"
    }
};

/**
 * [BOOTSTRAP]: Инициализация серверных узлов.
 * Создает физическую структуру папок на диске сервера.
 */
function initOmniStructure() {
    console.log("--------------------------------------------------");
    console.log(">>> INITIALIZING X-PLATFORM INFRASTRUCTURE...");
    const folders = Object.values(CONFIG.PATHS).filter(p => typeof p === 'string' && p.includes('local_storage'));
    folders.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[BOOT] NODE CREATED: \${path.basename(dir)}`);
        }
    });
    console.log(">>> ALL NODES OPERATIONAL. READY TO WORK.");
    console.log("--------------------------------------------------");
}
initOmniStructure();

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const upload = multer({ dest: 'uploads/' });

    /**
     * =====================================================================================
     * [ЧАСТЬ 1]: АВТОНОМНЫЕ ДВИЖКИ ВИЗУАЛИЗАЦИИ (SERVER-SIDE RENDERING)
     * =====================================================================================
     */

    

    // --- ОБРАБОТЧИК XLSX: ПЕРЕВОД ТАБЛИЦ В ВЕБ-СЕТКУ ---
    app.get('/storage/api/render-excel', async (req, res) => {
        try {
            const fPath = req.query.path;
            if (!XLSX || !fs.existsSync(fPath)) return res.status(404).send("Движок или файл недоступен.");

            const workbook = XLSX.readFile(fPath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const html = XLSX.utils.sheet_to_html(sheet);

            res.send(\`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8">
                <style>
                    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #fff; padding: 20px; color: #333; }
                    table { border-collapse: collapse; width: 100%; border: 1px solid #ddd; font-size: 13px; box-shadow: 0 5px 15px rgba(0,0,0,0.05); }
                    th { background: \${CONFIG.UI.GOLD}; color: #000; padding: 15px; border: 1px solid #ccc; font-weight: 800; }
                    td { border: 1px solid #eee; padding: 12px; }
                    tr:nth-child(even) { background: #fafafa; }
                    .header { font-weight: 900; border-bottom: 3px solid \${CONFIG.UI.GOLD}; padding-bottom: 10px; margin-bottom: 25px; color: #444; font-size: 16px; }
                </style></head><body>
                    <div class="header">X-PLATFORM XLSX VIEWER | АВТОНОМНОЕ ЯДРО</div>
                    \${html}
                </body></html>
            \`);
        } catch (e) { res.status(500).send("Ошибка рендеринга Excel: " + e.message); }
    });

    // --- ОБРАБОТЧИК DOCX: ПЕРЕВОД ТЕКСТА В ЧИСТЫЙ HTML ---
    app.get('/storage/api/render-word', async (req, res) => {
        try {
            const fPath = req.query.path;
            if (!mammoth || !fs.existsSync(fPath)) return res.status(404).send("Ошибка открытия документа.");
            const result = await mammoth.convertToHtml({path: fPath});
            res.send(\`
                <div style="padding:60px; font-family: 'Georgia', serif; line-height: 1.8; max-width: 850px; margin: auto; background: #fff; box-shadow: 0 0 30px rgba(0,0,0,0.1); font-size: 18px;">
                    <div style="color:\${CONFIG.UI.GOLD}; font-family:sans-serif; font-weight:900; font-size:12px; margin-bottom:30px; border-bottom:1px solid #eee; padding-bottom:10px">X-PLATFORM DOC-READER</div>
                    \${result.value}
                </div>
            \`);
        } catch (e) { res.status(500).send("Ошибка рендеринга Word: " + e.message); }
    });

    // --- ОБРАБОТЧИК МЕДИА: ГЕНЕРАЦИЯ ПРЕДПРОСМОТРА (SHARP ENGINE) ---
    app.get('/storage/api/render-thumb', async (req, res) => {
        try {
            const p = req.query.path;
            if (!sharp || !fs.existsSync(p)) return res.sendFile(p);
            const buffer = await sharp(p).resize(450, 450, { fit: 'inside' }).webp({quality: 80}).toBuffer();
            res.setHeader('Content-Type', 'image/webp');
            res.send(buffer);
        } catch (e) { res.sendStatus(500); }
    });

    /**
     * =====================================================================================
     * [ЧАСТЬ 2]: СИСТЕМНЫЕ API ВЗАИМОДЕЙСТВИЯ (HYBRID GATEWAY)
     * =====================================================================================
     */

    const checkAuth = (req) => {
        return req.headers.cookie && req.headers.cookie.includes(\`\${CONFIG.SECURITY.AUTH_KEY}=granted\`);
    };

    // --- ЛИСТИНГ: УМНОЕ РАЗДЕЛЕНИЕ ОБЛАКА И ЛОКАЛЬНОГО ДИСКА ---
    app.get('/storage/api/list-full', async (req, res) => {
        if (!checkAuth(req)) return res.status(401).json({error: "No Access"});
        try {
            const fId = req.query.folderId || 'root';
            let results = { files: [], parentId: null, isLocal: false };

            // ЛОКАЛЬНАЯ ЛОГИКА (PRIVATE / MIRRORS)
            if (fId === 'private_root' || fId.includes('local_storage')) {
                const target = (fId === 'private_root') ? CONFIG.PATHS.PRIVATE : fId;
                const entries = fs.readdirSync(target, { withFileTypes: true });
                results.files = entries.map(e => {
                    const fp = path.join(target, e.name);
                    const s = fs.statSync(fp);
                    return {
                        id: fp, name: e.name, size: s.size,
                        mimeType: e.isDirectory() ? 'folder' : 'file',
                        isLocal: true, mtime: s.mtime
                    };
                });
                results.parentId = (fId === 'private_root') ? 'root' : path.dirname(target);
                results.isLocal = true;
                return res.json(results);
            }

            // ОБЛАЧНАЯ ЛОГИКА (GOOGLE DRIVE)
            const gId = (fId === 'root') ? MY_ROOT_ID : fId;
            const driveR = await drive.files.list({
                q: \`'\${gId}' in parents and trashed = false\`,
                fields: 'files(id, name, mimeType, size, modifiedTime)',
                orderBy: 'folder, name'
            });
            results.files = driveR.data.files;
            results.parentId = (fId === 'root' ? null : 'root');
            res.json(results);
        } catch (e) { res.status(500).json({error: e.message}); }
    });

    // --- СОЗДАНИЕ ПАПОК (MKDIR ENGINE) ---
    app.post('/storage/api/make-folder', express.json(), async (req, res) => {
        if (!checkAuth(req)) return res.sendStatus(401);
        try {
            const { name, parentId } = req.body;
            
            // Если создаем в локальной зоне
            if (parentId === 'private_root' || parentId.includes('local_storage')) {
                const base = (parentId === 'private_root') ? CONFIG.PATHS.PRIVATE : parentId;
                const newPath = path.join(base, name);
                if (!fs.existsSync(newPath)) fs.mkdirSync(newPath, { recursive: true });
                return res.json({ success: true, mode: 'local' });
            }

            // Если создаем в облаке
            const gParent = (parentId === 'root') ? MY_ROOT_ID : parentId;
            const gRes = await drive.files.create({
                resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [gParent] },
                fields: 'id'
            });
            res.json(gRes.data);
        } catch (e) { res.status(500).send(e.message); }
    });

    // --- УДАЛЕНИЕ ОБЪЕКТОВ ---
    app.post('/storage/api/delete-items', express.json(), async (req, res) => {
        if (!checkAuth(req)) return res.sendStatus(401);
        try {
            const { ids } = req.body;
            for (let id of ids) {
                if (fs.existsSync(id)) {
                    if (fs.statSync(id).isDirectory()) fs.rmSync(id, { recursive: true });
                    else fs.unlinkSync(id);
                } else {
                    await drive.files.delete({ fileId: id });
                }
            }
            res.json({ success: true });
        } catch (e) { res.status(500).send(e.message); }
    });

    // --- ЗАГРУЗКА ФАЙЛОВ ---
    app.post('/storage/api/upload-hybrid', upload.single('file'), async (req, res) => {
        if (!checkAuth(req)) return res.sendStatus(401);
        try {
            const { folderId } = req.body;
            if (folderId === 'private_root' || folderId.includes('local_storage')) {
                const base = (folderId === 'private_root') ? CONFIG.PATHS.PRIVATE : folderId;
                fs.renameSync(req.file.path, path.join(base, req.file.originalname));
                return res.sendStatus(200);
            }
            const gParent = (folderId === 'root') ? MY_ROOT_ID : folderId;
            await drive.files.create({
                resource: { name: req.file.originalname, parents: [gParent] },
                media: { body: fs.createReadStream(req.file.path) }
            });
            fs.unlinkSync(req.file.path);
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    // --- АВТОРИЗАЦИЯ MASTER-ACCESS ---
    app.post('/storage/master-login', express.json(), (req, res) => {
        if (req.body.password === CONFIG.SECURITY.ADMIN_PASS) {
            res.setHeader('Set-Cookie', \`\${CONFIG.SECURITY.AUTH_KEY}=granted; Max-Age=604800; Path=/; HttpOnly; SameSite=Strict\`);
            res.json({ success: true });
        } else res.json({ success: false });
    });

    /**
     * =====================================================================================
     * [ЧАСТЬ 3]: ВЫСОКОУРОВНЕВЫЙ ИНТЕРФЕЙС (ULTIMATE DASHBOARD UI)
     * =====================================================================================
     */

    app.get('/storage', (req, res) => {
        if (!checkAuth(req)) return res.send(UI_AUTH_PAGE());
        res.send(UI_DASHBOARD_PAGE());
    });

    function UI_AUTH_PAGE() {
        return \`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
            <title>TITANIUM LOGIN</title>
            <style>
                body { background: #000; color: #fff; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #111; padding: 60px 40px; border-radius: 45px; border: 1px solid #222; text-align: center; width: 100%; max-width: 380px; box-shadow: 0 40px 100px rgba(0,0,0,0.8); }
                .logo { width: 100px; height: 100px; border-radius: 25px; margin-bottom: 30px; box-shadow: 0 0 30px rgba(240,185,11,0.2); }
                input { width: 100%; padding: 22px; background: #222; border: 1px solid #333; color: #fff; border-radius: 20px; text-align: center; font-size: 22px; margin: 30px 0; outline: none; transition: 0.3s; }
                input:focus { border-color: \${CONFIG.UI.GOLD}; }
                button { width: 100%; padding: 22px; background: \${CONFIG.UI.GOLD}; border: none; border-radius: 20px; font-weight: 900; font-size: 16px; color: #000; cursor: pointer; transition: 0.3s; }
                button:active { transform: scale(0.96); }
            </style>
        </head>
        <body>
            <div class="card">
                <img src="\${CONFIG.UI.LOGO}" class="logo">
                <h1 style="letter-spacing:-2px; font-weight:900">X-PLATFORM</h1>
                <input type="password" id="p" placeholder="SECURITY CODE">
                <button onclick="login()">AUTHORIZE SYSTEM</button>
            </div>
            <script>
                async function login() {
                    const p = document.getElementById('p').value;
                    const r = await fetch('/storage/master-login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password: p}) });
                    const d = await r.json();
                    if(d.success) location.reload(); else alert('ACCESS DENIED');
                }
            </script>
        </body>
        </html>\`;
    }

    function UI_DASHBOARD_PAGE() {
        return \`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
            <title>Titanium Master</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
            <style>
                :root { --gold: \${CONFIG.UI.GOLD}; --bg: #000; --panel: #111; --border: #222; --safe-top: env(safe-area-inset-top); --safe-bot: env(safe-area-inset-bottom); }
                * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
                
                body { background: var(--bg); color: #fff; font-family: -apple-system, sans-serif; margin: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
                
                /* HEADER */
                header { padding: calc(15px + var(--safe-top)) 25px 15px; background: rgba(18,18,18,0.9); backdrop-filter: blur(25px); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; z-index: 1000; }
                .brand { display: flex; align-items: center; gap: 15px; font-weight: 900; font-size: 20px; color: var(--gold); }
                .brand img { width: 36px; border-radius: 10px; }

                /* NAVIGATION SCROLLER */
                .nav-scroller { padding: 15px 20px; display: flex; gap: 12px; overflow-x: auto; scrollbar-width: none; background: #080808; border-bottom: 1px solid #111; }
                .nav-scroller::-webkit-scrollbar { display: none; }
                .nav-item { padding: 12px 28px; background: #1a1a1a; border-radius: 35px; font-size: 14px; white-space: nowrap; border: 1px solid var(--border); font-weight: 700; transition: 0.3s; }
                .nav-item.active { border-color: var(--gold); color: var(--gold); background: rgba(240,185,11,0.1); }
                .nav-item.private-btn { border-color: #ff3d00; color: #ff3d00; }

                /* MAIN CONTENT AREA */
                main { flex: 1; overflow-y: auto; padding-bottom: 160px; background: linear-gradient(180deg, #080808 0%, #000 100%); }
                .item-row { display: flex; align-items: center; padding: 22px 25px; border-bottom: 1px solid #111; gap: 20px; position: relative; transition: 0.2s; }
                .item-row:active { background: #0a0a0a; }
                .item-icon { width: 56px; height: 56px; border-radius: 20px; background: #151515; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #444; flex-shrink: 0; box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
                .is-dir .item-icon { color: var(--gold); background: rgba(240,185,11,0.08); }
                .is-xlsx .item-icon { color: #2e7d32; background: rgba(46,125,50,0.1); }
                .is-pdf .item-icon { color: #c62828; background: rgba(198,40,40,0.1); }
                .item-info { flex: 1; min-width: 0; }
                .item-name { font-weight: 800; font-size: 16px; margin-bottom: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .item-meta { font-size: 11px; color: #555; text-transform: uppercase; font-weight: 800; letter-spacing: 1px; }

                /* FLOATING ACTION SYSTEM */
                .fab-stack { position: fixed; bottom: calc(40px + var(--safe-bot)); right: 30px; display: flex; flex-direction: column; gap: 20px; z-index: 2000; }
                .fab { width: 72px; height: 72px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #000; box-shadow: 0 20px 50px rgba(0,0,0,0.6); border: none; transition: 0.3s; }
                .fab.sub { width: 58px; height: 58px; background: #222; color: #fff; font-size: 22px; }

                /* MASTER OVERLAY VIEWER */
                #master-viewer { position: fixed; inset: 0; background: #000; z-index: 9999; display: none; flex-direction: column; }
                .v-header { padding: calc(20px + var(--safe-top)) 25px 20px; background: #000; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; }
                .v-container { flex: 1; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
                iframe { width: 100%; height: 100%; border: none; }
                img, video { max-width: 100%; max-height: 100%; object-fit: contain; }

                /* BATCH OPERATIONS BAR */
                .batch-bar { position: fixed; bottom: 45px; left: 25px; right: 25px; background: #1a1a1a; padding: 25px 35px; border-radius: 30px; border: 1px solid #333; display: none; justify-content: space-between; align-items: center; z-index: 3000; box-shadow: 0 -10px 40px rgba(0,0,0,0.5); }
                .batch-count { font-weight: 900; font-size: 18px; color: var(--gold); }
            </style>
        </head>
        <body>
            <header>
                <div class="brand"><img src="\${CONFIG.UI.LOGO}"> X-STATION v162</div>
                <div style="display:flex; gap:25px; font-size:20px; color:#555">
                    <i class="fa fa-sync-alt" onclick="reload()"></i>
                    <i class="fa fa-layer-group" onclick="toggleMultiMode()"></i>
                </div>
            </header>
            
            <div class="nav-scroller">
                <div class="nav-item active" id="tab-root" onclick="nav('root')">ОБЛАКО</div>
                <div class="nav-item" id="tab-logist" onclick="nav('\${MY_ROOT_ID}')">ЛОГИСТИКА</div>
                <div class="nav-item" id="tab-merch" onclick="nav('\${MERCH_ROOT_ID}')">МЕРЧ</div>
                <div class="nav-item private-btn" id="tab-private" onclick="nav('private_root')">🔒 ЛИЧНЫЙ СЕЙФ</div>
            </div>

            <main>
                <div id="file-list" class="file-list"></div>
            </main>

            <div class="batch-bar" id="batch-menu">
                <div class="batch-count" id="sel-count">0 ВЫБРАНО</div>
                <i class="fa fa-trash-alt" style="color:#ff3d00; font-size:28px" onclick="deleteBatch()"></i>
            </div>

            <div class="fab-stack" id="fab-group">
                <button class="fab sub" onclick="makeNewFolder()"><i class="fa fa-folder-plus"></i></button>
                <button class="fab" onclick="document.getElementById('file-up').click()"><i class="fa fa-plus"></i></button>
            </div>
            <input type="file" id="file-up" style="display:none" multiple onchange="startUpload(this.files)">

            <div id="master-viewer">
                <div class="v-header">
                    <div id="v-title" style="font-weight:900; color:var(--gold); font-size:15px; letter-spacing:1px">PREVIEW CORE</div>
                    <i class="fa fa-times" style="font-size:38px; color:#fff" onclick="closeViewer()"></i>
                </div>
                <div class="v-container" id="v-view"></div>
            </div>

            <script>
                let currentId = 'root', selectedItems = new Set(), multiMode = false;

                async function nav(id) {
                    currentId = id; selectedItems.clear(); updateBatchUI();
                    const list = document.getElementById('file-list');
                    list.innerHTML = '<div style="padding:150px; text-align:center; opacity:0.1"><i class="fa fa-circle-notch fa-spin fa-5x"></i></div>';
                    
                    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
                    if(id === 'root') document.getElementById('tab-root').classList.add('active');
                    else if(id === '\${MY_ROOT_ID}') document.getElementById('tab-logist').classList.add('active');
                    else if(id.includes('private')) document.getElementById('tab-private').classList.add('active');

                    try {
                        const r = await fetch('/storage/api/list-full?folderId=' + id);
                        const data = await r.json();
                        render(data.files);
                    } catch(e) { list.innerHTML = '<div style="padding:100px;text-align:center">SERVER CONNECTION ERROR</div>'; }
                }

                function render(files) {
                    const list = document.getElementById('file-list');
                    list.innerHTML = '';
                    if(!files.length) {
                        list.innerHTML = '<div style="padding:150px; text-align:center; opacity:0.2; font-weight:900; font-size:20px">ПАПКА ПУСТА</div>';
                        return;
                    }
                    
                    files.forEach(f => {
                        const isD = f.mimeType.includes('folder') || f.mimeType === 'folder';
                        const ext = f.name.split('.').pop().toLowerCase();
                        const div = document.createElement('div');
                        div.className = 'item-row ' + (isD ? 'is-dir ' : '') + 'is-' + ext;
                        
                        div.innerHTML = \`
                            <div class="item-icon"><i class="fa \${isD ? 'fa-folder' : getIcon(ext)}"></i></div>
                            <div class="item-info">
                                <div class="item-name">\${f.name}</div>
                                <div class="item-meta">\${isD ? 'Папка' : formatSize(f.size)}</div>
                            </div>
                            <i class="fa fa-qrcode" style="color:#222; font-size:24px" onclick="event.stopPropagation(); showQR('\${f.id}')"></i>
                        \`;

                        div.onclick = () => {
                            if(multiMode) toggleItem(f.id, div);
                            else isD ? nav(f.id) : openViewer(f.id, f.name, f.mimeType);
                        };
                        list.appendChild(div);
                    });
                }

                function getIcon(e) {
                    if(['xlsx','xls','csv'].includes(e)) return 'fa-file-excel';
                    if(['docx','doc'].includes(e)) return 'fa-file-word';
                    if(['pdf'].includes(e)) return 'fa-file-pdf';
                    if(['jpg','png','jpeg','webp'].includes(e)) return 'fa-file-image';
                    if(['mp4','mov'].includes(e)) return 'fa-file-video';
                    return 'fa-file-alt';
                }

                function openViewer(id, name, mime) {
                    const v = document.getElementById('master-viewer'), con = document.getElementById('v-view');
                    document.getElementById('v-title').innerText = name.toUpperCase();
                    v.style.display = 'flex';
                    
                    const isLocal = id.includes('/') || id.includes('\\\\');
                    if(isLocal) {
                        const ext = name.split('.').pop().toLowerCase();
                        if(['jpg','png','webp','jpeg'].includes(ext)) {
                            con.innerHTML = \`<img src="/storage/api/render-thumb?path=\${encodeURIComponent(id)}">\`;
                        } else if(['xlsx','xls','csv'].includes(ext)) {
                            con.innerHTML = \`<iframe src="/storage/api/render-excel?path=\${encodeURIComponent(id)}"></iframe>\`;
                        } else if(['docx'].includes(ext)) {
                            con.innerHTML = \`<iframe src="/storage/api/render-word?path=\${encodeURIComponent(id)}"></iframe>\`;
                        } else {
                            con.innerHTML = '<div style="color:#000; font-weight:bold; text-align:center; padding:50px">PREVIEW UNAVAILABLE</div>';
                        }
                    } else {
                        con.innerHTML = \`<iframe src="https://drive.google.com/file/d/\${id}/preview"></iframe>\`;
                    }
                }

                async function makeNewFolder() {
                    const n = prompt('ИМЯ НОВОЙ ПАПКИ:'); if(!n) return;
                    await fetch('/storage/api/make-folder', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:n, parentId:currentId}) });
                    reload();
                }

                async function startUpload(files) {
                    for(let f of files) {
                        const fd = new FormData(); fd.append('file', f); fd.append('folderId', currentId);
                        await fetch('/storage/api/upload-hybrid', {method:'POST', body:fd});
                    }
                    reload();
                }

                async function deleteBatch() {
                    if(!selectedItems.size || !confirm('УДАЛИТЬ ВЫБРАННОЕ?')) return;
                    await fetch('/storage/api/delete-items', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids: Array.from(selectedItems)}) });
                    toggleMultiMode(); reload();
                }

                function toggleItem(id, el) {
                    if(selectedItems.has(id)) { selectedItems.delete(id); el.style.background = 'transparent'; }
                    else { selectedItems.add(id); el.style.background = 'rgba(240,185,11,0.08)'; }
                    updateBatchUI();
                }

                function toggleMultiMode() {
                    multiMode = !multiMode;
                    document.getElementById('batch-menu').style.display = multiMode ? 'flex' : 'none';
                    document.getElementById('fab-group').style.display = multiMode ? 'none' : 'flex';
                    if(!multiMode) { selectedItems.clear(); reload(); }
                }

                function updateBatchUI() { document.getElementById('sel-count').innerText = selectedItems.size + ' ВЫБРАНО'; }
                function formatSize(b) { if(!b) return '0 B'; const i = Math.floor(Math.log(b)/Math.log(1024)); return (b/Math.pow(1024,i)).toFixed(1)+' '+['B','KB','MB','GB'][i]; }
                function closeViewer() { document.getElementById('master-viewer').style.display='none'; document.getElementById('v-view').innerHTML=''; }
                function reload() { nav(currentId); }
                nav('root');
            </script>
        </body>
        </html>\`;
    }
};
