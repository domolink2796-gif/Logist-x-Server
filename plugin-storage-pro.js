const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');

/**
 * X-PLATFORM COMMANDER ULTIMATE v9.0 PRO (BLACK EDITION)
 * Полноценная корпоративная система управления файлами.
 */

module.exports = function(app, context) {
    const { MY_ROOT_ID, MERCH_ROOT_ID, readDatabase } = context;
    const STORAGE_ROOT = path.join(__dirname, 'storage');
    const TRASH_ROOT = path.join(STORAGE_ROOT, '.trash');
    
    // Глубокая инициализация структуры
    const initFolders = () => {
        const folders = [STORAGE_ROOT, TRASH_ROOT, path.join(__dirname, 'temp_uploads')];
        folders.forEach(f => { if (!fs.existsSync(f)) fs.mkdirSync(f, { recursive: true }); });
    };
    initFolders();

    const upload = multer({ dest: 'temp_uploads/' });

    // === МАСТЕР-КЛЮЧ АДМИНИСТРАТОРА ===
    const ADMIN_KEY = "X-PLATFORM-2026"; 

    app.use(cookieParser());
    
    // CDN и заголовки безопасности
    app.use('/cdn', (req, res, next) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Security-Policy', "default-src 'self' 'unsafe-inline'");
        next();
    }, express.static(STORAGE_ROOT));

    // Утилита: Расширенный расчет веса
    const getFileSize = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Утилита: Профессиональные иконки
    const getFileIcon = (ext, isDir) => {
        if (isDir) return '<i class="fas fa-folder" style="color:#f1c40f"></i>';
        const icons = {
            '.pdf': '<i class="fas fa-file-pdf" style="color:#e74c3c"></i>',
            '.xlsx': '<i class="fas fa-file-excel" style="color:#27ae60"></i>',
            '.xls': '<i class="fas fa-file-excel" style="color:#27ae60"></i>',
            '.docx': '<i class="fas fa-file-word" style="color:#2980b9"></i>',
            '.zip': '<i class="fas fa-file-archive" style="color:#f39c12"></i>',
            '.mp4': '<i class="fas fa-file-video" style="color:#9b59b6"></i>',
            '.jpg': '<i class="fas fa-file-image" style="color:#e67e22"></i>',
            '.png': '<i class="fas fa-file-image" style="color:#e67e22"></i>'
        };
        return icons[ext] || '<i class="fas fa-file-code"></i>';
    };

    // СИСТЕМА АВТОРИЗАЦИИ
    const checkAuth = async (req) => {
        const key = req.query.key || req.cookies?.x_key;
        if (!key) return null;
        if (key === ADMIN_KEY) return { role: 'admin', root: '', name: 'Евгений' };

        try {
            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            if (client) {
                const rootDir = client.type === 'merch' ? `МЕРЧ_${MERCH_ROOT_ID}` : `ЛОГИСТ_${MY_ROOT_ID}`;
                const clientDir = `${client.name}_${client.folderId || ''}`.replace(/_$/, '');
                return { role: 'client', root: path.join(rootDir, clientDir), name: client.name };
            }
        } catch (e) { console.error("DB Error:", e); }
        return null;
    };

    // API ДЛЯ ФАЙЛОВЫХ ОПЕРАЦИЙ
    app.post('/explorer/api', async (req, res) => {
        const access = await checkAuth(req);
        if (!access) return res.status(403).json({ error: "Access Denied" });
        const { action, path: rel, name, newName, oldPath } = req.body;
        
        try {
            if (action === 'mkdir') {
                const target = path.join(STORAGE_ROOT, rel, name);
                if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
                return res.json({ success: true });
            }
            if (action === 'delete' && access.role === 'admin') {
                const target = path.join(STORAGE_ROOT, rel);
                const trashPath = path.join(TRASH_ROOT, path.basename(rel) + '_' + Date.now());
                fs.renameSync(target, trashPath); // Перенос в корзину
                return res.json({ success: true });
            }
            if (action === 'rename' && access.role === 'admin') {
                fs.renameSync(path.join(STORAGE_ROOT, oldPath), path.join(STORAGE_ROOT, path.dirname(oldPath), newName));
                return res.json({ success: true });
            }
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/explorer/upload', upload.single('file'), async (req, res) => {
        const access = await checkAuth(req);
        if (!access) return res.status(403).send("Forbidden");
        const target = path.join(STORAGE_ROOT, req.body.path, req.file.originalname);
        fs.renameSync(req.file.path, target);
        res.redirect('/explorer?path=' + encodeURIComponent(req.body.path));
    });

    // ГЛАВНЫЙ ИНТЕРФЕЙС
    app.get('/explorer', async (req, res) => {
        const access = await checkAuth(req);
        if (!access) {
            return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>X-Login</title>
            <style>body{background:#0b0e14;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
            .box{background:#151921;padding:50px;border-radius:24px;border:1px solid #2d333b;text-align:center;width:380px;box-shadow:0 30px 100px rgba(0,0,0,0.8);}
            input{width:100%;padding:18px;margin:30px 0;background:#0b0e14;border:1px solid #444c56;color:white;border-radius:14px;font-size:20px;text-align:center;outline:none;}
            button{width:100%;padding:18px;background:#238636;color:white;border:none;border-radius:14px;font-weight:bold;cursor:pointer;font-size:18px;transition:0.3s;}
            button:hover{background:#2ea043;transform:translateY(-2px);}</style></head>
            <body><div class="box"><h1 style="color:#f1c40f;">X-PLATFORM</h1><p style="color:#768390">Cloud Secure Storage System</p>
            <input type="password" id="k" placeholder="••••••••"><button onclick="location.href='?key='+document.getElementById('k').value">ВОЙТИ В СИСТЕМУ</button></div></body></html>`);
        }

        if (req.query.key) res.cookie('x_key', req.query.key, { maxAge: 86400000, httpOnly: true });

        let relPath = req.query.path || access.root;
        if (access.role === 'client' && !relPath.startsWith(access.root)) relPath = access.root;

        const absPath = path.join(STORAGE_ROOT, relPath);
        if (!fs.existsSync(absPath)) fs.mkdirSync(absPath, { recursive: true });

        const items = fs.readdirSync(absPath, { withFileTypes: true });

        // Хлебные крошки
        const currentRel = relPath.replace(access.root, '').replace(/\\/g, '/');
        const parts = currentRel.split('/').filter(p => p);
        let bc = `<a href="/explorer" class="crumb"><i class="fas fa-home"></i> Cloud</a>`;
        let buildP = access.root;
        parts.forEach(p => {
            buildP = path.join(buildP, p);
            bc += ` <span class="sep">/</span> <a href="/explorer?path=${encodeURIComponent(buildP)}" class="crumb">${p.split('_')[0]}</a>`;
        });

        // Сортировка и рендер
        const rows = items.filter(i => !i.name.startsWith('.')).map(item => {
            const fPath = path.join(absPath, item.name);
            const s = fs.statSync(fPath);
            const iRel = path.join(relPath, item.name).replace(/\\/g, '/');
            const enc = iRel.split('/').map(encodeURIComponent).join('/');
            const ext = path.extname(item.name).toLowerCase();
            const isImg = ['.jpg','.jpeg','.png','.webp'].includes(ext);
            return `<tr class="f-row" data-name="${item.name.toLowerCase()}">
                <td onclick="${item.isDirectory() ? `location.href='/explorer?path=${encodeURIComponent(iRel)}'` : `openP('/cdn/${enc}', '${ext}')`}">
                    <div class="f-box"><div class="f-icon">${isImg ? `<img src="/cdn/${enc}" class="mini-p">` : getFileIcon(ext, item.isDirectory())}</div>
                    <div><div class="f-name">${item.name.split('_')[0]}</div><div class="f-date">${item.isDirectory()?'Папка':getFileSize(s.size)} • ${s.birthtime.toLocaleDateString()}</div></div></div>
                </td>
                <td style="text-align:right">
                    ${!item.isDirectory() ? `<a href="/cdn/${enc}" download class="tool-btn"><i class="fas fa-download"></i></a>` : ''}
                    ${access.role === 'admin' ? `<button onclick="event.stopPropagation(); renameItem('${iRel}', '${item.name}')" class="tool-btn"><i class="fas fa-pen"></i></button>` : ''}
                    ${access.role === 'admin' ? `<button onclick="event.stopPropagation(); deleteItem('${iRel}')" class="tool-btn text-danger"><i class="fas fa-trash"></i></button>` : ''}
                </td></tr>`;
        }).join('');

        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>X-Commander Pro</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            :root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#adbac7;--link:#539bf5;--accent:#347d39;}
            body{background:var(--bg);color:var(--text);font-family:system-ui;margin:0;overflow:hidden;}
            header{background:var(--panel);padding:16px 32px;display:flex;justify-content:space-between;border-bottom:1px solid var(--border);height:60px;align-items:center;box-sizing:border-box;}
            .bc-bar{background:#090c10;padding:12px 32px;border-bottom:1px solid var(--border);font-size:13px;height:45px;display:flex;align-items:center;}
            .crumb{color:var(--link);text-decoration:none;font-weight:600;}
            .sep{color:#444c56;margin:0 10px;}
            .main-layout{display:flex;height:calc(100vh - 105px);}
            .sidebar{width:240px;background:var(--panel);border-right:1px solid var(--border);padding:20px;display:flex;flex-direction:column;gap:15px;}
            .side-link{color:var(--text);text-decoration:none;display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;transition:0.2s;}
            .side-link:hover{background:var(--border);}
            .explorer{flex:1;overflow-y:auto;display:flex;flex-direction:column;}
            .toolbar{padding:15px 32px;background:var(--panel);border-bottom:1px solid var(--border);display:flex;gap:15px;align-items:center;}
            input.q{background:var(--bg);border:1px solid var(--border);color:white;padding:10px 15px;border-radius:8px;width:300px;outline:none;}
            .btn-p{background:var(--accent);color:white;border:none;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;}
            table{width:100%;border-collapse:collapse;}
            th{text-align:left;padding:15px 32px;background:#1c2128;font-size:11px;color:#768390;text-transform:uppercase;}
            td{padding:12px 32px;border-bottom:1px solid var(--border);}
            .f-row:hover{background:#22272e;cursor:pointer;}
            .f-box{display:flex;align-items:center;gap:16px;}
            .f-icon{width:42px;height:42px;background:#000;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;border:1px solid var(--border);overflow:hidden;}
            .mini-p{width:100%;height:100%;object-fit:cover;}
            .f-name{font-weight:600;color:#adbac7;font-size:14px;}
            .f-date{font-size:11px;color:#768390;margin-top:4px;}
            .tool-btn{background:none;border:none;color:#768390;cursor:pointer;font-size:16px;margin-left:15px;text-decoration:none;}
            #pBox{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(13,17,23,0.98);z-index:2000;flex-direction:column;}
        </style></head>
        <body>
            <header><div style="font-weight:800;color:#f1c40f;font-size:20px;">X-COMMANDER <span style="color:#fff;font-weight:400">ULTIMATE</span></div>
            <button onclick="document.cookie='x_key=;Max-Age=0';location.reload()" class="btn-p" style="background:#373e47">ВЫЙТИ</button></header>
            <div class="bc-bar">${bc}</div>
            <div class="main-layout">
                <div class="sidebar">
                    <div style="font-size:11px;color:#768390;text-transform:uppercase;font-weight:bold">Навигация</div>
                    <a href="/explorer" class="side-link"><i class="fas fa-hdd"></i> Все файлы</a>
                    <a href="/explorer?path=ЛОГИСТ_${MY_ROOT_ID}" class="side-link"><i class="fas fa-truck"></i> Логистика</a>
                    <a href="/explorer?path=МЕРЧ_${MERCH_ROOT_ID}" class="side-link"><i class="fas fa-box-open"></i> Мерчандайзинг</a>
                    <div style="margin-top:auto;padding-top:15px;border-top:1px solid var(--border)">
                        <div style="font-size:11px;color:#768390">X-Platform v9.0 Pro</div>
                    </div>
                </div>
                <div class="explorer">
                    <div class="toolbar">
                        <input type="text" id="qs" class="q" placeholder="Мгновенный поиск..." oninput="doSearch()">
                        <div style="flex:1"></div>
                        <input type="text" id="nd" class="q" placeholder="Новая папка" style="width:150px;">
                        <button class="btn-p" onclick="mkD()">+ СОЗДАТЬ</button>
                        <form action="/explorer/upload" method="POST" enctype="multipart/form-data" style="margin:0;">
                            <input type="hidden" name="path" value="${relPath}">
                            <input type="file" name="file" id="up" hidden onchange="this.form.submit()">
                            <button type="button" class="btn-p" style="background:#373e47" onclick="document.getElementById('up').click()">↑ ЗАГРУЗИТЬ</button>
                        </form>
                    </div>
                    <table><thead><tr><th>НАИМЕНОВАНИЕ</th><th style="text-align:right">ДЕЙСТВИЯ</th></tr></thead><tbody id="files">${rows}</tbody></table>
                </div>
            </div>
            <div id="pBox">
                <div style="padding:15px 32px;display:flex;justify-content:space-between;background:#1c2128;align-items:center;border-bottom:1px solid var(--border);">
                    <span style="font-weight:bold;">Предпросмотр документа</span>
                    <button onclick="closeP()" class="btn-p" style="background:#e5534b">ЗАКРЫТЬ ×</button>
                </div>
                <iframe id="pf" style="flex:1;border:none;background:white;"></iframe>
            </div>
            <script>
                function doSearch(){ let v=document.getElementById('qs').value.toLowerCase(); document.querySelectorAll('.f-row').forEach(r=>{ r.style.display=r.getAttribute('data-name').includes(v)?'':'none'; }); }
                async function mkD(){ let n=document.getElementById('nd').value; if(!n)return; await fetch('/explorer/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'mkdir',path:'${relPath}',name:n})}); location.reload(); }
                async function deleteItem(p){ if(confirm('Отправить в корзину?')){ await fetch('/explorer/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',path:p})}); location.reload(); } }
                async function renameItem(p, old){ let n=prompt('Новое имя:', old); if(!n || n==old)return; await fetch('/explorer/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'rename',oldPath:p,newName:n})}); location.reload(); }
                function openP(u, e){
                    const f=document.getElementById('pf');
                    if(['.jpg','.jpeg','.png','.webp'].includes(e)) f.srcdoc='<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#000"><img src="'+u+'" style="max-height:100%;max-width:100%;object-fit:contain"></body>';
                    else if(e==='.pdf') f.src=u;
                    else if(['.xlsx','.docx','.xls','.doc'].includes(e)) f.src='https://docs.google.com/viewer?url='+encodeURIComponent(window.location.origin+u)+'&embedded=true';
                    else window.open(u,'_blank');
                    document.getElementById('pBox').style.display='flex';
                }
                function closeP(){ document.getElementById('pBox').style.display='none'; document.getElementById('pf').src=''; }
            </script>
        </body></html>`);
    });
    console.log("✅ X-COMMANDER PRO v9.0 ACTIVATED");
};
