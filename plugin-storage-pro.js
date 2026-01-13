const fs = require('fs');
const path = require('path');

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const STORAGE_ROOT = path.join(__dirname, 'storage');
    
    // Подключаем multer только внутри, чтобы не вешать весь сервер
    let upload;
    try {
        const multer = require('multer');
        upload = multer({ dest: 'uploads/' });
    } catch (e) {
        console.log("⚠️ Multer не найден, загрузка через браузер будет ограничена");
    }

    // Создаем структуру X-Platform
    if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });

    // РАЗДАЧА ФАЙЛОВ (Миниатюры и скачивание)
    const express = require('express');
    app.use('/cdn', express.static(STORAGE_ROOT));

    // УДАЛЕНИЕ
    app.post('/explorer/delete', (req, res) => {
        const { itemPath } = req.body;
        if (!itemPath || ['ЛОГИСТ', 'МЕРЧ', ''].includes(itemPath)) return res.status(403).send("Protected");
        const absPath = path.join(STORAGE_ROOT, itemPath);
        if (fs.existsSync(absPath)) {
            fs.rmSync(absPath, { recursive: true, force: true });
            res.json({ success: true });
        } else res.status(404).send("Not found");
    });

    // СОЗДАНИЕ ПАПКИ
    app.post('/explorer/mkdir', (req, res) => {
        const { path: relPath, name } = req.body;
        const newPath = path.join(STORAGE_ROOT, relPath, name);
        if (!fs.existsSync(newPath)) {
            fs.mkdirSync(newPath, { recursive: true });
            res.json({ success: true });
        } else res.status(400).send("Exists");
    });

    // ЗАГРУЗКА
    if (upload) {
        app.post('/explorer/upload', upload.single('file'), (req, res) => {
            const relPath = req.body.path || '';
            const targetPath = path.join(STORAGE_ROOT, relPath, req.file.originalname);
            fs.renameSync(req.file.path, targetPath);
            res.redirect('/explorer?path=' + encodeURIComponent(relPath));
        });
    }

    // ИНТЕРФЕЙС X-DRIVE
    app.get('/explorer', (req, res) => {
        const relPath = req.query.path || '';
        const absPath = path.join(STORAGE_ROOT, relPath);
        if (!fs.existsSync(absPath)) return res.send("Ошибка: путь не найден");
        
        const items = fs.readdirSync(absPath, { withFileTypes: true });

        const itemsHtml = items.map(item => {
            const itemRel = path.join(relPath, item.name).replace(/\\/g, '/');
            const isDir = item.isDirectory();
            const isImg = ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(item.name).toLowerCase());
            const canDel = !(['ЛОГИСТ', 'МЕРЧ'].includes(item.name) && relPath === '');

            return `
            <div style="background:#161b22; border:1px solid #30363d; border-radius:10px; padding:10px; text-align:center;">
                <div onclick="${isDir ? `location.href='/explorer?path=${encodeURIComponent(itemRel)}'` : ''}" style="cursor:pointer; height:100px; display:flex; align-items:center; justify-content:center; background:#000; border-radius:5px; overflow:hidden;">
                    ${isImg ? `<img src="/cdn/${itemRel}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:40px;">${isDir ? '📂' : '📄'}</span>`}
                </div>
                <div style="font-size:11px; margin:8px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.name}</div>
                <div style="display:flex; gap:5px;">
                    ${!isDir ? `<a href="/cdn/${itemRel}" download="${item.name}" style="flex:1; background:#238636; color:white; text-decoration:none; font-size:10px; padding:5px; border-radius:4px; font-weight:bold;">СКАЧАТЬ</a>` : ''}
                    ${canDel ? `<button onclick="xDel('${itemRel}')" style="flex:1; background:#da3633; color:white; border:none; font-size:10px; padding:5px; border-radius:4px; cursor:pointer;">УДАЛИТЬ</button>` : ''}
                </div>
            </div>`;
        }).join('');

        res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>X-Platform Drive</title>
            <style>
                body { background:#0d1117; color:#c9d1d9; font-family:sans-serif; padding:20px; }
                .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap:15px; }
                .tools { background:#161b22; border:1px solid #30363d; padding:15px; border-radius:10px; margin-bottom:20px; display:flex; gap:10px; flex-wrap:wrap; }
                input, button { padding:8px; border-radius:6px; border:1px solid #30363d; }
                input { background:#0d1117; color:white; }
                .btn-ok { background:#238636; color:white; font-weight:bold; cursor:pointer; }
            </style>
        </head>
        <body>
            <h2>📂 X-DRIVE: ${relPath || 'Корень'}</h2>
            <div class="tools">
                <input type="text" id="nd" placeholder="Новая папка">
                <button class="btn-ok" onclick="mk()">+ Папка</button>
                <form action="/explorer/upload" method="POST" enctype="multipart/form-data" style="display:flex; gap:5px;">
                    <input type="hidden" name="path" value="${relPath}">
                    <input type="file" name="file" required>
                    <button type="submit" class="btn-ok">↑ Загрузить</button>
                </form>
                ${relPath ? `<button onclick="history.back()" style="background:#30363d; color:white;">⬅ Назад</button>` : ''}
            </div>
            <div class="grid">${itemsHtml}</div>
            <script>
                async function xDel(p) {
                    if(!confirm('Удалить?')) return;
                    await fetch('/explorer/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({itemPath:p}) });
                    location.reload();
                }
                async function mk() {
                    const n = document.getElementById('nd').value;
                    if(!n) return;
                    await fetch('/explorer/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:'${relPath}', name:n}) });
                    location.reload();
                }
            </script>
        </body>
        </html>`);
    });

    console.log("✅ X-PLATFORM DRIVE: ГИБРИДНЫЙ РЕЖИМ ЗАПУЩЕН");
};
