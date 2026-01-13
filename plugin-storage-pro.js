const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');

module.exports = function(app, context) {
    // Создаем главную папку хранилища
    const STORAGE_ROOT = path.join(__dirname, 'storage');
    const LOGIST_DIR = path.join(STORAGE_ROOT, 'ЛОГИСТ');
    const MERCH_DIR = path.join(STORAGE_ROOT, 'МЕРЧ');

    [STORAGE_ROOT, LOGIST_DIR, MERCH_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    const upload = multer({ dest: 'uploads/' });

    // --- 1. АВТОДЕПЛОЙ ---
    setInterval(() => {
        exec('git fetch origin main', () => {
            exec('git status -uno', (err, out) => {
                if (out && out.includes('behind')) {
                    console.log("📡 Обнаружено обновление на GitHub, скачиваю...");
                    exec('git pull origin main', () => { exec('pm2 restart logist-final'); });
                }
            });
        });
    }, 300000);

    // --- 2. УМНОЕ ЗЕРКАЛО (СИНХРОНИЗАЦИЯ ИМЕН) ---
    const folderNames = new Map();
    folderNames.set(context.MY_ROOT_ID, 'ЛОГИСТ');
    folderNames.set(context.MERCH_ROOT_ID, 'МЕРЧ');

    // Перехватываем создание папок, чтобы знать их реальные имена
    const originalGetOrCreate = context.getOrCreateFolder;
    context.getOrCreateFolder = async function(rawName, parentId) {
        const folderId = await originalGetOrCreate.apply(null, arguments);
        const name = String(rawName).trim();
        
        // Строим путь
        const parentPath = folderNames.get(parentId) || '';
        const currentPath = path.join(parentPath, name);
        folderNames.set(folderId, currentPath);

        const absPath = path.join(STORAGE_ROOT, currentPath);
        if (!fs.existsSync(absPath)) fs.mkdirSync(absPath, { recursive: true });
        
        return folderId;
    };

    // Перехватываем создание файлов
    const originalCreateFile = context.drive.files.create;
    context.drive.files.create = async function(params) {
        const result = await originalCreateFile.apply(context.drive.files, arguments);
        try {
            if (params.media && params.media.body) {
                const fileName = params.resource ? params.resource.name : `file_${Date.now()}`;
                const parentId = (params.resource && params.resource.parents) ? params.resource.parents[0] : null;
                
                const relPath = folderNames.get(parentId) || 'Разное';
                const targetDir = path.join(STORAGE_ROOT, relPath);
                
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                
                // Сохраняем файл физически
                const dest = fs.createWriteStream(path.join(targetDir, fileName));
                params.media.body.pipe(dest);
            }
        } catch (e) { console.log("Ошибка зеркала:", e.message); }
        return result;
    };

    // --- 3. ИНТЕРФЕЙС ПРОВОДНИКА ---
    app.use('/cdn', require('express').static(STORAGE_ROOT));

    app.get('/explorer', (req, res) => {
        const relPath = req.query.path || '';
        const absPath = path.join(STORAGE_ROOT, relPath);
        
        if (!fs.existsSync(absPath)) return res.send("Путь не найден");
        const items = fs.readdirSync(absPath, { withFileTypes: true });

        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Logist-X Explorer Pro</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.js"></script>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 20px; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #30363d; padding-bottom: 15px; margin-bottom: 20px; }
                .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 20px; }
                
                .item-card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 15px; text-align: center; transition: 0.2s; position: relative; cursor: pointer; }
                .item-card:hover { border-color: #f1c40f; background: #1c2128; transform: translateY(-3px); }
                
                .icon-box { font-size: 60px; margin-bottom: 10px; display: block; height: 80px; display: flex; align-items: center; justify-content: center; }
                .img-preview { width: 100%; height: 80px; object-fit: cover; border-radius: 6px; }
                
                .name { font-size: 13px; font-weight: 600; word-break: break-all; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; height: 36px; }
                .btn { background: #238636; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; border: none; font-weight: bold; cursor: pointer; }
                .btn-back { background: #30363d; }
                .download-link { font-size: 11px; color: #58a6ff; text-decoration: none; margin-top: 8px; display: inline-block; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1 style="margin:0; color:#f1c40f;">📁 Logist-X Cloud</h1>
                    <small style="opacity:0.5;">/${relPath}</small>
                </div>
                ${relPath ? `<a href="/explorer?path=${path.dirname(relPath)}" class="btn btn-back">⬅ Назад</a>` : ''}
            </div>

            <div class="grid" id="gallery">
        `;

        items.forEach(item => {
            const itemRel = path.join(relPath, item.name);
            const isDir = item.isDirectory();
            const ext = path.extname(item.name).toLowerCase();
            const isImg = ['.jpg','.jpeg','.png','.webp'].includes(ext);
            
            const fileUrl = `/cdn/${itemRel}`;
            const link = isDir ? `/explorer?path=${encodeURIComponent(itemRel)}` : fileUrl;

            html += `
                <div class="item-card" onclick="${isImg ? '' : `location.href='${link}'`}">
                    <div class="icon-box">
                        ${isImg ? `<img src="${fileUrl}" class="img-preview" data-name="${item.name}">` : (isDir ? '📂' : '📄')}
                    </div>
                    <div class="name">${item.name}</div>
                    ${!isDir ? `<a href="${fileUrl}" download class="download-link">Скачать</a>` : ''}
                </div>
            `;
        });

        html += `
            </div>
            <script>
                // Инициализация мощного просмотрщика Viewer.js
                const gallery = new Viewer(document.getElementById('gallery'), {
                    url: 'src',
                    title: (image) => image.alt || image.getAttribute('data-name'),
                    toolbar: {
                        zoomIn: 4, zoomOut: 4, oneToOne: 4, reset: 4,
                        prev: 4, play: { show: 4, size: 'large' }, next: 4,
                        rotateLeft: 4, rotateRight: 4, flipHorizontal: 4, flipVertical: 4,
                    },
                });
            </script>
        </body>
        </html>`;
        res.send(html);
    });

    app.get('/', (req, res) => res.redirect('/explorer'));
};
