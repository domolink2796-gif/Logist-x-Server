module.exports = function(app, googleSheets, auth, db) {
    const { google } = require('googleapis');
    console.log("📂 Плагин: Интеграция остатков в личные папки клиентов");

    let clientTables = {};

    async function getClientTable(key) {
        if (clientTables[key]) return clientTables[key];

        try {
            const drive = google.drive({ version: 'v3', auth });
            
            // 1. Ищем ID папки клиента (folder_id) в твоей базе данных
            // ПРОВЕРЬ: Название таблицы (licenses) и колонки (folder_id) должны совпадать с твоими
            const result = await db.query("SELECT folder_id FROM licenses WHERE lic_key = $1", [key]);
            const folderId = result.rows.length > 0 ? result.rows[0].folder_id : null;

            const fileName = `ОСТАТКИ_КОМАНДЫ_${key}`;

            // 2. Ищем файл именно в этой папке
            const query = folderId 
                ? `'${folderId}' in parents and name = '${fileName}' and trashed = false`
                : `name = '${fileName}' and trashed = false`;

            const search = await drive.files.list({ q: query, fields: 'files(id)' });

            if (search.data.files.length > 0) {
                clientTables[key] = search.data.files[0].id;
                return clientTables[key];
            }

            // 3. Если таблицы нет — создаем её прямо внутри папки клиента
            const spreadsheet = await googleSheets.spreadsheets.create({
                resource: {
                    properties: { title: fileName },
                    parents: folderId ? [folderId] : []
                },
                fields: 'spreadsheetId',
            });
            const newId = spreadsheet.data.spreadsheetId;

            // 4. Доступ по ссылке (чтобы открывалось из твоего кабинета без логина)
            await drive.permissions.create({
                fileId: newId,
                resource: { type: 'anyone', role: 'writer' }
            });

            // 5. Создаем шапку таблицы
            await googleSheets.spreadsheets.values.update({
                spreadsheetId: newId,
                range: "Sheet1!A1:G1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Дата/Время", "Сотрудник"]] }
            });

            clientTables[key] = newId;
            return newId;
        } catch (e) {
            console.error("❌ Ошибка плагина остатков:", e.message);
            return null;
        }
    }

    // Обработка сохранения данных от мерчендайзера
    app.post('/save-partial-stock', async (req, res) => {
        const { key, addr, item, userName } = req.body;
        const tableId = await getClientTable(key);
        if (!tableId) return res.sendStatus(500);

        try {
            await googleSheets.spreadsheets.values.append({
                spreadsheetId: tableId,
                range: "Sheet1!A:G",
                valueInputOption: "USER_ENTERED",
                resource: { values: [[addr, item.bc, item.name, item.shelf, item.stock, new Date().toLocaleString('ru-RU'), userName || 'Сотрудник']] }
            });
            res.sendStatus(200);
        } catch (e) { res.sendStatus(500); }
    });

    // Обработка загрузки для команды (Ваня видит данные Кати)
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
            
            // Собираем актуальное состояние (последняя запись по каждому BC)
            const lastState = {};
            filtered.forEach(r => {
                lastState[r[1]] = { bc: r[1], name: r[2], shelf: r[3], stock: r[4] };
            });
            res.json(Object.values(lastState));
        } catch (e) { res.json([]); }
    });
};
