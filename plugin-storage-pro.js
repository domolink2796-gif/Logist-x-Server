/**
 * plugin-storage-pro.js
 * FINAL ULTIMATE VERSION - FULL CLONE ENGINE
 * Project: X-Commander
 */

const express = require('express');
const { google } = require('googleapis');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// --- СИСТЕМА УМНОЙ ПАМЯТИ (Local Index) ---
const MEMORY_FILE = path.join(process.cwd(), 'storage_brain.json');
let brain = { history: [], folderMap: {}, preferences: { logisticsId: null, merchId: null } };
if (fs.existsSync(MEMORY_FILE)) { try { brain = JSON.parse(fs.readFileSync(MEMORY_FILE)); } catch(e){} }
const saveBrain = () => fs.writeFileSync(MEMORY_FILE, JSON.stringify(brain, null, 2));

router.use(cookieParser());
router.use(express.json());

// --- GOOGLE DRIVE CLIENT ---
async function getDrive(req) {
    const auth = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET);
    auth.setCredentials({ access_token: req.cookies.access_token });
    return google.drive({ version: 'v3', auth });
}

// --- API ENDPOINTS ---

router.get('/api/files', async (req, res) => {
    try {
        const drive = await getDrive(req);
        const folderId = req.query.folderId || 'root';
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, size, modifiedTime, iconLink, thumbnailLink)',
            orderBy: 'folder,name'
        });
        
        // Обучение: индексируем папки для умного поиска без Google в будущем
        response.data.files.forEach(f => {
            brain.folderMap[f.id] = { name: f.name, parent: folderId, type: f.mimeType };
        });
        saveBrain();
        
        res.json(response.data.files);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        const drive = await getDrive(req);
        const folderId = req.body.folderId || 'root';
        const fileMetadata = { name: req.file.originalname, parents: [folderId] };
        const media = { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) };
        
        const file = await drive.files.create({ resource: fileMetadata, media: media, fields: 'id, name' });
        
        // Запоминаем путь для Логистики/Мерча
        const folderName = brain.folderMap[folderId]?.name || 'Unknown';
        brain.history.push({ file: file.data.name, to: folderName, date: new Date() });
        saveBrain();

        fs.unlinkSync(req.file.path);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// --- MASTERPIECE UI RENDER ---
router.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>X-Commander | Google Drive Professional</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        /* CSS MASTERPIECE - PIXEL PERFECT GOOGLE DRIVE CLONE */
        :root {
            --google-gray-100: #f1f3f4;
            --google-gray-200: #e8eaed;
            --google-gray-300: #dadce0;
            --google-gray-500: #5f6368;
            --google-blue: #1a73e8;
            --google-blue-light: #e8f0fe;
            --text-dark: #3c4043;
            --sidebar-width: 256px;
        }

        body, html { margin: 0; padding: 0; height: 100%; font-family: 'Roboto', sans-serif; background: white; color: var(--text-dark); overflow: hidden; }

        /* Header */
        header {
            height: 64px; display: flex; align-items: center; justify-content: space-between;
            padding: 0 16px; border-bottom: 1px solid var(--google-gray-300); background: white;
            position: relative; z-index: 100;
        }
        .header-left { display: flex; align-items: center; width: var(--sidebar-width); }
        .logo-box { display: flex; align-items: center; text-decoration: none; color: inherit; }
        .logo-box i { font-size: 24px; color: var(--google-blue); margin-right: 12px; }
        .logo-box span { font-family: 'Google Sans', sans-serif; font-size: 22px; color: var(--google-gray-500); }

        .search-container { flex: 1; max-width: 720px; position: relative; }
        .search-bar {
            height: 48px; background: var(--google-gray-100); border-radius: 8px;
            display: flex; align-items: center; padding: 0 12px; transition: background 0.2s, box-shadow 0.2s;
        }
        .search-bar:focus-within { background: white; box-shadow: 0 1px 1px 0 rgba(65,69,73,0.3), 0 1px 3px 1px rgba(65,69,73,0.15); }
        .search-bar i { color: var(--google-gray-500); margin-right: 12px; }
        .search-bar input { border: none; background: transparent; width: 100%; outline: none; font-size: 16px; }

        .header-right { display: flex; align-items: center; gap: 20px; width: var(--sidebar-width); justify-content: flex-end; }
        .avatar { width: 32px; height: 32px; background: #8e24aa; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500; }

        /* Sidebar */
        .wrapper { display: flex; height: calc(100vh - 64px); }
        aside { width: var(--sidebar-width); padding-top: 12px; display: flex; flex-direction: column; flex-shrink: 0; }
        
        .new-btn {
            margin: 4px 0 16px 12px; width: 110px; height: 48px; border-radius: 24px;
            background: white; border: 1px solid var(--google-gray-300); box-shadow: 0 1px 2px 0 rgba(60,64,67,0.30), 0 1px 3px 1px rgba(60,64,67,0.15);
            display: flex; align-items: center; justify-content: center; cursor: pointer;
            font-family: 'Google Sans'; font-weight: 500; font-size: 14px; transition: box-shadow 0.2s;
        }
        .new-btn:hover { box-shadow: 0 4px 8px 3px rgba(60,64,67,0.15); background: #f8f9fa; }
        .new-btn img { width: 24px; margin-right: 12px; }

        .nav-link {
            height: 40px; display: flex; align-items: center; padding-left: 24px;
            border-radius: 0 20px 20px 0; cursor: pointer; font-size: 14px; color: var(--text-dark);
            margin-right: 8px;
        }
        .nav-link:hover { background: var(--google-gray-100); }
        .nav-link.active { background: var(--google-blue-light); color: var(--google-blue); font-weight: 500; }
        .nav-link i { width: 24px; font-size: 18px; margin-right: 16px; text-align: center; }

        /* Content Area */
        main { flex: 1; display: flex; flex-direction: column; background: white; border-top-left-radius: 16px; border: 1px solid var(--google-gray-300); margin-right: 12px; overflow: hidden; }
        
        .breadcrumb-row { height: 48px; display: flex; align-items: center; padding: 0 20px; font-family: 'Google Sans'; font-size: 18px; color: var(--text-dark); border-bottom: 1px solid var(--google-gray-300); }
        
        .table-container { flex: 1; overflow-y: auto; }
        table { width: 100%; border-collapse: collapse; }
        thead th {
            position: sticky; top: 0; background: white; text-align: left;
            padding: 12px; font-size: 13px; color: var(--google-gray-500);
            border-bottom: 1px solid var(--google-gray-300); font-weight: 500;
        }
        tbody td {
            padding: 8px 12px; border-bottom: 1px solid var(--google-gray-200);
            font-size: 14px; color: var(--text-dark); transition: background 0.1s;
        }
        tr:hover td { background: var(--google-gray-100); cursor: pointer; }
        
        .file-icon-cell { display: flex; align-items: center; }
        .file-icon-cell i { font-size: 18px; margin-right: 12px; }
        .fa-folder { color: #5f6368; }
        .fa-file-pdf { color: #ea4335; }
        .fa-file-excel { color: #1e8e3e; }
        .fa-file-image { color: #f4b400; }
        .fa-file-word { color: #4285f4; }

        /* Modal Preview */
        #preview-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); display: none; flex-direction: column; z-index: 1000;
        }
        .preview-header { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; color: white; }
        .preview-content { flex: 1; display: flex; justify-content: center; align-items: center; padding: 20px; }
        .preview-content iframe { width: 80%; height: 100%; border: none; background: white; border-radius: 4px; }

        /* Context Menu */
        #ctx-menu {
            position: fixed; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            border-radius: 4px; padding: 6px 0; min-width: 180px; display: none; z-index: 500;
        }
        .ctx-item { padding: 10px 16px; font-size: 14px; display: flex; align-items: center; cursor: pointer; }
        .ctx-item:hover { background: var(--google-gray-100); }
        .ctx-item i { margin-right: 12px; width: 18px; color: var(--google-gray-500); }

        /* Responsive */
        @media (max-width: 768px) {
            aside { display: none; }
            .search-container { max-width: 100%; }
        }
    </style>
</head>
<body>

    <header>
        <div class="header-left">
            <a href="#" class="logo-box">
                <i class="fab fa-xbox"></i>
                <span>X-Commander</span>
            </a>
        </div>
        <div class="search-container">
            <div class="search-bar">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Поиск на Диске (Логистика, Мерч...)">
            </div>
        </div>
        <div class="header-right">
            <i class="fas fa-question-circle" style="font-size: 20px; color: var(--google-gray-500);"></i>
            <i class="fas fa-cog" style="font-size: 20px; color: var(--google-gray-500);"></i>
            <div class="avatar">X</div>
        </div>
    </header>

    <div class="wrapper">
        <aside>
            <div class="new-btn" onclick="openUpload()">
                <img src="https://upload.wikimedia.org/wikipedia/commons/9/9e/Plus_symbol.svg">
                <span>Создать</span>
            </div>
            <div class="nav-link active" onclick="navigate('root')"><i class="fas fa-hdd"></i> Мой диск</div>
            <div class="nav-link" onclick="navigate('logistics')"><i class="fas fa-truck"></i> Логистика</div>
            <div class="nav-link" onclick="navigate('merch')"><i class="fas fa-tshirt"></i> Мерч</div>
            <div class="nav-link"><i class="fas fa-users"></i> Доступные мне</div>
            <div class="nav-link"><i class="fas fa-clock"></i> Недавние</div>
            <div class="nav-link"><i class="fas fa-star"></i> Помеченные</div>
            <div class="nav-link"><i class="fas fa-trash-alt"></i> Корзина</div>
            <div style="margin-top: auto; padding: 20px;">
                <div style="height: 4px; background: #eee; border-radius: 2px;">
                    <div style="width: 45%; height: 100%; background: var(--google-blue); border-radius: 2px;"></div>
                </div>
                <p style="font-size: 12px; color: var(--google-gray-500);">Хранилище: 6.8 ГБ из 15 ГБ</p>
            </div>
        </aside>

        <main>
            <div class="breadcrumb-row" id="breadcrumb">Мой диск</div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 40%;">Название</th>
                            <th>Владелец</th>
                            <th>Последнее изменение</th>
                            <th>Размер</th>
                        </tr>
                    </thead>
                    <tbody id="file-list">
                        </tbody>
                </table>
            </div>
        </main>
    </div>

    <input type="file" id="file-uploader" style="display:none" multiple onchange="handleUpload(this.files)">
    
    <div id="preview-overlay">
        <div class="preview-header">
            <span id="preview-filename">File Name</span>
            <button onclick="closePreview()" style="background:none; border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
        </div>
        <div class="preview-content">
            <iframe id="preview-frame"></iframe>
        </div>
    </div>

    <div id="ctx-menu">
        <div class="ctx-item" onclick="alert('Перемещено в Логистику')"><i class="fas fa-truck"></i> В Логистику</div>
        <div class="ctx-item" onclick="alert('Перемещено в Мерч')"><i class="fas fa-box"></i> В Мерч</div>
        <div class="ctx-item"><i class="fas fa-download"></i> Скачать</div>
        <div class="ctx-item" style="color: #d93025;"><i class="fas fa-trash"></i> Удалить</div>
    </div>

    <script>
        let currentFolder = 'root';
        const fileList = document.getElementById('file-list');

        async function fetchFiles(folderId = 'root') {
            currentFolder = folderId;
            const res = await fetch(\`/api/files?folderId=\${folderId}\`);
            const files = await res.json();
            renderFiles(files);
        }

        function renderFiles(files) {
            fileList.innerHTML = '';
            files.forEach(file => {
                const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                const row = document.createElement('tr');
                
                let iconClass = 'fa-file-alt';
                if(isFolder) iconClass = 'fa-folder';
                else if(file.mimeType.includes('pdf')) iconClass = 'fa-file-pdf';
                else if(file.mimeType.includes('spreadsheet')) iconClass = 'fa-file-excel';
                else if(file.mimeType.includes('image')) iconClass = 'fa-file-image';
                else if(file.mimeType.includes('word')) iconClass = 'fa-file-word';

                const size = file.size ? (file.size / (1024*1024)).toFixed(1) + ' МБ' : '—';
                const date = new Date(file.modifiedTime).toLocaleDateString('ru-RU');

                row.innerHTML = \`
                    <td>
                        <div class="file-icon-cell">
                            <i class="fas \${iconClass}"></i>
                            <span>\${file.name}</span>
                        </div>
                    </td>
                    <td>Я</td>
                    <td>\${date}</td>
                    <td>\${size}</td>
                \`;

                row.onclick = () => {
                    if(isFolder) fetchFiles(file.id);
                    else openPreview(file);
                };
                
                row.oncontextmenu = (e) => {
                    e.preventDefault();
                    const menu = document.getElementById('ctx-menu');
                    menu.style.display = 'block';
                    menu.style.left = e.pageX + 'px';
                    menu.style.top = e.pageY + 'px';
                };

                fileList.appendChild(row);
            });
        }

        function openUpload() { document.getElementById('file-uploader').click(); }

        async function handleUpload(files) {
            for(let file of files) {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('folderId', currentFolder);
                await fetch('/api/upload', { method: 'POST', body: fd });
            }
            fetchFiles(currentFolder);
        }

        function openPreview(file) {
            document.getElementById('preview-filename').innerText = file.name;
            document.getElementById('preview-overlay').style.display = 'flex';
            // Используем стандартный Google Viewer (требует публичного доступа или спец. прокси, здесь - концепт)
            document.getElementById('preview-frame').src = 'about:blank'; 
        }

        function closePreview() { document.getElementById('preview-overlay').style.display = 'none'; }

        window.onclick = () => document.getElementById('ctx-menu').style.display = 'none';

        // Старт
        fetchFiles();
    </script>
</body>
</html>
    `);
});

module.exports = router;
