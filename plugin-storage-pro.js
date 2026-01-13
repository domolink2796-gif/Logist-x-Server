const fs = require('fs');
const path = require('path');
const multer = require('multer');

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const STORAGE_ROOT = path.join(__dirname, 'storage');
    const LOG_FILE = path.join(__dirname, 'activity_log.json');

    const upload = multer({ dest: 'uploads/' });

    if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
    ['ЛОГИСТ', 'МЕРЧ'].forEach(dir => {
        const p = path.join(STORAGE_ROOT, dir);
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });

    function writeLog(action, details) {
        let logs = [];
        try {
            if (fs.existsSync(LOG_FILE)) logs = JSON.parse(fs.readFileSync(LOG_FILE));
            logs.push({ date: new Date().toLocaleString(), action, details });
            fs.writeFileSync(LOG_FILE, JSON.stringify(logs.slice(-1000), null, 2));
        } catch (e) { console.log("Ошибка лога:", e.message); }
    }

    const folderMap = new Map();
    folderMap.set(MY_ROOT_ID, 'ЛОГИСТ');
    folderMap.set(MERCH_ROOT_ID, 'МЕРЧ');

    const originalGetOrCreate = context.getOrCreateFolder;
    context.getOrCreateFolder = async function(rawName, parentId) {
        const folderId = await originalGetOrCreate.apply(null, arguments);
        const name = String(rawName).trim();
        const parentPath = folderMap.get(parentId) || '';
        const currentPath = path.join(parentPath, name);
        folderMap.set(folderId, currentPath);

        const absPath = path.join(STORAGE_ROOT, currentPath);
        if (!fs.existsSync(absPath)) {
            fs.mkdirSync(absPath, { recursive: true });
            writeLog('CREATE_DIR', currentPath);
        }
        return folderId;
    };

    const originalCreateFile = drive.files.create;
    drive.files.create = async function(params) {
        const result = await originalCreateFile.apply(drive.files, arguments);
        try {
            if (params.media && params.media.body) {
                const fileName = params.resource ? params.resource.name : `file_${Date.now()}.jpg`;
                const parentId = params.resource.parents ? params.resource.parents[0] : null;
                const relPath = folderMap.get(parentId) || 'Разное';
                const targetDir = path.join(STORAGE_ROOT, relPath);
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                const filePath = path.join(targetDir, fileName);
                const dest = fs.createWriteStream(filePath);
                params.media.body.pipe(dest);
                writeLog('SAVE_FILE', filePath);
            }
        } catch (e) { console.log("Ошибка зеркала:", e.message); }
        return result;
    };

    app.use('/cdn', require('express').static(STORAGE_ROOT));

    app.post('/explorer/delete', (req, res) => {
        const { itemPath } = req.body;
        if (!itemPath || ['', 'ЛОГИСТ', 'МЕРЧ', '/ЛОГИСТ', '/МЕРЧ'].includes(itemPath)) return res.status(403).send("Запрещено");
        const absPath = path.join(STORAGE_ROOT, itemPath);
        if (fs.existsSync(absPath)) {
            fs.rmSync(absPath, { recursive: true, force: true });
            writeLog('DELETE', itemPath);
            res.json({ success: true });
        } else res.status(404).send("Не найдено");
    });

    app.post('/explorer/mkdir', (req, res) => {
        const { path: relPath, name } = req.body;
        const newPath = path.join(STORAGE_ROOT, relPath, name);
        if (!fs.existsSync(newPath)) {
            fs.mkdirSync(newPath, { recursive: true });
            writeLog('MKDIR_MANUAL', path.join(relPath, name));
            res.json({ success: true });
        } else res.status(400).send("Уже есть");
    });

    app.post('/explorer/upload', upload.single('file'), (req, res) => {
        const { path: relPath } = req.body;
        const targetPath = path.join(STORAGE_ROOT, relPath, req.file.originalname);
        fs.renameSync(req.file.path, targetPath);
        writeLog('UPLOAD_MANUAL', path.join(relPath, req.file.originalname));
        res.redirect('/explorer?path=' + encodeURIComponent(relPath));
    });

    app.get('/explorer', (req, res) => {
        const relPath = req.query.path || '';
        const absPath = path.join(STORAGE_ROOT, relPath);
        if (!fs.existsSync(absPath)) return res.send("Путь не найден");
        const items = fs.readdirSync(absPath, { withFileTypes: true });

        let html = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Logist-X | PRO</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.js"></script>
            <style>
                body { font-family: sans-serif; background: #0d1117; color: #c9d1d9; margin:0; padding:20px; }
                .header { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #30363d; padding-bottom:15px; margin-bottom:20px; }
                .controls { background:#161b22; padding:15px; border-radius:10px; margin-bottom:20px; border:1px solid #30363d; display:flex; gap:10px; align-items:center; }
                .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:15px; }
                .item-card { background:#161b22; border:1px solid #30363d; border-radius:12px; padding:10px; text-align:center; position:relative; }
                .img-preview { width:100%; height:100px; object-fit:cover; border-radius:8px; cursor:pointer; }
                .folder-icon { font-size:45px; cursor:pointer; }
                .name { font-size:11px; margin:8px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .btn { padding:6px 12px; border-radius:6px; cursor:pointer; border:none; font-weight:bold; }
                .btn-add { background:#238636; color:white; }
                .btn-del { background:#da3633; color:white; font-size:10px; width:100%; margin-top:5px; }
                .btn-back { background:#f1c40f; color:black; text-decoration:none; padding:8px 15px; border-radius:6px; font-weight:bold; }
                input { background:#0d1117; border:1px solid #30363d; color:white; padding:6px; border-radius:6px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div><h1>📁 Logist-X Cloud <span style="color:#f1c40f">PRO</span></h1><small>/${relPath}</small></div>
                ${relPath ? `<a href="/explorer?path=${path.dirname(relPath)}" class="btn-back">⬅ НАЗАД</a>` : ''}
            </div>

            <div class="controls">
                <input type="text" id="newFolderName" placeholder="Новая папка">
                <button class="btn btn-add" onclick="mkdir()">Создать</button>
                <form action="/explorer/upload" method="POST" enctype="multipart/form-data" style="margin-left:auto; display:flex; gap:10px;">
                    <input type="hidden" name="path" value="${relPath}">
                    <input type="file" name="file" required style="width:180px">
                    <button type="submit" class="btn btn-add">↑ Загрузить</button>
                </form>
            </div>

            <div class="grid" id="gallery">
        `;

        items.forEach(item => {
            const itemRel = path.join(relPath, item.name).replace(/\\/g, '/');
            const isDir = item.isDirectory();
            const isImg = ['.jpg','.jpeg','.png'].includes(path.extname(item.name).toLowerCase());
            const canDelete = !['ЛОГИСТ', 'МЕРЧ'].includes(item.name) || relPath !== '';

            html += `
                <div class="item-card">
                    <div onclick="${isDir ? `location.href='/explorer?path=${encodeURIComponent(itemRel)}'` : ''}">
                        ${isImg ? `<img src="/cdn/${itemRel}" class="img-preview">` : `<div class="folder-icon">${isDir ? '📂' : '📄'}</div>`}
                    </div>
                    <div class="name">${item.name}</div>
                    ${canDelete ? `<button class="btn-del" onclick="del('${itemRel}')">УДАЛИТЬ</button>` : ''}
                </div>
            `;
        });

        html += `
            </div>
            <script>
                new Viewer(document.getElementById('gallery'), { url: 'src' });
                async function del(p) {
                    if(!confirm('Удалить?')) return;
                    const res = await fetch('/explorer/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({itemPath:p}) });
                    if(res.ok) location.reload(); else alert('Ошибка удаления');
                }
                async function mkdir() {
                    const name = document.getElementById('newFolderName').value;
                    if(!name) return;
                    const res = await fetch('/explorer/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:'${relPath}', name}) });
                    if(res.ok) location.reload(); else alert('Ошибка создания');
                }
            </script>
        </body>
        </html>`;
        res.send(html);
    });
    
    console.log("✅ ПЛАГИН STORAGE PRO ПОДКЛЮЧЕН");
};
