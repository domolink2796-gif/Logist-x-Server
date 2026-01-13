const multer = require('multer');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

/**
 * X-PLATFORM STORAGE PRO ENGINE v4.0
 * --------------------------------------------------
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * СВИДЕТЕЛЬСТВО РЦИС: № 0849-643-137 от 10.01.2026
 * --------------------------------------------------
 */

module.exports = function(app, context) {
    const { drive, google, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const upload = multer({ dest: 'uploads/' });

    const UI = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>X-Platform | Storage Pro Explorer</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --g-blue: #1a73e8;
            --g-blue-hover: #174ea6;
            --g-red: #d93025;
            --g-gray: #5f6368;
            --g-text: #3c4043;
            --g-border: #dadce0;
            --g-bg: #ffffff;
            --g-hover: #f1f3f4;
            --g-shadow: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15);
            --sidebar-width: 256px;
        }

        * { box-sizing: border-box; outline: none; -webkit-font-smoothing: antialiased; }
        body, html { margin: 0; padding: 0; height: 100%; font-family: 'Roboto', sans-serif; color: var(--g-text); background: var(--g-bg); overflow: hidden; }

        /* HEADER SECTION */
        header {
            height: 64px; padding: 0 16px; border-bottom: 1px solid var(--g-border);
            display: flex; align-items: center; justify-content: space-between;
            position: relative; z-index: 100; background: #fff;
        }
        .brand-box { display: flex; align-items: center; width: var(--sidebar-width); gap: 12px; cursor: pointer; }
        .brand-box i { font-size: 28px; color: var(--g-blue); }
        .brand-box span { font-family: 'Google Sans', sans-serif; font-size: 22px; color: var(--g-gray); }

        .search-container { flex: 1; max-width: 720px; position: relative; margin: 0 40px; }
        .search-container i { position: absolute; left: 16px; top: 14px; color: var(--g-gray); font-size: 18px; }
        .search-container input {
            width: 100%; background: #f1f3f4; border: 1px solid transparent;
            padding: 12px 12px 12px 52px; border-radius: 8px; font-size: 16px;
            transition: background 0.2s, box-shadow 0.2s;
        }
        .search-container input:focus { background: #fff; border-color: transparent; box-shadow: var(--g-shadow); }

        .header-tools { width: var(--sidebar-width); display: flex; justify-content: flex-end; align-items: center; gap: 20px; }
        .user-avatar {
            width: 34px; height: 34px; border-radius: 50%; background: #673ab7;
            color: #fff; display: flex; align-items: center; justify-content: center;
            font-size: 15px; font-weight: 500; cursor: pointer;
        }

        /* LAYOUT */
        .app-container { display: flex; height: calc(100vh - 64px); }

        /* SIDEBAR */
        aside { width: var(--sidebar-width); padding-top: 12px; display: flex; flex-direction: column; }
        .btn-create {
            margin: 8px 0 16px 16px; width: 120px; height: 48px; border-radius: 24px;
            border: 1px solid var(--g-border); background: #fff; display: flex; align-items: center;
            justify-content: center; gap: 12px; cursor: pointer; font-family: 'Google Sans';
            font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: 0.2s;
        }
        .btn-create:hover { background: #f8f9fa; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .btn-create img { width: 22px; }

        .nav-item {
            height: 40px; margin-right: 8px; border-radius: 0 20px 20px 0;
            display: flex; align-items: center; padding: 0 24px; cursor: pointer;
            font-size: 14px; color: var(--g-text); transition: background 0.1s;
        }
        .nav-item:hover { background: var(--g-hover); }
        .nav-item.active { background: #e8f0fe; color: var(--g-blue); font-weight: 500; }
        .nav-item i { width: 34px; font-size: 18px; color: var(--g-gray); }
        .nav-item.active i { color: var(--g-blue); }

        /* MAIN CONTENT AREA */
        main { flex: 1; display: flex; flex-direction: column; padding: 0 20px; overflow-y: auto; background: #fff; position: relative; }
        .bc-bar { height: 56px; display: flex; align-items: center; font-size: 18px; color: var(--g-gray); font-family: 'Google Sans'; }
        .bc-node { padding: 6px 10px; border-radius: 4px; cursor: pointer; }
        .bc-node:hover { background: var(--g-hover); color: var(--g-blue); }

        .file-list-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .file-list-table th {
            position: sticky; top: 0; background: #fff; text-align: left;
            padding: 10px 8px; border-bottom: 1px solid var(--g-border);
            font-size: 13px; color: var(--g-gray); font-weight: 500; z-index: 10;
        }
        .file-list-table td { padding: 12px 8px; border-bottom: 1px solid var(--g-border); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .file-row { transition: background 0.1s; }
        .file-row:hover { background: #f1f3f4; cursor: pointer; }
        .file-row.selected { background: #e8f0fe; }
        
        .f-icon-cell { width: 44px; text-align: center; font-size: 20px; }
        .icon-folder { color: var(--g-gray); }
        .icon-pdf { color: #ea4335; }
        .icon-excel { color: #1e8e3e; }
        .icon-image { color: #f4b400; }

        /* CONTEXT MENU */
        #context-menu {
            position: fixed; display: none; background: #fff; box-shadow: 0 8px 16px rgba(0,0,0,0.2);
            border: 1px solid var(--g-border); border-radius: 4px; padding: 6px 0; z-index: 2000; min-width: 220px;
        }
        .cm-item { padding: 10px 16px; font-size: 14px; display: flex; align-items: center; gap: 14px; cursor: pointer; color: var(--g-text); }
        .cm-item:hover { background: var(--g-hover); }
        .cm-item i { width: 20px; color: var(--g-gray); font-size: 16px; }

        /* MODALS */
        #preview-modal {
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); z-index: 5000; flex-direction: column;
        }
        .pm-header { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; color: #fff; }
        .pm-header i { font-size: 24px; cursor: pointer; opacity: 0.8; }
        .pm-header i:hover { opacity: 1; }
        #pv-frame { flex: 1; border: none; width: 90%; margin: 0 auto 30px; background: #fff; border-radius: 4px; box-shadow: 0 0 20px rgba(0,0,0,0.5); }

        /* TOAST & LOADER */
        #toast {
            position: fixed; bottom: 48px; left: 24px; background: #323232; color: #fff;
            padding: 12px 24px; border-radius: 4px; display: none; z-index: 9999; font-size: 14px;
        }
        .loading-bar { position: absolute; top: 0; left: 0; height: 3px; background: var(--g-blue); width: 0; transition: width 0.3s; }

        /* FOOTER */
        footer {
            height: 32px; border-top: 1px solid var(--g-border); background: #f8f9fa;
            display: flex; align-items: center; padding: 0 16px; font-size: 11px; color: var(--g-gray);
        }
        .lic-tag { margin-left: auto; display: flex; align-items: center; gap: 8px; color: #2e7d32; font-weight: 700; }
    </style>
</head>
<body>

<div id="loading-indicator" class="loading-bar"></div>

<header>
    <div class="brand-box" onclick="navigateTo('root', 'Мой диск')">
        <i class="fa-solid fa-cloud-arrow-up"></i>
        <span>X-Platform</span>
    </div>
    <div class="search-container">
        <i class="fa fa-search"></i>
        <input type="text" id="global-search" placeholder="Поиск файлов в Logist X..." oninput="filterFiles()">
    </div>
    <div class="header-tools">
        <i class="fa-regular fa-bell" style="font-size: 20px; color: var(--g-gray); cursor: pointer;"></i>
        <div class="user-avatar">EА</div>
    </div>
</header>

<div class="app-container">
    <aside>
        <div class="btn-create" onclick="triggerUpload()">
            <img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="">
            Создать
        </div>
        <div class="nav-item active" id="nav-root" onclick="navigateTo('root', 'Мой диск')">
            <i class="fa fa-hdd"></i> Мой диск
        </div>
        <div class="nav-item" onclick="navigateTo('${MY_ROOT_ID}', 'Логистика')">
            <i class="fa fa-truck-fast"></i> Логистика
        </div>
        <div class="nav-item" onclick="navigateTo('${MERCH_ROOT_ID}', 'Мерч')">
            <i class="fa fa-shirt"></i> Мерч
        </div>
        <div class="nav-item"><i class="fa fa-clock"></i> Недавние</div>
        <div class="nav-item"><i class="fa fa-star"></i> Помеченные</div>
        <div class="nav-item"><i class="fa fa-trash-can"></i> Корзина</div>
        
        <div style="margin-top: auto; padding: 20px;">
            <div style="font-size: 13px; color: var(--g-gray); margin-bottom: 10px;">
                <i class="fa fa-cloud" style="margin-right: 10px;"></i> 1.2 ГБ из 15 ГБ
            </div>
            <div style="height: 4px; background: #e0e0e0; border-radius: 2px; overflow: hidden;">
                <div style="width: 15%; height: 100%; background: var(--g-blue);"></div>
            </div>
        </div>
    </aside>

    <main id="explorer-main">
        <div class="bc-bar" id="breadcrumbs">Мой диск</div>
        <table class="file-list-table">
            <thead>
                <tr>
                    <th style="width: 50%">Название</th>
                    <th style="width: 15%">Владелец</th>
                    <th style="width: 20%">Последнее изменение</th>
                    <th style="width: 15%">Размер файла</th>
                </tr>
            </thead>
            <tbody id="file-body"></tbody>
        </table>
    </main>
</div>

<div id="context-menu">
    <div class="cm-item" onclick="actionPreview()"><i class="fa fa-eye"></i> Предпросмотр</div>
    <div class="cm-item" onclick="actionDownload()"><i class="fa fa-download"></i> Скачать</div>
    <div class="cm-item" onclick="actionRename()"><i class="fa fa-pen"></i> Переименовать</div>
    <hr style="border: none; border-top: 1px solid var(--g-border); margin: 5px 0;">
    <div class="cm-item" style="color: var(--g-red)" onclick="actionDelete()"><i class="fa fa-trash"></i> Удалить</div>
</div>

<div id="preview-modal">
    <div class="pm-header">
        <span id="pv-filename" style="font-family: 'Google Sans'; font-size: 18px;"></span>
        <div style="display: flex; gap: 24px; align-items: center;">
            <i class="fa fa-download" onclick="actionDownload()"></i>
            <i class="fa fa-xmark" onclick="closePreview()"></i>
        </div>
    </div>
    <iframe id="pv-frame"></iframe>
</div>

<div id="toast">Сообщение...</div>
<input type="file" id="hidden-upload" multiple style="display:none" onchange="processUpload(this.files)">

<footer>
    <i class="fa-solid fa-lock" style="font-size: 12px;"></i>
    <span style="margin-left: 10px;">Система управления данными X-Platform Pro</span>
    <div class="lic-tag">
        <i class="fa-solid fa-certificate"></i>
        Свидетельство РЦИС № 0849-643-137 | Правообладатель: Никитин Е.А.
    </div>
</footer>

<script>
    let currentFolderId = 'root';
    let pathStack = [{id: 'root', name: 'Мой диск'}];
    let selectedFile = { id: null, name: null };
    let allFilesCache = [];

    // ИНИЦИАЛИЗАЦИЯ И НАВИГАЦИЯ
    async function loadFolder(id) {
        currentFolderId = id;
        setLoading(30);
        const response = await fetch(\`/storage/api/list?folderId=\${id}\`);
        allFilesCache = await response.json();
        setLoading(100);
        renderFiles(allFilesCache);
        renderBreadcrumbs();
    }

    function renderFiles(files) {
        const tbody = document.getElementById('file-body');
        tbody.innerHTML = '';
        if (files.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; color: #999;">Папка пуста</td></tr>';
            return;
        }

        files.forEach(f => {
            const tr = document.createElement('tr');
            tr.className = 'file-row';
            const isDir = f.mimeType === 'application/vnd.google-apps.folder';
            const iconClass = getFileIcon(f.mimeType);
            
            tr.innerHTML = \`
                <td><i class="fa \${iconClass} f-icon-cell"></i> \${f.name}</td>
                <td>Я</td>
                <td>\${new Date(f.modifiedTime).toLocaleDateString('ru-RU', {day:'numeric', month:'short', year:'numeric'})}</td>
                <td>\${f.size ? (f.size/(1024*1024)).toFixed(1) + ' МБ' : '—'}</td>
            \`;

            tr.onclick = () => isDir ? navigateTo(f.id, f.name) : openPreview(f.id, f.name);
            tr.oncontextmenu = (e) => {
                e.preventDefault();
                selectedFile = { id: f.id, name: f.name };
                showCM(e.clientX, e.clientY);
                document.querySelectorAll('.file-row').forEach(el => el.classList.remove('selected'));
                tr.classList.add('selected');
            };
            tbody.appendChild(tr);
        });
    }

    function navigateTo(id, name) {
        const idx = pathStack.findIndex(p => p.id === id);
        if (idx !== -1) pathStack = pathStack.slice(0, idx + 1);
        else pathStack.push({id, name});
        loadFolder(id);
    }

    function renderBreadcrumbs() {
        const container = document.getElementById('breadcrumbs');
        container.innerHTML = pathStack.map((p, i) => 
            \`<span class="bc-node" onclick="navigateTo('\${p.id}', '\${p.name}')">\${p.name}</span>\`
        ).join(' <i class="fa fa-chevron-right" style="font-size: 10px; opacity: 0.5;"></i> ');
    }

    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    function getFileIcon(mime) {
        if (mime.includes('folder')) return 'fa-folder icon-folder';
        if (mime.includes('pdf')) return 'fa-file-pdf icon-pdf';
        if (mime.includes('spreadsheet') || mime.includes('excel')) return 'fa-file-excel icon-excel';
        if (mime.includes('image')) return 'fa-file-image icon-image';
        if (mime.includes('video')) return 'fa-file-video icon-pdf';
        return 'fa-file-lines';
    }

    function setLoading(val) {
        const bar = document.getElementById('loading-indicator');
        bar.style.width = val + '%';
        if (val === 100) setTimeout(() => bar.style.width = '0', 500);
    }

    function showToast(msg) {
        const t = document.getElementById('toast');
        t.innerText = msg; t.style.display = 'block';
        setTimeout(() => t.style.display = 'none', 3000);
    }

    // ДЕЙСТВИЯ (API CALLS)
    async function processUpload(files) {
        for (let file of files) {
            showToast(\`Загрузка: \${file.name}...\`);
            const fd = new FormData();
            fd.append('file', file);
            fd.append('folderId', currentFolderId);
            await fetch('/storage/api/upload', { method: 'POST', body: fd });
        }
        loadFolder(currentFolderId);
    }

    async function actionDelete() {
        if (!confirm(\`Удалить "\${selectedFile.name}"?\`)) return;
        await fetch(\`/storage/api/file/\${selectedFile.id}\`, { method: 'DELETE' });
        loadFolder(currentFolderId);
    }

    async function actionRename() {
        const newName = prompt('Введите новое имя:', selectedFile.name);
        if (!newName || newName === selectedFile.name) return;
        await fetch('/storage/api/rename', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: selectedFile.id, name: newName })
        });
        loadFolder(currentFolderId);
    }

    function actionDownload() { window.open(\`/storage/api/download?id=\${selectedFile.id}\`); }
    
    function actionPreview() { openPreview(selectedFile.id, selectedFile.name); }

    function openPreview(id, name) {
        document.getElementById('pv-filename').innerText = name;
        document.getElementById('pv-frame').src = \`https://drive.google.com/file/d/\${id}/preview\`;
        document.getElementById('preview-modal').style.display = 'flex';
        selectedFile = { id, name };
    }

    function closePreview() {
        document.getElementById('preview-modal').style.display = 'none';
        document.getElementById('pv-frame').src = '';
    }

    function showCM(x, y) {
        const cm = document.getElementById('context-menu');
        cm.style.display = 'block';
        cm.style.left = x + 'px'; cm.style.top = y + 'px';
    }

    function filterFiles() {
        const query = document.getElementById('global-search').value.toLowerCase();
        const filtered = allFilesCache.filter(f => f.name.toLowerCase().includes(query));
        renderFiles(filtered);
    }

    function triggerUpload() { document.getElementById('hidden-upload').click(); }

    window.onclick = () => { document.getElementById('context-menu').style.display = 'none'; };
    
    // START
    loadFolder('root');
</script>
</body>
</html>
    `;

    // --- API ROUTES (BACKEND LOGIC) ---
    app.get('/storage', (req, res) => res.send(UI));

    // 1. Получение списка файлов
    app.get('/storage/api/list', async (req, res) => {
        try {
            const r = await drive.files.list({
                q: `'${req.query.folderId || 'root'}' in parents and trashed = false`,
                fields: 'files(id, name, mimeType, size, modifiedTime)',
                orderBy: 'folder, name'
            });
            res.json(r.data.files);
        } catch (e) { res.status(500).send(e.message); }
    });

    // 2. Загрузка файла (Multer + Drive)
    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            const meta = { name: req.file.originalname, parents: [req.body.folderId] };
            const media = { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) };
            await drive.files.create({ resource: meta, media });
            fs.unlinkSync(req.file.path);
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    // 3. Переименование
    app.post('/storage/api/rename', express.json(), async (req, res) => {
        try {
            await drive.files.update({ fileId: req.body.id, resource: { name: req.body.name } });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    // 4. Удаление (Trash)
    app.delete('/storage/api/file/:id', async (req, res) => {
        try {
            await drive.files.update({ fileId: req.params.id, resource: { trashed: true } });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    // 5. Прокси-скачивание (чтобы не светить прямые ссылки)
    app.get('/storage/api/download', async (req, res) => {
        try {
            const file = await drive.files.get({ fileId: req.query.id, fields: 'name' });
            const response = await drive.files.get({ fileId: req.query.id, alt: 'media' }, { responseType: 'stream' });
            res.setHeader('Content-Disposition', `attachment; filename=${encodeURI(file.data.name)}`);
            response.data.pipe(res);
        } catch (e) { res.status(500).send(e.message); }
    });
};
