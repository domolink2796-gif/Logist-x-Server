const { google } = require('googleapis'); // ЭТОГО НЕ ХВАТАЛО

module.exports = function(app, googleSheets, auth, db) {
    console.log("📂 Плагин: Интеграция остатков в личные папки клиентов запущен");

    let clientTables = {};

    async function getClientTable(key) {
        if (clientTables[key]) return clientTables[key];

        try {
            const drive = google.drive({ version: 'v3', auth });
            
            // 1. Ищем ID папки клиента
            // ПРОВЕРЬ: Названия таблицы (licenses) и колонки (folder_id) должны быть как в твоей БД
            const result = await db.query("SELECT folder_id FROM licenses WHERE lic_key = $1", [key]);
            const folderId = (result.rows && result.rows.length > 0) ? result.rows[0].folder_id : null;

            if (!folderId) {
                console.log(`⚠️ Предупреждение: Для ключа ${key} не найден folder_id в базе.`);
            }

            const fileName = `ОСТАТКИ_КОМАНДЫ_${key}`;

            // 2. Ищем файл в папке
            const query = folderId 
                ? `'${folderId}' in parents and name = '${fileName}' and trashed = false`
                : `name = '${fileName}' and trashed = false`;

            const search = await drive.files.list({ q: query, fields: 'files(id)' });

            if (search.data.files && search.data.files.length > 0) {
                clientTables[key] = search.data.files[0].id;
                return clientTables[key];
            }

            // 3. Создаем таблицу, если не нашли
            const spreadsheet = await googleSheets.spreadsheets.create({
                resource: {
                    properties: { title: fileName },
                    parents: folderId ? [folderId] : []
                },
                fields: 'spreadsheetId',
            });
            const newId = spreadsheet.data.spreadsheetId;

            // 4. Доступ "для всех по ссылке"
            await drive.permissions.create({
                fileId: newId,
                resource: { type: 'anyone', role: 'writer' }
            });

            // 5. Создаем заголовки
            await googleSheets.spreadsheets.values.update({
                spreadsheetId: newId,
                range: "Sheet1!A1:G1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Дата/Время", "Сотрудник"]] }
            });

            clientTables[key] = newId;
            console.log(`✅ Создана новая таблица для ${key}: ${newId}`);
            return newId;
        } catch (e) {
            console.error("❌ Ошибка в getClientTable:", e.message);
            return null;
        }
    }

    // Прием данных от мерча
    app.post('/save-partial-stock', async (req, res) => {
        const { key, addr, item, userName } = req.body;
        console.log(`📥 Получен запрос на сохранение от ${userName} (${key})`);
        
        const tableId = await getClientTable(key);
        if (!tableId) return res.status(500).send("Ошибка поиска таблицы");

        try {
            await googleSheets.spreadsheets.values.append({
                spreadsheetId: tableId,
                range: "Sheet1!A:G",
                valueInputOption: "USER_ENTERED",
                resource: { values: [[addr, item.bc, item.name, item.shelf, item.stock, new Date().toLocaleString('ru-RU'), userName || 'Сотрудник']] }
            });
            console.log(`💾 Данные записаны: ${item.name} (${addr})`);
            res.sendStatus(200);
        } catch (e) { 
            console.error("❌ Ошибка записи в Google:", e.message);
            res.sendStatus(500); 
        }
    });

    // Выдача данных для команды
    app.get('/get-shop-stock', async (req, res) => {
        const { key, addr } = req.query;
        const tableId = await getClientTable(key);
        if (!tableId) return res.json([]);

        try {
            const result = await googleSheets.spreadsheets.values.get({
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
