const fs = require('fs');
const path = require('path');
const multer = require('multer');
const express = require('express');

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const STORAGE_ROOT = path.join(__dirname, 'storage');
    const upload = multer({ dest: 'uploads/' });

    if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
    
    // API ДЛЯ CDN (РАЗДАЧА ФАЙЛОВ)
    app.use('/cdn', express.static(STORAGE_ROOT));

    // API УДАЛЕНИЯ
    app.post('/explorer/delete', (req, res) => {
        const { itemPath } = req.body;
        if (!itemPath || ['', 'ЛОГИСТ', 'МЕРЧ'].includes(itemPath.replace(/^\//, ''))) return res.status(403).send("Защищено");
        const absPath = path.join(STORAGE_ROOT, itemPath);
        if (fs.existsSync(absPath)) {
            fs.rmSync(absPath, { recursive: true, force: true });
            res.json({ success: true });
        } else res.status(404).send("Не найден");
    });

    // API СОЗДАНИЯ ПАПКИ
    app.post('/explorer/mkdir', (req, res) => {
        const { path: relPath, name } = req.body;
        const newPath = path.join(STORAGE_ROOT, relPath, name);
        if (!fs.existsSync(newPath)) {
            fs.mkdirSync(newPath, { recursive: true });
            res.json({ success: true });
        } else res.status(400).send("Уже есть");
    });

    // API ЗАГРУЗКИ
    app.post('/explorer/upload', upload.single('file'), (req, res) => {
        const { path: relPath } = req.body;
        const targetPath = path.join(STORAGE_ROOT, relPath, req.file.originalname);
        fs.renameSync(req.file.path, targetPath);
        res.redirect('/explorer?path=' + encodeURIComponent(relPath));
    });

    // ИНТЕРФЕЙС X-DRIVE
    app.get('/explorer', (req, res) => {
        const relPath = req.query.path || '';
        const absPath = path.join(STORAGE_ROOT, relPath);
        if (!fs.existsSync(absPath)) return res.send("Ошибка пути");
        
        const items = fs.readdirSync(absPath, { withFileTypes: true });

        const itemsHtml = items.map(item => {
            const itemRel = path.join(relPath, item.name).replace(/\\/g, '/');
            const isDir = item.isDirectory();
            const ext = path.extname(item.name).toLowerCase();
            const isImg = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
            const canDel = !(['ЛОГИСТ', 'МЕРЧ'].includes(item.name) && relPath === '');

            return `
            <div class="x-card">
                <div class="x-preview" onclick="${isDir ? `location.href='/explorer?path=${encodeURIComponent(itemRel)}'` : ''}">
                    ${isImg ? `<img src="/cdn/${itemRel}" class="x-img">` : `<div class="x-icon">${isDir ? '📂' : '📄'}</div>`}
                </div>
                <div class="x-name" title="${item.name}">${item.name}</div>
                <div class="x-actions">
                    ${!isDir ? `<a href="/cdn/${itemRel}" download="${item.name}" class="x-btn x-download">СКАЧАТЬ</a>` : ''}
                    ${canDel ? `<button class="x-btn x-del" onclick="xDelete('${itemRel}')">УДАЛИТЬ</button>` : ''}
                </div>
            </div>`;
        }).join('');

        res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>X-Platform | Drive</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.js"></script>
            <style>
                :root { --bg: #010409; --panel: #0d1117; --card: #161b22; --border: #30363d; --accent: #f1c40f; --text: #c9d1d9; }
                body { background: var(--bg); color: var(--text); font-family: sans-serif; margin: 0; padding: 20px; }
                .x-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 15px; }
                .x-tools { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 15px; margin: 20px 0; display: flex; gap: 10px; }
                .x-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 15px; }
                .x-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; }
                .x-preview { height: 100px; display: flex; align-items: center; justify-content: center; background: #000; border-radius: 8px; cursor: pointer; overflow: hidden; }
                .x-img { width: 100%; height: 100%; object-fit: cover; }
                .x-icon { font-size: 40px; }
                .x-name { font-size: 11px; margin: 10px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; }
                .x-actions { display: flex; gap: 5px; margin-top: auto; }
                .x-btn { flex: 1; border: none; padding: 6px; border-radius: 5px; cursor: pointer; font-size: 10px; font-weight: bold; text-decoration: none; text-align: center; color: white; }
                .x-download { background: #238636; }
                .x-del { background: #da3633; }
                .btn-main { background: #238636; color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; }
                input { background: var(--bg); border: 1px solid var(--border); color: white; padding: 8px; border-radius: 6px; }
            </style>
        </head>
        <body>
            <div class="x-header">
                <h1>X-DRIVE / <span style="color:var(--accent)">${relPath || 'Root'}</span></h1>
                ${relPath ? `<button class="btn-main" style="background:#30363d" onclick="location.href='/explorer?path=${encodeURIComponent(path.dirname(relPath).replace(/\\/g, '/'))}'">⬅ Назад</button>` : ''}
            </div>
            <div class="x-tools">
                <input type="text" id="nd" placeholder="Новая папка">
                <button class="btn-main" onclick="xMk()">Создать</button>
                <form action="/explorer/upload" method="POST" enctype="multipart/form-data" style="display:flex; gap:10px;">
                    <input type="hidden" name="path" value="${relPath}">
                    <input type="file" name="file" required onchange="this.form.submit()">
                    <span style="font-size:12px; align-self:center;">↑ Загрузить файл</span>
                </form>
            </div>
            <div class="x-grid" id="gallery">${itemsHtml}</div>
            <script>
                new Viewer(document.getElementById('gallery'), { url: 'src' });
                async function xDelete(p) {
                    if(!confirm('Удалить файл?')) return;
                    await fetch('/explorer/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({itemPath: p}) });
                    location.reload();
                }
                async function xMk() {
                    const n = document.getElementById('nd').value;
                    if(!n) return;
                    await fetch('/explorer/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path: '${relPath}', name: n}) });
                    location.reload();
                }
            </script>
        </body>
        </html>`);
    });

    console.log("✅ X-PLATFORM DRIVE: ФУНКЦИЯ СКАЧИВАНИЯ ДОБАВЛЕНА");
};
