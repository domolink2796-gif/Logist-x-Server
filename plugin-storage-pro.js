const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');

/**
 * X-COMMANDER PRO ULTIMATE v4.0
 * Полноценный аналог Google Drive / Dropbox для X-Platform
 */

module.exports = function(app, context) {
    const { MY_ROOT_ID, MERCH_ROOT_ID, readDatabase } = context;
    const STORAGE_ROOT = path.join(__dirname, 'storage');
    
    // Настройка временной папки для загрузок
    const uploadDir = path.join(__dirname, 'temp_uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    const upload = multer({ dest: 'temp_uploads/' });

    // Твой мастер-ключ
    const ADMIN_KEY = "X-PLATFORM-2026"; 

    app.use(cookieParser());
    
    // Раздача файлов с заголовками CORS
    app.use('/cdn', (req, res, next) => {
        res.set('Access-Control-Allow-Origin', '*');
        next();
    }, express.static(STORAGE_ROOT));

    // Хелпер: Форматирование размера
    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Хелпер: Определение иконки
    const getIcon = (ext, isDir) => {
        if (isDir) return '📂';
        const icons = {
            '.pdf': '📕',
            '.xlsx': '📊', '.xls': '📊', '.csv': '📊',
            '.docx': '📝', '.doc': '📝', '.txt': '📄',
            '.zip': '📦', '.rar': '📦', '.7z': '📦',
            '.jpg': '🖼️', '.png': '🖼️', '.jpeg': '🖼️', '.webp': '🖼️'
        };
        return icons[ext] || '📄';
    };

    // --- СИСТЕМА ПРОВЕРКИ ДОСТУПА ---
    const checkAccess = async (req) => {
        const key = req.query.key || req.cookies?.x_key;
        if (!key) return null;
        if (key === ADMIN_KEY) return { role: 'admin', root: '', name: 'Администратор' };

        const db = await readDatabase();
        const client = db.find(k => k.key === key);
        if (client) {
            const rootDir = client.type === 'merch' ? `МЕРЧ_${MERCH_ROOT_ID}` : `ЛОГИСТ_${MY_ROOT_ID}`;
            const clientDir = `${client.name}_${client.folderId || ''}`.replace(/_$/, '');
            return { role: 'client', root: path.join(rootDir, clientDir), name: client.name };
        }
        return null;
    };

    // --- API: УДАЛЕНИЕ ---
    app.post('/explorer/delete', async (req, res) => {
        const access = await checkAccess(req);
        if (!access || access.role !== 'admin') return res.status(403).json({ error: "Нет прав" });
        
        try {
            const target = path.join(STORAGE_ROOT, req.body.itemPath);
            if (fs.existsSync(target)) {
                fs.rmSync(target, { recursive: true, force: true });
                res.json({ success: true });
            } else res.status(404).json({ error: "Не найдено" });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // --- API: СОЗДАНИЕ ПАПКИ ---
    app.post('/explorer/mkdir', async (req, res) => {
        const access = await checkAccess(req);
        if (!access) return res.status(403).json({ error: "Denied" });
        
        const { path: relPath, name } = req.body;
        const target = path.join(STORAGE_ROOT, relPath, name);
        try {
            if (!fs.existsSync(target)) {
                fs.mkdirSync(target, { recursive: true });
                res.json({ success: true });
            } else res.status(400).json({ error: "Уже существует" });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // --- API: ЗАГРУЗКА ---
    app.post('/explorer/upload', upload.single('file'), async (req, res) => {
        const access = await checkAccess(req);
        if (!access) return res.status(403).send("Forbidden");

        const relPath = req.body.path;
        const target = path.join(STORAGE_ROOT, relPath, req.file.originalname);
        try {
            fs.renameSync(req.file.path, target);
            res.redirect(`/explorer?path=${encodeURIComponent(relPath)}`);
        } catch (e) { res.status(500).send(e.message); }
    });

    // --- ОСНОВНОЙ ИНТЕРФЕЙС ---
    app.get('/explorer', async (req, res) => {
        const access = await checkAccess(req);
        
        // Окно входа
        if (!access) {
            return res.send(`
            <!DOCTYPE html><html><head><meta charset="UTF-8"><title>X-Drive Login</title>
            <style>
                body { background:#0d1117; color:white; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
                .login-card { background:#161b22; padding:40px; border-radius:16px; border:1px solid #30363d; text-align:center; width:320px; box-shadow:0 20px 50px rgba(0,0,0,0.5); }
                input { width:100%; padding:12px; margin:20px 0; background:#0d1117; border:1px solid #30363d; color:white; border-radius:8px; box-sizing:border-box; outline:none; text-align:center; }
                button { width:100%; padding:12px; background:#238636; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; transition:0.3s; }
                button:hover { background:#2ea043; }
            </style></head>
            <body>
                <div class="login-card">
                    <h2 style="color:#f1c40f;margin:0;">X-PLATFORM</h2>
                    <p style="color:#8b949e;font-size:14px;">Введите ключ лицензии</p>
                    <input type="password" id="key" placeholder="••••••••">
                    <button onclick="location.href='?key='+document.getElementById('key').value">ВОЙТИ В СИСТЕМУ</button>
                </div>
            </body></html>`);
        }

        // Сохраняем ключ в куки
        if (req.query.key) res.cookie('x_key', req.query.key, { maxAge: 86400000 });

        let relPath = req.query.path || access.root;
        // Ограничение для клиентов
        if (access.role === 'client' && !relPath.startsWith(access.root)) relPath = access.root;

        const absPath = path.join(STORAGE_ROOT, relPath);
        if (!fs.existsSync(absPath)) {
            // Если путь не существует (например, первый запуск), создаем базу
            fs.mkdirSync(absPath, { recursive: true });
        }

        const items = fs.readdirSync(absPath, { withFileTypes: true });

        // Генерация Breadcrumbs
        const currentRel = relPath.replace(access.root, '').replace(/\\/g, '/');
        const parts = currentRel.split('/').filter(p => p);
        let breadcrumbs = `<a href="/explorer" class="crumb">Cloud</a>`;
        let bPath = access.root;
        parts.forEach(p => {
            bPath = path.join(bPath, p);
            breadcrumbs += ` <span class="sep">/</span> <a href="/explorer?path=${encodeURIComponent(bPath)}" class="crumb">${p.split('_')[0]}</a>`;
        });

        // Формирование списка
        const rows = items.map(item => {
            const fPath = path.join(absPath, item.name);
            const s = fs.statSync(fPath);
            const iRel = path.join(relPath, item.name).replace(/\\/g, '/');
            const enc = iRel.split('/').map(encodeURIComponent).join('/');
            const ext = path.extname(item.name).toLowerCase();
            const isDir = item.isDirectory();
            const isImg = ['.jpg','.jpeg','.png','.webp'].includes(ext);

            return `
            <tr class="f-row" data-name="${item.name.toLowerCase()}">
                <td onclick="${isDir ? `location.href='/explorer?path=${encodeURIComponent(iRel)}'` : `openPreview('/cdn/${enc}', '${ext}')`}">
                    <div class="f-cell">
                        <div class="f-icon">${isImg ? `<img src="/cdn/${enc}" class="t-img">` : getIcon(ext, isDir)}</div>
                        <div class="f-text">
                            <div class="f-name">${item.name.split('_')[0]}</div>
                            <div class="f-info">${isDir ? 'Папка' : ext.toUpperCase()} • ${s.birthtime.toLocaleDateString()}</div>
                        </div>
                    </div>
                </td>
                <td class="f-meta">${isDir ? '--' : formatBytes(s.size)}</td>
                <td style="text-align:right;">
                    ${!isDir ? `<a href="/cdn/${enc}" download class="act-btn">⬇</a>` : ''}
                    ${access.role === 'admin' ? `<button onclick="event.stopPropagation(); deleteItem('${iRel}')" class="act-btn" style="color:#da3633">🗑</button>` : ''}
                </td>
            </tr>`;
        }).join('');

        res.send(`
        <!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>X-Commander Pro</title>
        <style>
            :root { --bg:#0d1117; --panel:#161b22; --border:#30363d; --text:#c9d1d9; --accent:#238636; --link:#58a6ff; }
            body { background:var(--bg); color:var(--text); font-family:-apple-system, sans-serif; margin:0; }
            header { background:var(--panel); padding:15px 25px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:100; }
            .bc { padding:12px 25px; background:#090c10; border-bottom:1px solid var(--border); font-size:13px; }
            .crumb { color:var(--link); text-decoration:none; font-weight:bold; }
            .toolbar { padding:15px 25px; display:flex; gap:10px; background:var(--panel); border-bottom:1px solid var(--border); flex-wrap:wrap; }
            
            input#search { background:var(--bg); border:1px solid var(--border); color:white; padding:10px; border-radius:8px; width:300px; outline:none; }
            .btn { background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:bold; cursor:pointer; }
            
            table { width:100%; border-collapse:collapse; }
            th { text-align:left; padding:15px; background:#21262d; font-size:11px; color:#8b949e; text-transform:uppercase; border-bottom:1px solid var(--border); }
            td { padding:12px 15px; border-bottom:1px solid #21262d; }
            .f-row:hover { background:#1c2128; cursor:pointer; }
            
            .f-cell { display:flex; align-items:center; gap:15px; }
            .f-icon { width:44px; height:44px; background:#000; border-radius:10px; display:flex; align-items:center; justify-content:center; overflow:hidden; font-size:22px; border:1px solid var(--border); }
            .t-img { width:100%; height:100%; object-fit:cover; }
            .f-name { font-weight:600; color:#f1f1f1; font-size:14px; }
            .f-info { font-size:11px; color:#8b949e; margin-top:2px; }
            .f-meta { font-size:12px; color:#8b949e; }
            .act-btn { background:none; border:none; color:#8b949e; font-size:18px; cursor:pointer; text-decoration:none; margin-left:10px; transition:0.2s; }
            .act-btn:hover { color:white; }

            /* Preview Overlay */
            #pBox { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:1000; flex-direction:column; }
            #pHead { background:var(--panel); padding:15px 25px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); }
            iframe { flex:1; border:none; background:white; }
        </style></head>
        <body>
            <header>
                <div style="font-weight:bold;color:#f1c40f;font-size:20px;">X-COMMANDER <span style="color:white">PRO</span></div>
                <button onclick="document.cookie='x_key=;Max-Age=0';location.reload()" style="background:#30363d;color:white;border:none;padding:8px 15px;border-radius:6px;cursor:pointer;">ВЫЙТИ</button>
            </header>
            <div class="bc">${breadcrumbs}</div>
            <div class="toolbar">
                <input type="text" id="search" placeholder="Быстрый поиск в этой папке..." oninput="doSearch()">
                <div style="flex:1"></div>
                <input type="text" id="newDir" placeholder="Имя папки" style="background:var(--bg);border:1px solid var(--border);color:white;padding:10px;border-radius:8px;width:150px;">
                <button class="btn" onclick="makeDir()">+ ПАПКА</button>
                <form action="/explorer/upload" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="path" value="${relPath}">
                    <input type="file" name="file" id="up" hidden onchange="this.form.submit()">
                    <button type="button" class="btn" style="background:#30363d" onclick="document.getElementById('up').click()">↑ ЗАГРУЗИТЬ</button>
                </form>
            </div>
            <table>
                <thead><tr><th>Наименование</th><th>Размер</th><th style="text-align:right">Действия</th></tr></thead>
                <tbody id="files">${rows}</tbody>
            </table>

            <div id="pBox">
                <div id="pHead"><span id="pTitle" style="font-weight:bold;">Предпросмотр</span><button onclick="closePreview()" style="background:#da3633;color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;">ЗАКРЫТЬ ×</button></div>
                <iframe id="pFrame"></iframe>
            </div>

            <script>
                function doSearch() {
                    let q = document.getElementById('search').value.toLowerCase();
                    document.querySelectorAll('.f-row').forEach(r => {
                        r.style.display = r.getAttribute('data-name').includes(q) ? '' : 'none';
                    });
                }
                async function deleteItem(p) {
                    if(!confirm('Удалить безвозвратно?')) return;
                    const res = await fetch('/explorer/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({itemPath:p}) });
                    if(res.ok) location.reload();
                }
                async function makeDir() {
                    const n = document.getElementById('newDir').value;
                    if(!n) return;
                    const res = await fetch('/explorer/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:'${relPath}', name:n}) });
                    if(res.ok) location.reload();
                }
                function openPreview(url, ext) {
                    const box = document.getElementById('pBox');
                    const frame = document.getElementById('pFrame');
                    const origin = window.location.origin;
                    
                    if(['.jpg','.jpeg','.png','.webp'].includes(ext)) {
                        frame.srcdoc = '<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#000"><img src="'+url+'" style="max-height:100%;max-width:100%;"></body>';
                    } else if(ext === '.pdf') {
                        frame.src = url;
                    } else if(['.xlsx','.docx','.xls','.doc'].includes(ext)) {
                        frame.src = 'https://docs.google.com/viewer?url=' + encodeURIComponent(origin + url) + '&embedded=true';
                    } else { window.open(url, '_blank'); return; }
                    box.style.display = 'flex';
                }
                function closePreview() {
                    document.getElementById('pBox').style.display = 'none';
                    document.getElementById('pFrame').src = '';
                }
            </script>
        </body></html>`);
    });

    console.log("✅ X-COMMANDER ULTRA v4.0 АКТИВИРОВАН");
};
