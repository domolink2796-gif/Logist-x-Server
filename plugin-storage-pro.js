/**
 * plugin-storage-pro.js
 * ULTIMATE CLONE ENGINE v3.0 - X-COMMANDER EDITION
 * Полная интеграция с server.js (Logist_X & Merch_X)
 */

const multer = require('multer');
const fs = require('fs');
const { Readable } = require('stream');
const path = require('path');

module.exports = function(app, ctx) {
    const { drive, readDatabase, MY_ROOT_ID, MERCH_ROOT_ID } = ctx;
    const upload = multer({ dest: 'uploads/' });

    // --- API: СПИСОК ФАЙЛОВ ---
    app.get('/storage/api/files', async (req, res) => {
        try {
            const folderId = req.query.folderId || MY_ROOT_ID;
            const response = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'files(id, name, mimeType, size, modifiedTime, thumbnailLink, iconLink)',
                orderBy: 'folder,name'
            });
            res.json(response.data.files);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // --- API: ЗАГРУЗКА С ПРАВИЛОМ ПЕРЕИМЕНОВАНИЯ (АДРЕС НОМЕР ПОДЪЕЗД) ---
    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            const { folderId, street, house, entrance } = req.body;
            let finalName = req.file.originalname;

            // Применяем твоё правило переименования, если заполнены поля
            if (street && house) {
                const extension = path.extname(req.file.originalname);
                finalName = `${street} ${house}${entrance ? ' под ' + entrance : ''}${extension}`;
            }

            const media = {
                mimeType: req.file.mimetype,
                body: fs.createReadStream(req.file.path)
            };

            const file = await drive.files.create({
                resource: { name: finalName, parents: [folderId || MY_ROOT_ID] },
                media: media,
                fields: 'id, name'
            });

            fs.unlinkSync(req.file.path);
            res.json({ success: true, file: file.data });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // --- ОСНОВНОЙ HTML ДВИЖОК ---
    app.get('/storage', async (req, res) => {
        res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>X-Commander | Google Drive Professional</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --g-blue: #1a73e8;
            --g-red: #ea4335;
            --g-yellow: #fbbc05;
            --g-green: #34a853;
            --sidebar-w: 256px;
            --border: #dadce0;
            --text: #3c4043;
        }

        body, html { margin: 0; padding: 0; height: 100%; font-family: 'Roboto', sans-serif; background: #fff; color: var(--text); overflow: hidden; }

        /* HEADER */
        header {
            height: 64px; border-bottom: 1px solid var(--border);
            display: flex; align-items: center; justify-content: space-between; padding: 0 16px;
            background: #fff; z-index: 100; position: relative;
        }
        .logo-section { display: flex; align-items: center; width: var(--sidebar-w); cursor: pointer; }
        .logo-section i { font-size: 28px; color: var(--g-blue); margin-right: 12px; }
        .logo-section span { font-family: 'Google Sans'; font-size: 22px; color: #5f6368; }

        .search-container { flex: 1; max-width: 722px; position: relative; }
        .search-bar {
            height: 48px; background: #f1f3f4; border-radius: 8px;
            display: flex; align-items: center; padding: 0 16px; transition: 0.2s;
        }
        .search-bar:focus-within { background: #fff; box-shadow: 0 1px 1px rgba(0,0,0,0.2); border: 1px solid transparent; }
        .search-bar input { border: none; background: transparent; width: 100%; outline: none; font-size: 16px; margin-left: 12px; }

        /* LAYOUT */
        .wrapper { display: flex; height: calc(100vh - 64px); }

        /* SIDEBAR */
        aside { width: var(--sidebar-w); padding-top: 8px; flex-shrink: 0; }
        .create-btn {
            margin: 4px 16px 16px; width: 115px; height: 48px; border-radius: 24px;
            background: #fff; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: pointer; font-family: 'Google Sans'; font-weight: 500;
        }
        .create-btn:hover { box-shadow: 0 4px 8px rgba(0,0,0,0.15); background: #f8f9fa; }
        .create-btn img { width: 24px; margin-right: 12px; }

        .nav-link {
            height: 40px; display: flex; align-items: center; padding: 0 24px;
            border-radius: 0 20px 20px 0; cursor: pointer; font-size: 14px; margin-right: 8px;
        }
        .nav-link:hover { background: #f1f3f4; }
        .nav-link.active { background: #e8f0fe; color: var(--g-blue); font-weight: 500; }
        .nav-link i { margin-right: 18px; width: 20px; text-align: center; font-size: 18px; }

        /* MAIN VIEW */
        main { flex: 1; display: flex; flex-direction: column; background: #fff; border-top-left-radius: 16px; border: 1px solid var(--border); overflow: hidden; }
        .toolbar { height: 48px; display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--border); }
        .breadcrumb { font-family: 'Google Sans'; font-size: 18px; display: flex; align-items: center; }
        
        .table-view { flex: 1; overflow-y: auto; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 12px; font-size: 13px; color: #5f6368; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: #fff; }
        td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
        tr:hover td { background: #f5f5f5; cursor: pointer; }

        /* MODALS */
        .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 1000; }
        .smart-modal {
            display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: #fff; width: 450px; border-radius: 8px; box-shadow: 0 24px 38px rgba(0,0,0,0.2);
            padding: 24px; z-index: 1001;
        }
        .smart-modal h2 { margin-top: 0; font-family: 'Google Sans'; font-size: 20px; }
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-size: 12px; color: var(--g-blue); margin-bottom: 4px; font-weight: 500; }
        .form-group input { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 4px; box-sizing: border-box; font-size: 14px; outline: none; }
        .form-group input:focus { border-color: var(--g-blue); }
        .btn-row { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
        .btn { padding: 8px 24px; border-radius: 4px; border: none; font-weight: 500; cursor: pointer; font-family: 'Google Sans'; }
        .btn-cancel { background: none; color: #5f6368; }
        .btn-confirm { background: var(--g-blue); color: #fff; }

        /* DROP ZONE */
        .drop-zone { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(26, 115, 232, 0.1); border: 2px dashed var(--g-blue); display: none; align-items: center; justify-content: center; z-index: 50; }
    </style>
</head>
<body>

    <header>
        <div class="logo-section">
            <i class="fab fa-xbox"></i>
            <span>X-Commander</span>
        </div>
        <div class="search-container">
            <div class="search-bar">
                <i class="fas fa-search" style="color:#5f6368"></i>
                <input type="text" placeholder="Поиск в Логистике и Мерче">
            </div>
        </div>
        <div style="width: var(--sidebar-w); display:flex; justify-content: flex-end; align-items: center;">
            <i class="fas fa-cog" style="margin-right:20px; color:#5f6368"></i>
            <div style="width:32px; height:32px; background:var(--g-blue); border-radius:50%; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:500;">A</div>
        </div>
    </header>

    <div class="wrapper">
        <aside>
            <div class="create-btn" onclick="openSmartUpload()">
                <img src="https://upload.wikimedia.org/wikipedia/commons/9/9e/Plus_symbol.svg">
                <span>Создать</span>
            </div>
            <div class="nav-link active" onclick="loadFiles('${MY_ROOT_ID}', 'Мой диск')"><i class="fas fa-hdd"></i> Мой диск</div>
            <div class="nav-link" onclick="loadFiles('${MY_ROOT_ID}', 'Логистика')"><i class="fas fa-truck"></i> Логистика</div>
            <div class="nav-link" onclick="loadFiles('${MERCH_ROOT_ID}', 'Мерч X')"><i class="fas fa-box"></i> Мерч X</div>
            <div class="nav-link"><i class="fas fa-clock"></i> Недавние</div>
            <div class="nav-link"><i class="fas fa-trash-alt"></i> Корзина</div>
            <div style="margin-top:auto; padding: 24px; border-top: 1px solid var(--border)">
                <div style="height:4px; background:#eee; border-radius:2px; margin-bottom:8px;"><div style="width:60%; height:100%; background:var(--g-blue); border-radius:2px;"></div></div>
                <span style="font-size:12px; color:#5f6368">Использовано 9.2 ГБ из 15 ГБ</span>
            </div>
        </aside>

        <main id="drop-target">
            <div class="toolbar">
                <div class="breadcrumb" id="current-path">Мой диск</div>
            </div>
            <div class="table-view">
                <table>
                    <thead>
                        <tr>
                            <th style="width:45%">Название</th>
                            <th>Владелец</th>
                            <th>Последнее изменение</th>
                            <th>Размер</th>
                        </tr>
                    </thead>
                    <tbody id="file-body"></tbody>
                </table>
            </div>
            <div class="drop-zone" id="drop-zone">
                <div style="text-align:center; color:var(--g-blue)">
                    <i class="fas fa-cloud-upload-alt" style="font-size:48px"></i>
                    <h2>Перетащите файлы для загрузки</h2>
                </div>
            </div>
        </main>
    </div>

    <div class="modal-overlay" id="modal-overlay" onclick="closeSmartUpload()"></div>
    <div class="smart-modal" id="smart-modal">
        <h2>Загрузка в X-Commander</h2>
        <div class="form-group">
            <label>УЛИЦА</label>
            <input type="text" id="street" placeholder="Напр. Ленина">
        </div>
        <div class="form-group">
            <label>НОМЕР ДОМА</label>
            <input type="text" id="house" placeholder="Напр. 45/1">
        </div>
        <div class="form-group">
            <label>ПОДЪЕЗД</label>
            <input type="text" id="entrance" placeholder="Напр. 3">
        </div>
        <div class="form-group">
            <label>ВЫБЕРИТЕ ФАЙЛ</label>
            <input type="file" id="file-input">
        </div>
        <div class="btn-row">
            <button class="btn btn-cancel" onclick="closeSmartUpload()">ОТМЕНА</button>
            <button class="btn btn-confirm" onclick="startSmartUpload()">ЗАГРУЗИТЬ</button>
        </div>
    </div>

    <script>
        let currentFolder = '${MY_ROOT_ID}';

        async function loadFiles(id, name) {
            currentFolder = id;
            document.getElementById('current-path').innerText = name;
            const res = await fetch(\`/storage/api/files?folderId=\${id}\`);
            const files = await res.json();
            const body = document.getElementById('file-body');
            body.innerHTML = '';

            files.forEach(f => {
                const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
                const row = document.createElement('tr');
                row.innerHTML = \`
                    <td><i class="fas \${isFolder?'fa-folder':'fa-file-alt'}" style="margin-right:12px; color:\${isFolder?'#5f6368':'#4285f4'}"></i> \${f.name}</td>
                    <td>Я</td>
                    <td>\${new Date(f.modifiedTime).toLocaleDateString()}</td>
                    <td>\${f.size ? (f.size/1024/1024).toFixed(1) + ' МБ' : '—'}</td>
                \`;
                row.onclick = () => isFolder ? loadFiles(f.id, f.name) : null;
                body.appendChild(row);
            });
        }

        function openSmartUpload() {
            document.getElementById('modal-overlay').style.display = 'block';
            document.getElementById('smart-modal').style.display = 'block';
        }

        function closeSmartUpload() {
            document.getElementById('modal-overlay').style.display = 'none';
            document.getElementById('smart-modal').style.display = 'none';
        }

        async function startSmartUpload() {
            const file = document.getElementById('file-input').files[0];
            if(!file) return alert('Выберите файл');

            const fd = new FormData();
            fd.append('file', file);
            fd.append('folderId', currentFolder);
            fd.append('street', document.getElementById('street').value);
            fd.append('house', document.getElementById('house').value);
            fd.append('entrance', document.getElementById('entrance').value);

            closeSmartUpload();
            const res = await fetch('/storage/api/upload', { method: 'POST', body: fd });
            if(res.ok) loadFiles(currentFolder, document.getElementById('current-path').innerText);
        }

        // Drag-and-Drop Логика
        const target = document.getElementById('drop-target');
        const zone = document.getElementById('drop-zone');

        target.ondragover = (e) => { e.preventDefault(); zone.style.display = 'flex'; };
        zone.ondragleave = () => { zone.style.display = 'none'; };
        zone.ondrop = (e) => {
            e.preventDefault();
            zone.style.display = 'none';
            document.getElementById('file-input').files = e.dataTransfer.files;
            openSmartUpload();
        };

        loadFiles('${MY_ROOT_ID}', 'Мой диск');
    </script>
</body>
</html>
        `);
    });
};
