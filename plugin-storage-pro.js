const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// СЮДА ВСТАВЛЯЙ СВОЮ ССЫЛКУ:
const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png"; 

/**
 * ============================================================================
 * TITANIUM DOMOLINK v44.0 | ABSOLUTE FINAL MONOLITH
 * ----------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * СТАТУС: ПОЛНАЯ СБОРКА (UI + API + UX + BRANDING)
 * ============================================================================
 */

module.exports = function(app, context) {
    const { drive, google, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const upload = multer({ dest: 'uploads/' });

    // --- ВЕСЬ ИНТЕРФЕЙС В ОДНОЙ ПЕРЕМЕННОЙ ---
    const UI = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>DOMOLINK | X-Platform</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --brand-bg: #0a0a0a;
            --accent: #f0b90b;
            --gray: #5f6368;
            --text: #3c4043;
            --border: #dadce0;
            --sidebar-w: 280px;
        }

        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; margin: 0; padding: 0; }
        body, html { height: 100%; font-family: 'Roboto', sans-serif; color: var(--text); background: #fff; overflow: hidden; }

        /* HEADER */
        header {
            height: 64px; padding: 0 20px; border-bottom: 2px solid var(--accent);
            display: flex; align-items: center; justify-content: space-between;
            background: var(--brand-bg); position: relative; z-index: 2000; color: #fff;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }
        .header-left { display: flex; align-items: center; gap: 15px; }
        .burger { display: none; font-size: 24px; color: var(--accent); cursor: pointer; padding: 5px; }
        .logo { display: flex; align-items: center; gap: 12px; font-family: 'Google Sans'; font-size: 18px; font-weight: 700; color: #fff; text-decoration: none; }
        .logo img { height: 40px; width: auto; border-radius: 4px; }

        /* LAYOUT */
        .wrapper { display: flex; height: calc(100vh - 64px); position: relative; }

        /* SIDEBAR */
        aside { 
            width: var(--sidebar-w); height: 100%; border-right: 1px solid #eee;
            background: #fff; display: flex; flex-direction: column; padding: 20px 0;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 1500;
        }
        
        .nav-link {
            height: 48px; margin: 2px 12px; border-radius: 24px;
            display: flex; align-items: center; padding: 0 20px; cursor: pointer;
            color: var(--text); text-decoration: none; font-size: 14px; font-weight: 500;
        }
        .nav-link i { width: 34px; font-size: 18px; color: var(--gray); }
        .nav-link:hover { background: #f1f3f4; }
        .nav-link.active { background: #e8f0fe; color: #1a73e8; font-weight: 700; }

        /* MAIN */
        main { flex: 1; padding: 0 25px; overflow-y: auto; background: #fff; position: relative; }
        .bc { height: 56px; display: flex; align-items: center; font-size: 18px; color: var(--gray); border-bottom: 1px solid #eee; margin-bottom: 10px; }
        
        .file-table { width: 100%; border-collapse: collapse; }
        .file-table th { text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--gray); position: sticky; top: 0; background: #fff; z-index: 10; }
        .file-table td { padding: 15px 8px; border-bottom: 1px solid #eee; font-size: 15px; cursor: pointer; }
        .file-row:hover { background: #f8f9fa; }

        /* FAB */
        .fab {
            position: fixed; bottom: 30px; right: 30px; width: 60px; height: 60px;
            border-radius: 20px; background: var(--brand-bg); border: 2px solid var(--accent);
            display: flex; align-items: center; justify-content: center; z-index: 1000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.4); cursor: pointer;
        }
        .fab img { height: 35px; width: auto; }

        /* MOBILE */
        @media (max-width: 768px) {
            .burger { display: block; }
            aside { position: fixed; left: 0; transform: translateX(-100%); height: 100%; box-shadow: 10px 0 20px rgba(0,0,0,0.1); }
            aside.open { transform: translateX(0); }
            .hide-mobile { display: none; }
            .overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1400; }
            .overlay.active { display: block; }
            main { padding: 0 15px; }
        }

        /* MENUS */
        #ctx-menu, #new-menu {
            position: fixed; display: none; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            border-radius: 12px; z-index: 5000; min-width: 220px; padding: 8px 0; border: 1px solid #eee;
        }
        .menu-item { padding: 12px 20px; font-size: 15px; display: flex; align-items: center; gap: 15px; cursor: pointer; }
        .menu-item:hover { background: #f1f3f4; }
        .menu-item i { width: 20px; color: var(--gray); }

        /* MODAL */
        #modal-pv { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 9999; flex-direction: column; }
        .pv-header { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; color: #fff; background: var(--brand-bg); }
        #pv-frame { flex: 1; border: none; background: #fff; }
        
        #toast { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); background: #323232; color: #fff; padding: 10px 25px; border-radius: 20px; display: none; z-index: 10000; font-size: 14px; }
    </style>
</head>
<body>

<div class="overlay" id="overlay" onclick="toggleSidebar()"></div>

<header>
    <div class="header-left">
        <div class="burger" onclick="toggleSidebar()"><i class="fa fa-bars"></i></div>
        <div class="logo">
            <img src="\${LOGO_URL}" alt="Logo">
            <span>DOMOLINK PLATFORM</span>
        </div>
    </div>
    <div style="font-weight: 700; color: var(--accent); font-size: 14px;">НИКИТИН Е.А.</div>
</header>

<div class="wrapper">
    <aside id="sidebar">
        <div class="nav-link active" onclick="nav('root', 'Мой диск')"><i class="fa fa-hdd"></i> Мой диск</div>
        <div class="nav-link" onclick="nav('\${MY_ROOT_ID}', 'Логистика')"><i class="fa fa-truck-fast"></i> Логистика</div>
        <div class="nav-link" onclick="nav('\${MERCH_ROOT_ID}', 'Мерчандайзинг')"><i class="fa fa-boxes-stacked"></i> Мерчандайзинг</div>
        <div class="nav-link" style="margin-top: auto;"><i class="fa fa-trash"></i> Корзина</div>
    </aside>

    <main>
        <div class="bc" id="bc-container">Мой диск</div>
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

<div class="fab" onclick="toggleNew(event)">
    <img src="\${LOGO_URL}" alt="+">
</div>

<div id="new-menu">
    <div class="menu-item" onclick="createNewFolder()"><i class="fa fa-folder-plus"></i> Новая папка</div>
    <div class="menu-item" onclick="document.getElementById('file-input').click()"><i class="fa fa-file-upload"></i> Загрузить файл</div>
</div>

<div id="ctx-menu">
    <div class="menu-item" onclick="openPreview()"><i class="fa fa-eye"></i> Предпросмотр</div>
    <div class="menu-item" onclick="renameItem()"><i class="fa fa-edit"></i> Переименовать</div>
    <div class="menu-item" onclick="deleteItem()" style="color:red"><i class="fa fa-trash"></i> Удалить</div>
</div>

<div id="modal-pv">
    <div class="pv-header">
        <span id="pv-title" style="font-size:16px;"></span>
        <i class="fa fa-times" onclick="closePreview()" style="font-size:24px; cursor:pointer; color:var(--accent);"></i>
    </div>
    <iframe id="pv-frame"></iframe>
</div>

<input type="file" id="file-input" style="display:none" multiple onchange="handleUpload(this.files)">
<div id="toast"></div>

<script>
    let currentId = 'root'; 
    let path = [{id:'root', name:'Мой диск'}];
    let focusFile = null; 
    let fileCache = [];

    async function load(id) {
        currentId = id; 
        try {
            const r = await fetch(\`/storage/api/list?folderId=\${id}\`);
            fileCache = await r.json(); 
            render(); 
            renderBC();
        } catch(e) { showToast("Ошибка загрузки"); }
    }

    function render() {
        const list = document.getElementById('file-list');
        list.innerHTML = fileCache.length ? '' : '<tr><td colspan="3" style="text-align:center; padding:60px; color:#999;">Пусто</td></tr>';
        
        fileCache.forEach(f => {
            const tr = document.createElement('tr'); 
            tr.className = 'file-row';
            const isD = f.mimeType.includes('folder');
            tr.innerHTML = \`
                <td><i class="fa \${isD?'fa-folder':'fa-file-lines'}" style="margin-right:12px; color:\${isD?'#fbc02d':'#455a64'}; font-size:20px;"></i> \${f.name}</td>
                <td class="hide-mobile">\${new Date(f.modifiedTime).toLocaleDateString()}</td>
                <td class="hide-mobile">\${f.size ? (f.size/1024/1024).toFixed(1)+' MB' : '—'}</td>
            \`;
            tr.onclick = () => isD ? nav(f.id, f.name) : openPreview(f.id, f.name);
            tr.oncontextmenu = (e) => {
                e.preventDefault(); 
                focusFile = f;
                const m = document.getElementById('ctx-menu');
                m.style.display = 'block'; 
                m.style.left = e.clientX+'px'; 
                m.style.top = e.clientY+'px';
            };
            list.appendChild(tr);
        });
    }

    function nav(id, name) {
        const idx = path.findIndex(x => x.id === id);
        if(idx !== -1) path = path.slice(0, idx+1);
        else path.push({id, name});
        load(id); 
        toggleSidebar(true);
    }

    function renderBC() {
        document.getElementById('bc-container').innerHTML = path.map(p => 
            \`<span style="cursor:pointer; padding:4px 8px;" onclick="nav('\${p.id}', '\${p.name}')">\${p.name}</span>\`
        ).join(' <i class="fa fa-chevron-right" style="font-size:10px; margin:0 5px; opacity:0.3;"></i> ');
    }

    function toggleSidebar(force) {
        const s = document.getElementById('sidebar'); 
        const o = document.getElementById('overlay');
        if(force) { s.classList.remove('open'); o.classList.remove('active'); return; }
        s.classList.toggle('open'); 
        o.classList.toggle('active');
    }

    function toggleNew(e) { 
        e.stopPropagation(); 
        const m = document.getElementById('new-menu'); 
        m.style.display = m.style.display==='block'?'none':'block'; 
    }

    function openPreview(id, name) {
        const tid = id || focusFile.id; 
        document.getElementById('pv-title').innerText = name || focusFile.name;
        document.getElementById('pv-frame').src = \`https://drive.google.com/file/d/\${tid}/preview\`;
        document.getElementById('modal-pv').style.display = 'flex';
    }

    function closePreview() { 
        document.getElementById('modal-pv').style.display='none'; 
        document.getElementById('pv-frame').src=''; 
    }

    async function handleUpload(files) { 
        for(let f of files){ 
            showToast(\`Загрузка: \${f.name}...\`);
            const fd=new FormData(); 
            fd.append('file',f); 
            fd.append('folderId',currentId); 
            await fetch('/storage/api/upload',{method:'POST',body:fd}); 
        } 
        load(currentId); 
    }

    async function createNewFolder() { 
        const n=prompt('Имя папки:'); 
        if(n){ 
            await fetch('/storage/api/mkdir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parentId:currentId,name:n})}); 
            load(currentId); 
        } 
    }

    async function deleteItem() { 
        if(confirm('Удалить?')){ 
            await fetch(\`/storage/api/delete/\${focusFile.id}\`, {method:'DELETE'}); 
            load(currentId); 
        } 
    }

    async function renameItem() { 
        const n=prompt('Новое имя:', focusFile.name); 
        if(n){ 
            await fetch('/storage/api/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:focusFile.id,name:n})}); 
            load(currentId); 
        } 
    }

    function showToast(msg) {
        const t = document.getElementById('toast');
        t.innerText = msg; t.style.display = 'block';
        setTimeout(() => t.style.display = 'none', 3000);
    }

    window.onclick = () => { 
        document.getElementById('ctx-menu').style.display='none'; 
        document.getElementById('new-menu').style.display='none'; 
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
                q: \`'\${req.query.folderId || 'root'}' in parents and trashed = false\`,
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

    console.log("✅ TITANIUM DOMOLINK v44.0: FULL MONOLITH LOADED");
};
