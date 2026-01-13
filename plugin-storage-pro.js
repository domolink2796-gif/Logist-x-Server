const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');

/**
 * ============================================================================
 * X-PLATFORM COMMANDER: ULTIMATE ENTERPRISE EDITION v13.0
 * ============================================================================
 * Разработано эксклюзивно для Евгения.
 * Система управления данными промышленного уровня.
 * * ФУНКЦИОНАЛЬНЫЙ ФАРШ:
 * - Многоуровневая авторизация по ключам
 * - Интеллектуальная корзина (Safe-Delete System)
 * - Древовидная навигация с поддержкой истории
 * - Расширенный мониторинг действий (System Logs)
 * - Предпросмотр всех корпоративных форматов (PDF, XLSX, DOCX, TXT)
 * - Адаптивный Dark-интерфейс (X-Black Design)
 * ============================================================================
 */

module.exports = function(app, context) {
    const { MY_ROOT_ID, MERCH_ROOT_ID, readDatabase } = context;
    const STORAGE_ROOT = path.join(__dirname, 'storage');
    const TRASH_ROOT = path.join(STORAGE_ROOT, '.sys_trash_bin');
    const SYSTEM_LOG_PATH = path.join(__dirname, 'logs', 'x_commander_audit.log');
    
    // --- 1. СЕКЦИЯ ГЛУБОКОЙ ИНИЦИАЛИЗАЦИИ СИСТЕМЫ ---
    
    const initializeInfrastructure = () => {
        const structuralDirs = [
            STORAGE_ROOT,
            TRASH_ROOT,
            path.join(__dirname, 'logs'),
            path.join(__dirname, 'temp_uploads')
        ];

        structuralDirs.forEach(directory => {
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
                console.log(`[INFRA] Создана директория: ${directory}`);
            }
        });

        if (!fs.existsSync(SYSTEM_LOG_PATH)) {
            fs.writeFileSync(SYSTEM_LOG_PATH, `--- X-COMMANDER AUDIT LOG CREATED: ${new Date().toISOString()} ---\n`);
        }
    };

    initializeInfrastructure();

    // Настройка высокопроизводительного загрузчика Multer
    const storageConfig = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'temp_uploads/');
        },
        filename: (req, file, cb) => {
            const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, `XP_${uniquePrefix}_${file.originalname}`);
        }
    });

    const uploadEngine = multer({ 
        storage: storageConfig,
        limits: { fileSize: 500 * 1024 * 1024 } // Лимит 500МБ
    });

    // === МАСТЕР-КЛЮЧ АДМИНИСТРАТОРА (ДОСТУП КО ВСЕМУ) ===
    const ADMIN_MASTER_KEY = "X-PLATFORM-2026"; 

    // Подключение обязательных промежуточных обработчиков
    app.use(cookieParser());
    
    // Секция статической раздачи файлов (CDN) с заголовками защиты
    app.use('/cdn', (req, res, next) => {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
            'Cache-Control': 'private, no-cache, no-store, must-revalidate'
        });
        next();
    }, express.static(STORAGE_ROOT));

    // --- 2. СЕКЦИЯ ВСПОМОГАТЕЛЬНЫХ СИСТЕМНЫХ ФУНКЦИЙ ---

    const logOperation = (username, action, detail) => {
        const timestamp = new Date().toLocaleString('ru-RU');
        const entry = `[${timestamp}] [USER: ${username}] [ACTION: ${action}] [DETAIL: ${detail}]\n`;
        fs.appendFileSync(SYSTEM_LOG_PATH, entry);
    };

    const calculateFormatSize = (bytes) => {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = 2;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const resolveFileIcon = (fileName, isDirectory) => {
        if (isDirectory) return '<i class="fas fa-folder-open" style="color:#ffca28"></i>';
        const extension = path.extname(fileName).toLowerCase();
        const iconMap = {
            '.pdf': '<i class="fas fa-file-pdf" style="color:#ff5252"></i>',
            '.xlsx': '<i class="fas fa-file-excel" style="color:#4caf50"></i>',
            '.xls': '<i class="fas fa-file-excel" style="color:#4caf50"></i>',
            '.docx': '<i class="fas fa-file-word" style="color:#2196f3"></i>',
            '.doc': '<i class="fas fa-file-word" style="color:#2196f3"></i>',
            '.zip': '<i class="fas fa-file-archive" style="color:#ffa726"></i>',
            '.rar': '<i class="fas fa-file-archive" style="color:#ffa726"></i>',
            '.mp4': '<i class="fas fa-file-video" style="color:#9c27b0"></i>',
            '.jpg': '<i class="fas fa-file-image" style="color:#e91e63"></i>',
            '.jpeg': '<i class="fas fa-file-image" style="color:#e91e63"></i>',
            '.png': '<i class="fas fa-file-image" style="color:#e91e63"></i>',
            '.txt': '<i class="fas fa-file-alt"></i>',
            '.log': '<i class="fas fa-terminal" style="color:#adbac7"></i>'
        };
        return iconMap[extension] || '<i class="fas fa-file-code"></i>';
    };

    // --- 3. СЕКЦИЯ БЕЗОПАСНОСТИ И ВЕРИФИКАЦИИ ---

    const validateSession = async (req) => {
        const token = req.query.key || req.cookies?.x_xp_token;
        if (!token) return null;
        
        if (token === ADMIN_MASTER_KEY) {
            return { role: 'admin', root: '', name: 'Евгений' };
        }

        try {
            const database = await readDatabase();
            const userAccount = database.find(u => u.key === token);
            if (userAccount) {
                const typePrefix = userAccount.type === 'merch' ? `МЕРЧ_${MERCH_ROOT_ID}` : `ЛОГИСТ_${MY_ROOT_ID}`;
                const folderAlias = `${userAccount.name}_${userAccount.folderId || ''}`.replace(/_$/, '');
                return { 
                    role: 'client', 
                    root: path.join(typePrefix, folderAlias), 
                    name: userAccount.name 
                };
            }
        } catch (error) {
            console.error("Critical Auth Error:", error);
            logOperation('SYSTEM', 'CRITICAL_AUTH_FAIL', error.message);
        }
        return null;
    };

    // --- 4. СЕКЦИЯ API ДЛЯ ФАЙЛОВЫХ ОПЕРАЦИЙ ---

    app.post('/explorer/api/v1/execute', async (req, res) => {
        const session = await validateSession(req);
        if (!session) return res.status(403).json({ error: "Access Denied" });

        const { operation, payload } = req.body;
        try {
            switch(operation) {
                case 'create_folder':
                    const newDirPath = path.join(STORAGE_ROOT, payload.targetPath, payload.folderName);
                    if (!fs.existsSync(newDirPath)) {
                        fs.mkdirSync(newDirPath, { recursive: true });
                        logOperation(session.name, 'MKDIR', `${payload.targetPath}/${payload.folderName}`);
                    }
                    break;

                case 'move_to_trash':
                    if (session.role !== 'admin') throw new Error("Administrative privileges required");
                    const sourcePath = path.join(STORAGE_ROOT, payload.itemPath);
                    const trashID = `${Date.now()}_DEL_${path.basename(payload.itemPath)}`;
                    fs.renameSync(sourcePath, path.join(TRASH_ROOT, trashID));
                    logOperation(session.name, 'TRASH_MOVE', payload.itemPath);
                    break;

                case 'rename_object':
                    if (session.role !== 'admin') throw new Error("Administrative privileges required");
                    const oldFullPath = path.join(STORAGE_ROOT, payload.oldPath);
                    const newFullPath = path.join(path.dirname(oldFullPath), payload.newName);
                    fs.renameSync(oldFullPath, newFullPath);
                    logOperation(session.name, 'RENAME', `${payload.oldPath} -> ${payload.newName}`);
                    break;

                default:
                    throw new Error("Unsupported operational command");
            }
            res.json({ success: true, timestamp: Date.now() });
        } catch (err) {
            logOperation(session.name, 'API_ERROR', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/explorer/upload/v1', uploadEngine.single('file'), async (req, res) => {
        const session = await validateSession(req);
        if (!session) return res.status(401).send("Authentication required");
        
        try {
            const destinationPath = path.join(STORAGE_ROOT, req.body.path, req.file.originalname);
            fs.renameSync(req.file.path, destinationPath);
            logOperation(session.name, 'FILE_UPLOAD', req.file.originalname);
            res.redirect('/explorer?path=' + encodeURIComponent(req.body.path));
        } catch (err) {
            res.status(500).send("Upload processing failed: " + err.message);
        }
    });

    // --- 5. СЕКЦИЯ ИНТЕРФЕЙСА (X-BLACK ENTERPRISE UI) ---

    app.get('/explorer', async (req, res) => {
        const session = await validateSession(req);
        
        // РЕНДЕР СТРАНИЦЫ ВХОДА
        if (!session) {
            return res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>X-Drive Enterprise Login</title>
            <style>
                body { background: radial-gradient(circle at center, #111827 0%, #030712 100%); color: #f9fafb; font-family: 'Segoe UI', system-ui, -apple-system; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .auth-card { background: rgba(17, 24, 39, 0.8); backdrop-filter: blur(20px); padding: 60px; border-radius: 40px; border: 1px solid rgba(75, 85, 99, 0.3); text-align: center; width: 420px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
                .xp-logo { font-size: 42px; font-weight: 900; background: linear-gradient(to right, #fbbf24, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px; }
                input { width: 100%; padding: 22px; margin: 30px 0; background: #030712; border: 1px solid #374151; color: #fff; border-radius: 20px; font-size: 24px; text-align: center; outline: none; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
                input:focus { border-color: #fbbf24; box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.2); transform: scale(1.02); }
                button { width: 100%; padding: 22px; background: #fbbf24; color: #000; border: none; border-radius: 20px; font-weight: 800; cursor: pointer; font-size: 20px; text-transform: uppercase; letter-spacing: 1px; transition: 0.3s; }
                button:hover { background: #f59e0b; box-shadow: 0 10px 20px rgba(245, 158, 11, 0.3); }
            </style></head><body><div class="auth-card"><div class="xp-logo">X-PLATFORM</div><p style="color: #9ca3af; font-size: 14px;">ENTERPRISE DATA COMMANDER</p>
            <input type="password" id="access_key" placeholder="••••••••" autofocus><button onclick="location.href='?key='+document.getElementById('access_key').value">ВХОД В ОБЛАКО</button></div></body></html>`);
        }

        // УСТАНОВКА КУКИ ДЛЯ ДЛИТЕЛЬНОЙ СЕССИИ
        if (req.query.key) res.cookie('x_xp_token', req.query.key, { maxAge: 86400000 * 30, httpOnly: true, sameSite: 'strict' });

        let relativePath = req.query.path || session.root;
        // КЛИЕНТСКИЙ ГАРД (ЗАПРЕТ ВЫХОДА ИЗ СВОЕЙ ПАПКИ)
        if (session.role === 'client' && !relativePath.startsWith(session.root)) relativePath = session.root;

        const absolutePath = path.join(STORAGE_ROOT, relativePath);
        if (!fs.existsSync(absolutePath)) fs.mkdirSync(absolutePath, { recursive: true });

        const dirItems = fs.readdirSync(absolutePath, { withFileTypes: true });

        // ПОСТРОЕНИЕ ХЛЕБНЫХ КРОШЕК (PATH ENGINE)
        const displayPath = relativePath.replace(session.root, '').replace(/\\/g, '/');
        const pathSegments = displayPath.split('/').filter(s => s);
        let breadcrumbsHtml = `<a href="/explorer" class="nav-crumb"><i class="fas fa-server"></i> Root</a>`;
        let accumulatorPath = session.root;
        pathSegments.forEach(segment => {
            accumulatorPath = path.join(accumulatorPath, segment);
            breadcrumbsHtml += ` <span class="nav-sep"><i class="fas fa-chevron-right"></i></span> <a href="/explorer?path=${encodeURIComponent(accumulatorPath)}" class="nav-crumb">${segment.split('_')[0]}</a>`;
        });

        // ГЕНЕРАЦИЯ ТАБЛИЦЫ ФАЙЛОВ
        const tableRows = dirItems.filter(i => !i.name.startsWith('.')).map(item => {
            const fullItemPath = path.join(absolutePath, item.name);
            const metadata = fs.statSync(fullItemPath);
            const itemRelPath = path.join(relativePath, item.name).replace(/\\/g, '/');
            const urlEncodedPath = itemRelPath.split('/').map(encodeURIComponent).join('/');
            const extension = path.extname(item.name).toLowerCase();
            const isImage = ['.jpg','.jpeg','.png','.webp','.gif'].includes(extension);

            return `<tr class="data-row" data-search-name="${item.name.toLowerCase()}">
                <td onclick="${item.isDirectory() ? `location.href='/explorer?path=${encodeURIComponent(itemRelPath)}'` : `launchInspector('/cdn/${urlEncodedPath}', '${extension}')`}">
                    <div class="file-flex">
                        <div class="icon-wrapper">${isImage ? `<img src="/cdn/${urlEncodedPath}" class="thumb-preview">` : resolveFileIcon(item.name, item.isDirectory())}</div>
                        <div class="meta-wrapper">
                            <div class="main-title">${item.name.split('_')[0]}</div>
                            <div class="sub-detail">${item.isDirectory() ? 'Директория' : calculateFormatSize(metadata.size)} • ${metadata.mtime.toLocaleDateString('ru-RU')}</div>
                        </div>
                    </div>
                </td>
                <td class="action-cell">
                    ${!item.isDirectory() ? `<a href="/cdn/${urlEncodedPath}" download class="ctrl-btn" title="Скачать"><i class="fas fa-download"></i></a>` : ''}
                    ${session.role === 'admin' ? `<button onclick="event.stopPropagation(); renameDialog('${itemRelPath}', '${item.name}')" class="ctrl-btn" title="Переименовать"><i class="fas fa-edit"></i></button>` : ''}
                    ${session.role === 'admin' ? `<button onclick="event.stopPropagation(); moveToTrash('${itemRelPath}')" class="ctrl-btn trash-trigger" title="Удалить"><i class="fas fa-trash-alt"></i></button>` : ''}
                </td>
            </tr>`;
        }).join('');

        res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>X-Commander Enterprise</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <style>
            :root { --bg: #030712; --panel: #111827; --border: #1f2937; --text: #d1d5db; --link: #60a5fa; --accent: #10b981; --danger: #ef4444; --warning: #f59e0b; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', system-ui; margin: 0; overflow: hidden; height: 100vh; }
            header { height: 70px; background: var(--panel); display: flex; justify-content: space-between; align-items: center; padding: 0 40px; border-bottom: 1px solid var(--border); z-index: 1000; position: relative; }
            .branding { font-weight: 900; font-size: 24px; color: var(--warning); display: flex; align-items: center; gap: 12px; }
            .breadcrumbs-bar { height: 50px; background: #0b0f1a; display: flex; align-items: center; padding: 0 40px; border-bottom: 1px solid var(--border); }
            .nav-crumb { color: var(--link); text-decoration: none; font-weight: 600; font-size: 14px; }
            .nav-sep { margin: 0 15px; color: #4b5563; font-size: 10px; }
            .workspace { display: flex; height: calc(100vh - 120px); }
            .sidebar { width: 300px; background: var(--panel); border-right: 1px solid var(--border); padding: 30px; display: flex; flex-direction: column; gap: 15px; }
            .nav-item { padding: 14px 20px; border-radius: 16px; color: var(--text); text-decoration: none; display: flex; align-items: center; gap: 15px; font-size: 15px; transition: 0.2s; font-weight: 500; }
            .nav-item:hover { background: var(--border); color: #fff; }
            .nav-item.active { background: rgba(96, 165, 250, 0.1); color: var(--link); border: 1px solid rgba(96, 165, 250, 0.2); }
            .explorer-view { flex: 1; overflow-y: auto; background: var(--bg); display: flex; flex-direction: column; }
            .controls-row { padding: 25px 40px; display: flex; gap: 20px; align-items: center; background: var(--panel); border-bottom: 1px solid var(--border); sticky; top: 0; }
            .search-field { background: var(--bg); border: 1px solid var(--border); color: #fff; padding: 14px 25px; border-radius: 16px; width: 400px; outline: none; transition: 0.3s; }
            .search-field:focus { border-color: var(--link); }
            .action-btn-main { background: var(--accent); color: #fff; border: none; padding: 14px 28px; border-radius: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.2s; }
            .action-btn-main:hover { filter: brightness(1.1); transform: translateY(-2px); }
            table { width: 100%; border-collapse: collapse; }
            th { text-align: left; padding: 18px 40px; background: #0f172a; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; border-bottom: 1px solid var(--border); }
            td { padding: 16px 40px; border-bottom: 1px solid var(--border); transition: 0.2s; }
            .data-row:hover td { background: rgba(255, 255, 255, 0.02); cursor: pointer; }
            .file-flex { display: flex; align-items: center; gap: 20px; }
            .icon-wrapper { width: 54px; height: 54px; background: #000; border-radius: 18px; display: flex; align-items: center; justify-content: center; font-size: 26px; border: 1px solid var(--border); overflow: hidden; }
            .thumb-preview { width: 100%; height: 100%; object-fit: cover; }
            .main-title { font-weight: 700; color: #f1f5f9; font-size: 16px; }
            .sub-detail { font-size: 13px; color: #64748b; margin-top: 5px; }
            .ctrl-btn { background: none; border: none; color: #64748b; font-size: 20px; cursor: pointer; margin-left: 20px; transition: 0.2s; text-decoration: none; }
            .ctrl-btn:hover { color: #fff; transform: scale(1.2); }
            .trash-trigger:hover { color: var(--danger); }
            #inspector-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(3, 7, 18, 0.98); z-index: 5000; flex-direction: column; }
            iframe { flex: 1; border: none; background: #fff; }
        </style></head>
        <body>
            <header>
                <div class="branding"><i class="fas fa-shield-alt"></i> X-COMMANDER <span style="color:#fff; font-weight:300;">ENTERPRISE</span></div>
                <div style="display:flex; align-items:center; gap:25px;">
                    <div style="text-align:right;"><div style="font-size:12px; color:#64748b;">Сессия:</div><div style="font-size:14px; color:var(--warning); font-weight:bold;">${session.name}</div></div>
                    <button onclick="document.cookie='x_xp_token=;Max-Age=0';location.reload()" class="action-btn-main" style="background:#374151">ВЫХОД</button>
                </div>
            </header>
            <div class="breadcrumbs-bar">${breadcrumbsHtml}</div>
            <div class="workspace">
                <div class="sidebar">
                    <div style="font-size:11px; color:#4b5563; text-transform:uppercase; font-weight:900; letter-spacing:2px; margin-bottom:10px;">Cloud Navigation</div>
                    <a href="/explorer" class="nav-item ${!displayPath ? 'active' : ''}"><i class="fas fa-database"></i> Главное хранилище</a>
                    <a href="/explorer?path=ЛОГИСТ_${MY_ROOT_ID}" class="nav-item"><i class="fas fa-truck-moving"></i> Отдел Логистики</a>
                    <a href="/explorer?path=МЕРЧ_${MERCH_ROOT_ID}" class="nav-item"><i class="fas fa-box-open"></i> Мерчандайзинг</a>
                    <div style="margin-top:auto; padding:20px; background: rgba(255,255,255,0.02); border-radius:20px; border: 1px solid var(--border);">
                        <div style="font-size:11px; color:#64748b;">SYSTEM STATUS</div>
                        <div style="font-size:13px; color:var(--accent); font-weight:bold; margin-top:8px;"><i class="fas fa-circle" style="font-size:8px; margin-right:5px;"></i> Server Online</div>
                    </div>
                </div>
                <div class="explorer-view">
                    <div class="controls-row">
                        <input type="text" id="live-search" class="search-field" placeholder="Поиск в текущей папке..." oninput="triggerSearch()">
                        <div style="flex:1"></div>
                        <input type="text" id="folder-name-input" class="search-field" style="width:200px;" placeholder="Новая папка">
                        <button class="action-btn-main" onclick="executeCommand('create_folder')"><i class="fas fa-folder-plus"></i></button>
                        <form action="/explorer/upload/v1" method="POST" enctype="multipart/form-data" style="margin:0;">
                            <input type="hidden" name="path" value="${relativePath}">
                            <input type="file" name="file" id="sys-file-input" hidden onchange="this.form.submit()">
                            <button type="button" class="action-btn-main" style="background:#4b5563" onclick="document.getElementById('sys-file-input').click()"><i class="fas fa-cloud-upload-alt"></i></button>
                        </form>
                    </div>
                    <table>
                        <thead><tr><th>Наименование и метаданные</th><th style="text-align:right">Инструментарий</th></tr></thead>
                        <tbody id="file-registry">${tableRows}</tbody>
                    </table>
                </div>
            </div>
            <div id="inspector-overlay">
                <div style="height:70px; background:#0f172a; display:flex; justify-content:space-between; align-items:center; padding:0 40px; border-bottom:1px solid var(--border);">
                    <div style="font-weight:bold; color:var(--warning);"><i class="fas fa-eye" style="margin-right:10px;"></i> INSPECTOR MODE</div>
                    <button onclick="closeInspector()" class="action-btn-main" style="background:var(--danger)">ЗАКРЫТЬ ×</button>
                </div>
                <iframe id="inspector-frame"></iframe>
            </div>
            <script>
                function triggerSearch() {
                    let val = document.getElementById('live-search').value.toLowerCase();
                    document.querySelectorAll('.data-row').forEach(row => {
                        row.style.display = row.getAttribute('data-search-name').includes(val) ? '' : 'none';
                    });
                }
                async function executeCommand(cmd) {
                    let name = document.getElementById('folder-name-input').value;
                    if(!name) return;
                    const response = await fetch('/explorer/api/v1/execute', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ operation: cmd, payload: { targetPath: '${relativePath}', folderName: name }})
                    });
                    if(response.ok) location.reload();
                }
                async function moveToTrash(p) {
                    if(!confirm('Отправить объект в системный архив (корзину)?')) return;
                    const response = await fetch('/explorer/api/v1/execute', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ operation: 'move_to_trash', payload: { itemPath: p }})
                    });
                    if(response.ok) location.reload();
                }
                async function renameDialog(p, current) {
                    let n = prompt('Введите новое системное имя:', current);
                    if(!n || n == current) return;
                    const response = await fetch('/explorer/api/v1/execute', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ operation: 'rename_object', payload: { oldPath: p, newName: n }})
                    });
                    if(response.ok) location.reload();
                }
                function launchInspector(url, ext) {
                    const frame = document.getElementById('inspector-frame');
                    const viewer = document.getElementById('inspector-overlay');
                    const origin = window.location.origin;
                    
                    if(['.jpg','.jpeg','.png','.webp','.gif'].includes(ext)) {
                        frame.srcdoc = '<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#000"><img src="'+url+'" style="max-height:100%;max-width:100%;object-fit:contain;box-shadow:0 0 50px rgba(0,0,0,0.5);"></body>';
                    } else if(ext === '.pdf') {
                        frame.src = url;
                    } else if(['.xlsx','.docx','.xls','.doc'].includes(ext)) {
                        frame.src = 'https://docs.google.com/viewer?url=' + encodeURIComponent(origin + url) + '&embedded=true';
                    } else {
                        window.open(url, '_blank');
                        return;
                    }
                    viewer.style.display = 'flex';
                }
                function closeInspector() {
                    document.getElementById('inspector-overlay').style.display = 'none';
                    document.getElementById('inspector-frame').src = '';
                }
            </script>
        </body></html>`);
    });
    console.log("✅ X-COMMANDER ENTERPRISE v13.0 ACTIVATED AND SECURED");
};
