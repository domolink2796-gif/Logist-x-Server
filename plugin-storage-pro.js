const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

/**
 * ============================================================================
 * TITANIUM X-PLATFORM v55.1 | THE GOLDEN MONOLITH REPAIRED
 * ----------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * ИСПРАВЛЕНО: Позиционирование меню FAB (создание папки и загрузка)
 * ============================================================================
 */

const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";

module.exports = function(app, context) {
    const { drive, google, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const upload = multer({ dest: 'uploads/' });

    const UI = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>X-PLATFORM | Cloud Storage</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --brand-bg: #0a0a0a;
            --accent: #f0b90b;
            --gray-text: #5f6368;
            --main-text: #3c4043;
            --border: #dadce0;
            --sidebar-w: 280px;
            --blue-link: #1a73e8;
        }

        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; margin: 0; padding: 0; }
        body, html { height: 100%; font-family: 'Roboto', sans-serif; color: var(--main-text); background: #fff; overflow: hidden; }

        header {
            height: 64px; padding: 0 20px; border-bottom: 2px solid var(--accent);
            display: flex; align-items: center; justify-content: space-between;
            background: var(--brand-bg); position: relative; z-index: 2000; color: #fff;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }
        .h-left { display: flex; align-items: center; gap: 15px; }
        .burger { display: none; font-size: 24px; color: var(--accent); cursor: pointer; padding: 5px; }
        .logo-box { display: flex; align-items: center; gap: 12px; font-family: 'Google Sans'; font-size: 20px; font-weight: 700; color: #fff; text-decoration: none; }
        .logo-box img { height: 42px; width: auto; border-radius: 4px; }

        .wrapper { display: flex; height: calc(100vh - 64px); position: relative; }

        aside { 
            width: var(--sidebar-w); height: 100%; border-right: 1px solid #eee;
            background: #fff; display: flex; flex-direction: column; padding: 20px 0;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 1500;
        }
        
        .nav-item {
            height: 50px; margin: 2px 12px; border-radius: 25px;
            display: flex; align-items: center; padding: 0 20px; cursor: pointer;
            color: var(--main-text); text-decoration: none; font-size: 15px; font-weight: 500;
        }
        .nav-item i { width: 35px; font-size: 20px; color: var(--gray-text); }
        .nav-item:hover { background: #f1f3f4; }
        .nav-item.active { background: #e8f0fe; color: var(--blue-link); font-weight: 700; }
        .nav-item.active i { color: var(--blue-link); }

        main { flex: 1; padding: 0 25px; overflow-y: auto; background: #fff; position: relative; }
        .breadcrumbs { 
            height: 56px; display: flex; align-items: center; font-size: 18px; 
            font-family: 'Google Sans'; color: var(--gray-text); border-bottom: 1px solid #eee; 
            margin-bottom: 15px; overflow-x: auto; white-space: nowrap;
        }
        .bc-node { cursor: pointer; padding: 4px 8px; border-radius: 4px; }
        .bc-node:hover { background: #eee; color: #000; }
        
        .file-table { width: 100%; border-collapse: collapse; }
        .file-table th { text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--gray-text); position: sticky; top: 0; background: #fff; z-index: 10; }
        .file-table td { padding: 16px 8px; border-bottom: 1px solid #eee; font-size: 15px; cursor: pointer; }
        .file-row:hover { background: #f8f9fa; }

        .fab {
            position: fixed; bottom: 30px; right: 30px; width: 64px; height: 64px;
            border-radius: 20px; background: var(--brand-bg); border: 2px solid var(--accent);
            display: flex; align-items: center; justify-content: center; z-index: 1000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.4); cursor: pointer;
        }
        .fab img { height: 38px; width: auto; }

        .overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1400; }
        .overlay.active { display: block; }

        @media (max-width: 768px) {
            .burger { display: block; }
            aside { position: fixed; left: 0; transform: translateX(-100%); height: 100%; box-shadow: 10px 0 20px rgba(0,0,0,0.1); }
            aside.open { transform: translateX(0); }
            .hide-mobile { display: none; }
            main { padding: 0 15px; }
        }

        /* NEW MENU POSITIONING FIX */
        #new-menu {
            position: fixed; display: none; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            border-radius: 12px; z-index: 5000; min-width: 220px; padding: 8px 0; border: 1px solid #eee;
            bottom: 100px; right: 30px; /* Появляется над кнопкой FAB */
        }
        #ctx-menu {
            position: fixed; display: none; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            border-radius: 12px; z-index: 5000; min-width: 220px; padding: 8px 0; border: 1px solid #eee;
        }
        .menu-item { padding: 12px 20px; font-size: 15px; display: flex; align-items: center; gap: 15px; cursor: pointer; }
        .menu-item:hover { background: #f1f3f4; }
        .menu-item i { width: 20px; color: var(--gray-text); font-size: 18px; }

        #pv-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 9999; flex-direction: column; }
        .pv-h { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; color: #fff; background: var(--brand-bg); }
        #pv-f { flex: 1; border: none; background: #fff; }
        
        #toast { position: fixed; bottom: 110px; left: 50%; transform: translateX(-50%); background: #323232; color: #fff; padding: 12px 25px; border-radius: 25px; display: none; z-index: 10000; font-size: 14px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); }
    </style>
</head>
<body>

<div class="overlay" id="overlay" onclick="toggleSidebar()"></div>

<header>
    <div class="h-left">
        <div class="burger" onclick="toggleSidebar()"><i class="fa fa-bars"></i></div>
        <div class="logo-box">
            <img src="${LOGO_URL}" alt="X">
            <span>X-PLATFORM</span>
        </div>
    </div>
    <div style="font-weight: 700; color: var(--accent); font-size: 14px;">НИКИТИН Е.А.</div>
</header>

<div class="wrapper">
    <aside id="sidebar">
        <div class="nav-item active" id="nav-root" onclick="navigate('root', 'Мой диск')">
            <i class="fa fa-hdd"></i> Мой диск
        </div>
        <div class="nav-item" onclick="navigate('${MY_ROOT_ID}', 'Логистика')">
            <i class="fa fa-truck-fast"></i> Логистика
        </div>
        <div class="nav-item" onclick="navigate('${MERCH_ROOT_ID}', 'Мерчандайзинг')">
            <i class="fa fa-boxes-stacked"></i> Мерчандайзинг
        </div>
        <div class="nav-item" id="nav-trash" style="margin-top: auto;" onclick="navigate('trash', 'Корзина')">
            <i class="fa fa-trash-can"></i> Корзина
        </div>
        <div style="padding: 20px; font-size: 10px; color: #ccc;">ULTIMATE v55.1 FULL BUILD</div>
    </aside>

    <main>
        <div class="breadcrumbs" id="bc-container">Мой диск</div>
        <table class="file-table">
            <thead>
                <tr>
                    <th style="width: 60%">Название</th>
                    <th class="hide-mobile">Изменено</th>
                    <th class="hide-mobile">Размер</th>
                </tr>
            </thead>
            <tbody id="file-list"></tbody>
        </table>
    </main>
</div>

<div class="fab" onclick="toggleNewMenu(event)">
    <img src="${LOGO_URL}" alt="+">
</div>

<div id="new-menu">
    <div class="menu-item" onclick="createFolder(event)"><i class="fa fa-folder-plus"></i> Новая папка</div>
    <div class="menu-item" onclick="triggerUpload(event)"><i class="fa fa-file-upload"></i> Загрузить файл</div>
</div>

<div id="ctx-menu">
    <div class="menu-item" onclick="viewFile()"><i class="fa fa-eye"></i> Предпросмотр</div>
    <div class="menu-item" onclick="renameItem()"><i class="fa fa-pen-to-square"></i> Переименовать</div>
    <div class="menu-item" onclick="deleteItem()" style="color: #d93025;"><i class="fa fa-trash-can"></i> Удалить</div>
</div>

<div id="pv-modal">
    <div class="pv-h">
        <span id="pv-title" style="font-weight: 500;"></span>
        <i class="fa fa-xmark" onclick="closePreview()" style="font-size: 28px; cursor: pointer; color: var(--accent);"></i>
    </div>
    <iframe id="pv-f"></iframe>
</div>

<input type="file" id="file-input" style="display:none" multiple onchange="handleUpload(this.files)">
<div id="toast"></div>

<script>
    let currentFolderId = 'root'; 
    let path = [{id:'root', name:'Мой диск'}];
    let selectedFile = null; 
    let filesCache = [];

    async function load(id) {
        currentFolderId = id;
        try {
            const r = await fetch('/storage/api/list?folderId=' + id);
            filesCache = await r.json();
            render();
            renderBC();
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            if(id === 'root') document.getElementById('nav-root').classList.add('active');
            if(id === 'trash') document.getElementById('nav-trash').classList.add('active');
        } catch(e) { showToast("Ошибка загрузки данных"); }
    }

    function render() {
        const body = document.getElementById('file-list');
        body.innerHTML = filesCache.length ? '' : '<tr><td colspan="3" style="text-align:center; padding:80px; color:#999;">Папка пуста</td></tr>';
        
        filesCache.forEach(f => {
            const tr = document.createElement('tr'); 
            tr.className = 'file-row';
            const isDir = f.mimeType.includes('folder');
            
            tr.innerHTML = \`
                <td><i class="fa \${isDir?'fa-folder':'fa-file-lines'}" style="margin-right:12px; color:\${isDir?'#fbc02d':'#1a73e8'}; font-size:20px;"></i> \${f.name}</td>
                <td class="hide-mobile">\${new Date(f.modifiedTime).toLocaleDateString()}</td>
                <td class="hide-mobile">\${f.size ? (f.size/1024/1024).toFixed(1)+' MB' : '—'}</td>
            \`;

            tr.onclick = () => isDir ? navigate(f.id, f.name) : viewFile(f.id, f.name);
            
            tr.oncontextmenu = (e) => {
                e.preventDefault();
                selectedFile = f;
                const m = document.getElementById('ctx-menu');
                m.style.display = 'block'; 
                m.style.left = e.clientX + 'px'; 
                m.style.top = e.clientY + 'px';
            };
            body.appendChild(tr);
        });
    }

    function navigate(id, name) {
        const idx = path.findIndex(x => x.id === id);
        if(idx !== -1) path = path.slice(0, idx+1);
        else path.push({id, name});
        load(id);
        toggleSidebar(true);
    }

    function renderBC() {
        document.getElementById('bc-container').innerHTML = path.map(p => 
            \`<span class="bc-node" onclick="navigate('\${p.id}', '\${p.name}')">\${p.name}</span>\`
        ).join(' <i class="fa fa-chevron-right" style="font-size:10px; margin:0 5px; opacity:0.3;"></i> ');
    }

    function toggleSidebar(close) {
        const s = document.getElementById('sidebar'); 
        const o = document.getElementById('overlay');
        if(close) { if(s) s.classList.remove('open'); if(o) o.classList.remove('active'); return; }
        s.classList.toggle('open'); 
        o.classList.toggle('active');
    }

    function toggleNewMenu(e) { 
        e.stopPropagation(); 
        const m = document.getElementById('new-menu'); 
        m.style.display = (m.style.display === 'block') ? 'none' : 'block'; 
    }

    function triggerUpload(e) {
        e.stopPropagation();
        document.getElementById('file-input').click();
        document.getElementById('new-menu').style.display = 'none';
    }

    function viewFile(id, name) {
        const tid = id || selectedFile.id;
        document.getElementById('pv-title').innerText = name || (selectedFile?selectedFile.name:'');
        document.getElementById('pv-f').src = 'https://drive.google.com/file/d/' + tid + '/preview';
        document.getElementById('pv-modal').style.display = 'flex';
    }

    function closePreview() { 
        document.getElementById('pv-modal').style.display = 'none'; 
        document.getElementById('pv-f').src = ''; 
    }

    async function handleUpload(files) {
        for(let f of files) {
            showToast("Загрузка: " + f.name);
            const fd = new FormData(); 
            fd.append('file', f); 
            fd.append('folderId', currentFolderId);
            await fetch('/storage/api/upload', {method: 'POST', body: fd});
        }
        load(currentFolderId);
    }

    async function createFolder(e) {
        e.stopPropagation();
        const n = prompt("Имя новой папки:");
        if(!n) return;
        document.getElementById('new-menu').style.display = 'none';
        await fetch('/storage/api/mkdir', {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({parentId: currentFolderId, name: n})
        });
        load(currentFolderId);
    }

    async function deleteItem() {
        if(!confirm("Удалить '" + selectedFile.name + "'?")) return;
        await fetch('/storage/api/delete/' + selectedFile.id, {method: 'DELETE'});
        load(currentFolderId);
    }

    async function renameItem() {
        const n = prompt("Новое имя:", selectedFile.name);
        if(!n || n === selectedFile.name) return;
        await fetch('/storage/api/rename', {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({id: selectedFile.id, name: n})
        });
        load(currentFolderId);
    }

    function showToast(m) {
        const t = document.getElementById('toast');
        t.innerText = m; t.style.display = 'block';
        setTimeout(() => t.style.display = 'none', 3000);
    }

    window.onclick = () => {
        document.getElementById('ctx-menu').style.display = 'none';
        document.getElementById('new-menu').style.display = 'none';
    };

    load('root');
</script>
</body>
</html>
    `;

    // --- API SERVER SIDE ---
    app.get('/storage', (req, res) => res.send(UI));

    app.get('/storage/api/list', async (req, res) => {
        try {
            let q = "";
            const folderId = req.query.folderId || 'root';
            if (folderId === 'trash') { q = "trashed = true"; } 
            else { q = `'${folderId}' in parents and trashed = false`; }
            const r = await drive.files.list({
                q: q,
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
                resource: { 
                    name: req.body.name, 
                    mimeType: 'application/vnd.google-apps.folder', 
                    parents: [req.body.parentId] 
                }
            });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/rename', express.json(), async (req, res) => {
        try {
            await drive.files.update({ 
                fileId: req.body.id, 
                resource: { name: req.body.name } 
            });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.delete('/storage/api/delete/:id', async (req, res) => {
        try {
            await drive.files.update({ 
                fileId: req.params.id, 
                resource: { trashed: true } 
            });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    console.log("✅ TITANIUM X-PLATFORM v55.1 FULLY LOADED");
};
