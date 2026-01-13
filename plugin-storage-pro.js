const fs = require('fs');
const path = require('path');
const multer = require('multer');

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const STORAGE_ROOT = path.join(__dirname, 'storage');

    // Настройка для загрузки файлов через браузер
    const upload = multer({ dest: 'uploads/' });

    // Создаем папки если их нет
    if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
    ['ЛОГИСТ', 'МЕРЧ'].forEach(dir => {
        const p = path.join(STORAGE_ROOT, dir);
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });

    const folderMap = new Map();
    folderMap.set(MY_ROOT_ID, 'ЛОГИСТ');
    folderMap.set(MERCH_ROOT_ID, 'МЕРЧ');

    // --- ЛОГИКА АВТОНОМНОСТИ ---

    const originalGetOrCreate = context.getOrCreateFolder;
    context.getOrCreateFolder = async function(rawName, parentId) {
        const folderId = await originalGetOrCreate.apply(null, arguments);
        const name = String(rawName).trim();
        const parentPath = folderMap.get(parentId) || '';
        const currentPath = path.join(parentPath, name);
        folderMap.set(folderId, currentPath);

        const absPath = path.join(STORAGE_ROOT, currentPath);
        if (!fs.existsSync(absPath)) fs.mkdirSync(absPath, { recursive: true });
        return folderId;
    };

    const originalCreateFile = drive.files.create;
    drive.files.create = async function(params) {
        const result = await originalCreateFile.apply(drive.files, arguments);
        try {
            if (params.media && params.media.body) {
                const fileName = params.resource ? params.resource.name : "file_" + Date.now() + ".jpg";
                const parentId = params.resource.parents ? params.resource.parents[0] : null;
                const relPath = folderMap.get(parentId) || 'Разное';
                const targetDir = path.join(STORAGE_ROOT, relPath);
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                const filePath = path.join(targetDir, fileName);
                const dest = fs.createWriteStream(filePath);
                params.media.body.pipe(dest);
            }
        } catch (e) { console.log("Ошибка записи файла:", e.message); }
        return result;
    };

    // --- API УПРАВЛЕНИЯ ---
    app.use('/cdn', require('express').static(STORAGE_ROOT));

    app.post('/explorer/delete', (req, res) => {
        const itemPath = req.body.itemPath;
        if (!itemPath || ['', 'ЛОГИСТ', 'МЕРЧ'].includes(itemPath)) return res.status(403).send("Запрещено");
        const absPath = path.join(STORAGE_ROOT, itemPath);
        if (fs.existsSync(absPath)) {
            fs.rmSync(absPath, { recursive: true, force: true });
            res.json({ success: true });
        } else res.status(404).send("Не найдено");
    });

    app.post('/explorer/mkdir', (req, res) => {
        const { path: relPath, name } = req.body;
        const newPath = path.join(STORAGE_ROOT, relPath, name);
        if (!fs.existsSync(newPath)) {
            fs.mkdirSync(newPath, { recursive: true });
            res.json({ success: true });
        } else res.status(400).send("Уже существует");
    });

    app.post('/explorer/upload', upload.single('file'), (req, res) => {
        const relPath = req.body.path;
        const targetPath = path.join(STORAGE_ROOT, relPath, req.file.originalname);
        fs.renameSync(req.file.path, targetPath);
        res.redirect('/explorer?path=' + encodeURIComponent(relPath));
    });

    // --- ИНТЕРФЕЙС (ИСПРАВЛЕННЫЙ) ---
    app.get('/explorer', (req, res) => {
        const relPath = req.query.path || '';
        const absPath = path.join(STORAGE_ROOT, relPath);
        if (!fs.existsSync(absPath)) return res.send("Путь не найден");
        const items = fs.readdirSync(absPath, { withFileTypes: true });

        // Формируем список элементов
        let itemsHtml = items.map(item => {
            const itemRel = (relPath ? relPath + '/' : '') + item.name;
            const isDir = item.isDirectory();
            const ext = path.extname(item.name).toLowerCase();
            const isImg = ['.jpg', '.jpeg', '.png'].includes(ext);
            const canDel = !(['ЛОГИСТ', 'МЕРЧ'].includes(item.name) && relPath === '');

            return `
            <div class="card">
                <div onclick="${isDir ? "location.href='/explorer?path=" + encodeURIComponent(itemRel) + "'" : ""}">
                    ${isImg ? '<img src="/cdn/' + itemRel + '" class="preview">' : '<div class="icon">' + (isDir ? '📂' : '📄') + '</div>'}
                </div>
                <div class="name">${item.name}</div>
                ${canDel ? '<button class="btn-del" onclick="remove(\'' + itemRel + '\')">УДАЛИТЬ</button>' : ''}
            </div>`;
        }).join('');

        const backLink = relPath ? `<button class="btn" onclick="history.back()">⬅ НАЗАД</button>` : '';

        res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Logist-X PRO</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.js"></script>
            <style>
                body { background:#0d1117; color:#c9d1d9; font-family:sans-serif; padding:20px; margin:0; }
                .header { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #30363d; padding-bottom:15px; }
                .controls { background:#161b22; padding:15px; border-radius:10px; margin:20px 0; border:1px solid #30363d; display:flex; gap:10px; flex-wrap:wrap; }
                .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:15px; }
                .card { background:#161b22; border:1px solid #30363d; border-radius:12px; padding:10px; text-align:center; }
                .preview { width:100%; height:100px; object-fit:cover; border-radius:8px; cursor:pointer; }
                .icon { font-size:45px; cursor:pointer; }
                .name { font-size:11px; margin:8px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .btn { padding:8px 15px; border-radius:6px; cursor:pointer; border:none; font-weight:bold; }
                .btn-add { background:#238636; color:white; }
                .btn-del { background:#da3633; color:white; font-size:10px; width:100%; border:none; padding:5px; border-radius:4px; cursor:pointer; }
                input { background:#0d1117; border:1px solid #30363d; color:white; padding:8px; border-radius:6px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div><h1>📂 Cloud PRO</h1><small>storage/${relPath}</small></div>
                ${backLink}
            </div>
            <div class="controls">
                <input type="text" id="fn" placeholder="Имя папки">
                <button class="btn btn-add" onclick="mk()">+ Папка</button>
                <form action="/explorer/upload" method="POST" enctype="multipart/form-data" style="display:flex; gap:10px;">
                    <input type="hidden" name="path" value="${relPath}">
                    <input type="file" name="file" required onchange="this.form.submit()">
                    <span style="font-size:12px; align-self:center;">↑ Загрузить</span>
                </form>
            </div>
            <div class="grid" id="gallery">${itemsHtml}</div>
            <script>
                new Viewer(document.getElementById('gallery'), { url: 'src' });
                async function remove(p) {
                    if(!confirm('Удалить?')) return;
                    await fetch('/explorer/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({itemPath:p}) });
                    location.reload();
                }
                async function mk() {
                    const n = document.getElementById('fn').value;
                    if(!n) return;
                    await fetch('/explorer/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:'${relPath}', name:n}) });
                    location.reload();
                }
            </script>
        </body>
        </html>
        `);
    });

    console.log("✅ ПЛАГИН STORAGE PRO ПОДКЛЮЧЕН (БЕЗ ОШИБОК)");
};
