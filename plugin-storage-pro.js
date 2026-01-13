const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');

module.exports = function(app, context) {
    const STORAGE_ROOT = path.join(__dirname, 'storage', 'drive_mirror');
    if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });

    const upload = multer({ dest: 'uploads/' });

    // --- АВТОДЕПЛОЙ ---
    setInterval(() => {
        exec('git fetch origin main', () => {
            exec('git status -uno', (err, out) => {
                if (out && out.includes('behind')) {
                    exec('git pull origin main', () => { exec('pm2 restart logist-final'); });
                }
            });
        });
    }, 300000);

    // --- ЗЕРКАЛО ---
    const folderPathMap = new Map();
    folderPathMap.set(context.MY_ROOT_ID, 'Logist_Root');
    folderPathMap.set(context.MERCH_ROOT_ID, 'Merch_Root');

    const originalGetOrCreate = context.getOrCreateFolder;
    context.getOrCreateFolder = async function(drive, parentId, folderName) {
        const folderId = await originalGetOrCreate.apply(null, arguments);
        try {
            const parentPath = folderPathMap.get(parentId) || 'Other';
            const fullLocalPath = path.join(parentPath, folderName);
            folderPathMap.set(folderId, fullLocalPath);
            const abs = path.join(STORAGE_ROOT, fullLocalPath);
            if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
        } catch(e){}
        return folderId;
    };

    const originalCreateFile = context.drive.files.create;
    context.drive.files.create = async function(params) {
        const res = await originalCreateFile.apply(context.drive.files, arguments);
        try {
            if (params.media && params.media.body) {
                const name = params.resource ? params.resource.name : `file_${Date.now()}`;
                const pId = (params.resource && params.resource.parents) ? params.resource.parents[0] : null;
                const rel = folderPathMap.get(pId) || 'Unsorted';
                const dir = path.join(STORAGE_ROOT, rel);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                params.media.body.pipe(fs.createWriteStream(path.join(dir, name)));
            }
        } catch(e){}
        return res;
    };

    // --- API ПРОВОДНИКА ---
    app.use('/cdn', require('express').static(STORAGE_ROOT));

    app.get('/api/delete', (req, res) => {
        const target = path.join(STORAGE_ROOT, req.query.path);
        if (fs.existsSync(target)) { fs.rmSync(target, { recursive: true, force: true }); res.redirect('back'); }
    });

    app.post('/api/upload', upload.single('file'), (req, res) => {
        const targetDir = path.join(STORAGE_ROOT, req.body.path || '');
        fs.renameSync(req.file.path, path.join(targetDir, req.file.originalname));
        res.redirect('back');
    });

    // ГЛАВНЫЙ ИНТЕРФЕЙС
    app.get('/explorer', (req, res) => {
        const relPath = req.query.path || '';
        const absPath = path.join(STORAGE_ROOT, relPath);
        if (!fs.existsSync(absPath)) return res.send("Ошибка пути");

        const items = fs.readdirSync(absPath, { withFileTypes: true });

        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Logist-X Explorer</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #0a0a0a; color: white; margin: 0; padding: 20px; }
                .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
                .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 15px; }
                .card { background: #181818; border-radius: 10px; padding: 15px; text-align: center; cursor: pointer; position: relative; border: 1px solid #333; transition: 0.2s; }
                .card:hover { background: #222; border-color: #f1c40f; }
                .icon { font-size: 50px; display: block; margin-bottom: 8px; }
                .name { font-size: 13px; word-break: break-all; height: 32px; overflow: hidden; display: block; }
                .btn { background: #f1c40f; color: black; padding: 8px 15px; border-radius: 6px; text-decoration: none; font-weight: bold; border: none; cursor: pointer; }
                .dl-btn { font-size: 11px; color: #f1c40f; text-decoration: underline; margin-top: 5px; display: inline-block; }
                .btn-del { position: absolute; top: 5px; right: 5px; color: #555; text-decoration: none; font-size: 14px; padding: 2px 6px; }
                .btn-del:hover { color: #e74c3c; }
                
                /* Модальное окно для просмотра */
                #viewer { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 1000; justify-content: center; align-items: center; flex-direction: column; }
                #viewer img { max-width: 90%; max-height: 80%; border: 2px solid white; }
                #viewer-close { position: absolute; top: 20px; right: 20px; font-size: 40px; color: white; cursor: pointer; }
            </style>
        </head>
        <body>
            <div id="viewer" onclick="this.style.display='none'">
                <span id="viewer-close">&times;</span>
                <img id="viewer-img" src="">
                <h3 id="viewer-name"></h3>
                <a id="viewer-dl" href="" download class="btn">💾 СКАЧАТЬ ФАЙЛ</a>
            </div>

            <div class="header">
                <h1>📁 Logist-X Cloud <span style="font-size:14px; color:#f1c40f;">/ ${relPath}</span></h1>
                <a href="/explorer?path=${path.dirname(relPath)}" class="btn" style="background:#444; color:white;">⬅ Назад</a>
            </div>

            <div style="margin-bottom:20px; background:#181818; padding:15px; border-radius:10px;">
                <form action="/api/upload" method="post" enctype="multipart/form-data">
                    <input type="hidden" name="path" value="${relPath}">
                    <input type="file" name="file" required>
                    <button type="submit" class="btn">➕ Загрузить файл</button>
                </form>
            </div>

            <div class="grid">
        `;

        items.forEach(item => {
            const itemRel = path.join(relPath, item.name);
            const isDir = item.isDirectory();
            const ext = path.extname(item.name).toLowerCase();
            const isImg = ['.jpg','.jpeg','.png','.gif','.webp'].includes(ext);
            const isPdf = ext === '.pdf';
            
            let icon = isDir ? '📂' : '📄';
            if (isImg) icon = '🖼️';
            if (isPdf) icon = '📕';

            const fileUrl = `/cdn/${itemRel}`;
            const clickAction = isDir 
                ? `location.href='/explorer?path=${encodeURIComponent(itemRel)}'` 
                : (isImg ? `openViewer('${fileUrl}', '${item.name}')` : `window.open('${fileUrl}')`);

            html += `
                <div class="card" onclick="${clickAction}">
                    <a href="/api/delete?path=${encodeURIComponent(itemRel)}" class="btn-del" onclick="event.stopPropagation(); return confirm('Удалить?')">✖</a>
                    <span class="icon">${icon}</span>
                    <span class="name">${item.name}</span>
                    ${!isDir ? `<a href="${fileUrl}" download="${item.name}" class="dl-btn" onclick="event.stopPropagation()">скачать</a>` : ''}
                </div>
            `;
        });

        html += `
            </div>
            <script>
                function openViewer(url, name) {
                    document.getElementById('viewer-img').src = url;
                    document.getElementById('viewer-name').innerText = name;
                    document.getElementById('viewer-dl').href = url;
                    document.getElementById('viewer').style.display = 'flex';
                }
            </script>
        </body>
        </html>`;
        res.send(html);
    });

    app.get('/', (req, res) => res.redirect('/explorer'));
};
