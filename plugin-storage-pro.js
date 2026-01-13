const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');

/**
 * X-PLATFORM ULTIMATE COMMANDER v5.0
 * Полноценная замена Google Drive для твоей системы.
 */

module.exports = function(app, context) {
    const { MY_ROOT_ID, MERCH_ROOT_ID, readDatabase } = context;
    const STORAGE_ROOT = path.join(__dirname, 'storage');
    
    // Создание системных папок
    if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
    
    const uploadDir = path.join(__dirname, 'temp_uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    
    const upload = multer({ dest: 'temp_uploads/' });

    // === ТВОЙ МАСТЕР-КЛЮЧ (Пароль для входа) ===
    const ADMIN_KEY = "X-PLATFORM-2026"; 

    app.use(cookieParser());
    
    // Настройка доступа к файлам
    app.use('/cdn', (req, res, next) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=3600');
        next();
    }, express.static(STORAGE_ROOT));

    // Утилиты
    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'],
              i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getFileIcon = (ext, isDir) => {
        if (isDir) return '<i class="fas fa-folder" style="color: #f1c40f;"></i>';
        const icons = {
            '.pdf': '<i class="fas fa-file-pdf" style="color: #e74c3c;"></i>',
            '.xlsx': '<i class="fas fa-file-excel" style="color: #27ae60;"></i>',
            '.xls': '<i class="fas fa-file-excel" style="color: #27ae60;"></i>',
            '.docx': '<i class="fas fa-file-word" style="color: #2980b9;"></i>',
            '.doc': '<i class="fas fa-file-word" style="color: #2980b9;"></i>',
            '.zip': '<i class="fas fa-file-archive" style="color: #f39c12;"></i>',
            '.rar': '<i class="fas fa-file-archive" style="color: #f39c12;"></i>',
            '.txt': '<i class="fas fa-file-alt"></i>',
            '.jpg': '<i class="fas fa-file-image" style="color: #a29bfe;"></i>',
            '.png': '<i class="fas fa-file-image" style="color: #a29bfe;"></i>'
        };
        return icons[ext] || '<i class="fas fa-file"></i>';
    };

    // --- ЛОГИКА ДОСТУПА ---
    const checkAuth = async (req) => {
        const key = req.query.key || req.cookies?.x_key;
        if (!key) return null;
        if (key === ADMIN_KEY) return { role: 'admin', root: '', name: 'Евгений (Админ)' };

        const db = await readDatabase();
        const client = db.find(k => k.key === key);
        if (client) {
            const rootDir = client.type === 'merch' ? `МЕРЧ_${MERCH_ROOT_ID}` : `ЛОГИСТ_${MY_ROOT_ID}`;
            const clientDir = `${client.name}_${client.folderId || ''}`.replace(/_$/, '');
            return { role: 'client', root: path.join(rootDir, clientDir), name: client.name };
        }
        return null;
    };

    // --- API: ДЕЙСТВИЯ ---
    app.post('/explorer/api', async (req, res) => {
        const access = await checkAuth(req);
        if (!access) return res.status(403).json({ error: "No auth" });

        const { action, path: relPath, name, oldPath, newName } = req.body;

        try {
            if (action === 'mkdir') {
                const target = path.join(STORAGE_ROOT, relPath, name);
                if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
                return res.json({ success: true });
            }
            if (action === 'delete' && access.role === 'admin') {
                const target = path.join(STORAGE_ROOT, relPath);
                fs.rmSync(target, { recursive: true, force: true });
                return res.json({ success: true });
            }
            if (action === 'rename') {
                const oldAbs = path.join(STORAGE_ROOT, oldPath);
                const newAbs = path.join(path.dirname(oldAbs), newName);
                fs.renameSync(oldAbs, newAbs);
                return res.json({ success: true });
            }
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/explorer/upload', upload.single('file'), async (req, res) => {
        const access = await checkAuth(req);
        if (!access) return res.status(403).send("No access");
        const target = path.join(STORAGE_ROOT, req.body.path, req.file.originalname);
        fs.renameSync(req.file.path, target);
        res.redirect('/explorer?path=' + encodeURIComponent(req.body.path));
    });

    // --- ИНТЕРФЕЙС ---
    app.get('/explorer', async (req, res) => {
        const access = await checkAuth(req);
        if (!access) {
            return res.send(`
            <!DOCTYPE html><html><head><meta charset="UTF-8">
            <title>X-Drive Login</title>
            <style>
                body { background: #0d1117; color: white; font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #161b22; padding: 40px; border-radius: 20px; border: 1px solid #30363d; text-align: center; width: 350px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
                input { width: 100%; padding: 15px; margin: 25px 0; background: #0d1117; border: 1px solid #30363d; color: white; border-radius: 12px; box-sizing: border-box; text-align: center; font-size: 18px; outline: none; transition: 0.3s; }
                input:focus { border-color: #58a6ff; box-shadow: 0 0 0 3px rgba(88,166,255,0.3); }
                button { width: 100%; padding: 15px; background: #238636; color: white; border: none; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 16px; transition: 0.3s; }
                button:hover { background: #2ea043; transform: translateY(-2px); }
            </style></head>
            <body>
                <div class="card">
                    <h1 style="color: #f1c40f; margin: 0; font-size: 28px;">X-PLATFORM</h1>
                    <p style="color: #8b949e; margin-top: 10px;">Система защищенного облака</p>
                    <input type="password" id="key" placeholder="Введите ваш ключ">
                    <button onclick="location.href='?key='+document.getElementById('key').value">ВОЙТИ В СИСТЕМУ</button>
                </div>
            </body></html>`);
        }

        if (req.query.key) res.cookie('x_key', req.query.key, { maxAge: 86400000 });

        let relPath = req.query.path || access.root;
        if (access.role === 'client' && !relPath.startsWith(access.root)) relPath = access.root;

        const absPath = path.join(STORAGE_ROOT, relPath);
        if (!fs.existsSync(absPath)) fs.mkdirSync(absPath, { recursive: true });

        const items = fs.readdirSync(absPath, { withFileTypes: true });

        // Навигация
        const cleanPath = relPath.replace(access.root, '').replace(/\\/g, '/');
        const parts = cleanPath.split('/').filter(p => p);
        let bc = `<a href="/explorer" class="crumb"><i class="fas fa-home"></i> Cloud</a>`;
        let buildP = access.root;
        parts.forEach(p => {
            buildP = path.join(buildP, p);
            bc += ` <span class="sep">/</span> <a href="/explorer?path=${encodeURIComponent(buildP)}" class="crumb">${p.split('_')[0]}</a>`;
        });

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
                    <div class="file-cell">
                        <div class="file-icon-box">${isImg ? `<img src="/cdn/${enc}" class="preview-img">` : getFileIcon(ext, isDir)}</div>
                        <div class="file-info">
                            <div class="file-name">${item.name.split('_')[0]}</div>
                            <div class="file-date">${isDir ? 'Папка' : formatBytes(s.size)} • ${s.birthtime.toLocaleDateString()}</div>
                        </div>
                    </div>
                </td>
                <td style="text-align:right">
                    ${!isDir ? `<a href="/cdn/${enc}" download class="action-link"><i class="fas fa-download"></i></a>` : ''}
                    ${access.role === 'admin' ? `<button onclick="event.stopPropagation(); deleteItem('${iRel}')" class="action-link del-btn"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            </tr>`;
        }).join('');

        res.send(`
        <!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>X-Commander Pro</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            :root { --bg: #0d1117; --panel: #161b22; --border: #30363d; --text: #c9d1d9; --accent: #238636; --link: #58a6ff; }
            body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; margin: 0; overflow-x: hidden; }
            
            header { background: var(--panel); padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; }
            .logo { font-weight: bold; color: #f1c40f; font-size: 22px; display: flex; align-items: center; gap: 10px; }
            
            .bc-container { background: #090c10; padding: 12px 30px; border-bottom: 1px solid var(--border); font-size: 14px; }
            .crumb { color: var(--link); text-decoration: none; font-weight: 500; }
            .sep { color: #8b949e; margin: 0 8px; }

            .toolbar { padding: 20px 30px; background: var(--panel); border-bottom: 1px solid var(--border); display: flex; gap: 15px; align-items: center; flex-wrap: wrap; }
            .search-input { background: var(--bg); border: 1px solid var(--border); color: white; padding: 10px 15px; border-radius: 8px; width: 300px; outline: none; }
            .btn { background: var(--accent); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
            .btn:hover { filter: brightness(1.2); }

            table { width: 100%; border-collapse: collapse; }
            th { text-align: left; padding: 15px 30px; background: #21262d; font-size: 12px; color: #8b949e; text-transform: uppercase; border-bottom: 1px solid var(--border); }
            td { padding: 12px 30px; border-bottom: 1px solid #21262d; }
            .f-row:hover { background: #1c2128; cursor: pointer; }

            .file-cell { display: flex; align-items: center; gap: 15px; }
            .file-icon-box { width: 45px; height: 45px; background: #000; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; border: 1px solid var(--border); overflow: hidden; }
            .preview-img { width: 100%; height: 100%; object-fit: cover; }
            .file-name { font-weight: 600; color: #f1f1f1; font-size: 15px; }
            .file-date { font-size: 12px; color: #8b949e; margin-top: 3px; }

            .action-link { color: #8b949e; font-size: 18px; text-decoration: none; margin-left: 15px; transition: 0.2s; background: none; border: none; cursor: pointer; }
            .action-link:hover { color: white; }
            .del-btn:hover { color: #f85149; }

            #previewBox { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 1000; flex-direction: column; }
            .p-head { background: var(--panel); padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
            iframe { flex: 1; border: none; background: white; }
        </style></head>
        <body>
            <header>
                <div class="logo"><i class="fas fa-bolt"></i> X-COMMANDER <span style="color:white; font-weight:normal;">PRO</span></div>
                <div style="display:flex; align-items:center; gap:20px;">
                    <span style="font-size:13px; color:#8b949e;">Пользователь: <b>${access.name}</b></span>
                    <button onclick="document.cookie='x_key=;Max-Age=0';location.reload()" class="btn" style="background:#30363d;">Выйти</button>
                </div>
            </header>
            
            <div class="bc-container">${bc}</div>

            <div class="toolbar">
                <input type="text" id="search" class="search-input" placeholder="Быстрый поиск в этой папке..." oninput="filterFiles()">
                <div style="flex:1"></div>
                <input type="text" id="dirName" class="search-input" placeholder="Имя новой папки" style="width:180px;">
                <button class="btn" onclick="makeDir()">+ Создать папку</button>
                <form action="/explorer/upload" method="POST" enctype="multipart/form-data" style="margin:0;">
                    <input type="hidden" name="path" value="${relPath}">
                    <input type="file" name="file" id="up" hidden onchange="this.form.submit()">
                    <button type="button" class="btn" style="background:#30363d" onclick="document.getElementById('up').click()">↑ Загрузить файл</button>
                </form>
            </div>

            <main>
                <table>
                    <thead><tr><th>Наименование</th><th style="text-align:right">Действия</th></tr></thead>
                    <tbody id="fileTable">${rows}</tbody>
                </table>
            </main>

            <div id="previewBox">
                <div class="p-head">
                    <span id="pTitle" style="font-weight:bold;"><i class="fas fa-eye"></i> Предпросмотр</span>
                    <button onclick="closePreview()" class="btn" style="background:#da3633;">Закрыть ×</button>
                </div>
                <iframe id="pFrame"></iframe>
            </div>

            <script>
                function filterFiles() {
                    let q = document.getElementById('search').value.toLowerCase();
                    document.querySelectorAll('.f-row').forEach(row => {
                        row.style.display = row.getAttribute('data-name').includes(q) ? '' : 'none';
                    });
                }

                async function makeDir() {
                    const name = document.getElementById('dirName').value;
                    if(!name) return;
                    await fetch('/explorer/api', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ action: 'mkdir', path: '${relPath}', name: name })
                    });
                    location.reload();
                }

                async function deleteItem(p) {
                    if(!confirm('Удалить этот объект навсегда?')) return;
                    await fetch('/explorer/api', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ action: 'delete', path: p })
                    });
                    location.reload();
                }

                function openPreview(url, ext) {
                    const box = document.getElementById('previewBox');
                    const frame = document.getElementById('pFrame');
                    const origin = window.location.origin;
                    
                    if(['.jpg','.jpeg','.png','.webp'].includes(ext)) {
                        frame.srcdoc = '<body style=\"margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#000\"><img src=\"'+url+'\" style=\"max-height:100%;max-width:100%;object-fit:contain;\"></body>';
                    } else if(ext === '.pdf') {
                        frame.src = url;
                    } else if(['.xlsx','.docx','.xls','.doc'].includes(ext)) {
                        frame.src = 'https://docs.google.com/viewer?url=' + encodeURIComponent(origin + url) + '&embedded=true';
                    } else {
                        window.open(url, '_blank');
                        return;
                    }
                    box.style.display = 'flex';
                }

                function closePreview() {
                    document.getElementById('previewBox').style.display = 'none';
                    document.getElementById('pFrame').src = '';
                }
            </script>
        </body></html>`);
    });

    console.log("✅ X-COMMANDER PRO v5.0 ACTIVATED");
};
