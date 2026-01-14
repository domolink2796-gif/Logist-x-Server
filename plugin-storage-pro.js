const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

/**
 * ============================================================================
 * TITANIUM X-PLATFORM v56.0 | THE PRE-AUTONOMOUS MONOLITH
 * ----------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * * ОПИСАНИЕ: Полноразмерная система (500+ строк) с глубокой интеграцией.
 * ПРЕДНАЗНАЧЕНИЕ: Сбор логики программ "Логист" и "Мерч" для ухода от Google.
 * ИСПРАВЛЕНО: Кнопка FAB, Главный экран, Дублирование путей, Память.
 * ============================================================================
 */

const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";

module.exports = function(app, context) {
    // Деструктуризация контекста из вашего server.js
    const { 
        drive, google, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, saveDatabase, getOrCreateFolder 
    } = context;
    
    const upload = multer({ dest: 'uploads/' });

    // --- МОЗГОВОЙ ЦЕНТР (СИСТЕМА ОБУЧЕНИЯ И ЗАПОМИНАНИЯ) ---
    async function deepSystemLearning(fileAction) {
        try {
            const memoryPath = path.join(__dirname, 'server_memory.json');
            let memoryBase = [];
            
            if (fs.existsSync(memoryPath)) {
                const raw = fs.readFileSync(memoryPath, 'utf8');
                try { memoryBase = JSON.parse(raw); } catch(e) { memoryBase = []; }
            }

            // Получаем базу ключей для анализа принадлежности файла
            const keys = await readDatabase();
            
            // Ищем, к какому объекту или сотруднику относится папка
            const objectMatch = keys.find(k => k.folderId === fileAction.parentId || k.key === fileAction.name);

            const memoryEntry = {
                timestamp: new Date().toISOString(),
                event: fileAction.event, // 'CREATE_DIR', 'UPLOAD_FILE', 'MOVE', 'DELETE'
                fileName: fileAction.name,
                googleId: fileAction.id,
                parentId: fileAction.parentId,
                mimeType: fileAction.mimeType,
                // Важнейшая часть: определяем логику для будущего переезда
                logicType: objectMatch ? objectMatch.type : 'manual',
                objectRef: objectMatch ? objectMatch.name : 'Unknown',
                autoPath: `/${objectMatch ? objectMatch.type : 'general'}/${fileAction.name}`
            };

            memoryBase.push(memoryEntry);
            
            // Ограничиваем размер памяти 20 000 записей (для стабильности сервера)
            if (memoryBase.length > 20000) memoryBase.shift();
            
            fs.writeFileSync(memoryPath, JSON.stringify(memoryBase, null, 2));
            console.log(`🧠 [X-MEMORY] Запомнена логика: ${fileAction.name} (${memoryEntry.logicType})`);
        } catch (err) {
            console.error("❌ Ошибка обучения системы:", err.message);
        }
    }

    // --- ВИЗУАЛЬНЫЙ ИНТЕРФЕЙС (HTML5 / CSS3 / JS) ---
    const UI = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>X-PLATFORM | Titanium Pro</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --bg: #0a0a0a;
            --accent: #f0b90b;
            --sidebar: #ffffff;
            --text-main: #202124;
            --text-sub: #5f6368;
            --active-blue: #e8f0fe;
            --blue-link: #1a73e8;
            --border: #dadce0;
        }

        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
        body, html { height: 100%; font-family: 'Roboto', sans-serif; background: #fff; color: var(--text-main); overflow: hidden; }

        header {
            height: 64px; background: var(--bg); border-bottom: 2px solid var(--accent);
            display: flex; align-items: center; justify-content: space-between; padding: 0 20px;
            position: relative; z-index: 2000; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .logo-section { display: flex; align-items: center; gap: 12px; }
        .logo-section img { height: 42px; width: auto; border-radius: 6px; }
        .logo-section span { color: #fff; font-family: 'Google Sans'; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }

        .app-container { display: flex; height: calc(100vh - 64px); }

        aside {
            width: 280px; background: var(--sidebar); border-right: 1px solid var(--border);
            display: flex; flex-direction: column; padding: 16px 0; transition: all 0.3s ease;
            z-index: 1000;
        }

        .nav-link {
            height: 48px; margin: 2px 12px; border-radius: 24px; display: flex; align-items: center;
            padding: 0 18px; cursor: pointer; transition: 0.2s; color: var(--text-main);
            font-size: 14px; font-weight: 500; text-decoration: none;
        }
        .nav-link i { font-size: 20px; margin-right: 16px; color: var(--text-sub); width: 24px; text-align: center; }
        .nav-link:hover { background: #f1f3f4; }
        .nav-link.active { background: var(--active-blue); color: var(--blue-link); }
        .nav-link.active i { color: var(--blue-link); }

        main { flex: 1; overflow-y: auto; padding: 0 24px; background: #fff; position: relative; }

        .top-bar {
            height: 56px; border-bottom: 1px solid var(--border); display: flex; align-items: center;
            margin-bottom: 8px; position: sticky; top: 0; background: #fff; z-index: 500;
        }
        .breadcrumb-box { font-family: 'Google Sans'; font-size: 18px; color: var(--text-sub); display: flex; align-items: center; gap: 8px; }
        .bc-item { cursor: pointer; padding: 4px 8px; border-radius: 4px; }
        .bc-item:hover { background: #f1f3f4; color: #000; }

        .data-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .data-table th { text-align: left; padding: 12px 8px; color: var(--text-sub); font-size: 13px; font-weight: 500; border-bottom: 1px solid var(--border); }
        .data-table td { padding: 14px 8px; border-bottom: 1px solid #f1f1f1; font-size: 14px; cursor: pointer; }
        .file-row:hover { background: #f8f9fa; }

        /* ИСПРАВЛЕННАЯ ГЛАВНАЯ КНОПКА Х */
        .floating-action-btn {
            position: fixed; bottom: 32px; right: 32px; width: 64px; height: 64px;
            border-radius: 18px; background: var(--bg); border: 2px solid var(--accent);
            display: flex; align-items: center; justify-content: center; z-index: 3000;
            box-shadow: 0 6px 20px rgba(0,0,0,0.3); cursor: pointer; transition: 0.2s;
        }
        .floating-action-btn:active { transform: scale(0.9); }
        .floating-action-btn img { width: 38px; height: 38px; }

        #action-menu {
            position: fixed; display: none; bottom: 108px; right: 32px;
            background: #fff; border: 1px solid var(--border); border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.15); z-index: 4000; min-width: 200px; padding: 8px 0;
        }
        .action-item { padding: 12px 20px; display: flex; align-items: center; gap: 14px; cursor: pointer; font-size: 14px; font-weight: 500; }
        .action-item:hover { background: #f1f3f4; }
        .action-item i { font-size: 18px; color: var(--text-sub); width: 20px; }

        /* КОНТЕКСТНОЕ МЕНЮ */
        #context-menu {
            position: fixed; display: none; background: #fff; border: 1px solid var(--border);
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 5000; padding: 6px 0; min-width: 180px;
        }

        #preview-overlay {
            display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.9);
            z-index: 9999; flex-direction: column;
        }
        .preview-header { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; color: #fff; }
        .preview-frame { flex: 1; border: none; background: #fff; }

        #toast-msg {
            position: fixed; bottom: 110px; left: 50%; transform: translateX(-50%);
            background: #323232; color: #fff; padding: 12px 24px; border-radius: 24px;
            display: none; z-index: 10000; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        @media (max-width: 768px) {
            aside { position: fixed; left: -280px; height: 100%; box-shadow: 8px 0 16px rgba(0,0,0,0.1); }
            aside.mobile-open { left: 0; }
            .hide-mobile { display: none; }
        }
    </style>
</head>
<body>

<header>
    <div class="logo-section" onclick="toggleSidebar()">
        <img src="${LOGO_URL}">
        <span>X-PLATFORM</span>
    </div>
    <div style="font-size: 12px; color: var(--accent); font-weight: bold; text-align: right;">
        ADMIN PANEL<br>НИКИТИН Е.А.
    </div>
</header>

<div class="app-container">
    <aside id="main-sidebar">
        <div class="nav-link active" id="nav-root" onclick="browse('root', 'Мой диск')">
            <i class="fa fa-hdd"></i> Мой диск
        </div>
        <div class="nav-link" onclick="browse('${MY_ROOT_ID}', 'Логистика')">
            <i class="fa fa-truck-fast"></i> Логистика
        </div>
        <div class="nav-link" onclick="browse('${MERCH_ROOT_ID}', 'Мерчандайзинг')">
            <i class="fa fa-boxes-stacked"></i> Мерчандайзинг
        </div>
        <div class="nav-link" style="margin-top: auto;" onclick="browse('trash', 'Корзина')">
            <i class="fa fa-trash-can"></i> Корзина
        </div>
        <div style="padding: 20px; font-size: 10px; color: #bbb; text-align: center; border-top: 1px solid #eee;">
            BUILD v56.0 | SMART MEMORY ACTIVE
        </div>
    </aside>

    <main>
        <div class="top-bar">
            <div class="breadcrumb-box" id="breadcrumb-list">Мой диск</div>
        </div>
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 60%">Название</th>
                    <th class="hide-mobile">Изменено</th>
                    <th class="hide-mobile">Размер</th>
                </tr>
            </thead>
            <tbody id="files-display">
                </tbody>
        </table>
    </main>
</div>

<div class="floating-action-btn" onclick="openActionMenu(event)">
    <img src="${LOGO_URL}">
</div>

<div id="action-menu">
    <div class="action-item" onclick="createNewFolder()"><i class="fa fa-folder-plus"></i> Новая папка</div>
    <div class="action-item" onclick="triggerFileUpload()"><i class="fa fa-cloud-arrow-up"></i> Загрузить файл</div>
    <div class="action-item" onclick="location.reload()"><i class="fa fa-rotate"></i> Обновить</div>
</div>

<div id="context-menu">
    <div class="action-item" onclick="handlePreview()"><i class="fa fa-eye"></i> Просмотреть</div>
    <div class="action-item" onclick="handleRename()"><i class="fa fa-pen-to-square"></i> Переименовать</div>
    <div class="action-item" onclick="handleDelete()" style="color: #d93025;"><i class="fa fa-trash-can"></i> Удалить</div>
</div>

<div id="preview-overlay">
    <div class="preview-header">
        <span id="preview-filename" style="font-weight: 500;"></span>
        <i class="fa fa-circle-xmark" onclick="closePreview()" style="font-size: 32px; cursor: pointer; color: var(--accent);"></i>
    </div>
    <iframe id="preview-frame" class="preview-frame"></iframe>
</div>

<input type="file" id="hidden-file-input" style="display:none" multiple onchange="processUpload(this.files)">
<div id="toast-msg"></div>

<script>
    let currentFolderId = 'root';
    let breadcrumbPath = [{id: 'root', name: 'Мой диск'}];
    let selectedItem = null;
    let itemsInView = [];

    async function loadFolder(id) {
        currentFolderId = id;
        try {
            const response = await fetch('/storage/api/v1/list?folderId=' + id);
            itemsInView = await response.json();
            renderTable();
            renderBreadcrumbs();
            
            // Подсветка активного раздела в меню
            document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
            if(id === 'root') document.getElementById('nav-root').classList.add('active');
        } catch(err) {
            notify("Ошибка связи с сервером");
        }
    }

    function renderTable() {
        const container = document.getElementById('files-display');
        container.innerHTML = itemsInView.length ? '' : '<tr><td colspan="3" style="text-align:center; padding:100px; color:#aaa;">Папка пуста</td></tr>';
        
        itemsInView.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'file-row';
            const isFolder = item.mimeType.includes('folder');
            
            tr.innerHTML = \`
                <td><i class="fa \${isFolder ? 'fa-folder' : 'fa-file-lines'}" style="margin-right:12px; color:\${isFolder ? '#fbc02d' : '#1a73e8'}; font-size:20px;"></i> \${item.name}</td>
                <td class="hide-mobile" style="color:#777; font-size:12px;">\${new Date().toLocaleDateString()}</td>
                <td class="hide-mobile" style="color:#777; font-size:12px;">\${item.size ? (item.size/1024/1024).toFixed(2) + ' MB' : '—'}</td>
            \`;

            tr.onclick = () => isFolder ? browse(item.id, item.name) : viewFile(item.id, item.name);
            
            // Правая кнопка или долгое нажатие (контекстное меню)
            tr.oncontextmenu = (e) => {
                e.preventDefault();
                selectedItem = item;
                const menu = document.getElementById('context-menu');
                menu.style.display = 'block';
                menu.style.left = e.clientX + 'px';
                menu.style.top = e.clientY + 'px';
            };

            container.appendChild(tr);
        });
    }

    function browse(id, name) {
        const index = breadcrumbPath.findIndex(p => p.id === id);
        if(index !== -1) {
            breadcrumbPath = breadcrumbPath.slice(0, index + 1);
        } else {
            breadcrumbPath.push({id, name});
        }
        loadFolder(id);
        const sidebar = document.getElementById('main-sidebar');
        if(window.innerWidth < 768) sidebar.classList.remove('mobile-open');
    }

    function renderBreadcrumbs() {
        document.getElementById('breadcrumb-list').innerHTML = breadcrumbPath.map(p => 
            \`<span class="bc-item" onclick="browse('\${p.id}', '\${p.name}')">\${p.name}</span>\`
        ).join(' <i class="fa fa-chevron-right" style="font-size:10px; opacity:0.3;"></i> ');
    }

    function toggleSidebar() {
        document.getElementById('main-sidebar').classList.toggle('mobile-open');
    }

    function openActionMenu(e) {
        e.stopPropagation();
        const menu = document.getElementById('action-menu');
        menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    }

    function triggerFileUpload() {
        document.getElementById('hidden-file-input').click();
        document.getElementById('action-menu').style.display = 'none';
    }

    async function processUpload(files) {
        for(let file of files) {
            notify("Загрузка: " + file.name);
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folderId', currentFolderId);
            await fetch('/storage/api/v1/upload', {method: 'POST', body: formData});
        }
        loadFolder(currentFolderId);
    }

    async function createNewFolder() {
        const folderName = prompt("Введите название папки:");
        if(!folderName) return;
        document.getElementById('action-menu').style.display = 'none';
        await fetch('/storage/api/v1/mkdir', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({parentId: currentFolderId, name: folderName})
        });
        loadFolder(currentFolderId);
    }

    function viewFile(id, name) {
        const targetId = id || selectedItem.id;
        const fileName = name || (selectedItem ? selectedItem.name : 'Просмотр');
        document.getElementById('preview-filename').innerText = fileName;
        document.getElementById('preview-frame').src = 'https://drive.google.com/file/d/' + targetId + '/preview';
        document.getElementById('preview-overlay').style.display = 'flex';
    }

    function closePreview() {
        document.getElementById('preview-overlay').style.display = 'none';
        document.getElementById('preview-frame').src = '';
    }

    async function handleDelete() {
        if(!confirm("Переместить '" + selectedItem.name + "' в корзину?")) return;
        await fetch('/storage/api/v1/delete/' + selectedItem.id, {method: 'DELETE'});
        loadFolder(currentFolderId);
    }

    async function handleRename() {
        const newName = prompt("Новое имя:", selectedItem.name);
        if(!newName || newName === selectedItem.name) return;
        await fetch('/storage/api/v1/rename', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id: selectedItem.id, name: newName})
        });
        loadFolder(currentFolderId);
    }

    function notify(text) {
        const t = document.getElementById('toast-msg');
        t.innerText = text;
        t.style.display = 'block';
        setTimeout(() => t.style.display = 'none', 3000);
    }

    function handlePreview() { viewFile(); }

    window.onclick = () => {
        document.getElementById('action-menu').style.display = 'none';
        document.getElementById('context-menu').style.display = 'none';
    };

    loadFolder('root');
</script>
</body>
</html>
    `;

    // --- СЕРВЕРНЫЕ МАРШРУТЫ (API) ---

    // Главная точка входа - заменяем белый экран на интерфейс
    app.get('/', (req, res) => res.send(UI));
    app.get('/storage', (req, res) => res.send(UI));

    // API: Список файлов
    app.get('/storage/api/v1/list', async (req, res) => {
        try {
            const folderId = req.query.folderId || 'root';
            const query = (folderId === 'trash') ? "trashed = true" : `'${folderId}' in parents and trashed = false`;
            
            const driveRes = await drive.files.list({
                q: query,
                fields: 'files(id, name, mimeType, size, modifiedTime, parents)',
                orderBy: 'folder, name'
            });

            // ОБУЧЕНИЕ: запоминаем всё, что видим (даже если создано внешними программами)
            for (const f of driveRes.data.files) {
                await deepSystemLearning({...f, event: 'SYNC_DISCOVERY', parentId: folderId});
            }

            res.json(driveRes.data.files);
        } catch (e) {
            res.status(500).json({error: e.message});
        }
    });

    // API: Загрузка
    app.post('/storage/api/v1/upload', upload.single('file'), async (req, res) => {
        try {
            const driveFile = await drive.files.create({
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) },
                fields: 'id, name, parents, mimeType'
            });

            // ЗАПОМИНАЕМ ЛОГИКУ
            await deepSystemLearning({...driveFile.data, event: 'UPLOAD_FILE', parentId: req.body.folderId});

            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.sendStatus(200);
        } catch (e) {
            res.status(500).send(e.message);
        }
    });

    // API: Создание папки
    app.post('/storage/api/v1/mkdir', express.json(), async (req, res) => {
        try {
            const folder = await drive.files.create({
                resource: { 
                    name: req.body.name, 
                    mimeType: 'application/vnd.google-apps.folder', 
                    parents: [req.body.parentId] 
                },
                fields: 'id, name, parents, mimeType'
            });

            // ЗАПОМИНАЕМ ЛОГИКУ СОЗДАНИЯ ПАПКИ
            await deepSystemLearning({...folder.data, event: 'CREATE_DIR', parentId: req.body.parentId});

            res.sendStatus(200);
        } catch (e) {
            res.status(500).send(e.message);
        }
    });

    // API: Переименование
    app.post('/storage/api/v1/rename', express.json(), async (req, res) => {
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

    // API: Удаление (в корзину)
    app.delete('/storage/api/v1/delete/:id', async (req, res) => {
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

    console.log("✅ МОНОЛИТ v56.0 ЗАПУЩЕН: ИДЕТ СБОР ЛОГИКИ С ПРИВЯЗКОЙ К БАЗЕ КЛЮЧЕЙ");
};
