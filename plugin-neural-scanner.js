/**
 * =========================================================================================
 * TITANIUM PLUGIN: GLOBAL NEURAL SCANNER
 * -----------------------------------------------------------------------------------------
 * ЦЕЛЬ: Клонирование структуры Google Drive на сервер без скачивания тяжелых файлов.
 * ЗАПУСК: /api/admin/global-scan?password=Logist_X_ADMIN
 * =========================================================================================
 */

const fs = require('fs');
const path = require('path');

// --- КОНФИГ ---
const CONFIG = {
    ADMIN_PASS: 'Logist_X_ADMIN', // Твой пароль из server.js
    STORAGE_ROOT: path.join(__dirname, 'local_storage'),
    NEURAL_MAP: path.join(__dirname, 'titanium_neural_map.json')
};

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID } = context;

    // Загружаем или создаем базу памяти
    let NEURAL_MEMORY = { map: {} };
    if (fs.existsSync(CONFIG.NEURAL_MAP)) {
        try { NEURAL_MEMORY = JSON.parse(fs.readFileSync(CONFIG.NEURAL_MAP, 'utf8')); } catch(e){}
    }

    // Сохранение памяти
    function saveMemory() {
        fs.writeFileSync(CONFIG.NEURAL_MAP, JSON.stringify(NEURAL_MEMORY, null, 2));
    }

    // --- РЕКУРСИВНЫЙ СКАНЕР ---
    async function scanFolderRecursive(folderId, localPath, projectNode) {
        console.log(`📂 SCAN: ${localPath}`);

        // 1. Создаем физическую папку
        if (!fs.existsSync(localPath)) {
            fs.mkdirSync(localPath, { recursive: true });
        }

        let pageToken = null;
        
        do {
            try {
                // Запрашиваем файлы пачками (чтобы не упереться в лимиты)
                const res = await drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: 'nextPageToken, files(id, name, mimeType, size, parents)',
                    pageSize: 100,
                    pageToken: pageToken
                });

                const files = res.data.files;
                pageToken = res.data.nextPageToken;

                for (const file of files) {
                    const isDir = file.mimeType === 'application/vnd.google-apps.folder';
                    const nextLocalPath = path.join(localPath, file.name);

                    // 2. Записываем в Нейронную Память (Обучаем сервер)
                    NEURAL_MEMORY.map[file.id] = {
                        localPath: isDir ? nextLocalPath : (fs.existsSync(nextLocalPath) ? nextLocalPath : null),
                        name: file.name,
                        mimeType: file.mimeType,
                        parentId: folderId,
                        isLocal: fs.existsSync(nextLocalPath), // True только если файл реально скачан
                        project: projectNode,
                        scannedAt: Date.now()
                    };

                    // 3. Если это папка — ныряем глубже (Рекурсия)
                    if (isDir) {
                        await scanFolderRecursive(file.id, nextLocalPath, projectNode);
                    }
                }

                // Маленькая пауза, чтобы Google не забанил за частоту запросов
                await new Promise(r => setTimeout(r, 200)); 

            } catch (e) {
                console.error(`ERROR scanning folder ${folderId}:`, e.message);
                pageToken = null; // Прерываем этот цикл при ошибке
            }
        } while (pageToken);
        
        saveMemory(); // Сохраняем прогресс после каждой папки
    }

    // --- API ЗАПУСКА ---
    app.get('/api/admin/global-scan', async (req, res) => {
        const { password } = req.query;

        if (password !== CONFIG.ADMIN_PASS) {
            return res.status(403).send("ACCESS DENIED");
        }

        res.write(`
            <html>
            <body style="background:#000; color:#0f0; font-family:monospace; padding:20px;">
            <h1>🚀 TITANIUM NEURAL SCANNER STARTED</h1>
            <p>Scanning structure... Check server console for details.</p>
            <pre id="log"></pre>
        `);

        // Запускаем процесс асинхронно, не блокируя сервер
        (async () => {
            try {
                console.log("--- STARTING LOGIST SCAN ---");
                const logistPath = path.join(CONFIG.STORAGE_ROOT, 'LOGIST_CORE');
                await scanFolderRecursive(MY_ROOT_ID, logistPath, 'LOGIST_CORE');

                console.log("--- STARTING MERCH SCAN ---");
                const merchPath = path.join(CONFIG.STORAGE_ROOT, 'MERCH_CORE');
                await scanFolderRecursive(MERCH_ROOT_ID, merchPath, 'MERCH_CORE');

                console.log("--- SCAN COMPLETE ---");
                saveMemory();
            } catch (e) {
                console.error("FATAL SCAN ERROR:", e);
            }
        })();

        res.write("<p>Process running in background...</p></body></html>");
        res.end();
    });
};
