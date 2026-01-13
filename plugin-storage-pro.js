const fs = require('fs');
const path = require('path');
const express = require('express');

module.exports = function(app, context) {
    const { MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const STORAGE_ROOT = path.join(__dirname, 'storage');

    // Раздача файлов
    app.use('/cdn', express.static(STORAGE_ROOT));

    // --- ОБРАБОТЧИКИ СОБЫТИЙ (SERVER-SIDE) ---

    // 1. Создание папки
    app.post('/explorer/mkdir', (req, res) => {
        const { path: relPath, name } = req.body;
        const targetPath = path.join(STORAGE_ROOT, relPath, name);
        
        try {
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
                res.json({ success: true });
            } else {
                res.status(400).json({ error: "Папка уже существует" });
            }
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 2. Удаление
    app.post('/explorer/delete', (req, res) => {
        const { itemPath } = req.body;
        // Защита: запрещаем удалять корень и системные разделы
        const protected = ['', 'ЛОГИСТ', 'МЕРЧ'].includes(itemPath.replace(/^\//, ''));
        if (protected) return res.status(403).json({ error: "Запрещено удалять систему" });

        const targetPath = path.join(STORAGE_ROOT, itemPath);
        try {
            if (fs.existsSync(targetPath)) {
                fs.rmSync(targetPath, { recursive: true, force: true });
                res.json({ success: true });
            } else {
                res.status(404).json({ error: "Не найдено" });
            }
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // --- ИНТЕРФЕЙС (CLIENT-SIDE) ---
    app.get('/explorer', (req, res) => {
        const relPath = req.query.path || '';
        const absPath = path.join(STORAGE_ROOT, relPath);
        
        if (!fs.existsSync(absPath)) return res.send("Ошибка: Путь не найден на сервере.");
        
        const items = fs.readdirSync(absPath, { withFileTypes: true });

        const itemsHtml = items.map(item => {
            const itemRel = path.join(relPath, item.name).replace(/\\/g, '/');
            const encodedPath = itemRel.split('/').map(encodeURIComponent).join('/');
            const isDir = item.isDirectory();
            const isImg = ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(item.name).toLowerCase());
            const displayName = item.name.includes('_') ? item.name.split('_')[0] : item.name;

            return `
            <div style="background:#161b22; border:1px solid #30363d; border-radius:10px; padding:10px; text-align:center; width:150px;">
                <div onclick="${isDir ? `location.href='/explorer?path=${encodeURIComponent(itemRel)}'` : ''}" style="cursor:pointer; height:100px; display:flex; align-items:center; justify-content:center; background:#000; border-radius:5px; overflow:hidden;">
                    ${isImg ? `<img src="/cdn/${encodedPath}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:40px;">${isDir ? '📂' : '📄'}</span>`}
                </div>
                <div style="font-size:11px; margin:8px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.name}">${displayName}</div>
                <div style="display:flex; gap:5px;">
                    ${!isDir ? `<a href="/cdn/${encodedPath}" download="${item.name}" style="flex:1; background:#238636; color:white; text-decoration:none; font-size:10px; padding:5px; border-radius:4px; font-weight:bold;">СКАЧАТЬ</a>` : ''}
                    <button onclick="xDel('${itemRel}')" style="flex:1; background:#da3633; color:white; border:none; font-size:10px; padding:5px; border-radius:4px; cursor:pointer;">УДАЛИТЬ</button>
                </div>
            </div>`;
        }).join('');

        res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>X-Platform Drive</title>
            <style>
                body { background:#0d1117; color:#c9d1d9; font-family:sans-serif; padding:20px; margin:0; }
                .grid { display:flex; flex-wrap:wrap; gap:15px; }
                .tools { background:#161b22; border:1px solid #30363d; padding:15px; border-radius:10px; margin-bottom:20px; display:flex; gap:10px; }
                .btn { background:#238636; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer; }
                input { background:#0d1117; color:white; border:1px solid #30363d; padding:8px; border-radius:6px; outline:none; }
            </style>
        </head>
        <body>
            <h2 style="color:#f1c40f;">📂 X-DRIVE: /${relPath}</h2>
            <div class="tools">
                ${relPath ? `<button class="btn" style="background:#30363d" onclick="history.back()">⬅ Назад</button>` : ''}
                <input type="text" id="nd" placeholder="Название папки">
                <button class="btn" onclick="mk()">+ Создать папку</button>
            </div>
            <div class="grid">${itemsHtml}</div>
            <script>
                async function xDel(p) { 
                    if(confirm('Удалить этот элемент?')) { 
                        const res = await fetch('/explorer/delete', { 
                            method:'POST', 
                            headers:{'Content-Type':'application/json'}, 
                            body:JSON.stringify({itemPath:p}) 
                        }); 
                        if(res.ok) location.reload(); else alert('Ошибка удаления');
                    } 
                }
                async function mk() { 
                    const n = document.getElementById('nd').value; 
                    if(n) { 
                        const res = await fetch('/explorer/mkdir', { 
                            method:'POST', 
                            headers:{'Content-Type':'application/json'}, 
                            body:JSON.stringify({path:'${relPath}', name:n}) 
                        }); 
                        if(res.ok) location.reload(); else alert('Ошибка создания папки');
                    } 
                }
            </script>
        </body>
        </html>`);
    });

    console.log("✅ X-PLATFORM DRIVE: ПОЛНОЦЕННЫЙ ФУНКЦИОНАЛ ЗАПУЩЕН");
};
