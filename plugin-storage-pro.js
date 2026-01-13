const express = require('express');
const multer = require('multer');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

/**
 * ============================================================================
 * TITANIUM ULTIMATE v36.0 | PROFESSIONAL CLOUD ENGINE
 * ----------------------------------------------------------------------------
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * ФУНКЦИОНАЛ: ПОЛНЫЙ АНАЛОГ GOOGLE DRIVE (UPLOAD, MKDIR, RENAME, DELETE, VIEW)
 * ============================================================================
 */

module.exports = function(app, context) {
    const { drive, google, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const upload = multer({ dest: 'uploads/' });

    // --- ВЫСОКОТЕХНОЛОГИЧНЫЙ ИНТЕРФЕЙС (UI) ---
    const UI = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>X-Commander | Titanium Pro</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --g-blue: #1a73e8; --g-red: #d93025; --g-gray: #5f6368;
            --g-text: #3c4043; --g-border: #dadce0; --g-hover: #f1f3f4;
            --g-shadow: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15);
            --sidebar-width: 280px;
        }

        * { box-sizing: border-box; outline: none; transition: background 0.2s, color 0.2s; }
        body, html { margin: 0; padding: 0; height: 100%; font-family: 'Roboto', sans-serif; color: var(--g-text); background: #fff; overflow: hidden; }

        /* HEADER */
        header {
            height: 64px; padding: 0 24px; border-bottom: 1px solid var(--g-border);
            display: flex; align-items: center; justify-content: space-between;
            background: #fff; position: relative; z-index: 1000;
        }
        .logo-box { display: flex; align-items: center; width: var(--sidebar-width); gap: 15px; cursor: pointer; }
        .logo-box i { font-size: 30px; color: var(--g-blue); }
        .logo-box span { font-family: 'Google Sans'; font-size: 22px; color: #5f6368; }

        .search-area { flex: 1; max-width: 720px; position: relative; }
        .search-area i { position: absolute; left: 16px; top: 14px; color: #5f6368; }
        .search-area input {
            width: 100%; background: #f1f3f4; border: 1px solid transparent;
            padding: 12px 12px 12px 52px; border-radius: 8px; font-size: 16px;
        }
        .search-area input:focus { background: #fff; box-shadow: var(--g-shadow); }

        /* LAYOUT */
        .app-wrapper { display: flex; height: calc(100vh - 64px); }

        /* SIDEBAR */
        aside { width: var(--sidebar-width); padding: 16px 0; display: flex; flex-direction: column; border-right: 1px solid #eee; }
        .btn-new {
            margin: 0 16px 20px; width: 140px; height: 48px; border-radius: 24px;
            box-shadow: var(--g-shadow); background: #fff; display: flex; align-items: center;
            justify-content: center; gap: 12px; cursor: pointer; font-weight: 500; font-family: 'Google Sans';
        }
        .btn-new:hover { background: #f8f9fa; }

        .nav-link {
            height: 40px; margin-right: 8px; border-radius: 0 20px 20px 0;
            display: flex; align-items: center; padding: 0 24px; cursor: pointer;
            font-size: 14px; color: #3c4043; text-decoration: none;
        }
        .nav-link i { width: 34px; font-size: 18px; color: #5f6368; }
        .nav-link:hover { background: #f1f3f4; }
        .nav-link.active { background: #e8f0fe; color: #1a73e8; font-weight: 500; }
        .nav-link.active i { color: #1a73e8; }

        /* MAIN CONTENT */
        main { flex: 1; padding: 0 24px; overflow-y: auto; background: #fff; }
        .bc-container { height: 56px; display: flex; align-items: center; font-size: 18px; font-family: 'Google Sans'; color: #5f6368; }
        .bc-item { padding: 4px 8px; border-radius: 4px; cursor: pointer; }
        .bc-item:hover { background: #eee; }

        .file-table { width: 100%; border-collapse: collapse; }
        .file-table th {
            text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--g-border);
            font-size: 13px; color: #5f6368; position: sticky; top: 0; background: #fff; z-index: 10;
        }
        .file-table td { padding: 10px 8px; border-bottom: 1px solid #eee; font-size: 14px; }
        .row-item { cursor: pointer; }
        .row-item:hover { background: #f8f9fa; }
        .row-item.selected { background: #e8f0fe ! encroachment; }

        .icon-cell { width: 40px; text-align: center; font-size: 20px; }
        .f-folder { color: #5f6368; }
        .f-pdf { color: #ea4335; }
        .f-excel { color: #1e8e3e; }
        .f-image { color: #f4b400; }

        /* CONTEXT MENU */
        #menu-ctx {
            position: fixed; display: none; background: #fff; box-shadow: 0 8px 16px rgba(0,0,0,0.2);
            border: 1px solid #ddd; border-radius: 4px; padding: 6px 0; z-index: 5000; min-width: 220px;
        }
        .menu-ctx-item { padding: 10px 16px; font-size: 14px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .menu-ctx-item:hover { background: #f1f3f4; }
        .menu-ctx-item i { width: 20px; color: #5f6368; }

        /* MODALS */
        #modal-pv {
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.9); z-index: 9000; flex-direction: column;
        }
        .pv-head { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; color: #fff; }
        #pv-iframe { flex: 1; border: none; width: 85%; margin: 0 auto 30px; background: #fff; border-radius: 4px; }

        #toast-msg {
            position: fixed; bottom: 30px; left: 30px; background: #323232; color: #fff;
            padding: 12px 24px; border-radius: 4px; display: none; z-index: 10000;
        }

        /* NEW FOLDER MENU */
        #menu-new {
            display: none; position: fixed; top: 120px; left: 24px; background: #fff;
            box-shadow: var(--g-shadow); border-radius: 4px; z-index: 2000; width: 200px; padding: 8px 0;
        }
    </style>
</head>
<body>

<header>
    <div class="logo-box" onclick="nav('root', 'Мой диск')">
        <i class="fa-solid fa-cloud-bolt"></i>
        <span>X-Commander</span>
    </div>
    <div class="search-area">
        <i class="fa fa-search"></i>
        <input type="text" id="search-in" placeholder="Поиск файлов..." oninput="search()">
    </div>
    <div style="display:flex; gap:20px; align-items:center;">
        <i class="fa-solid fa-circle-info" style="color:var(--g-gray); font-size:20px;"></i>
        <div style="width:34px; height:34px; border-radius:50%; background:#673ab7; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold;">EA</div>
    </div>
</header>

<div class="app-wrapper">
    <aside>
        <div class="btn-new" onclick="toggleNew(event)">
            <i class="fa fa-plus" style="color:#34a853; font-size:20px;"></i>
            Создать
        </div>
        <div class="nav-link active" id="link-root" onclick="nav('root', 'Мой диск')"><i class="fa fa-hdd"></i> Мой диск</div>
        <div class="nav-link" onclick="nav('${MY_ROOT_ID}', 'Логистика')"><i class="fa fa-truck-fast"></i> Логистика</div>
        <div class="nav-link" onclick="nav('${MERCH_ROOT_ID}', 'Мерчандайзинг')"><i class="fa fa-boxes-stacked"></i> Мерч</div>
        <div class="nav-link"><i class="fa fa-clock"></i> Недавние</div>
        <div class="nav-link"><i class="fa fa-trash-can"></i> Корзина</div>
    </aside>

    <main>
        <div class="bc-container" id="bc-box">Мой диск</div>
        <table class="file-table">
            <thead>
                <tr>
                    <th style="width:50%">Название</th>
                    <th style="width:15%">Владелец</th>
                    <th style="width:20%">Изменено</th>
                    <th style="width:15%">Размер</th>
                </tr>
            </thead>
            <tbody id="list-box"></tbody>
        </table>
    </main>
</div>

<div id="menu-new">
    <div class="menu-ctx-item" onclick="mkDir()"><i class="fa fa-folder-plus"></i> Новая папка</div>
    <div class="menu-ctx-item" onclick="document.getElementById('file-in').click()"><i class="fa fa-file-upload"></i> Загрузить файл</div>
</div>

<div id="menu-ctx">
    <div class="menu-ctx-item" onclick="view()"><i class="fa fa-eye"></i> Предпросмотр</div>
    <div class="menu-ctx-item" onclick="down()"><i class="fa fa-download"></i> Скачать</div>
    <div class="menu-ctx-item" onclick="ren()"><i class="fa fa-pen"></i> Переименовать</div>
    <div class="menu-ctx-item" onclick="del()" style="color:var(--g-red)"><i class="fa fa-trash"></i> Удалить</div>
</div>

<div id="modal-pv">
    <div class="pv-head">
        <span id="pv-name" style="font-family:'Google Sans'; font-size:18px;"></span>
        <i class="fa fa-xmark" onclick="closePv()" style="font-size:24px; cursor:pointer;"></i>
    </div>
    <iframe id="pv-iframe"></iframe>
</div>

<input type="file" id="file-in" style="display:none" multiple onchange="upload(this.files)">
<div id="toast-msg"></div>

<script>
    let currentId = 'root';
    let path = [{id:'root', name:'Мой диск'}];
    let focus = {id:null, name:null};
    let filesData = [];

    async function load(id) {
        currentId = id;
        const res = await fetch(\`/storage/api/list?folderId=\${id}\`);
        filesData = await res.json();
        render();
        renderBC();
    }

    function render() {
        const body = document.getElementById('list-box');
        body.innerHTML = filesData.length ? '' : '<tr><td colspan="4" style="text-align:center; padding:60px; color:#999;">Папка пуста</td></tr>';
        
        filesData.forEach(f => {
            const tr = document.createElement('tr');
            tr.className = 'row-item';
            const isDir = f.mimeType.includes('folder');
            
            tr.innerHTML = \`
                <td><i class="fa \${getIco(f.mimeType)} icon-cell"></i> \${f.name}</td>
                <td>Я</td>
                <td>\${new Date(f.modifiedTime).toLocaleDateString()}</td>
                <td>\${f.size ? (f.size/1024/1024).toFixed(1) + ' МБ' : '—'}</td>
            \`;

            tr.onclick = () => isDir ? nav(f.id, f.name) : view(f.id, f.name);
            tr.oncontextmenu = (e) => {
                e.preventDefault();
                focus = {id: f.id, name: f.name};
                const cm = document.getElementById('menu-ctx');
                cm.style.display = 'block'; cm.style.left = e.clientX+'px'; cm.style.top = e.clientY+'px';
                document.querySelectorAll('.row-item').forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
            };
            body.appendChild(tr);
        });
    }

    function getIco(m) {
        if(m.includes('folder')) return 'fa-folder f-folder';
        if(m.includes('pdf')) return 'fa-file-pdf f-pdf';
        if(m.includes('spreadsheet') || m.includes('excel')) return 'fa-file-excel f-excel';
        if(m.includes('image')) return 'fa-file-image f-image';
        return 'fa-file-lines';
    }

    function nav(id, name) {
        const i = path.findIndex(x => x.id === id);
        if(i !== -1) path = path.slice(0, i+1);
        else path.push({id, name});
        load(id);
    }

    function renderBC() {
        document.getElementById('bc-box').innerHTML = path.map(b => 
            \`<span class="bc-item" onclick="nav('\${b.id}', '\${b.name}')">\${b.name}</span>\`
        ).join(' <i class="fa fa-chevron-right" style="font-size:10px; margin:0 6px; opacity:0.4;"></i> ');
    }

    async function upload(files) {
        for(let f of files) {
            toast(\`Загрузка: \${f.name}...\`);
            const fd = new FormData(); fd.append('file', f); fd.append('folderId', currentId);
            await fetch('/storage/api/upload', {method:'POST', body:fd});
        }
        load(currentId);
    }

    async function mkDir() {
        const n = prompt('Название папки:');
        if(!n) return;
        await fetch('/storage/api/mkdir', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({parentId: currentId, name: n})
        });
        load(currentId);
    }

    async function del() {
        if(confirm(\`Удалить "\${focus.name}"?\`)) {
            await fetch(\`/storage/api/delete/\${focus.id}\`, {method:'DELETE'});
            load(currentId);
        }
    }

    async function ren() {
        const n = prompt('Новое имя:', focus.name);
        if(!n || n === focus.name) return;
        await fetch('/storage/api/rename', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({id: focus.id, name: n})
        });
        load(currentId);
    }

    function down() { window.open(\`/storage/api/download?id=\${focus.id}\`); }
    function view(id, n) {
        const targetId = id || focus.id;
        const targetName = n || focus.name;
        document.getElementById('pv-name').innerText = targetName;
        document.getElementById('pv-iframe').src = \`https://drive.google.com/file/d/\${targetId}/preview\`;
        document.getElementById('modal-pv').style.display = 'flex';
    }
    function closePv() { document.getElementById('modal-pv').style.display = 'none'; document.getElementById('pv-iframe').src = ''; }
    function toast(m) { const t = document.getElementById('toast-msg'); t.innerText = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3000); }
    function toggleNew(e) { e.stopPropagation(); const m = document.getElementById('menu-new'); m.style.display = m.style.display === 'none' ? 'block' : 'none'; }
    function search() {
        const q = document.getElementById('search-in').value.toLowerCase();
        const filt = filesData.filter(f => f.name.toLowerCase().includes(q));
        filesData = filt; render(); // Упрощенный поиск
    }

    window.onclick = () => { 
        document.getElementById('menu-ctx').style.display = 'none'; 
        document.getElementById('menu-new').style.display = 'none';
    };
    load('root');
</script>
</body>
</html>
    `;

    // --- СЕРВЕРНЫЙ API (Node.js) ---
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
            await drive.files.create({ 
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: media
            });
            fs.unlinkSync(req.file.path);
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/mkdir', express.json(), async (req, res) => {
        try {
            await drive.files.create({
                resource: { name: req.body.name, mimeType: 'application/vnd.google-apps.folder', parents: [req.body.parentId] }
            });
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

    app.get('/storage/api/download', async (req, res) => {
        try {
            const f = await drive.files.get({ fileId: req.query.id, fields: 'name' });
            const stream = await drive.files.get({ fileId: req.query.id, alt: 'media' }, { responseType: 'stream' });
            res.setHeader('Content-Disposition', `attachment; filename=${encodeURI(f.data.name)}`);
            stream.data.pipe(res);
        } catch (e) { res.status(500).send(e.message); }
    });

    console.log("✅ TITANIUM ULTIMATE v36.0 ACTIVATED [FULL LOAD]");
};
