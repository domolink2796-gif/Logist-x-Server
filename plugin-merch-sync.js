const { google } = require('googleapis');

module.exports = function(app, ctx) {
    // Берем инструменты из контекста твоего основного server.js
    const { sheets, drive, readDatabase, getOrCreateFolder } = ctx;
    
    console.log("📂 Плагин командных остатков подключен к контексту Server.js");

    let clientTables = {};

    async function getClientTable(key) {
        if (clientTables[key]) return clientTables[key];

        try {
            // 1. Используем твою функцию из server.js для получения папки клиента
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            
            if (!kData || !kData.folderId) {
                console.log(`⚠️ Предупреждение: Ключ ${key} не имеет folderId`);
                return null;
            }

            const folderId = kData.folderId;
            const fileName = `ОСТАТКИ_КОМАНДЫ_${key}`;

            // 2. Ищем, нет ли уже такой таблицы в папке
            const q = `'${folderId}' in parents and name = '${fileName}' and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id)' });

            if (search.data.files && search.data.files.length > 0) {
                clientTables[key] = search.data.files[0].id;
                return clientTables[key];
            }

            // 3. Если нет — создаем новую таблицу Google
            const spreadsheet = await sheets.spreadsheets.create({
                resource: {
                    properties: { title: fileName }
                }
            });
            const newId = spreadsheet.data.spreadsheetId;

            // 4. Переносим её в папку клиента и даем доступ
            await drive.files.update({
                fileId: newId,
                addParents: folderId,
                removeParents: 'root',
                fields: 'id, parents'
            });

            await drive.permissions.create({
                fileId: newId,
                resource: { type: 'anyone', role: 'writer' }
            });

            // 5. Создаем шапку
            await sheets.spreadsheets.values.update({
                spreadsheetId: newId,
                range: "Sheet1!A1:G1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Дата/Время", "Сотрудник"]] }
            });

            clientTables[key] = newId;
            console.log(`✅ Создана таблица в папке клиента ${kData.name}: ${newId}`);
            return newId;
        } catch (e) {
            console.error("❌ Ошибка в плагине остатков:", e.message);
            return null;
        }
    }

    // Прием данных от мерча
    app.post('/save-partial-stock', async (req, res) => {
        const { key, addr, item, userName } = req.body;
        console.log(`📥 ПРИШЕЛ ПИК: ${item.name} (${addr}) от ${userName}`);
        
        const tableId = await getClientTable(key);
        if (!tableId) return res.status(500).send("Не найдена папка клиента");

        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId: tableId,
                range: "Sheet1!A:G",
                valueInputOption: "USER_ENTERED",
                resource: { values: [[addr, item.bc, item.name, item.shelf, item.stock, new Date().toLocaleString('ru-RU'), userName || 'Мерч']] }
            });
            res.sendStatus(200);
        } catch (e) { 
            console.error("❌ Ошибка записи в таблицу:", e.message);
            res.sendStatus(500); 
        }
    });

    // Получение данных для синхронизации команды
    app.get('/get-shop-stock', async (req, res) => {
        const { key, addr } = req.query;
        const tableId = await getClientTable(key);
        if (!tableId) return res.json([]);

        try {
            const result = await sheets.spreadsheets.values.get({
                spreadsheetId: tableId,
                range: "Sheet1!A:G",
            });
            const rows = result.data.values || [];
            const filtered = rows.slice(1).filter(r => r[0] === addr);
            const lastState = {};
            filtered.forEach(r => {
                lastState[r[1]] = { bc: r[1], name: r[2], shelf: r[3], stock: r[4] };
            });
            res.json(Object.values(lastState));
        } catch (e) { res.json([]); }
    });
};
