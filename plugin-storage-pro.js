/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v159.0 | HYPER-MONOLITH (ENTERPRISE EDITION)
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026) | ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * СТАТУС: ЗАЩИЩЕНО СВИДЕТЕЛЬСТВОМ № 0849-643-137 (РЦИС.РФ)
 * -----------------------------------------------------------------------------------------
 * ОПИСАНИЕ: ПОЛНОРАЗМЕРНОЕ УПРАВЛЯЮЩЕЕ ЯДРО ДЛЯ АВТОНОМНОГО ХРАНЕНИЯ ДАННЫХ.
 * ПОДДЕРЖКА: EXCEL, WORD, PDF, ИЗОБРАЖЕНИЯ (SHARP), PRIVATE CORE.
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// --- [ЯДРА ОБРАБОТКИ ДАННЫХ] ---
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

// --- [ГЛОБАЛЬНЫЕ НАСТРОЙКИ СИСТЕМЫ] ---
const CONFIG = {
    SYS_NAME: "TITANIUM X-PLATFORM",
    VERSION: "159.0 HYPER-MONOLITH",
    PASSWORD: "admin",
    SESSION_KEY: "titanium_master_auth_v159",
    LOGO: "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png",
    PATHS: {
        ROOT: __dirname,
        STORAGE: path.join(__dirname, 'local_storage'),
        PRIVATE: path.join(__dirname, 'local_storage', 'PRIVATE_CORE'),
        LOGIST: path.join(__dirname, 'local_storage', 'LOGIST_CORE'),
        MERCH: path.join(__dirname, 'local_storage', 'MERCH_CORE'),
        CACHE: path.join(__dirname, 'local_storage', 'SYSTEM_CACHE'),
        DB_MIRROR: path.join(__dirname, 'db_mirror')
    },
    RENDER_SETTINGS: {
        THUMB_RES: 450,
        EXCEL_THEME: "modern"
    }
};

// --- [ИНИЦИАЛИЗАЦИЯ КРИТИЧЕСКИХ УЗЛОВ] ---
function initSystemFolders() {
    const folders = [
        CONFIG.PATHS.STORAGE, 
        CONFIG.PATHS.PRIVATE, 
        CONFIG.PATHS.LOGIST, 
        CONFIG.PATHS.MERCH,
        CONFIG.PATHS.CACHE,
        CONFIG.PATHS.DB_MIRROR
    ];
    console.log("--- STARTING TITANIUM SYSTEM INITIALIZATION ---");
    folders.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[OK] Directory ready: ${dir}`);
        }
    });
}
initSystemFolders();

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const upload = multer({ dest: 'uploads/' });

    /**
     * =====================================================================================
     * [СЕКЦИЯ 1]: АВТОНОМНЫЕ ОБРАБОТЧИКИ (OFFLINE ENGINE)
     * =====================================================================================
     */

    // ОБРАБОТКА ТАБЛИЦ EXCEL (XLSX, XLS, CSV)
    app.get('/storage/api/render-excel', async (req, res) => {
        try {
            const fPath = req.query.path;
            if (!fs.existsSync(fPath)) return res.status(404).send("Файл не найден");

            const workbook = XLSX.readFile(fPath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const html = XLSX.utils.sheet_to_html(sheet);

            return res.send(`
                <html><head><meta charset="UTF-8"><style>
                    body { font-family: 'Inter', sans-serif; background: #fff; margin: 0; padding: 15px; }
                    table { border-collapse: collapse; width: 100%; border: 1px solid #ddd; }
                    th { background: #f0b90b; color: #000; padding: 12px; font-weight: 800; border: 1px solid #ccc; }
                    td { border: 1px solid #eee; padding: 10px; font-size: 13px; }
                    tr:nth-child(even) { background: #f9f9f9; }
                    .header-info { padding-bottom: 15px; font-weight: bold; color: #666; font-size: 14px; border-bottom: 2px solid #f0b90b; margin-bottom: 15px; }
                </style></head><body>
                    <div class="header-info">TITANIUM EXCEL VIEWER | АВТОНОМНЫЙ РЕЖИМ</div>
                    \${html}
                </body></html>
            `);
        } catch (e) { res.status(500).send("Excel Error: " + e.message); }
    });

    // ОБРАБОТКА WORD (DOCX)
    app.get('/storage/api/render-word', async (req, res) => {
        try {
            const fPath = req.query.path;
            if (!fs.existsSync(fPath)) return res.status(404).send("Файл не найден");
            const result = await mammoth.convertToHtml({path: fPath});
            res.send(\`<div style="padding:50px; font-family: serif; line-height: 1.8; max-width: 800px; margin: auto; background: #fff;">\${result.value}</div>\`);
        } catch (e) { res.status(500).send("Word Error: " + e.message); }
    });

    // ГЕНЕРАЦИЯ УМНЫХ МИНИАТЮР (SHARP OPTIMIZER)
    app.get('/storage/api/thumb-gen', async (req, res) => {
        try {
            const p = req.query.path;
            if (!fs.existsSync(p)) return res.sendStatus(404);
            const thumb = await sharp(p).resize(CONFIG.RENDER_SETTINGS.THUMB_RES).webp().toBuffer();
            res.setHeader('Content-Type', 'image/webp');
            res.send(thumb);
        } catch (e) { res.sendStatus(500); }
    });

    /**
     * =====================================================================================
     * [СЕКЦИЯ 2]: ЯДРО ФАЙЛОВЫХ ОПЕРАЦИЙ (HYBRID API)
     * =====================================================================================
     */

    function isAuth(req) { return req.headers.cookie && req.headers.cookie.includes(\`\${CONFIG.SESSION_KEY}=granted\`); }

    // ЛИСТИНГ: УМНОЕ ОПРЕДЕЛЕНИЕ ПУТЕЙ
    app.get('/storage/api/list', async (req, res) => {
        if (!isAuth(req)) return res.status(401).json({error: "No Access"});
        try {
            const folderId = req.query.folderId || 'root';
            let results = { files: [], parentId: null, type: 'cloud' };

            // ЛОКАЛЬНЫЙ РЕЖИМ (PRIVATE / MIRROR)
            if (folderId === 'private_root' || folderId.includes('local_storage')) {
                const base = (folderId === 'private_root') ? CONFIG.PATHS.PRIVATE : folderId;
                const items = fs.readdirSync(base, { withFileTypes: true });
                results.files = items.map(i => {
                    const fpath = path.join(base, i.name);
                    const s = fs.statSync(fpath);
                    return { id: fpath, name: i.name, size: s.size, mimeType: i.isDirectory() ? 'folder' : 'file', isLocal: true };
                });
                results.parentId = (folderId === 'private_root') ? 'root' : path.dirname(base);
                results.type = 'local';
                return res.json(results);
            }

            // ОБЛАЧНЫЙ РЕЖИМ (GOOGLE)
            const gId = (folderId === 'root') ? MY_ROOT_ID : folderId;
            const r = await drive.files.list({
                q: \`'\${gId}' in parents and trashed = false\`,
                fields: 'files(id, name, mimeType, size)',
                orderBy: 'folder, name'
            });
            res.json({ files: r.data.files, parentId: (folderId === 'root' ? null : 'root'), type: 'cloud' });
        } catch (e) { res.status(500).json({error: e.message}); }
    });

    // СОЗДАНИЕ ПАПОК (ЛОГИКА MKDIR PRO)
    app.post('/storage/api/mkdir', express.json(), async (req, res) => {
        if (!isAuth(req)) return res.sendStatus(401);
        try {
            const { name, parentId } = req.body;
            
            // Если создаем локально
            if (parentId === 'private_root' || parentId.includes('local_storage')) {
                const root = (parentId === 'private_root') ? CONFIG.PATHS.PRIVATE : parentId;
                const target = path.join(root, name);
                if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
                return res.json({ success: true });
            }

            // Если создаем в Google
            const gParent = (parentId === 'root') ? MY_ROOT_ID : parentId;
            const folder = await drive.files.create({
                resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [gParent] },
                fields: 'id'
            });
            res.json(folder.data);
        } catch (e) { res.status(500).send(e.message); }
    });

    // УДАЛЕНИЕ (МАССОВОЕ)
    app.post('/storage/api/delete-items', express.json(), async (req, res) => {
        if (!isAuth(req)) return res.sendStatus(401);
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

    // ЗАГРУЗКА ФАЙЛОВ
    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        if (!isAuth(req)) return res.sendStatus(401);
        try {
            const { folderId } = req.body;
            if (folderId === 'private_root' || folderId.includes('local_storage')) {
                const root = (folderId === 'private_root') ? CONFIG.PATHS.PRIVATE : folderId;
                fs.renameSync(req.file.path, path.join(root, req.file.originalname));
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

    // СКАЧИВАНИЕ И ПРОКСИ
    app.get('/storage/api/download/:id', async (req, res) => {
        try {
            const id = req.params.id;
            if (fs.existsSync(id)) return res.download(id);
            const r = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
            r.data.pipe(res);
        } catch (e) { res.status(404).send("Error"); }
    });

    app.get('/storage/api/proxy-view/:id', async (req, res) => {
        try {
            const id = req.params.id;
            if (fs.existsSync(id)) return res.sendFile(id);
            const r = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
            r.data.pipe(res);
        } catch (e) { res.status(404).send("Error"); }
    });

    // АВТОРИЗАЦИЯ
    app.post('/storage/auth-master', express.json(), (req, res) => {
        if (req.body.password === CONFIG.PASSWORD) {
            res.setHeader('Set-Cookie', \`\${CONFIG.SESSION_KEY}=granted; Max-Age=604800; Path=/; HttpOnly\`);
            res.json({ success: true });
        } else res.json({ success: false });
    });

    /**
     * =====================================================================================
     * [СЕКЦИЯ 3]: ИНТЕРФЕЙС УПРАВЛЕНИЯ (SUPREME UI SYSTEM)
     * =====================================================================================
     */

    app.get('/storage', (req, res) => {
        if (!isAuth(req)) return res.send(UI_LOGIN);
        res.send(UI_DASHBOARD);
    });

    const UI_LOGIN = \`
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <style>
        body { background: #000; color: #fff; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .login-box { background: #111; padding: 50px; border-radius: 40px; border: 1px solid #222; text-align: center; width: 100%; max-width: 380px; }
        input { width: 100%; padding: 22px; background: #222; border: 1px solid #333; color: #fff; border-radius: 20px; text-align: center; font-size: 20px; margin: 30px 0; outline: none; }
        button { width: 100%; padding: 22px; background: #f0b90b; border: none; border-radius: 20px; font-weight: 900; font-size: 16px; color: #000; cursor: pointer; }
    </style></head>
    <body>
        <div class="login-box">
            <img src="\${CONFIG.LOGO}" width="80" style="border-radius:20px; margin-bottom:20px">
            <h2>TITANIUM MASTER</h2>
            <input type="password" id="pass" placeholder="Код доступа">
            <button onclick="auth()">ВОЙТИ В СИСТЕМУ</button>
        </div>
        <script>
            async function auth() {
                const p = document.getElementById('pass').value;
                const r = await fetch('/storage/auth-master', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password: p}) });
                if((await r.json()).success) location.reload(); else alert('ОШИБКА');
            }
        </script>
    </body></html>\`;

    const UI_DASHBOARD = \`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        <title>X-Platform Master</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        <style>
            :root { --gold: #f0b90b; --bg: #000; --safe-top: env(safe-area-inset-top); --safe-bot: env(safe-area-inset-bottom); }
            * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
            body { background: var(--bg); color: #fff; font-family: -apple-system, system-ui, sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
            
            /* HEADER */
            .header { padding: calc(15px + var(--safe-top)) 20px 15px; background: #111; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; z-index: 100; }
            .brand { display: flex; align-items: center; gap: 12px; font-weight: 900; font-size: 18px; color: var(--gold); }
            .brand img { width: 34px; border-radius: 10px; }

            /* NAV SCROLLER */
            .nav-bar { padding: 15px 20px; display: flex; gap: 12px; overflow-x: auto; scrollbar-width: none; background: #080808; }
            .nav-bar::-webkit-scrollbar { display: none; }
            .tab { padding: 12px 24px; background: #1a1a1a; border-radius: 30px; font-size: 14px; white-space: nowrap; border: 1px solid #222; font-weight: 700; transition: 0.3s; }
            .tab.active { border-color: var(--gold); color: var(--gold); background: rgba(240,185,11,0.1); }
            .tab.private { border-color: #ff3d00; color: #ff3d00; }

            /* LISTING */
            .main-view { flex: 1; overflow-y: auto; padding-bottom: 150px; }
            .item-row { display: flex; align-items: center; padding: 20px; border-bottom: 1px solid #111; gap: 18px; position: relative; }
            .item-row:active { background: #0a0a0a; }
            .item-icon { width: 54px; height: 54px; border-radius: 18px; background: #151515; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #444; flex-shrink: 0; }
            .is-folder .item-icon { color: var(--gold); background: rgba(240,185,11,0.08); }
            .item-info { flex: 1; min-width: 0; }
            .item-name { font-weight: 700; font-size: 16px; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .item-meta { font-size: 12px; color: #555; text-transform: uppercase; font-weight: 600; }

            /* FLOATING SYSTEM */
            .fab-group { position: fixed; bottom: calc(30px + var(--safe-bot)); right: 25px; display: flex; flex-direction: column; gap: 18px; z-index: 200; }
            .fab { width: 70px; height: 70px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30px; color: #000; box-shadow: 0 15px 40px rgba(0,0,0,0.6); border: none; }
            .fab.sub { width: 56px; height: 56px; background: #222; color: #fff; font-size: 22px; }

            /* MASTER VIEWER */
            #viewer { position: fixed; inset: 0; background: #000; z-index: 1000; display: none; flex-direction: column; }
            .v-head { padding: calc(20px + var(--safe-top)) 20px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; }
            .v-body { flex: 1; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
            iframe { width: 100%; height: 100%; border: none; }
            img, video { max-width: 100%; max-height: 100%; object-fit: contain; }

            /* MULTI-SELECT BAR */
            .batch-bar { position: fixed; bottom: 40px; left: 20px; right: 20px; background: #1a1a1a; padding: 20px 30px; border-radius: 25px; border: 1px solid #333; display: none; justify-content: space-between; align-items: center; z-index: 500; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="brand"><img src="\${CONFIG.LOGO}"> TITANIUM SUPREME</div>
            <div style="display:flex; gap:20px; color:#555">
                <i class="fa fa-sync" onclick="reload()"></i>
                <i class="fa fa-check-double" onclick="toggleMultiMode()"></i>
            </div>
        </div>
        
        <div class="main-view">
            <div class="nav-bar">
                <div class="tab active" id="t-root" onclick="nav('root')">ОБЛАКО</div>
                <div class="tab" id="t-logist" onclick="nav('\${MY_ROOT_ID}')">ЛОГИСТИКА</div>
                <div class="tab" id="t-merch" onclick="nav('\${MERCH_ROOT_ID}')">МЕРЧ</div>
                <div class="tab private" id="t-private" onclick="nav('private_root')">🔒 ЛИЧНЫЙ СЕЙФ</div>
            </div>
            <div id="file-list"></div>
        </div>

        <div class="batch-bar" id="b-bar">
            <span id="sel-txt" style="font-weight:900">0 ОБЪЕКТОВ</span>
            <i class="fa fa-trash-alt" style="color:#ff3d00; font-size:24px" onclick="deleteSelected()"></i>
        </div>

        <div class="fab-group" id="f-group">
            <button class="fab sub" onclick="makeDir()"><i class="fa fa-folder-plus"></i></button>
            <button class="fab" onclick="document.getElementById('file-in').click()"><i class="fa fa-plus"></i></button>
        </div>
        <input type="file" id="file-in" style="display:none" multiple onchange="doUpload(this.files)">

        <div id="viewer">
            <div class="v-head">
                <div id="v-title" style="font-weight:900; color:var(--gold); font-size:14px">MASTER VIEW</div>
                <i class="fa fa-times" style="font-size:35px; color:#fff" onclick="closeV()"></i>
            </div>
            <div class="v-body" id="v-body"></div>
        </div>

        <script>
            let cid = 'root', selected = new Set(), isMulti = false;

            async function nav(id) {
                cid = id; selected.clear(); updateBar();
                const list = document.getElementById('file-list');
                list.innerHTML = '<div style="padding:150px; text-align:center; opacity:0.1"><i class="fa fa-circle-notch fa-spin fa-5x"></i></div>';
                
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                if(id === 'root') document.getElementById('t-root').classList.add('active');
                else if(id === '\${MY_ROOT_ID}') document.getElementById('t-logist').classList.add('active');
                else if(id.includes('private')) document.getElementById('t-private').classList.add('active');

                try {
                    const r = await fetch('/storage/api/list?folderId=' + id);
                    const d = await r.json();
                    render(d.files);
                } catch(e) { list.innerHTML = 'ОШИБКА'; }
            }

            function render(files) {
                const list = document.getElementById('file-list');
                list.innerHTML = '';
                if(!files.length) { list.innerHTML = '<div style="padding:120px; text-align:center; opacity:0.2; font-weight:900">ПУСТАЯ ПАПКА</div>'; return; }
                
                files.forEach(f => {
                    const isF = f.mimeType === 'folder';
                    const div = document.createElement('div');
                    div.className = 'item-row ' + (isF ? 'is-folder' : '');
                    div.innerHTML = \`
                        <div class="item-icon"><i class="fa \${isF ? 'fa-folder' : 'fa-file-alt'}"></i></div>
                        <div class="item-info">
                            <div class="item-name">\${f.name}</div>
                            <div class="item-meta">\${isF ? 'Папка' : formatSize(f.size)}</div>
                        </div>
                        <i class="fa fa-qrcode" style="color:#222" onclick="event.stopPropagation(); showQR('\${f.id}')"></i>
                    \`;
                    div.onclick = () => {
                        if(isMulti) toggleSel(f.id, div);
                        else isF ? nav(f.id) : openV(f.id, f.name, f.mimeType);
                    };
                    list.appendChild(div);
                });
            }

            function openV(id, name, mime) {
                const v = document.getElementById('viewer'), b = document.getElementById('v-body');
                document.getElementById('v-title').innerText = name.toUpperCase();
                v.style.display = 'flex';
                
                const local = id.includes('/') || id.includes('\\\\');
                if(local) {
                    const ext = name.split('.').pop().toLowerCase();
                    if(['jpg','png','jpeg','webp'].includes(ext)) b.innerHTML = \`<img src="/storage/api/proxy-view/\${encodeURIComponent(id)}">\`;
                    else if(['xlsx','xls','csv'].includes(ext)) b.innerHTML = \`<iframe src="/storage/api/render-excel?path=\${encodeURIComponent(id)}"></iframe>\`;
                    else if(['docx'].includes(ext)) b.innerHTML = \`<iframe src="/storage/api/render-word?path=\${encodeURIComponent(id)}"></iframe>\`;
                    else b.innerHTML = '<div style="color:#000; text-align:center; padding:100px">ФАЙЛ СКАЧАН</div>';
                } else {
                    b.innerHTML = \`<iframe src="https://drive.google.com/file/d/\${id}/preview"></iframe>\`;
                }
            }

            async function makeDir() {
                const n = prompt('Имя новой папки:'); if(!n) return;
                await fetch('/storage/api/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:n, parentId:cid}) });
                reload();
            }

            async function doUpload(files) {
                for(let f of files) {
                    const fd = new FormData(); fd.append('file', f); fd.append('folderId', cid);
                    await fetch('/storage/api/upload', {method:'POST', body:fd});
                }
                reload();
            }

            async function deleteSelected() {
                if(!selected.size || !confirm('УДАЛИТЬ?')) return;
                await fetch('/storage/api/delete-items', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids: Array.from(selected)}) });
                toggleMultiMode(); reload();
            }

            function toggleSel(id, el) {
                if(selected.has(id)) { selected.delete(id); el.style.background = 'transparent'; }
                else { selected.add(id); el.style.background = 'rgba(240,185,11,0.05)'; }
                updateBar();
            }

            function toggleMultiMode() {
                isMulti = !isMulti;
                document.getElementById('b-bar').style.display = isMulti ? 'flex' : 'none';
                document.getElementById('f-group').style.display = isMulti ? 'none' : 'flex';
                if(!isMulti) { selected.clear(); reload(); }
            }

            function updateBar() { document.getElementById('sel-txt').innerText = selected.size + ' ВЫБРАНО'; }
            function formatSize(b) { if(!b) return '---'; const i = Math.floor(Math.log(b)/Math.log(1024)); return (b/Math.pow(1024,i)).toFixed(1)+' '+['B','KB','MB','GB'][i]; }
            function closeV() { document.getElementById('viewer').style.display='none'; document.getElementById('v-body').innerHTML=''; }
            function reload() { nav(cid); }
            nav('root');
        </script>
    </body>
    </html>\`;
};
