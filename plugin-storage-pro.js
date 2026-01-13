
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

/**
 * ============================================================================
 * TITANIUM DOMOLINK v43.0 | ПОЛНАЯ РАЗВЕРНУТАЯ СБОРКА
 * ----------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * СТАТУС: БЕЗ СОКРАЩЕНИЙ (Full Expanded Edition)
 * ============================================================================
 */

// ТВОЯ ПРОВЕРЕННАЯ ССЫЛКА НА ЛОГОТИП:
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
    <title>DOMOLINK | Cloud Drive</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --brand-bg: #0a0a0a; 
            --accent: #f0b90b; 
            --gray: #5f6368;
            --text-main: #3c4043; 
            --border-color: #dadce0; 
            --bg-light: #f1f3f4;
            --sidebar-width: 280px;
        }

        * { 
            box-sizing: border-box; 
            -webkit-tap-highlight-color: transparent; 
            outline: none; 
            margin: 0; 
            padding: 0; 
        }

        body, html { 
            height: 100%; 
            font-family: 'Roboto', sans-serif; 
            color: var(--text-main); 
            background: #fff; 
            overflow: hidden; 
        }

        /* ШАПКА САЙТА */
        header {
            height: 64px;
            padding: 0 20px;
            border-bottom: 2px solid var(--accent);
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--brand-bg);
            position: relative;
            z-index: 2000;
            color: #fff;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .burger {
            display: none;
            font-size: 24px;
            color: var(--accent);
            cursor: pointer;
            padding: 5px;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: 'Google Sans', sans-serif;
            font-size: 20px;
            font-weight: 700;
            color: #fff;
            text-decoration: none;
        }

        .logo img {
            height: 42px;
            width: auto;
            border-radius: 4px;
        }

        /* ОСНОВНОЙ КОНТЕЙНЕР */
        .app-container {
            display: flex;
            height: calc(100vh - 64px);
            position: relative;
        }

        /* БОКОВАЯ ПАНЕЛЬ */
        aside {
            width: var(--sidebar-width);
            height: 100%;
            border-right: 1px solid #eee;
            background: #fff;
            display: flex;
            flex-direction: column;
            padding: 20px 0;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1500;
        }

        .nav-item {
            height: 48px;
            margin: 4px 12px;
            border-radius: 24px;
            display: flex;
            align-items: center;
            padding: 0 20px;
            cursor: pointer;
            color: var(--text-main);
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            transition: 0.2s;
        }

        .nav-item i {
            width: 34px;
            font-size: 18px;
            color: var(--gray);
        }

        .nav-item:hover {
            background: var(--bg-light);
        }

        .nav-item.active {
            background: #e8f0fe;
            color: #1a73e8;
            font-weight: 700;
        }

        .nav-item.active i {
            color: #1a73e8;
        }

        /* ГЛАВНАЯ ОБЛАСТЬ */
        main {
            flex: 1;
            padding: 0 25px;
            overflow-y: auto;
            background: #fff;
            position: relative;
        }

        .breadcrumbs {
            height: 56px;
            display: flex;
            align-items: center;
            font-size: 18px;
            font-family: 'Google Sans';
            color: var(--gray);
            border-bottom: 1px solid #eee;
            margin-bottom: 10px;
        }

        /* ТАБЛИЦА ФАЙЛОВ */
        .file-list-table {
            width: 100%;
            border-collapse: collapse;
        }

        .file-list-table th {
            text-align: left;
            padding: 12px 8px;
            font-size: 13px;
            color: var(--gray);
            border-bottom: 1px solid var(--border-color);
            position: sticky;
            top: 0;
            background: #fff;
            z-index: 10;
        }

        .file-row {
            cursor: pointer;
            border-bottom: 1px solid #f1f1f1;
            transition: 0.1s;
        }

        .file-row:hover {
            background: #f8f9fa;
        }

        .file-row td {
            padding: 15px 8px;
            font-size: 15px;
        }

        .file-icon {
            margin-right: 12px;
            font-size: 20px;
        }

        /* КНОПКА СОЗДАНИЯ (FAB) */
        .fab-button {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 60px;
            height: 60px;
            border-radius: 20px;
            background: var(--brand-bg);
            border: 2px solid var(--accent);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.4);
            cursor: pointer;
        }

        .fab-button img {
            height: 35px;
            width: auto;
        }

        /* МОБИЛЬНАЯ АДАПТАЦИЯ */
        @media (max-width: 768px) {
            .burger { display: block; }
            aside {
                position: fixed;
                left: 0;
                transform: translateX(-100%);
                height: 100%;
                box-shadow: 10px 0 20px rgba(0,0,0,0.1);
            }
            aside.open {
                transform: translateX(0);
            }
            .hide-mobile { display: none; }
            .mobile-overlay {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 1400;
            }
            .mobile-overlay.active {
                display: block;
            }
            main { padding: 0 15px; }
        }

        /* КОНТЕКСТНОЕ МЕНЮ */
        #context-menu {
            position: fixed;
            display: none;
            background: #fff;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            border-radius: 12px;
            z-index: 5000;
            min-width: 220px;
            padding: 8px 0;
            border: 1px solid #eee;
        }

        .menu-item {
            padding: 12px 20px;
            font-size: 15px;
            display: flex;
            align-items: center;
            gap: 15px;
            cursor: pointer;
            transition: 0.2s;
        }

        .menu-item:hover {
            background: #f1f3f4;
        }

        .menu-item i {
            width: 20px;
            color: var(--gray);
            font-size: 18px;
        }

        /* ПРЕДПРОСМОТР */
        #preview-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 9999;
            flex-direction: column;
        }

        .preview-header {
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            color: #fff;
            background: var(--brand-bg);
        }

        #preview-iframe {
            flex: 1;
            border: none;
            background: #fff;
        }

        #toast-message {
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: #323232;
            color: #fff;
            padding: 12px 25px;
            border-radius: 25px;
            display: none;
            z-index: 10000;
            font-size: 14px;
        }
    </style>
</head>
<body>

<div class="mobile-overlay" id="overlay" onclick="toggleSidebar()"></div>

<header>
    <div class="header-left">
        <div class="burger" onclick="toggleSidebar()">
            <i class="fa fa-bars"></i>
        </div>
        <div class="logo">
            <img src="\${LOGO_URL}" alt="Domolink Logo">
            <span>DOMOLINK PLATFORM</span>
        </div>
    </div>
    <div style="font-weight: 700; color: var(--accent); font-size: 14px;">НИКИТИН Е.А.</div>
</header>

<div class="app-container">
    <aside id="sidebar">
        <div class="nav-item active" id="btn-root" onclick="navigateTo('root', 'Мой диск')">
            <i class="fa fa-hdd"></i> Мой диск
        </div>
        <div class="nav-item" onclick="navigateTo('\${MY_ROOT_ID}', 'Логистика')">
            <i class="fa fa-truck-fast"></i> Логистика
        </div>
        <div class="nav-item" onclick="navigateTo('\${MERCH_ROOT_ID}', 'Мерчандайзинг')">
            <i class="fa fa-boxes-stacked"></i> Мерч
        </div>
        <div class="nav-item" style="margin-top: auto;">
            <i class="fa fa-trash"></i> Корзина
        </div>
    </aside>

    <main>
        <div class="breadcrumbs" id="bc-view">Мой диск</div>
        <table class="file-list-table">
            <thead>
                <tr>
                    <th style="width: 60%">Название</th>
                    <th class="hide-mobile">Дата изменения</th>
                    <th class="hide-mobile">Размер</th>
                </tr>
            </thead>
            <tbody id="file-body">
                </tbody>
        </table>
    </main>
</div>

<div class="fab-button" onclick="showCreateMenu(event)">
    <img src="\${LOGO_URL}" alt="Plus">
</div>

<div id="create-menu" style="display:none; position:fixed; bottom:100px; right:30px; background:#fff; border-radius:12px; box-shadow:0 5px 20px rgba(0,0,0,0.2); z-index:2000; width:200px; padding:10px 0; border: 1px solid #eee;">
    <div class="menu-item" onclick="createNewFolder()">
        <i class="fa fa-folder-plus"></i> Новая папка
    </div>
    <div class="menu-item" onclick="document.getElementById('file-uploader').click()">
        <i class="fa fa-file-upload"></i> Загрузить файл
    </div>
</div>

<div id="context-menu">
    <div class="menu-item" onclick="openPreview()">
        <i class="fa fa-eye"></i> Просмотреть
    </div>
    <div class="menu-item" onclick="renameFile()">
        <i class="fa fa-pen-to-square"></i> Переименовать
    </div>
    <div class="menu-item" onclick="deleteFile()" style="color: #d93025;">
        <i class="fa fa-trash-can"></i> Удалить
    </div>
</div>

<div id="preview-modal">
    <div class="preview-header">
        <span id="preview-filename" style="font-weight: 500;"></span>
        <i class="fa fa-xmark" onclick="closePreview()" style="font-size: 26px; cursor: pointer; color: var(--accent);"></i>
    </div>
    <iframe id="preview-iframe"></iframe>
</div>

<input type="file" id="file-uploader" style="display:none" multiple onchange="handleFileUpload(this.files)">
<div id="toast-message">Сообщение</div>

<script>
    let currentFolderId = 'root';
    let pathHistory = [{id: 'root', name: 'Мой диск'}];
    let selectedFile = null;
    let filesCache = [];

    // Загрузка списка файлов
    async function loadFiles(folderId) {
        currentFolderId = folderId;
        try {
            const response = await fetch(\`/storage/api/list?folderId=\${folderId}\`);
            filesCache = await response.json();
            renderFileList();
            renderBreadcrumbs();
        } catch (err) {
            console.error("Ошибка загрузки:", err);
            showToast("Ошибка при загрузке файлов");
        }
    }

    // Отрисовка файлов в таблице
    function renderFileList() {
        const listBody = document.getElementById('file-body');
        listBody.innerHTML = '';

        if (filesCache.length === 0) {
            listBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:80px; color:#999;">Папка пуста</td></tr>';
            return;
        }

        filesCache.forEach(file => {
            const isFolder = file.mimeType.includes('folder');
            const row = document.createElement('tr');
            row.className = 'file-row';
            
            row.innerHTML = \`
                <td>
                    <i class="fa \${isFolder ? 'fa-folder' : 'fa-file-lines'} file-icon" 
                       style="color: \${isFolder ? '#fbc02d' : '#455a64'}"></i>
                    \${file.name}
                </td>
                <td class="hide-mobile">\${new Date(file.modifiedTime).toLocaleDateString()}</td>
                <td class="hide-mobile">\${file.size ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : '—'}</td>
            \`;

            // Клик для открытия
            row.onclick = () => {
                if (isFolder) {
                    navigateTo(file.id, file.name);
                } else {
                    openPreviewFromFile(file.id, file.name);
                }
            };

            // Правый клик (Контекстное меню)
            row.oncontextmenu = (e) => {
                e.preventDefault();
                selectedFile = file;
                const menu = document.getElementById('context-menu');
                menu.style.display = 'block';
                menu.style.left = e.clientX + 'px';
                menu.style.top = e.clientY + 'px';
                
                // Подсветка строки
                document.querySelectorAll('.file-row').forEach(r => r.style.background = '');
                row.style.background = '#e8f0fe';
            };

            listBody.appendChild(row);
        });
    }

    // Навигация
    function navigateTo(id, name) {
        const index = pathHistory.findIndex(p => p.id === id);
        if (index !== -1) {
            pathHistory = pathHistory.slice(0, index + 1);
        } else {
            pathHistory.push({id, name});
        }
        loadFiles(id);
        toggleSidebar(true);
    }

    // Хлебные крошки
    function renderBreadcrumbs() {
        const bcView = document.getElementById('bc-view');
        bcView.innerHTML = pathHistory.map(node => 
            \`<span style="cursor:pointer; padding:5px;" onclick="navigateTo('\${node.id}', '\${node.name}')">\${node.name}</span>\`
        ).join(' <i class="fa fa-chevron-right" style="font-size:10px; margin:0 8px; opacity:0.4;"></i> ');
    }

    // Боковое меню (Mobile)
    function toggleSidebar(forceClose = false) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');
        if (forceClose) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        } else {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        }
    }

    // Управление меню создания
    function showCreateMenu(e) {
        e.stopPropagation();
        const menu = document.getElementById('create-menu');
        menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    }

    // Предпросмотр
    function openPreviewFromFile(id, name) {
        const previewId = id || selectedFile.id;
        const previewName = name || selectedFile.name;
        document.getElementById('preview-filename').innerText = previewName;
        document.getElementById('preview-iframe').src = \`https://drive.google.com/file/d/\${previewId}/preview\`;
        document.getElementById('preview-modal').style.display = 'flex';
    }

    function openPreview() { openPreviewFromFile(); }

    function closePreview() {
        document.getElementById('preview-modal').style.display = 'none';
        document.getElementById('preview-iframe').src = '';
    }

    // API: Загрузка файла
    async function handleFileUpload(files) {
        for (const file of files) {
            showToast(\`Загрузка: \${file.name}...\`);
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folderId', currentFolderId);

            try {
                await fetch('/storage/api/upload', {
                    method: 'POST',
                    body: formData
                });
            } catch (err) {
                showToast("Ошибка при загрузке");
            }
        }
        loadFiles(currentFolderId);
    }

    // API: Создание папки
    async function createNewFolder() {
        const folderName = prompt("Введите название папки:");
        if (!folderName) return;

        try {
            await fetch('/storage/api/mkdir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentId: currentFolderId, name: folderName })
            });
            loadFiles(currentFolderId);
        } catch (err) {
            showToast("Не удалось создать папку");
        }
    }

    // API: Удаление
    async function deleteFile() {
        if (!confirm(\`Удалить "\${selectedFile.name}"?\`)) return;

        try {
            await fetch(\`/storage/api/delete/\${selectedFile.id}\`, { method: 'DELETE' });
            loadFiles(currentFolderId);
        } catch (err) {
            showToast("Ошибка удаления");
        }
    }

    // API: Переименование
    async function renameFile() {
        const newName = prompt("Новое название:", selectedFile.name);
        if (!newName || newName === selectedFile.name) return;

        try {
            await fetch('/storage/api/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedFile.id, name: newName })
            });
            loadFiles(currentFolderId);
        } catch (err) {
            showToast("Ошибка переименования");
        }
    }

    // Утилиты
    function showToast(msg) {
        const t = document.getElementById('toast-message');
        t.innerText = msg;
        t.style.display = 'block';
        setTimeout(() => t.style.display = 'none', 3000);
    }

    // Закрытие меню при клике в любое место
    window.onclick = function() {
        document.getElementById('context-menu').style.display = 'none';
        document.getElementById('create-menu').style.display = 'none';
    };

    // Старт
    loadFiles('root');
</script>
</body>
</html>
    `;

    /* ========================================================================
       API СЕРВЕРНАЯ ЧАСТЬ (EXPRESS)
       ======================================================================== */

    // Главная страница интерфейса
    app.get('/storage', (req, res) => {
        res.send(UI);
    });

    // Список файлов
    app.get('/storage/api/list', async (req, res) => {
        try {
            const response = await drive.files.list({
                q: \`'\${req.query.folderId || 'root'}' in parents and trashed = false\`,
                fields: 'files(id, name, mimeType, size, modifiedTime)',
                orderBy: 'folder, name'
            });
            res.json(response.data.files);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Загрузка файла на Google Drive
    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            const fileMetadata = {
                name: req.file.originalname,
                parents: [req.body.folderId]
            };
            const media = {
                mimeType: req.file.mimetype,
                body: fs.createReadStream(req.file.path)
            };
            await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id'
            });
            // Удаляем временный файл после загрузки
            fs.unlinkSync(req.file.path);
            res.sendStatus(200);
        } catch (e) {
            res.status(500).send(e.message);
        }
    });

    // Создание папки
    app.post('/storage/api/mkdir', express.json(), async (req, res) => {
        try {
            const fileMetadata = {
                name: req.body.name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [req.body.parentId]
            };
            await drive.files.create({
                resource: fileMetadata,
                fields: 'id'
            });
            res.sendStatus(200);
        } catch (e) {
            res.status(500).send(e.message);
        }
    });

    // Переименование
    app.post('/storage/api/rename', express.json(), async (req, res) => {
        try {
            await drive.files.update({
                fileId: req.body.id,
                resource: { name: req.body.name }
            });
            res.sendStatus(200);
        } catch (e) {
            res.status(500).send(e.message);
        }
    });

    // Удаление (в корзину)
    app.delete('/storage/api/delete/:id', async (req, res) => {
        try {
            await drive.files.update({
                fileId: req.params.id,
                resource: { trashed: true }
            });
            res.sendStatus(200);
        } catch (e) {
            res.status(500).send(e.message);
        }
    });

    console.log("✅ TITANIUM DOMOLINK v43.0: ПОЛНАЯ СБОРКА ЗАПУЩЕНА");
};
