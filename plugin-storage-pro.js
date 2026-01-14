/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v155.0 | ULTIMATE CORE (FULL UNPACKED)
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * -----------------------------------------------------------------------------------------
 * ПОЛНЫЙ ФУНКЦИОНАЛ:
 * - Neural Architect: Синхронизация Google Drive и Локального сервера.
 * - Private Core: Полностью автономная папка "Личное" (private_storage).
 * - File Master: Создание файлов (.txt, .json), создание папок, переименование, удаление.
 * - Media Engine: Потоковое видео, просмотр фото и документов.
 * - UI v3: Улучшенные иконки и мобильное контекстное меню.
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// --- [CONFIGURATION] ---
const CONFIG = {
    PASSWORD: "admin",           
    SESSION_KEY: "titanium_x_session_v155",
    LOGO: "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png",
    PATHS: {
        STORAGE: path.join(__dirname, 'local_storage'),
        PRIVATE: path.join(__dirname, 'private_storage'), 
        DB_MIRROR: path.join(__dirname, 'db_mirror'),
        NEURAL_MAP: path.join(__dirname, 'titanium_neural_map.json'),
        LOGS: path.join(__dirname, 'titanium_system.log')
    }
};

const PRIVATE_ROOT_ID = 'local-private-root';

// --- [INIT] ---
[CONFIG.PATHS.STORAGE, CONFIG.PATHS.DB_MIRROR, CONFIG.PATHS.PRIVATE].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let NEURAL_MEMORY = { map: {}, stats: { total_files: 0, last_sync: 0 } };
if (fs.existsSync(CONFIG.PATHS.NEURAL_MAP)) {
    try {
        NEURAL_MEMORY = JSON.parse(fs.readFileSync(CONFIG.PATHS.NEURAL_MAP, 'utf8'));
    } catch (e) { console.error("Memory error, resetting..."); }
}

// MIME Detector для локальных файлов
function getLocalMime(filename) {
    const ext = path.extname(filename).toLowerCase();
    const map = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
        '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
        '.pdf': 'application/pdf', '.txt': 'text/plain', '.json': 'application/json',
        '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    return map[ext] || 'application/octet-stream';
}

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID, readDatabase, readBarcodeDb, readPlanogramDb } = context;
    const upload = multer({ dest: 'uploads/' });

    const saveMemory = () => fs.writeFileSync(CONFIG.PATHS.NEURAL_MAP, JSON.stringify(NEURAL_MEMORY, null, 2));

    const checkAuth = (req) => req.headers.cookie && req.headers.cookie.includes(`${CONFIG.SESSION_KEY}=granted`);
    const protect = (req, res, next) => checkAuth(req) ? next() : res.status(401).json({error: "Access Denied"});

    // 1. AUTH
    app.post('/storage/auth', express.json(), (req, res) => {
        if (req.body.password === CONFIG.PASSWORD) {
            res.setHeader('Set-Cookie', `${CONFIG.SESSION_KEY}=granted; Max-Age=604800; Path=/; HttpOnly`);
            res.json({ success: true });
        } else res.json({ success: false });
    });

    // 2. LIST API (Hybrid)
    app.get('/storage/api/list', protect, async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            let files = [];
            let parentId = null;

            if (folderId === PRIVATE_ROOT_ID || (NEURAL_MEMORY.map[folderId] && NEURAL_MEMORY.map[folderId].isPrivate)) {
                // LOCAL PRIVATE STORAGE
                let targetDir = (folderId === PRIVATE_ROOT_ID) ? CONFIG.PATHS.PRIVATE : NEURAL_MEMORY.map[folderId].localPath;
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, {recursive: true});

                const items = fs.readdirSync(targetDir);
                files = items.map(name => {
                    const fullPath = path.join(targetDir, name);
                    const stats = fs.statSync(fullPath);
                    const isDir = stats.isDirectory();
                    const id = `local_${Buffer.from(fullPath).toString('hex')}`;
                    
                    NEURAL_MEMORY.map[id] = { 
                        name, localPath: fullPath, isPrivate: true, 
                        mimeType: isDir ? 'application/vnd.google-apps.folder' : getLocalMime(name) 
                    };
                    return { id, name, size: stats.size, mimeType: NEURAL_MEMORY.map[id].mimeType };
                });
                parentId = (folderId === PRIVATE_ROOT_ID) ? 'root' : PRIVATE_ROOT_ID;
            } else {
                // GOOGLE DRIVE
                if (folderId !== 'root') {
                    const meta = await drive.files.get({ fileId: folderId, fields: 'parents' });
                    if (meta.data.parents) parentId = meta.data.parents[0];
                }
                const r = await drive.files.list({ 
                    q: `'${folderId}' in parents and trashed = false`, 
                    fields: 'files(id, name, mimeType, size)', orderBy: 'folder, name' 
                });
                files = r.data.files;
            }
            res.json({ files, parentId });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // 3. PROXY (Медиа движок)
    app.get('/storage/api/proxy/:id', protect, async (req, res) => {
        try {
            const id = req.params.id;
            if (id.startsWith('local_')) {
                const fileInfo = NEURAL_MEMORY.map[id];
                if (!fileInfo || !fs.existsSync(fileInfo.localPath)) return res.status(404).send("Not Found");
                res.setHeader('Content-Type', fileInfo.mimeType);
                res.sendFile(fileInfo.localPath);
            } else {
                const response = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
                const meta = await drive.files.get({ fileId: id, fields: 'mimeType' });
                res.setHeader('Content-Type', meta.data.mimeType);
                response.data.pipe(res);
            }
        } catch (e) { res.status(500).send("Stream Error"); }
    });

    // 4. MANAGEMENT (Rename, Delete, Create)
    app.post('/storage/api/rename', express.json(), protect, async (req, res) => {
        const { id, newName } = req.body;
        try {
            if (id.startsWith('local_')) {
                const oldPath = NEURAL_MEMORY.map[id].localPath;
                const newPath = path.join(path.dirname(oldPath), newName);
                fs.renameSync(oldPath, newPath);
            } else {
                await drive.files.update({ fileId: id, resource: { name: newName } });
            }
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/create-file', express.json(), protect, async (req, res) => {
        const { name, content, parentId, isFolder } = req.body;
        try {
            if (parentId.startsWith('local_') || parentId === PRIVATE_ROOT_ID) {
                const targetDir = (parentId === PRIVATE_ROOT_ID) ? CONFIG.PATHS.PRIVATE : NEURAL_MEMORY.map[parentId].localPath;
                const finalPath = path.join(targetDir, name);
                if (isFolder) fs.mkdirSync(finalPath, { recursive: true });
                else fs.writeFileSync(finalPath, content);
            } else {
                const driveParent = parentId === 'root' ? MY_ROOT_ID : parentId;
                if (isFolder) {
                    await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [driveParent] } });
                } else {
                    await drive.files.create({ resource: { name, parents: [driveParent] }, media: { mimeType: 'text/plain', body: content } });
                }
            }
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/delete', express.json(), protect, async (req, res) => {
        try {
            const id = req.body.id;
            if (id.startsWith('local_')) {
                const p = NEURAL_MEMORY.map[id].localPath;
                if (fs.lstatSync(p).isDirectory()) fs.rmSync(p, { recursive: true });
                else fs.unlinkSync(p);
            } else {
                await drive.files.delete({ fileId: id });
            }
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/upload', upload.single('file'), protect, async (req, res) => {
        try {
            const folderId = req.body.folderId;
            if (folderId.startsWith('local_') || folderId === PRIVATE_ROOT_ID) {
                const targetDir = (folderId === PRIVATE_ROOT_ID) ? CONFIG.PATHS.PRIVATE : NEURAL_MEMORY.map[folderId].localPath;
                fs.copyFileSync(req.file.path, path.join(targetDir, req.file.originalname));
                fs.unlinkSync(req.file.path);
            } else {
                const driveParent = folderId === 'root' ? MY_ROOT_ID : folderId;
                await drive.files.create({ 
                    resource: { name: req.file.originalname, parents: [driveParent] },
                    media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) }
                });
                fs.unlinkSync(req.file.path);
            }
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.get('/storage', (req, res) => {
        if (!checkAuth(req)) return res.send(UI_COMPONENTS.LOGIN);
        res.send(UI_COMPONENTS.DASHBOARD);
    });

    const UI_COMPONENTS = {
        LOGIN: `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;}input{padding:15px;background:#111;border:1px solid #333;color:#fff;border-radius:10px;text-align:center;width:250px;font-size:18px;}</style></head><body><div style="text-align:center;"><img src="${CONFIG.LOGO}" width="80" style="border-radius:15px;"><br><br><input type="password" placeholder="TITANIUM CODE" onchange="login(this.value)"><script>async function login(v){const r=await fetch('/storage/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:v})});if((await r.json()).success)location.reload();}</script></div></body></html>`,
        
        DASHBOARD: `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
            <title>Titanium v155</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
            <style>
                :root { --gold: #f0b90b; --bg: #000; --card: #151515; --border: #222; }
                body { background: var(--bg); color: #fff; font-family: -apple-system, system-ui, sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
                
                .header { padding: 45px 20px 15px; background: #111; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
                .brand { display: flex; align-items: center; gap: 10px; font-weight: 900; letter-spacing: 1px; }
                .brand img { width: 28px; border-radius: 6px; }

                .viewport { flex: 1; overflow-y: auto; padding-bottom: 100px; }
                
                .nav-pills { padding: 15px; display: flex; gap: 10px; overflow-x: auto; background: #080808; }
                .pill { padding: 8px 16px; background: #1a1a1a; border-radius: 20px; font-size: 12px; border: 1px solid #333; white-space: nowrap; font-weight: 600; color: #888; }
                .pill.active { border-color: var(--gold); color: var(--gold); background: rgba(240,185,11,0.05); }

                .f-row { display: flex; align-items: center; padding: 14px 20px; border-bottom: 1px solid #111; gap: 15px; }
                .f-row:active { background: #0a0a0a; }
                .f-icon { width: 42px; height: 42px; border-radius: 12px; background: #151515; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #444; }
                .is-dir .f-icon { color: var(--gold); background: rgba(240,185,11,0.1); }
                .f-details { flex: 1; min-width: 0; }
                .f-name { font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .f-meta { font-size: 11px; color: #555; margin-top: 2px; }
                .f-ops { padding: 10px; color: #333; }

                /* MODALS */
                .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 5000; display: none; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
                .modal-box { background: #1a1a1a; width: 85%; max-width: 350px; padding: 25px; border-radius: 20px; border: 1px solid #333; }
                input, textarea { width: 100%; padding: 12px; background: #111; border: 1px solid #333; color: #fff; border-radius: 10px; margin-bottom: 15px; box-sizing: border-box; font-size: 16px; }
                .btn { padding: 12px; border-radius: 10px; border: none; font-weight: 800; cursor: pointer; width: 100%; margin-bottom: 10px; }
                .btn-gold { background: var(--gold); color: #000; }
                .btn-dark { background: #333; color: #fff; }

                #viewer { position: fixed; inset: 0; background: #000; z-index: 6000; display: none; flex-direction: column; }
                .v-close { position: absolute; top: 40px; right: 20px; font-size: 32px; color: #fff; text-shadow: 0 0 10px #000; }
                .v-body { flex: 1; display: flex; align-items: center; justify-content: center; }
                video, img { max-width: 100%; max-height: 100%; }

                .fab { position: fixed; bottom: 30px; right: 25px; width: 60px; height: 60px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #000; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="brand"><img src="${CONFIG.LOGO}"> TITANIUM 155</div>
                <div style="display:flex; gap:20px; color:#555">
                    <i class="fa fa-folder-plus" onclick="showCreate(true)"></i>
                    <i class="fa fa-file-signature" onclick="showCreate(false)"></i>
                </div>
            </div>

            <div class="viewport">
                <div class="nav-pills">
                    <div class="pill active" onclick="nav('root', this)">ОБЛАКО</div>
                    <div class="pill" onclick="nav('${PRIVATE_ROOT_ID}', this)">ЛИЧНОЕ (SERVER)</div>
                    <div class="pill" onclick="nav('${MY_ROOT_ID}', this)">ЛОГИСТИКА</div>
                    <div class="pill" onclick="nav('${MERCH_ROOT_ID}', this)">МЕРЧ</div>
                </div>
                <div id="file-list"></div>
            </div>

            <!-- MENU MODAL -->
            <div class="modal" id="modal-ops" onclick="closeModals()">
                <div class="modal-box" onclick="event.stopPropagation()">
                    <h4 id="ops-title" style="margin: 0 0 20px 0; color:var(--gold)">Файл</h4>
                    <button class="btn btn-gold" onclick="preRename()">Переименовать</button>
                    <button class="btn btn-dark" style="color:#ff4444" onclick="doDelete()">Удалить навсегда</button>
                    <button class="btn btn-dark" onclick="closeModals()">Отмена</button>
                </div>
            </div>

            <!-- CREATE MODAL -->
            <div class="modal" id="modal-create">
                <div class="modal-content modal-box">
                    <h3 id="create-title">Новый файл</h3>
                    <input type="text" id="create-name" placeholder="Название">
                    <textarea id="create-content" placeholder="Текст (для файлов)" rows="5"></textarea>
                    <button class="btn btn-gold" onclick="submitCreate()">СОЗДАТЬ</button>
                    <button class="btn btn-dark" onclick="closeModals()">ОТМЕНА</button>
                </div>
            </div>

            <div id="viewer">
                <i class="fa fa-times v-close" onclick="closeViewer()"></i>
                <div class="v-body" id="v-body"></div>
            </div>

            <div class="fab" onclick="document.getElementById('fup').click()"><i class="fa fa-upload"></i></div>
            <input type="file" id="fup" style="display:none" onchange="upload(this.files)">

            <script>
                let cur = 'root';
                let activeId = null;
                let activeName = '';
                let isCreatingFolder = false;

                async function nav(id, el) {
                    cur = id;
                    if(el) {
                        document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                        el.classList.add('active');
                    }
                    const list = document.getElementById('file-list');
                    list.innerHTML = '<div style="padding:100px; text-align:center; opacity:0.2"><i class="fa fa-sync fa-spin fa-3x"></i></div>';
                    
                    const r = await fetch('/storage/api/list?folderId=' + id);
                    const d = await r.json();
                    list.innerHTML = '';
                    
                    if(d.files.length === 0) {
                        list.innerHTML = '<div style="padding:100px; text-align:center; color:#333">Пусто</div>';
                    }

                    d.files.forEach(f => {
                        const isDir = f.mimeType.includes('folder');
                        const div = document.createElement('div');
                        div.className = 'f-row ' + (isDir ? 'is-dir' : '');
                        div.innerHTML = \`
                            <div class="f-icon"><i class="fa \${getIcon(f.name, f.mimeType)}"></i></div>
                            <div class="f-details" onclick="\${isDir ? \`nav('\${f.id}')\` : \`view('\${f.id}', '\${f.mimeType}')\`}">
                                <div class="f-name">\${f.name}</div>
                                <div class="f-meta">\${isDir ? 'Папка' : (f.size/1024/1024).toFixed(2)+' MB'}</div>
                            </div>
                            <div class="f-ops" onclick="openOps('\${f.id}', '\${f.name}')"><i class="fa fa-ellipsis-v"></i></div>
                        \`;
                        list.appendChild(div);
                    });
                }

                function getIcon(n, m) {
                    if(m.includes('folder')) return 'fa-folder';
                    const ext = n.split('.').pop().toLowerCase();
                    if(['jpg','jpeg','png','gif'].includes(ext)) return 'fa-file-image';
                    if(['mp4','mov','avi','webm'].includes(ext)) return 'fa-file-video';
                    if(ext === 'pdf') return 'fa-file-pdf';
                    if(['doc','docx'].includes(ext)) return 'fa-file-word';
                    if(['xls','xlsx'].includes(ext)) return 'fa-file-excel';
                    return 'fa-file-lines';
                }

                function openOps(id, name) {
                    activeId = id;
                    activeName = name;
                    document.getElementById('ops-title').innerText = name;
                    document.getElementById('modal-ops').style.display = 'flex';
                }

                function showCreate(folder) {
                    isCreatingFolder = folder;
                    document.getElementById('create-title').innerText = folder ? 'Новая папка' : 'Новый файл';
                    document.getElementById('create-content').style.display = folder ? 'none' : 'block';
                    document.getElementById('modal-create').style.display = 'flex';
                }

                async function submitCreate() {
                    const name = document.getElementById('create-name').value;
                    const content = document.getElementById('create-content').value;
                    if(!name) return;
                    await fetch('/storage/api/create-file', {
                        method: 'POST', headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ name, content, parentId: cur, isFolder: isCreatingFolder })
                    });
                    closeModals(); nav(cur);
                }

                function preRename() {
                    const n = prompt("Новое имя:", activeName);
                    if(n && n !== activeName) {
                        fetch('/storage/api/rename', {
                            method: 'POST', headers: {'Content-Type':'application/json'},
                            body: JSON.stringify({ id: activeId, newName: n })
                        }).then(() => { closeModals(); nav(cur); });
                    }
                }

                async function doDelete() {
                    if(confirm("Удалить безвозвратно?")) {
                        await fetch('/storage/api/delete', {
                            method: 'POST', headers: {'Content-Type':'application/json'},
                            body: JSON.stringify({ id: activeId })
                        });
                        closeModals(); nav(cur);
                    }
                }

                async function upload(files) {
                    for(let f of files) {
                        const fd = new FormData(); fd.append('file', f); fd.append('folderId', cur);
                        await fetch('/storage/api/upload', { method:'POST', body:fd });
                    }
                    nav(cur);
                }

                function view(id, mime) {
                    const body = document.getElementById('v-body');
                    const url = '/storage/api/proxy/' + id;
                    body.innerHTML = '';
                    if(mime.includes('image')) body.innerHTML = '<img src="'+url+'">';
                    else if(mime.includes('video')) body.innerHTML = '<video src="'+url+'" controls autoplay></video>';
                    else window.open(url);
                    document.getElementById('viewer').style.display = 'flex';
                }

                function closeModals() { 
                    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
                    document.getElementById('create-name').value = '';
                    document.getElementById('create-content').value = '';
                }
                function closeViewer() { document.getElementById('v-body').innerHTML = ''; document.getElementById('viewer').style.display = 'none'; }

                nav('root');
            </script>
        </body>
        </html>
        `
    };
};