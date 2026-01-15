/**
 * =========================================================================================
 * TITANIUM NEURAL SCANNER v167.0 | STRUCTURE BUILDER
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ЦЕЛЬ: Полная синхронизация структуры Google Drive и Локального хранилища.
 * -----------------------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
    ADMIN_PASS: 'Logist_X_ADMIN', 
    STORAGE_ROOT: path.join(__dirname, 'local_storage'),
    NEURAL_MAP: path.join(__dirname, 'titanium_neural_map.json')
};

module.exports = function(app, context) {
    const { drive, MY_ROOT_ID, MERCH_ROOT_ID } = context;

    let NEURAL_MEMORY = { map: {} };
    if (fs.existsSync(CONFIG.NEURAL_MAP)) {
        try { NEURAL_MEMORY = JSON.parse(fs.readFileSync(CONFIG.NEURAL_MAP, 'utf8')); } catch(e){}
    }

    function saveMemory() {
        fs.writeFileSync(CONFIG.NEURAL_MAP, JSON.stringify(NEURAL_MEMORY, null, 2));
    }

    async function scanFolderRecursive(folderId, localPath, projectNode) {
        if (!fs.existsSync(localPath)) {
            fs.mkdirSync(localPath, { recursive: true });
        }

        let pageToken = null;
        do {
            try {
                const res = await drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: 'nextPageToken, files(id, name, mimeType, size)',
                    pageSize: 100,
                    pageToken: pageToken
                });

                const files = res.data.files;
                pageToken = res.data.nextPageToken;

                for (const file of files) {
                    const isDir = file.mimeType === 'application/vnd.google-apps.folder';
                    const nextLocalPath = path.join(localPath, file.name);

                    // Умная запись в память
                    NEURAL_MEMORY.map[file.id] = {
                        localPath: nextLocalPath,
                        name: file.name,
                        mimeType: file.mimeType,
                        parentId: folderId,
                        size: file.size,
                        isLocal: fs.existsSync(nextLocalPath) && !isDir,
                        project: projectNode,
                        updatedAt: Date.now()
                    };

                    if (isDir) {
                        await scanFolderRecursive(file.id, nextLocalPath, projectNode);
                    }
                }
                await new Promise(r => setTimeout(r, 150)); // Скоростной режим с защитой
            } catch (e) {
                console.error(`Ошибка скана ${folderId}:`, e.message);
                pageToken = null;
            }
        } while (pageToken);
        saveMemory();
    }

    app.get('/api/admin/global-scan', async (req, res) => {
        if (req.query.password !== CONFIG.ADMIN_PASS) return res.status(403).send("STOP: WRONG PASS");

        res.write("<html><body style='background:#000; color:#f0b90b; font-family:monospace; padding:20px;'>");
        res.write("<h2>🧬 TITANIUM NEURAL SCANNER v167</h2>");
        res.write("<p>Синхронизация структуры запущена в фоновом режиме...</p>");

        (async () => {
            console.log("--- START GLOBAL SYNC ---");
            try {
                // 1. Скан Логистики
                await scanFolderRecursive(MY_ROOT_ID, path.join(CONFIG.STORAGE_ROOT, 'LOGIST_X'), 'LOGIST');
                // 2. Скан Мерча
                await scanFolderRecursive(MERCH_ROOT_ID, path.join(CONFIG.STORAGE_ROOT, 'MERCH_X'), 'MERCH');
                console.log("--- GLOBAL SYNC COMPLETE ---");
            } catch (e) { console.error("Sync Error:", e); }
        })();

        res.write("<p style='color:#0f0'>Успешно! Теперь сервер видит всю структуру облака.</p></body></html>");
        res.end();
    });
};
