/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v163.0 | OFFICE VIEW EDITION
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * -----------------------------------------------------------------------------------------
 * ИСПРАВЛЕНИЯ v163:
 * [1] Office Viewer: Замена Google Viewer на Microsoft Office Online (стабильнее для Excel/Word).
 * [2] PDF Fix: Улучшенное отображение PDF через нативный фрейм браузера.
 * [3] Viewer Logic: Добавлена кнопка "Скачать", если предпросмотр недоступен.
 * [4] Сохранено: Все функции v162 (Auto-Recovery, Nginx Limit 2GB).
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// --- [CONFIGURATION] ---
const CONFIG = {
    PASSWORD: "admin",           
    SESSION_KEY: "titanium_x_session_v163",
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

let NEURAL_MEMORY = { map: {}, stats: { total_files: 0 } };
if (fs.existsSync(CONFIG.PATHS.NEURAL_MAP)) {
    try {
        NEURAL_MEMORY = JSON.parse(fs.readFileSync(CONFIG.PATHS.NEURAL_MAP, 'utf8'));
    } catch (e) { console.error("Neural map reset"); }
}

function getLocalMime(filename) {
    const ext = path.extname(filename).toLowerCase();
    const map = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
        '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
        '.pdf': 'application/pdf', 
        '.txt': 'text/plain', '.log': 'text/plain', '.json': 'application/json', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css',
        '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.zip': 'application/zip', '.rar': 'application/x-rar-compressed'
    };
    return map[ext] || 'application/octet-stream';
}

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID } = context;

    // FIX 413
    app.use(express.json({ limit: '500mb' }));
    app.use(express.urlencoded({ limit: '500mb', extended: true }));
    
    // UPLOAD CONFIG: 2GB
    const upload = multer({ 
        dest: 'uploads/',
        limits: { fileSize: 2048 * 1024 * 1024 } 
    });

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

    // 2. LIST API
    app.get('/storage/api/list', protect, async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            let files = [];
            let parentId = null;

            if (folderId === PRIVATE_ROOT_ID || (NEURAL_MEMORY.map[folderId] && NEURAL_MEMORY.map[folderId].isPrivate)) {
                let targetDir = (folderId === PRIVATE_ROOT_ID) ? CONFIG.PATHS.PRIVATE : NEURAL_MEMORY.map[folderId].localPath;
                
                if (!fs.existsSync(targetDir)) return res.json({ files: [], parentId: 'root' });

                const items = fs.readdirSync(targetDir);
                files = items.map(name => {
                    const fullPath = path.join(targetDir, name);
                    try {
                        const stats = fs.statSync(fullPath);
                        const isDir = stats.isDirectory();
                        const id = `local_${Buffer.from(fullPath).toString('hex')}`;
                        
                        NEURAL_MEMORY.map[id] = { 
                            name, localPath: fullPath, isPrivate: true, 
                            mimeType: isDir ? 'application/vnd.google-apps.folder' : getLocalMime(name) 
                        };
                        return { id, name, size: stats.size, mimeType: NEURAL_MEMORY.map[id].mimeType };
                    } catch(e) { return null; }
                }).filter(f => f !== null);

                parentId = (folderId === PRIVATE_ROOT_ID) ? 'root' : (NEURAL_MEMORY.map[folderId].parentId || PRIVATE_ROOT_ID);
                saveMemory();
            } else {
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

    // 3. PROXY
    app.get('/storage/api/proxy/:id', protect, async (req, res) => {
        try {
            const id = req.params.id;
            if (id.startsWith('local_')) {
                const fileInfo = NEURAL_MEMORY.map[id];
                if (!fileInfo || !fs.existsSync(fileInfo.localPath)) return res.status(404).send("File lost");
                
                const realMime = getLocalMime(fileInfo.localPath); 
                res.setHeader('Content-Type', realMime);
                
                const stream = fs.createReadStream(fileInfo.localPath);
                stream.pipe(res);
            } else {
                const response = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
                const meta = await drive.files.get({ fileId: id, fields: 'mimeType' });
                res.setHeader('Content-Type', meta.data.mimeType);
                response.data.pipe(res);
            }
        } catch (e) { res.status(500).send("Stream Error"); }
    });

    // 4. MANAGEMENT
    app.post('/storage/api/create-file', express.json(), protect, async (req, res) => {
        const { name, content, parentId, isFolder } = req.body;
        try {
            if (parentId.startsWith('local_') || parentId === PRIVATE_ROOT_ID) {
                const targetDir = (parentId === PRIVATE_ROOT_ID) ? CONFIG.PATHS.PRIVATE : NEURAL_MEMORY.map[parentId].localPath;
                const finalPath = path.join(targetDir, name);
                if (isFolder) fs.mkdirSync(finalPath, { recursive: true });
                else fs.writeFileSync(finalPath, content || '');
            } else {
                const driveParent = parentId === 'root' ? MY_ROOT_ID : parentId;
                if (isFolder) {
                    await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [driveParent] } });
                } else {
                    await drive.files.create({ resource: { name, parents: [driveParent] }, media: { mimeType: 'text/plain', body: content || '' } });
                }
            }
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/upload', upload.single('file'), protect, async (req, res) => {
        req.setTimeout(0); 
        try {
            if (!req.file) throw new Error("File not received");
            const folderId = req.body.folderId;
            if (folderId.startsWith('local_') || folderId === PRIVATE_ROOT_ID) {
                const targetDir = (folderId === PRIVATE_ROOT_ID) ? CONFIG.PATHS.PRIVATE : NEURAL_MEMORY.map[folderId].localPath;
                fs.renameSync(req.file.path, path.join(targetDir, req.file.originalname));
            } else {
                const driveParent = folderId === 'root' ? MY_ROOT_ID : folderId;
                await drive.files.create({ 
                    resource: { name: req.file.originalname, parents: [driveParent] },
                    media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) }
                });
                fs.unlinkSync(req.file.path);
            }
            res.sendStatus(200);
        } catch (e) { 
            if(req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.status(500).send(e.message); 
        }
    });

    app.post('/storage/api/delete', express.json(), protect, async (req, res) => {
        try {
            const id = req.body.id;
            if (id.startsWith('local_')) {
                const p = NEURAL_MEMORY.map[id].localPath;
                if (fs.lstatSync(p).isDirectory()) fs.rmSync(p, { recursive: true });
                else fs.unlinkSync(p);
            } else await drive.files.delete({ fileId: id });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/rename', express.json(), protect, async (req, res) => {
        const { id, newName } = req.body;
        try {
            if (id.startsWith('local_')) {
                const oldPath = NEURAL_MEMORY.map[id].localPath;
                const newPath = path.join(path.dirname(oldPath), newName);
                fs.renameSync(oldPath, newPath);
            } else await drive.files.update({ fileId: id, resource: { name: newName } });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.get('/storage', (req, res) => {
        if (!checkAuth(req)) return res.send(UI_COMPONENTS.LOGIN);
        res.send(UI_COMPONENTS.DASHBOARD);
    });

    const UI_COMPONENTS = {
        LOGIN: `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0"><style>body{background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;}input{padding:18px;background:#111;border:1px solid #333;color:#fff;border-radius:12px;text-align:center;width:260px;font-size:18px;outline:none;border-color:var(--gold);}</style></head><body><div style="text-align:center;"><img src="${CONFIG.LOGO}" width="80" style="border-radius:15px;box-shadow:0 0 20px rgba(240,185,11,0.2);"><br><br><input type="password" placeholder="TITANIUM ACCESS" onchange="login(this.value)"><script>async function login(v){const r=await fetch('/storage/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:v})});if((await r.json()).success)location.reload();}</script></div></body></html>`,
        
        DASHBOARD: `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
            <title>Titanium Maximus 163</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            <style>
                :root { --gold: #f0b90b; --bg: #000; --card: #121212; --border: #222; }
                body { background: var(--bg); color: #fff; font-family: -apple-system, sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
                
                .header { padding: 45px 20px 15px; background: #111; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
                .brand { display: flex; align-items: center; gap: 10px; font-weight: 900; }
                .brand img { width: 28px; border-radius: 6px; }

                .viewport { flex: 1; overflow-y: auto; padding-bottom: 100px; }
                
                .nav-pills { padding: 15px; display: flex; gap: 10px; overflow-x: auto; background: #080808; border-bottom: 1px solid #111; }
                .pill { padding: 8px 16px; background: #1a1a1a; border-radius: 20px; font-size: 12px; border: 1px solid #333; white-space: nowrap; font-weight: 700; color: #777; transition: 0.2s; }
                .pill.active { border-color: var(--gold); color: var(--gold); background: rgba(240,185,11,0.1); }

                .f-row { display: flex; align-items: center; padding: 15px 20px; border-bottom: 1px solid #111; gap: 15px; transition: 0.1s; }
                .f-row:active { background: #111; }
                .f-icon { width: 44px; height: 44px; border-radius: 12px; background: #151515; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #444; }
                .is-dir .f-icon { color: var(--gold); background: rgba(240,185,11,0.1); }

                .f-details { flex: 1; min-width: 0; }
                .f-name { font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .f-meta { font-size: 11px; color: #555; margin-top: 3px; }
                .f-ops { padding: 10px; color: #444; }

                .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 5000; display: none; align-items: center; justify-content: center; backdrop-filter: blur(10px); }
                .modal-box { background: #1a1a1a; width: 85%; max-width: 340px; padding: 25px; border-radius: 25px; border: 1px solid #333; }
                input, textarea { width: 100%; padding: 14px; background: #111; border: 1px solid #333; color: #fff; border-radius: 12px; margin-bottom: 15px; box-sizing: border-box; font-size: 16px; outline: none; }
                input:focus { border-color: var(--gold); }
                .btn { padding: 14px; border-radius: 12px; border: none; font-weight: 800; cursor: pointer; width: 100%; margin-bottom: 10px; }
                .btn-gold { background: var(--gold); color: #000; }
                .btn-dark { background: #222; color: #fff; }

                .qr-container { background: #fff; padding: 20px; border-radius: 15px; display: flex; justify-content: center; margin-bottom: 15px; }

                #viewer { position: fixed; inset: 0; background: #000; z-index: 6000; display: none; flex-direction: column; }
                .v-close { position: absolute; top: 40px; right: 20px; font-size: 35px; color: #fff; z-index: 100; opacity: 0.8; cursor:pointer; }
                .v-body { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; overflow: auto; }
                video, img { max-width: 100%; max-height: 100%; object-fit: contain; }
                iframe { border: none; background: #fff; width: 100%; height: 100%; }

                .fab { position: fixed; bottom: 35px; right: 25px; width: 65px; height: 65px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #000; box-shadow: 0 10px 40px rgba(0,0,0,0.8); }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="brand"><img src="${CONFIG.LOGO}"> TITANIUM</div>
                <div style="display:flex; gap:22px; color:#666">
                    <i class="fa fa-folder-plus" onclick="showCreate(true)"></i>
                    <i class="fa fa-file-circle-plus" onclick="showCreate(false)"></i>
                </div>
            </div>

            <div class="viewport">
                <div class="nav-pills" id="pills-bar">
                    <div class="pill active" onclick="nav('root', this)">ОБЛАКО</div>
                    <div class="pill" onclick="nav('${PRIVATE_ROOT_ID}', this)">ЛИЧНОЕ</div>
                    <div class="pill" onclick="nav('${MY_ROOT_ID}', this)">ЛОГИСТИКА</div>
                    <div class="pill" onclick="nav('${MERCH_ROOT_ID}', this)">МЕРЧ</div>
                </div>
                <div id="file-list"></div>
            </div>

            <div class="modal" id="modal-ops" onclick="closeModals()">
                <div class="modal-box" onclick="event.stopPropagation()">
                    <h3 id="ops-title" style="margin: 0 0 20px 0; color:var(--gold); font-size:18px;">Объект</h3>
                    <button class="btn btn-gold" onclick="generateQR()">QR Код / Скачать</button>
                    <button class="btn btn-dark" onclick="preRename()">Переименовать</button>
                    <button class="btn btn-dark" style="color:#ff5555" onclick="doDelete()">Удалить</button>
                    <button class="btn btn-dark" onclick="closeModals()">Отмена</button>
                </div>
            </div>

            <div class="modal" id="modal-qr" onclick="closeModals()">
                <div class="modal-box" onclick="event.stopPropagation()" style="text-align:center">
                    <h3 style="color:#fff">Сканируй для загрузки</h3>
                    <div class="qr-container" id="qrcode"></div>
                    <p style="font-size:12px; color:#777">Убедитесь, что устройства в одной сети</p>
                    <button class="btn btn-dark" onclick="closeModals()">Закрыть</button>
                </div>
            </div>

            <div class="modal" id="modal-create">
                <div class="modal-box">
                    <h3 id="create-title">Новый файл</h3>
                    <input type="text" id="create-name" placeholder="Название">
                    <textarea id="create-content" placeholder="Контент (текст)" rows="5"></textarea>
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
                let parentCur = null;
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
                    list.innerHTML = '<div style="padding:120px; text-align:center; opacity:0.1"><i class="fa fa-circle-notch fa-spin fa-3x"></i></div>';
                    
                    try {
                        const r = await fetch('/storage/api/list?folderId=' + id);
                        if(r.status === 401) { location.reload(); return; }
                        if(!r.ok) throw new Error("Server Error: " + r.status);
                        const d = await r.json();
                        
                        if(d.error) throw new Error(d.error);
                        if(!d.files) throw new Error("Пустой ответ сервера");

                        list.innerHTML = '';
                        parentCur = d.parentId;

                        if(parentCur) {
                            const back = document.createElement('div');
                            back.className = 'f-row';
                            back.innerHTML = '<div class="f-icon" style="background:#222; color:#fff"><i class="fa fa-arrow-left"></i></div><div class="f-details"><b>Назад</b></div>';
                            back.onclick = () => nav(parentCur);
                            list.appendChild(back);
                        }

                        if(d.files.length === 0 && !parentCur) {
                            list.innerHTML = '<div style="padding:100px; text-align:center; color:#444; font-weight:bold;">ПУСТО</div>';
                        }

                        d.files.forEach(f => {
                            const isDir = f.mimeType.includes('folder');
                            const iconClass = getIcon(f.name, f.mimeType);
                            const iconColor = getColor(f.name, f.mimeType, isDir);
                            
                            const div = document.createElement('div');
                            div.className = 'f-row ' + (isDir ? 'is-dir' : '');
                            div.innerHTML = \`
                                <div class="f-icon" style="color:\${iconColor}"><i class="fa \${iconClass}"></i></div>
                                <div class="f-details" onclick="\${isDir ? \`nav('\${f.id}')\` : \`view('\${f.id}', '\${f.mimeType}')\`}">
                                    <div class="f-name">\${f.name}</div>
                                    <div class="f-meta">\${isDir ? 'Папка' : (f.size/1024/1024).toFixed(2)+' MB'}</div>
                                </div>
                                <div class="f-ops" onclick="openOps('\${f.id}', '\${f.name}')"><i class="fa fa-ellipsis-vertical"></i></div>
                            \`;
                            list.appendChild(div);
                        });
                    } catch(e) {
                         console.error(e);
                         list.innerHTML = '<div style="padding:20px; color:red; text-align:center">Ошибка связи с сервером<br><small>' + e.message + '</small></div>';
                    }
                }

                function getIcon(n, m) {
                    if(m.includes('folder')) return 'fa-folder';
                    const ext = n.split('.').pop().toLowerCase();
                    const icons = {
                        'jpg':'fa-image', 'jpeg':'fa-image', 'png':'fa-image', 'gif':'fa-image', 'webp':'fa-image',
                        'mp4':'fa-video', 'mov':'fa-video', 'avi':'fa-video', 'webm':'fa-video',
                        'mp3':'fa-music', 'wav':'fa-music', 'ogg':'fa-music',
                        'pdf':'fa-file-pdf', 'doc':'fa-file-word', 'docx':'fa-file-word',
                        'xls':'fa-file-excel', 'xlsx':'fa-file-excel', 'ppt':'fa-file-powerpoint', 'pptx':'fa-file-powerpoint',
                        'txt':'fa-file-lines', 'log':'fa-file-lines', 
                        'json':'fa-code', 'js':'fa-code', 'html':'fa-code', 'css':'fa-code',
                        'zip':'fa-file-zipper', 'rar':'fa-file-zipper', '7z':'fa-file-zipper'
                    };
                    return icons[ext] || 'fa-file';
                }

                function getColor(n, m, isDir) {
                    if(isDir) return '#f0b90b'; 
                    const ext = n.split('.').pop().toLowerCase();
                    if(['xls','xlsx','csv'].includes(ext)) return '#217346'; 
                    if(['doc','docx'].includes(ext)) return '#2b579a'; 
                    if(['pdf'].includes(ext)) return '#f40f02'; 
                    if(['ppt','pptx'].includes(ext)) return '#d24726'; 
                    if(['zip','rar','7z'].includes(ext)) return '#a58e65'; 
                    if(m.includes('image')) return '#d93f87'; 
                    if(m.includes('video')) return '#8e44ad'; 
                    if(m.includes('audio')) return '#f39c12'; 
                    if(m.includes('code') || ['json','js','html','css'].includes(ext)) return '#3498db'; 
                    return '#666'; 
                }

                function openOps(id, name) {
                    activeId = id; activeName = name;
                    document.getElementById('ops-title').innerText = name;
                    document.getElementById('modal-ops').style.display = 'flex';
                }

                function generateQR() {
                    closeModals();
                    const url = window.location.origin + '/storage/api/proxy/' + activeId;
                    const qrDiv = document.getElementById('qrcode');
                    qrDiv.innerHTML = '';
                    new QRCode(qrDiv, { text: url, width: 200, height: 200 });
                    document.getElementById('modal-qr').style.display = 'flex';
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
                    if(confirm("Удалить объект?")) {
                        await fetch('/storage/api/delete', {
                            method: 'POST', headers: {'Content-Type':'application/json'},
                            body: JSON.stringify({ id: activeId })
                        });
                        closeModals(); nav(cur);
                    }
                }

                async function upload(files) {
                    if(!files || !files.length) return;
                    document.getElementById('file-list').innerHTML = '<div style="padding:100px;text-align:center"><i class="fa fa-cloud-arrow-up fa-fade fa-3x" style="color:var(--gold)"></i><br><br>Загрузка...<br><span style="font-size:12px;color:#555">Для больших видео подождите</span></div>';
                    for(let f of files) {
                        const fd = new FormData(); fd.append('file', f); fd.append('folderId', cur);
                        try {
                            const r = await fetch('/storage/api/upload', { method:'POST', body:fd });
                            if(r.status === 401) { location.reload(); return; }
                            if(!r.ok) throw new Error("Upload Failed: " + r.status);
                        } catch(e) { alert("Ошибка загрузки файла " + f.name + ": " + e); }
                    }
                    nav(cur);
                }

                function view(id, mime) {
                    const body = document.getElementById('v-body');
                    const url = '/storage/api/proxy/' + id;
                    const fullUrl = window.location.origin + url;
                    
                    body.innerHTML = '<div style="color:#555"><i class="fa fa-spinner fa-spin fa-2x"></i></div>';
                    document.getElementById('viewer').style.display = 'flex';
                    
                    if(mime.includes('image')) {
                        body.innerHTML = '<img src="'+url+'">';
                    }
                    else if(mime.includes('video')) {
                        body.innerHTML = '<video src="'+url+'" controls autoplay playsinline style="max-height:80vh"></video>';
                    }
                    else if(mime.includes('audio')) {
                         body.innerHTML = '<div style="text-align:center"><i class="fa fa-music fa-5x" style="color:#333;margin-bottom:30px"></i><br><audio src="'+url+'" controls autoplay></audio></div>';
                    }
                    else if(mime.includes('pdf')) {
                         // Нативный PDF
                         body.innerHTML = '<iframe src="'+url+'" type="application/pdf" width="100%" height="100%"></iframe>';
                    }
                    else if(mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('word') || mime.includes('document') || mime.includes('presentation') || mime.includes('powerpoint')) {
                         // Microsoft Viewer (более стабильный для docx/xlsx)
                         const encoded = encodeURIComponent(fullUrl);
                         const msViewer = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encoded;
                         body.innerHTML = '<iframe src="'+msViewer+'" style="width:100%; height:100%; border:none;"></iframe>';
                    }
                    else if(mime.includes('text') || mime.includes('json') || mime.includes('javascript') || mime.includes('xml')) {
                         fetch(url).then(r => r.text()).then(t => {
                             body.innerHTML = '<pre style="color:#eee; padding:20px; overflow:auto; white-space:pre-wrap; width:100%; height:100%; box-sizing:border-box;">'+t.replace(/</g,'&lt;')+'</pre>';
                         }).catch(e => body.innerHTML = 'Error loading text');
                    }
                    else {
                        body.innerHTML = '<div style="text-align:center"><h3>Предпросмотр недоступен</h3><p>Этот формат нельзя открыть в браузере</p><button class="btn btn-gold" onclick="window.open(\\''+url+'\\')">СКАЧАТЬ ФАЙЛ</button></div>';
                    }
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
