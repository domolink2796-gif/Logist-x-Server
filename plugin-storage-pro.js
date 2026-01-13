const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

/**
 * ============================================================================
 * TITANIUM X-PLATFORM v57.0 | THE ULTIMATE MONOLITH
 * ----------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * ФУНКЦИОНАЛ: ПОЛНЫЙ (UI + API + UX + BRANDING + CONTEXT)
 * СТАТУС: MAXIMUM PERFORMANCE (450+ LINES)
 * ============================================================================
 */

// ПРЯМАЯ ССЫЛКА НА ТВОЙ ЛОГОТИП
const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";

module.exports = function(app, context) {
    const { drive, google, MY_ROOT_ID, MERCH_ROOT_ID } = context;
    const upload = multer({ dest: 'uploads/' });

    // --- ГЕНЕРАЦИЯ ИНТЕРФЕЙСА ---
    const UI = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>X-PLATFORM | Professional Cloud</title>
    
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <style>
        :root {
            --brand-dark: #0a0a0a;
            --brand-accent: #f0b90b;
            --text-main: #3c4043;
            --text-secondary: #5f6368;
            --border-light: #dadce0;
            --bg-sidebar: #ffffff;
            --bg-main: #ffffff;
            --bg-hover: #f1f3f4;
            --blue-active: #1a73e8;
            --sidebar-width: 280px;
        }

        /* RESET & BASE */
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; margin: 0; padding: 0; }
        body, html { 
            height: 100%; 
            font-family: 'Roboto', sans-serif; 
            color: var(--text-main); 
            background: var(--bg-main); 
            overflow: hidden; 
        }

        /* HEADER */
        header {
            height: 64px;
            padding: 0 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--brand-dark);
            color: #fff;
            border-bottom: 2px solid var(--brand-accent);
            position: relative;
            z-index: 2000;
            box-shadow: 0 2px 12px rgba(0,0,0,0.4);
        }

        .header-left { display: flex; align-items: center; gap: 15px; }
        .burger-menu { 
            display: none; 
            font-size: 24px; 
            color: var(--brand-accent); 
            cursor: pointer; 
            padding: 5px; 
        }

        .logo-container {
            display: flex;
            align-items: center;
            gap: 12px;
            text-decoration: none;
            color: #fff;
        }

        .logo-container img {
            height: 42px;
            width: auto;
            border-radius: 4px;
            transition: transform 0.3s;
        }

        .logo-container span {
            font-family: 'Google Sans', sans-serif;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.5px;
        }

        .user-info {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 700;
            color: var(--brand-accent);
            font-size: 14px;
        }

        /* MAIN LAYOUT */
        .app-wrapper {
            display: flex;
            height: calc(100vh - 64px);
            position: relative;
        }

        /* SIDEBAR NAVIGATION */
        aside {
            width: var(--sidebar-width);
            height: 100%;
            background: var(--bg-sidebar);
            border-right: 1px solid #eee;
            display: flex;
            flex-direction: column;
            padding: 15px 0;
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
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s, color 0.2s;
        }

        .nav-item i {
            width: 34px;
            font-size: 18px;
            color: var(--text-secondary);
        }

        .nav-item:hover { background: var(--bg-hover); }
        .nav-item.active {
            background: #e8f0fe;
            color: var(--blue-active);
            font-weight: 700;
        }
        .nav-item.active i { color: var(--blue-active); }

        /* CONTENT AREA */
        main {
            flex: 1;
            padding: 0 25px;
            overflow-y: auto;
            background: #fff;
            position: relative;
        }

        .breadcrumb-strip {
            height: 56px;
            display: flex;
            align-items: center;
            font-family: 'Google Sans';
            font-size: 18px;
            color: var(--text-secondary);
            border-bottom: 1px solid #eee;
            margin-bottom: 10px;
            white-space: nowrap;
            overflow-x: auto;
        }

        .bc-node { 
            cursor: pointer; 
            padding: 4px 8px; 
            border-radius: 4px; 
            transition: 0.2s;
        }
        .bc-node:hover { background: #eee; color: #000; }

        /* FILE TABLE */
        .file-list-container { width: 100%; border-collapse: collapse; }
        .file-list-container th {
            text-align: left;
            padding: 12px 8px;
            font-size: 13px;
            color: var(--text-secondary);
            border-bottom: 1px solid var(--border-light);
            position: sticky;
            top: 0;
            background: #fff;
            z-index: 10;
        }

        .file-row {
            cursor: pointer;
            border-bottom: 1px solid #f1f1f1;
            transition: background 0.1s;
        }

        .file-row:hover { background: #f8f9fa; }
        .file-row td { padding: 16px 8px; font-size: 15px; }

        /* FLOATING ACTION BUTTON (FAB) */
        .fab-trigger {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 64px;
            height: 64px;
            border-radius: 20px;
            background: var(--brand-dark);
            border: 2px solid var(--brand-accent);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 3000;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
            cursor: pointer;
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .fab-trigger:active { transform: scale(0.9) rotate(5deg); }
        .fab-trigger img { height: 38px; width: auto; }

        /* FAB MENU */
        #create-menu {
            position: fixed;
            display: none;
            bottom: 105px;
            right: 30px;
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.2);
            z-index: 4000;
            width: 220px;
            padding: 10px 0;
            border: 1px solid #eee;
            animation: popUp 0.2s ease-out;
        }

        @keyframes popUp {
            from { opacity: 0; transform: translateY(15px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .menu-option {
            padding: 12px 20px;
            font-size: 15px;
            display: flex;
            align-items: center;
            gap: 15px;
            cursor: pointer;
            transition: 0.2s;
        }
        .menu-option:hover { background: var(--bg-hover); }
        .menu-option i { width: 22px; font-size: 18px; color: var(--text-secondary); }

        /* CONTEXT MENU */
        #context-popup {
            position: fixed;
            display: none;
            background: #fff;
            box-shadow: 0 10px 35px rgba(0,0,0,0.25);
            border-radius: 12px;
            z-index: 5000;
            min-width: 220px;
            padding: 8px 0;
            border: 1px solid #eee;
        }

        /* MODAL PREVIEW */
        #preview-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.95);
            z-index: 9999;
            flex-direction: column;
        }

        .preview-bar {
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 25px;
            color: #fff;
            background: var(--brand-dark);
        }

        #preview-frame {
            flex: 1;
            border: none;
            background: #fff;
        }

        /* MOBILE OPTIMIZATION */
        @media (max-width: 768px) {
            .burger-menu { display: block; }
            aside {
                position: fixed;
                left: 0;
                transform: translateX(-100%);
                height: 100%;
                box-shadow: 10px 0 25px rgba(0,0,0,0.15);
            }
            aside.open { transform: translateX(0); }
            .hide-on-mobile { display: none; }
            .mobile-overlay {
                display: none;
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.5);
                z-index: 1400;
            }
            .mobile-overlay.active { display: block; }
            main { padding: 0 15px; }
        }

        /* TOAST NOTIFICATION */
        #toast-box {
            position: fixed;
            bottom: 110px;
            left: 50%;
            transform: translateX(-50%);
            background: #323232;
            color: #fff;
            padding: 12px 28px;
            border-radius: 30px;
            display: none;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.4);
        }
    </style>
</head>
<body>

<div class="mobile-overlay" id="mobile-ovl" onclick="toggleSidebar()"></div>

<header>
    <div class="header-left">
        <div class="burger-menu" onclick="toggleSidebar()">
            <i class="fa fa-bars"></i>
        </div>
        <a href="/storage" class="logo-container">
            <img src="${LOGO_URL}" alt="X-Logo">
            <span>X-PLATFORM</span>
        </a>
    </div>
    <div class="user-info">
        НИКИТИН Е.А.
    </div>
</header>

<div class="app-wrapper">
    <aside id="main-sidebar">
        <div class="nav-item active" id="nav-root" onclick="navigate('root', 'Мой диск')">
            <i class="fa fa-hdd"></i> Мой диск
        </div>
        <div class="nav-item" onclick="navigate('${MY_ROOT_ID}', 'Логистика')">
            <i class="fa fa-truck-fast"></i> Логистика
        </div>
        <div class="nav-item" onclick="navigate('${MERCH_ROOT_ID}', 'Мерчандайзинг')">
            <i class="fa fa-boxes-stacked"></i> Мерчандайзинг
        </div>
        <div class="nav-item" style="margin-top: auto;">
            <i class="fa fa-trash-can"></i> Корзина
        </div>
        <div style="padding: 20px; font-size: 10px; color: #bbb; text-align: center;">
            TITANIUM ENGINE v57.0
        </div>
    </aside>

    <main id="content-pane">
        <div class="breadcrumb-strip" id="bc-view">Мой диск</div>
        <table class="file-list-container">
            <thead>
                <tr>
                    <th style="width: 60%">Название</th>
                    <th class="hide-on-mobile">Дата изменения</th>
                    <th class="hide-on-mobile">Размер</th>
                </tr>
            </thead>
            <tbody id="file-table-body">
                </tbody>
        </table>
    </main>
</div>

<div class="fab-trigger" onclick="toggleCreateMenu(event)">
    <img src="${LOGO_URL}" alt="Action">
</div>

<div id="create-menu">
    <div class="menu-option" onclick="uiCreateFolder()">
        <i class="fa fa-folder-plus"></i> Создать папку
    </div>
    <div class="menu-option" onclick="document.getElementById('hidden-upload').click()">
        <i class="fa fa-cloud-arrow-up"></i> Загрузить файл
    </div>
</div>

<div id="context-popup">
    <div class="menu-option" onclick="uiPreviewFile()">
        <i class="fa fa-eye"></i> Предпросмотр
    </div>
    <div class="menu-option" onclick="uiRenameFile()">
        <i class="fa fa-pen-to-square"></i> Переименовать
    </div>
    <div class="menu-option" onclick="uiDeleteFile()" style="color: #d93025;">
        <i class="fa fa-trash-can"></i> Удалить
    </div>
</div>

<div id="preview-overlay">
    <div class="preview-bar">
        <span id="preview-title" style="font-weight: 500; font-family: 'Google Sans';"></span>
        <i class="fa fa-xmark" onclick="closePreview()" style="font-size: 28px; cursor: pointer; color: var(--brand-accent);"></i>
    </div>
    <iframe id="preview-frame"></iframe>
</div>

<input type="file" id="hidden-upload" style="display:none" multiple onchange="handleFileUpload(this.files)">
<div id="toast-box"></div>

<script>
    /**
     * CLIENT-SIDE ENGINE
     */
    let currentId = 'root';
    let pathHistory = [{id: 'root', name: 'Мой диск'}];
    let selectedFileObject = null;
    let localFilesCache = [];

    // Инициализация загрузки
    async function loadDirectory(id) {
        currentId = id;
        try {
            const response = await fetch('/storage/api/list?folderId=' + id);
            if (!response.ok) throw new Error('Network fail');
            localFilesCache = await response.json();
            renderTable();
            renderBreadcrumbs();
        } catch (err) {
            showToast("Ошибка связи с сервером");
        }
    }

    // Отрисовка таблицы
    function renderTable() {
        const tbody = document.getElementById('file-table-body');
        tbody.innerHTML = '';

        if (localFilesCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:100px; color:#999; font-size: 14px;">Папка пуста</td></tr>';
            return;
        }

        localFilesCache.forEach(file => {
            const isFolder = file.mimeType.includes('folder');
            const tr = document.createElement('tr');
            tr.className = 'file-row';
            
            const sizeStr = file.size ? (file.size / (1024 * 1024)).toFixed(2) + ' MB' : '—';
            const dateStr = new Date(file.modifiedTime).toLocaleDateString('ru-RU');

            tr.innerHTML = \`
                <td>
                    <i class="fa \${isFolder ? 'fa-folder' : 'fa-file-lines'}" 
                       style="margin-right:15px; color:\${isFolder ? '#fbc02d' : '#455a64'}; font-size:20px;"></i>
                    \${file.name}
                </td>
                <td class="hide-on-mobile">\${dateStr}</td>
                <td class="hide-on-mobile">\${sizeStr}</td>
            \`;

            // Обработка клика
            tr.onclick = () => {
                if (isFolder) navigate(file.id, file.name);
                else uiPreviewFile(file.id, file.name);
            };

            // Контекстное меню
            tr.oncontextmenu = (e) => {
                e.preventDefault();
                selectedFileObject = file;
                const menu = document.getElementById('context-popup');
                menu.style.display = 'block';
                menu.style.left = e.clientX + 'px';
                menu.style.top = e.clientY + 'px';
            };

            tbody.appendChild(tr);
        });
    }

    // Навигация
    function navigate(id, name) {
        const index = pathHistory.findIndex(p => p.id === id);
        if (index !== -1) {
            pathHistory = pathHistory.slice(0, index + 1);
        } else {
            pathHistory.push({id, name});
        }
        loadDirectory(id);
        toggleSidebar(true);
    }

    // Отрисовка хлебных крошек
    function renderBreadcrumbs() {
        const container = document.getElementById('bc-view');
        container.innerHTML = pathHistory.map((node, i) => {
            const isLast = i === pathHistory.length - 1;
            return \`<span class="bc-node" onclick="navigate('\${node.id}', '\${node.name}')">\${node.name}</span>\`;
        }).join(' <i class="fa fa-chevron-right" style="font-size:10px; margin:0 8px; opacity:0.3;"></i> ');
    }

    // Управление сайдбаром
    function toggleSidebar(forceClose = false) {
        const sb = document.getElementById('main-sidebar');
        const ovl = document.getElementById('mobile-ovl');
        if (forceClose) {
            sb.classList.remove('open');
            ovl.classList.remove('active');
        } else {
            sb.classList.toggle('open');
            ovl.classList.toggle('active');
        }
    }

    // Меню "Создать"
    function toggleCreateMenu(e) {
        e.stopPropagation();
        const menu = document.getElementById('create-menu');
        menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    }

    // Предпросмотр
    function uiPreviewFile(id, name) {
        const targetId = id || selectedFileObject.id;
        const targetName = name || selectedFileObject.name;
        document.getElementById('preview-title').innerText = targetName;
        document.getElementById('preview-frame').src = 'https://drive.google.com/file/d/' + targetId + '/preview';
        document.getElementById('preview-overlay').style.display = 'flex';
    }

    function closePreview() {
        document.getElementById('preview-overlay').style.display = 'none';
        document.getElementById('preview-frame').src = '';
    }

    // API: Загрузка
    async function handleFileUpload(files) {
        for (const file of files) {
            showToast("Загрузка: " + file.name);
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folderId', currentId);
            try {
                await fetch('/storage/api/upload', { method: 'POST', body: formData });
            } catch (err) { showToast("Ошибка загрузки"); }
        }
        loadDirectory(currentId);
    }

    // API: Создание папки
    async function uiCreateFolder() {
        const folderName = prompt("Название папки:");
        if (!folderName) return;
        try {
            await fetch('/storage/api/mkdir', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ parentId: currentId, name: folderName })
            });
            loadDirectory(currentId);
        } catch (e) { showToast("Ошибка API"); }
    }

    // API: Переименование
    async function uiRenameFile() {
        const newName = prompt("Новое название:", selectedFileObject.name);
        if (!newName || newName === selectedFileObject.name) return;
        try {
            await fetch('/storage/api/rename', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: selectedFileObject.id, name: newName })
            });
            loadDirectory(currentId);
        } catch (e) { showToast("Ошибка переименования"); }
    }

    // API: Удаление
    async function uiDeleteFile() {
        if (!confirm("Удалить '" + selectedFileObject.name + "'?")) return;
        try {
            await fetch('/storage/api/delete/' + selectedFileObject.id, { method: 'DELETE' });
            loadDirectory(currentId);
        } catch (e) { showToast("Ошибка удаления"); }
    }

    // Утилита: Тост
    function showToast(msg) {
        const t = document.getElementById('toast-box');
        t.innerText = msg;
        t.style.display = 'block';
        setTimeout(() => t.style.display = 'none', 3000);
    }

    // Глобальные клики
    window.onclick = () => {
        document.getElementById('create-menu').style.display = 'none';
        document.getElementById('context-popup').style.display = 'none';
    };

    // Старт системы
    loadDirectory('root');
</script>
</body>
</html>
    `;

    // --- BACKEND API HANDLERS ---
    
    // 1. Главная страница
    app.get('/storage', (req, res) => {
        res.send(UI);
    });

    // 2. Список файлов
    app.get('/storage/api/list', async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            const response = await drive.files.list({
                q: \`'\${folderId}' in parents and trashed = false\`,
                fields: 'files(id, name, mimeType, size, modifiedTime)',
                orderBy: 'folder, name'
            });
            res.json(response.data.files);
        } catch (error) {
            console.error("DRIVE_LIST_ERROR:", error);
            res.status(500).json({ error: error.message });
        }
    });

    // 3. Загрузка файла
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
            fs.unlinkSync(req.file.path); // Удаление временного файла
            res.sendStatus(200);
        } catch (error) {
            res.status(500).send(error.message);
        }
    });

    // 4. Создание папки
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
        } catch (error) {
            res.status(500).send(error.message);
        }
    });

    // 5. Переименование
    app.post('/storage/api/rename', express.json(), async (req, res) => {
        try {
            await drive.files.update({
                fileId: req.body.id,
                resource: { name: req.body.name }
            });
            res.sendStatus(200);
        } catch (error) {
            res.status(500).send(error.message);
        }
    });

    // 6. Удаление (в корзину)
    app.delete('/storage/api/delete/:id', async (req, res) => {
        try {
            await drive.files.update({
                fileId: req.params.id,
                resource: { trashed: true }
            });
            res.sendStatus(200);
        } catch (error) {
            res.status(500).send(error.message);
        }
    });

    console.log("✅ TITANIUM X-PLATFORM v57.0: ПОЛНЫЙ МОНОЛИТ ЗАПУЩЕН");
};
