const multer = require('multer');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

/**
 * ============================================================================
 * TITANIUM DRIVE v35.0 | PROFESSIONAL STORAGE ENGINE
 * ----------------------------------------------------------------------------
 * РАЗРАБОТКА: GEMINI (2026) СПЕЦИАЛЬНО ДЛЯ ЕВГЕНИЯ АНАТОЛЬЕВИЧА
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * СВИДЕТЕЛЬСТВО РЦИС: № 0849-643-137 от 10.01.2026
 * ============================================================================
 */

module.exports = function(app, context) {
    const { drive, google, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const upload = multer({ dest: 'uploads/' });

    // --- ГРАФИЧЕСКИЙ ИНТЕРФЕЙС (ULTIMATE UI) ---
    const UI = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>X-Commander | Titanium Drive</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --g-blue: #1a73e8; --g-red: #d93025; --g-gray: #5f6368;
            --g-text: #3c4043; --g-border: #dadce0; --g-hover: #f1f3f4;
            --g-shadow: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15);
            --sidebar-width: 280px;
        }

        * { box-sizing: border-box; outline: none; transition: all 0.2s ease; }
        body, html { margin: 0; padding: 0; height: 100%; font-family: 'Roboto', sans-serif; color: var(--g-text); background: #fff; overflow: hidden; }

        /* HEADER */
        header {
            height: 64px; padding: 0 24px; border-bottom: 1px solid var(--g-border);
            display: flex; align-items: center; justify-content: space-between;
            background: #fff; position: relative; z-index: 1000;
        }
        .logo-section { display: flex; align-items: center; width: var(--sidebar-width); gap: 15px; cursor: pointer; }
        .logo-section i { font-size: 32px; color: var(--g-blue); }
        .logo-section span { font-family: 'Google Sans'; font-size: 22px; color: #5f6368; font-weight: 400; }

        .search-bar { flex: 1; max-width: 720px; position: relative; }
        .search-bar i { position: absolute; left: 16px; top: 14px; color: #5f6368; }
        .search-bar input {
            width: 100%; background: #f1f3f4; border: none; padding: 12px 12px 12px 52px;
            border-radius: 8px; font-size: 16px; border: 1px solid transparent;
        }
        .search-bar input:focus { background: #fff; border-color: #eee; box-shadow: var(--g-shadow); }

        /* MAIN LAYOUT */
        .wrapper { display: flex; height: calc(100vh - 64px); }

        aside { width: var(--sidebar-width); padding: 16px 0; display: flex; flex-direction: column; background: #fff; }
        .create-btn {
            margin: 0 16px 20px; width: 140px; height: 48px; border-radius: 24px;
            box-shadow: var(--g-shadow); background: #fff; display: flex; align-items: center;
            justify-content: center; gap: 12px; cursor: pointer; font-weight: 500; font-family: 'Google Sans';
        }
        .create-btn:hover { box-shadow: 0 4px 8px rgba(0,0,0,0.15); background: #f8f9fa; }

        .menu-item {
            height: 40px; margin-right: 8px; border-radius: 0 20px 20px 0;
            display: flex; align-items: center; padding: 0 24px; cursor: pointer;
            font-size: 14px; color: #3c4043;
        }
        .menu-item i { width: 34px; font-size: 18px; color: #5f6368; }
        .menu-item:hover { background: #f1f3f4; }
        .menu-item.active { background: #e8f0fe; color: #1a73e8; font-weight: 500; }
        .menu-item.active i { color: #1a73e8; }

        /* CONTENT */
        main { flex: 1; padding: 0 24px; overflow-y: auto; position: relative; }
        .breadcrumbs { height: 56px; display: flex; align-items: center; font-size: 18px; font-family: 'Google Sans'; color: #5f6368; }
        .bc-item { padding: 4px 8px; border-radius: 4px; cursor: pointer; }
        .bc-item:hover { background: #eee; }

        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th {
            text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--g-border);
            font-size: 13px; color: #5f6368; position: sticky; top: 0; background: #fff;
        }
        .data-table td { padding: 12px 8px; border-bottom: 1px solid #eee; font-size: 14px; }
        .data-row { cursor: pointer; animation: fadeIn 0.3s ease; }
        .data-row:hover { background: #f8f9fa; }
        .data-row.selected { background: #e8f0fe; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        /* ICONS */
        .f-icon { width: 40px; text-align: center; font-size: 20px; }
        .color-folder { color: #5f6368; }
        .color-pdf { color: #ea4335; }
        .color-excel { color: #1e8e3e; }
        .color-word { color: #1a73e8; }
        .color-img { color: #f4b400; }

        /* CONTEXT MENU */
        #ctx-menu {
            position: fixed; display: none; background: #fff; box-shadow: 0 8px 16px rgba(0,0,0,0.15);
            border: 1px solid #ddd; border-radius: 4px; padding: 5px 0; z-index: 5000; min-width: 200px;
        }
        .ctx-item { padding: 10px 16px; font-size: 14px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .ctx-item:hover { background: #f1f3f4; }
        .ctx-item i { width: 18px; color: #5f6368; }

        /* PREVIEW MODAL */
        #pv-modal {
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.9); z-index: 9999; flex-direction: column;
        }
        .pv-top { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; color: #fff; }
        #pv-frame { flex: 1; border: none; width: 85%; margin: 0 auto 30px; background: #fff; border-radius: 4px; }

        /* BUTTONS */
        .btn-action { background: none; border: none; padding: 8px; cursor: pointer; border-radius: 50%; color: #5f6368; }
        .btn-action:hover { background: #eee; color: #000; }
        
        #toast { position: fixed; bottom: 30px; left: 30px; background: #323232; color: #fff; padding: 12px 24px; border-radius: 4px; display: none; z-index: 10000; }
    </style>
</head>
<body>

<header>
    <div class="logo-section" onclick="navTo('root', 'Мой диск')">
        <i class="fa-solid fa-layer-group"></i>
        <span>X-Commander</span>
    </div>
    <div class="search-bar">
        <i class="fa fa-search"></i>
        <input type="text" id="q-search" placeholder="Поиск в Titanium Drive..." oninput="doSearch()">
    </div>
    <div style="display:flex; gap:20px; align-items:center;">
        <i class="fa-solid fa-circle-question" style="color:var(--g-gray); font-size:20px;"></i>
        <div style="width:34px; height:34px; border-radius:50%; background:#1a73e8; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700;">E</div>
    </div>
</header>

<div class="wrapper">
    <aside>
        <div class="create-btn" onclick="showNewMenu(event)">
            <img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" style="width:20px;">
            Создать
        </div>
        <div class="menu-item active" onclick="navTo('root', 'Мой диск')"><i class="fa fa-hdd"></i> Мой диск</div>
        <div class="menu-item" onclick="navTo('${MY_ROOT_ID}', 'Логистика')"><i class="fa fa-truck-fast"></i> Логистика</div>
        <div class="menu-item" onclick="navTo('${MERCH_ROOT_ID}', 'Мерчандайзинг')"><i class="fa fa-boxes-stacked"></i> Мерч</div>
        <div class="menu-item"><i class="fa fa-clock"></i> Недавние</div>
        <div class="menu-item"><i class="fa fa-trash-can"></i> Корзина</div>
    </aside>

    <main>
        <div class="breadcrumbs" id="bc-cont">Мой диск</div>
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width:50%">Название</th>
                    <th style="width:15%">Владелец</th>
                    <th style="width:20%">Последнее изменение</th>
                    <th style="width:15%">Размер</th>
                </tr>
            </thead>
            <tbody id="files-list"></tbody>
        </table>
    </main>
</div>

<div id="ctx-menu">
    <div class="ctx-item" onclick="doView()"><i class="fa fa-eye"></i> Предпросмотр</div>
    <div class="ctx-item" onclick="doDownload()"><i class="fa fa-cloud-download"></i> Скачать</div>
    <div class="ctx-item" onclick="doRename()"><i class="fa fa-pen-to-square"></i> Переименовать</div>
    <div class="ctx-item" onclick="doDelete()" style="color:var(--g-red)"><i class="fa fa-trash-can"></i> Удалить</div>
</div>

<div id="pv-modal">
    <div class="pv-top">
        <span id="pv-title" style="font-family:'Google Sans'; font-size:18px;"></span>
        <div style="display:flex; gap:25px; align-items:center;">
            <i class="fa fa-download" onclick="doDownload()" style="cursor:pointer;"></i>
            <i class="fa fa-xmark" onclick="closePv()" style="font-size:24px; cursor:pointer;"></i>
        </div>
    </div>
    <iframe id="pv-frame"></iframe>
</div>

<div id="new-menu" style="display:none; position:fixed; top:120px; left:20px; background:#fff; box-shadow:var(--g-shadow); border-radius:4px; padding:8px 0; z-index:2000; width:220px;">
    <div class="ctx-item" onclick="makeDir()"><i class="fa fa-folder-plus"></i> Новая папка</div>
    <div class="ctx-item" onclick="document.getElementById('file-up').click()"><i class="fa fa-file-upload"></i> Загрузить файл</div>
</div>

<input type="file" id="file-up" style="display:none" multiple onchange="uploadFiles(this.files)">
<div id="toast"></div>

<script>
    let curFolder = 'root';
    let breadStack = [{id:'root', name:'Мой диск'}];
    let focusFile = {id:null, name:null};
    let cache = [];

    async function refresh(id) {
        curFolder = id;
        const res = await fetch(\`/storage/api/list?folderId=\${id}\`);
        cache = await res.json();
        render();
        renderBC();
    }

    function render() {
        const body = document.getElementById('files-list');
        body.innerHTML = cache.length ? '' : '<tr><td colspan="4" style="text-align:center; padding:50px; color:#999;">Здесь пока пусто</td></tr>';
        
        cache.forEach(f => {
            const tr = document.createElement('tr');
            tr.className = 'data-row';
            const isDir = f.mimeType.includes('folder');
            
            tr.innerHTML = \`
                <td><i class="fa \${getIcon(f.mimeType)} f-icon"></i> \${f.name}</td>
                <td>Я</td>
                <td>\${new Date(f.modifiedTime).toLocaleDateString()}</td>
                <td>\${f.size ? (f.size/1024/1024).toFixed(1) + ' МБ' : '—'}</td>
            \`;

            tr.onclick = () => isDir ? navTo(f.id, f.name) : openPv(f.id, f.name);
            tr.oncontextmenu = (e) => {
                e.preventDefault();
                focusFile = {id: f.id, name: f.name};
                const cm = document.getElementById('ctx-menu');
                cm.style.display = 'block'; cm.style.left = e.clientX+'px'; cm.style.top = e.clientY+'px';
                document.querySelectorAll('.data-row').forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
            };
            body.appendChild(tr);
        });
    }

    function getIcon(mime) {
        if(mime.includes('folder')) return 'fa-folder color-folder';
        if(mime.includes('pdf')) return 'fa-file-pdf color-pdf';
        if(mime.includes('spreadsheet') || mime.includes('excel')) return 'fa-file-excel color-excel';
        if(mime.includes('word') || mime.includes('document')) return 'fa-file-word color-word';
        if(mime.includes('image')) return 'fa-file-image color-img';
        return 'fa-file-lines';
    }

    function navTo(id, name) {
        const i = breadStack.findIndex(x => x.id === id);
        if(i !== -1) breadStack = breadStack.slice(0, i+1);
        else breadStack.push({id, name});
        refresh(id);
    }

    function renderBC() {
        document.getElementById('bc-cont').innerHTML = breadStack.map(b => 
            \`<span class="bc-item" onclick="navTo('\${b.id}', '\${b.name}')">\${b.name}</span>\`
        ).join(' <i class="fa fa-chevron-right" style="font-size:10px; margin:0 5px; opacity:0.4;"></i> ');
    }

    async function uploadFiles(files) {
        for(let f of files) {
            msg(\`Загрузка: \${f.name}...\`);
            const fd = new FormData(); fd.append('file', f); fd.append('folderId', curFolder);
            await fetch('/storage/api/upload', {method:'POST', body:fd});
        }
        refresh(curFolder);
    }

    async function makeDir() {
        const n = prompt('Название новой папки:');
        if(!n) return;
        await fetch('/storage/api/mkdir', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({parentId: curFolder, name: n})
        });
        refresh(curFolder);
    }

    async function doDelete() {
        if(confirm(\`Удалить "\${focusFile.name}"?\`)) {
            await fetch(\`/storage/api/delete/\${focusFile.id}\`, {method:'DELETE'});
            refresh(curFolder);
        }
    }

    async function doRename() {
        const n = prompt('Новое имя:', focusFile.name);
        if(!n || n === focusFile.name) return;
        await fetch('/storage/api/rename', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({id: focusFile.id, name: n})
        });
        refresh(curFolder);
    }

    function doDownload() { window.open(\`/storage/api/download?id=\${focusFile.id}\`); }
    function openPv(id, n) {
        document.getElementById('pv-title').innerText = n;
        document.getElementById('pv-frame').src = \`https://drive.google.com/file/d/\${id}/preview\`;
        document.getElementById('pv-modal').style.display = 'flex';
        focusFile = {id, name: n};
    }
    function closePv() { document.getElementById('pv-modal').style.display = 'none'; document.getElementById('pv-frame').src = ''; }
    function msg(m) { const t = document.getElementById('toast'); t.innerText = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3000); }
    function showNewMenu(e) { 
        e.stopPropagation();
        const m = document.getElementById('new-menu');
        m.style.display = m.style.display === 'none' ? 'block' : 'none';
    }
    function doSearch() {
        const q = document.getElementById('q-search').value.toLowerCase();
        const filt = cache.filter(f => f.name.toLowerCase().includes(q));
        renderFiltered(filt);
    }
    function renderFiltered(files) {
        // Та же логика рендера, но для фильтрованного списка
        cache = files; render(); refresh(curFolder); // Упрощенно для примера
    }

    window.onclick = () => { 
        document.getElementById('ctx-menu').style.display = 'none'; 
        document.getElementById('new-menu').style.display = 'none';
    };
    refresh('root');
</script>
</body>
</html>
    `;

    // --- СЕРВЕРНАЯ ЧАСТЬ (API) ---

    app.get('/storage', (req, res) => res.send(UI));

    // 1. Список
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

    // 2. Загрузка
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

    // 3. Создание папки
    app.post('/storage/api/mkdir', express.json(), async (req, res) => {
        try {
            await drive.files.create({
                resource: { name: req.body.name, mimeType: 'application/vnd.google-apps.folder', parents: [req.body.parentId] }
            });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    // 4. Переименование
    app.post('/storage/api/rename', express.json(), async (req, res) => {
        try {
            await drive.files.update({ fileId: req.body.id, resource: { name: req.body.name } });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    // 5. Удаление
    app.delete('/storage/api/delete/:id', async (req, res) => {
        try {
            await drive.files.update({ fileId: req.params.id, resource: { trashed: true } });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    // 6. Скачивание
    app.get('/storage/api/download', async (req, res) => {
        try {
            const f = await drive.files.get({ fileId: req.query.id, fields: 'name' });
            const stream = await drive.files.get({ fileId: req.query.id, alt: 'media' }, { responseType: 'stream' });
            res.setHeader('Content-Disposition', `attachment; filename=${encodeURI(f.data.name)}`);
            stream.data.pipe(res);
        } catch (e) { res.status(500).send(e.message); }
    });

    console.log("✅ TITANIUM DRIVE v35.0 ACTIVATED [LOGIST-X]");
};
