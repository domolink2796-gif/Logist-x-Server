const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

/**
 * ============================================================================
 * TITANIUM ADAPTIVE v48.1 | BRANDED EDITION
 * ----------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * ============================================================================
 */

module.exports = function(app, context) {
    const { drive, google, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const upload = multer({ dest: 'uploads/' });

    const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";

    const UI = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Logist-X | Titanium Adaptive</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --blue: #1a73e8; --red: #d93025; --gray: #5f6368;
            --text: #3c4043; --border: #dadce0; --bg: #ffffff;
            --sidebar-w: 280px;
        }

        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }
        body, html { margin: 0; padding: 0; height: 100%; font-family: 'Roboto', sans-serif; color: var(--text); background: var(--bg); overflow: hidden; }

        header {
            height: 60px; padding: 0 15px; border-bottom: 1px solid var(--border);
            display: flex; align-items: center; justify-content: space-between;
            background: #fff; position: relative; z-index: 2000;
        }
        .header-left { display: flex; align-items: center; gap: 10px; }
        .burger { display: none; font-size: 20px; padding: 10px; cursor: pointer; color: var(--gray); }
        .logo { display: flex; align-items: center; gap: 12px; font-family: 'Google Sans'; font-size: 20px; color: var(--gray); font-weight: 500; }
        .logo img { height: 40px; border-radius: 4px; }

        .wrapper { display: flex; height: calc(100vh - 60px); position: relative; }

        aside { 
            width: var(--sidebar-w); height: 100%; border-right: 1px solid #eee;
            background: #fff; display: flex; flex-direction: column; padding: 15px 0;
            transition: transform 0.3s ease; z-index: 1500;
        }
        
        .nav-link {
            height: 48px; margin-right: 8px; border-radius: 0 24px 24px 0;
            display: flex; align-items: center; padding: 0 24px; cursor: pointer;
            color: var(--text); text-decoration: none; font-size: 14px;
        }
        .nav-link i { width: 35px; font-size: 18px; color: var(--gray); }
        .nav-link:hover { background: #f1f3f4; }
        .nav-link.active { background: #e8f0fe; color: var(--blue); font-weight: 700; }

        main { flex: 1; padding: 0 20px; overflow-y: auto; background: #fff; }
        .breadcrumbs { height: 50px; display: flex; align-items: center; font-size: 18px; font-family: 'Google Sans'; color: var(--gray); }

        .file-table { width: 100%; border-collapse: collapse; }
        .file-table th { text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: #fff; }
        .file-table td { padding: 14px 8px; border-bottom: 1px solid #f1f1f1; font-size: 14px; cursor: pointer; }

        .fab {
            position: fixed; bottom: 25px; right: 25px; width: 56px; height: 56px;
            border-radius: 28px; background: #fff; box-shadow: 0 3px 10px rgba(0,0,0,0.2);
            display: flex; align-items: center; justify-content: center; z-index: 1000;
            cursor: pointer; border: 1px solid #eee;
        }
        .fab img { width: 30px; height: auto; }

        @media (max-width: 768px) {
            .burger { display: block; }
            aside { position: fixed; left: 0; transform: translateX(-100%); box-shadow: 10px 0 20px rgba(0,0,0,0.1); }
            aside.open { transform: translateX(0); }
            .overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1400; }
            .overlay.active { display: block; }
        }

        .ctx-menu { position: fixed; display: none; background: #fff; box-shadow: 0 5px 20px rgba(0,0,0,0.15); border-radius: 8px; z-index: 5000; min-width: 220px; padding: 6px 0; border: 1px solid #eee; }
        .ctx-item { padding: 12px 20px; display: flex; align-items: center; gap: 15px; cursor: pointer; font-size: 15px; }

        #pv-modal { display: none; position: fixed; inset: 0; background: #000; z-index: 9999; flex-direction: column; }
        .pv-header { height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; color: #fff; background: rgba(0,0,0,0.5); }
        #pv-frame { flex: 1; border: none; background: #fff; }
    </style>
</head>
<body>

<div class="overlay" id="overlay" onclick="toggleSidebar()"></div>

<header>
    <div class="header-left">
        <div class="burger" onclick="toggleSidebar()"><i class="fa fa-bars"></i></div>
        <div class="logo" onclick="nav('root', 'Мой диск')">
            <img src="\${LOGO_URL}" alt="Logo">
            <span>Logist-X</span>
        </div>
    </div>
    <div style="width: 34px; height: 34px; border-radius: 50%; background: var(--blue); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">EA</div>
</header>

<div class="wrapper">
    <aside id="sidebar">
        <div class="nav-link active" id="nav-root" onclick="nav('root', 'Мой диск')"><i class="fa fa-hdd"></i> Мой диск</div>
        <div class="nav-link" onclick="nav('\${MY_ROOT_ID}', 'Логистика')"><i class="fa fa-truck-fast"></i> Логистика</div>
        <div class="nav-link" onclick="nav('\${MERCH_ROOT_ID}', 'Мерчандайзинг')"><i class="fa fa-boxes-stacked"></i> Мерчандайзинг</div>
        <div class="nav-link"><i class="fa fa-trash-can"></i> Корзина</div>
        <div style="margin-top: auto; padding: 20px; font-size: 11px; color: #bbb;">TITANIUM v48.1 BRANDED</div>
    </aside>

    <main>
        <div class="breadcrumbs" id="bc-container">Мой диск</div>
        <table class="file-table">
            <thead>
                <tr>
                    <th>Название</th>
                    <th class="hide-mobile">Изменено</th>
                    <th class="hide-mobile">Размер</th>
                </tr>
            </thead>
            <tbody id="file-list"></tbody>
        </table>
    </main>
</div>

<div class="fab" onclick="toggleNewMenu(event)">
    <img src="\${LOGO_URL}" alt="+">
</div>

<div id="new-menu" class="ctx-menu" style="bottom: 90px; right: 25px;">
    <div class="ctx-item" onclick="createNewFolder()"><i class="fa fa-folder-plus"></i> Новая папка</div>
    <div class="ctx-item" onclick="document.getElementById('file-input').click()"><i class="fa fa-file-upload"></i> Загрузить файл</div>
</div>

<div id="file-ctx" class="ctx-menu">
    <div class="ctx-item" onclick="openPreview()"><i class="fa fa-eye"></i> Предпросмотр</div>
    <div class="ctx-item" onclick="renameItem()"><i class="fa fa-edit"></i> Переименовать</div>
    <div class="ctx-item" onclick="deleteItem()" style="color: var(--red);"><i class="fa fa-trash"></i> Удалить</div>
</div>

<div id="pv-modal">
    <div class="pv-header">
        <span id="pv-title" style="font-family:'Google Sans'; font-size:16px;"></span>
        <i class="fa fa-times" onclick="closePreview()" style="font-size: 24px; cursor: pointer;"></i>
    </div>
    <iframe id="pv-frame"></iframe>
</div>

<input type="file" id="file-input" style="display:none" multiple onchange="handleUpload(this.files)">
<div id="toast"></div>

<script>
    let currentFolderId = 'root';
    let breadcrumbs = [{id:'root', name:'Мой диск'}];
    let focusFile = null;
    let fileCache = [];

    async function loadFolder(id) {
        currentFolderId = id;
        const response = await fetch(\`/storage/api/list?folderId=\${id}\`);
        fileCache = await response.json();
        renderFiles();
        renderBreadcrumbs();
    }

    function renderFiles() {
        const body = document.getElementById('file-list');
        body.innerHTML = fileCache.length ? '' : '<tr><td colspan="3" style="text-align:center; padding:60px; color:#999;">Папка пуста</td></tr>';
        
        fileCache.forEach(f => {
            const tr = document.createElement('tr');
            tr.className = 'file-row';
            const isDir = f.mimeType.includes('folder');
            
            tr.innerHTML = \`
                <td><i class="fa \${isDir?'fa-folder':'fa-file-lines'}" style="margin-right:12px; color:\${isDir?'#fbc02d':'#1a73e8'}; font-size:18px;"></i> \${f.name}</td>
                <td class="hide-mobile">\${new Date(f.modifiedTime).toLocaleDateString()}</td>
                <td class="hide-mobile">\${f.size ? (f.size/1024/1024).toFixed(1)+' MB' : '—'}</td>
            \`;

            tr.onclick = () => isDir ? nav(f.id, f.name) : openPreview(f.id, f.name);
            tr.oncontextmenu = (e) => {
                e.preventDefault();
                focusFile = f;
                const m = document.getElementById('file-ctx');
                m.style.display = 'block'; m.style.left = e.clientX+'px'; m.style.top = e.clientY+'px';
            };
            body.appendChild(tr);
        });
    }

    function nav(id, name) {
        const idx = breadcrumbs.findIndex(x => x.id === id);
        if(idx !== -1) breadcrumbs = breadcrumbs.slice(0, idx+1);
        else breadcrumbs.push({id, name});
        loadFolder(id);
        toggleSidebar(true);
    }

    function renderBreadcrumbs() {
        document.getElementById('bc-container').innerHTML = breadcrumbs.map(b => 
            \`<span style="cursor:pointer; padding:5px;" onclick="nav('\${b.id}', '\${b.name}')">\${b.name}</span>\`
        ).join(' <i class="fa fa-chevron-right" style="font-size:10px; margin:0 5px; opacity:0.4;"></i> ');
    }

    function toggleSidebar(forceClose = false) {
        const s = document.getElementById('sidebar');
        const o = document.getElementById('overlay');
        if(forceClose) { s.classList.remove('open'); o.classList.remove('active'); return; }
        s.classList.toggle('open'); o.classList.toggle('active');
    }

    function toggleNewMenu(e) { e.stopPropagation(); const m = document.getElementById('new-menu'); m.style.display = m.style.display==='block'?'none':'block'; }

    async function handleUpload(files) {
        for(let f of files) {
            showToast(\`Загрузка: \${f.name}...\`);
            const fd = new FormData(); fd.append('file', f); fd.append('folderId', currentFolderId);
            await fetch('/storage/api/upload', {method:'POST', body:fd});
        }
        loadFolder(currentFolderId);
    }

    async function createNewFolder() {
        const n = prompt('Введите имя папки:');
        if(!n) return;
        await fetch('/storage/api/mkdir', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({parentId:currentFolderId, name:n})});
        loadFolder(currentFolderId);
    }

    async function deleteItem() {
        if(confirm('Удалить этот объект?')) {
            await fetch(\`/storage/api/delete/\${focusFile.id}\`, {method:'DELETE'});
            loadFolder(currentFolderId);
        }
    }

    async function renameItem() {
        const n = prompt('Новое имя:', focusFile.name);
        if(!n || n === focusFile.name) return;
        await fetch('/storage/api/rename', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:focusFile.id, name:n})});
        loadFolder(currentFolderId);
    }

    function openPreview(id, name) {
        const tid = id || focusFile.id;
        const tnm = name || focusFile.name;
        document.getElementById('pv-title').innerText = tnm;
        document.getElementById('pv-frame').src = \`https://drive.google.com/file/d/\${tid}/preview\`;
        document.getElementById('pv-modal').style.display = 'flex';
    }

    function closePreview() { document.getElementById('pv-modal').style.display = 'none'; document.getElementById('pv-frame').src = ''; }

    function showToast(m) { const t = document.getElementById('toast'); t.innerText = m; t.style.display = 'block'; setTimeout(()=>t.style.display='none', 3000); }

    window.onclick = () => { 
        document.getElementById('file-ctx').style.display = 'none'; 
        document.getElementById('new-menu').style.display = 'none'; 
    };
    
    loadFolder('root');
</script>
</body>
</html>
    `;

    app.get('/storage', (req, res) => res.send(UI));

    app.get('/storage/api/list', async (req, res) => {
        try {
            const r = await drive.files.list({
                q: `'${req.query.folderId || 'root'}' in parents and trashed = false`,
                fields: 'files(id, name, mimeType, size, modifiedTime)',
                orderBy: 'folder, name'
            });
            res.json(r.data.files);
        } catch (e) { res.status(500).json({error: e.message}); }
    });

    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            const media = { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) };
            await drive.files.create({ resource: { name: req.file.originalname, parents: [req.body.folderId] }, media: media });
            fs.unlinkSync(req.file.path); res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/mkdir', express.json(), async (req, res) => {
        try {
            await drive.files.create({ resource: { name: req.body.name, mimeType: 'application/vnd.google-apps.folder', parents: [req.body.parentId] } });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/rename', express.json(), async (req, res) => {
        try {
            await drive.files.update({ fileId: req.body.id, resource: { name: req.body.name } });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.delete('/storage/api/delete/:id', async (req, res) => {
        try {
            await drive.files.update({ fileId: req.params.id, resource: { trashed: true } });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    console.log("✅ TITANIUM ADAPTIVE v48.1 LOADED WITH CUSTOM LOGO");
};
