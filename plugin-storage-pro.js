const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

module.exports = function(app, context) {
    // === НАСТРОЙКИ ===
    const STORAGE_ROOT = path.join(__dirname, 'storage', 'drive_mirror');
    const CHECK_INTERVAL_MINUTES = 5;

    // Хеш-мап для запоминания путей: ID Гугла -> Путь на диске
    // Мы предзаполняем его корневыми папками из твоего server.js
    const folderPathMap = new Map();
    folderPathMap.set(context.MY_ROOT_ID, 'Logist_Root');
    folderPathMap.set(context.MERCH_ROOT_ID, 'Merch_Root');

    console.log("✅ SYSTEM: Включено полное зеркалирование структуры папок");

    // ============================================================
    // 1. ПЕРЕХВАТЧИК СОЗДАНИЯ ПАПОК (getOrCreateFolder)
    // ============================================================
    // Мы подменяем функцию, чтобы знать, как называются папки
    const originalGetOrCreate = context.getOrCreateFolder;

    context.getOrCreateFolder = async function(drive, parentId, folderName) {
        // 1. Выполняем оригинальное действие (создаем в Google)
        const folderId = await originalGetOrCreate.apply(null, arguments);

        try {
            // 2. Вычисляем путь для Beget
            // Если мы знаем, кто родитель (parentId), берем его путь. Если нет — кидаем в корень.
            const parentPath = folderPathMap.get(parentId) || 'Unknown_Structure';
            
            // Полный путь: Родитель / Имя Новой Папки
            const fullLocalPath = path.join(parentPath, folderName);

            // 3. Запоминаем ID новой папки
            folderPathMap.set(folderId, fullLocalPath);

            // 4. Создаем физическую папку на диске сервера
            const absolutePath = path.join(STORAGE_ROOT, fullLocalPath);
            if (!fs.existsSync(absolutePath)) {
                fs.mkdirSync(absolutePath, { recursive: true });
                console.log(`Tp📁 [FOLDER] Создана папка: ${fullLocalPath}`);
            }

        } catch (e) {
            console.error("⚠️ Ошибка зеркалирования папки:", e.message);
        }

        return folderId;
    };

    // ============================================================
    // 2. ПЕРЕХВАТЧИК ЗАГРУЗКИ ФАЙЛОВ (files.create)
    // ============================================================
    const originalCreateFile = context.drive.files.create;

    context.drive.files.create = async function(params) {
        // Выполняем загрузку в Google
        const googleResult = await originalCreateFile.apply(context.drive.files, arguments);

        try {
            if (params.media && params.media.body) {
                // Имя файла
                const fileName = params.resource ? params.resource.name : `file_${Date.now()}`;
                
                // Ищем, в какую папку (ID) сервер хочет положить файл
                let targetFolderId = null;
                if (params.resource && params.resource.parents && params.resource.parents.length > 0) {
                    targetFolderId = params.resource.parents[0];
                }

                // Определяем путь на диске по ID
                // Если ID есть в нашей памяти — используем путь. Если нет — кладем в Unsorted.
                const relativePath = folderPathMap.get(targetFolderId) || `Unsorted_${new Date().toLocaleDateString('ru-RU')}`;
                const saveDir = path.join(STORAGE_ROOT, relativePath);

                // На всякий случай создаем папку (если вдруг пропустили шаг создания)
                if (!fs.existsSync(saveDir)) {
                    fs.mkdirSync(saveDir, { recursive: true });
                }

                const filePath = path.join(saveDir, fileName);

                // Сохраняем
                if (params.media.body.pipe) {
                    const dest = fs.createWriteStream(filePath);
                    params.media.body.pipe(dest);
                    console.log(`💾 [FILE] Сохранен: ${relativePath}/${fileName}`);
                }
            }
        } catch (e) {
            console.error("⚠️ Ошибка сохранения файла:", e.message);
        }

        return googleResult;
    };

    // ============================================================
    // 3. АВТО-ДЕПЛОЙ (Чтобы сервер сам обновлялся)
    // ============================================================
    setInterval(() => {
        exec('git fetch origin main', (err, stdout) => {
            exec('git status -uno', (err, statusOut) => {
                if (statusOut && statusOut.includes('Your branch is behind')) {
                    console.log('🚀 ОБНОВЛЕНИЕ КОДА...');
                    exec('git pull origin main', () => {
                        exec('pm2 restart logist-final');
                    });
                }
            });
        });
    }, CHECK_INTERVAL_MINUTES * 60 * 1000);

    // ЗАГЛУШКА ДЛЯ САЙТА
    app.get('/', (req, res) => res.send('<h1>🟢 SYSTEM ONLINE</h1>'));
    app.get('/my-files', (req, res) => res.send('<h1>🔐 DATA STORAGE</h1>'));
};
