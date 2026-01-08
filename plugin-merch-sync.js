const { google } = require('googleapis');

module.exports = function(app, ctx) {
    const { sheets, drive, readDatabase } = ctx;
    
    // Эта надпись ДОЛЖНА быть в логах Railway при запуске
    console.log("☀️ [DEBUG] Плагин МЕРЧ СОЛНЦЕ загружен успешно");

    async function getTable(key) {
        try {
            console.log(`🔎 [DEBUG] Ищем папку для ключа: ${key}`);
            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            
            let folderId = client ? client.folderId : null;

            // Если в базе нет folderId, ищем папку на Диске по ИМЕНИ (как основной сервер)
            if (!folderId) {
                console.log(`📡 [DEBUG] folderId не в базе, ищем на Диске папку с именем: ${key}`);
                const res = await drive.files.list({
                    q: `name = '${key}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'files(id)'
                });
                if (res.data.files && res.data.files.length > 0) {
                    folderId = res.data.files[0].id;
                    console.log(`✅ [DEBUG] Найдена папка на Диске: ${folderId}`);
                }
            }

            if (!folderId) {
                console.error(`❌ [DEBUG] ПАПКА НЕ НАЙДЕНА. Проверь, создана ли папка с названием ${key} на Диске`);
                return null;
            }

            const tableName = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            const q = `'${folderId}' in parents and name = '${tableName}' and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id)' });

            if (search.data.files && search.data.files.length > 0) {
                return search.data.files[0].id;
            }

            // СОЗДАНИЕ ТАБЛИЦЫ
            console.log(`🔨 [DEBUG] Создаем таблицу ${tableName} в папке ${folderId}`);
            const ss = await sheets.spreadsheets.create({
                resource: { properties: { title: tableName } }
            });
            const id = ss.data.spreadsheetId;

            // Перенос в папку
            await drive.files.update({ fileId: id, addParents: folderId, removeParents: 'root' });
            
            // Права доступа
            await drive.permissions.create({ fileId: id, resource: { type: 'anyone', role: 'writer' } });

            // Заголовки
            await sheets.spreadsheets.values.update({
                spreadsheetId: id, range: "Sheet1!A1:G1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Обновлено", "Мерч"]] }
            });

            return id;
        } catch (e) {
            console.error("❌ [DEBUG] Ошибка в getTable:", e.message);
            return null;
        }
    }

    app.post('/save-partial-stock', async (req, res) => {
        const { key, addr, item, userName } = req.body;
        console.log(`📩 [DEBUG] Пришли данные: ${addr} | ${item.name} | Пользователь: ${userName}`);

        const tId = await getTable(key);
        if (!tId) {
            console.error("❌ [DEBUG] Не удалось получить ID таблицы. Операция отменена.");
            return res.status(500).send("Ошибка папки");
        }

        try {
            const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            const getRes = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = getRes.data.values || [];
            const rowIndex = rows.findIndex(r => r[0] === addr && r[1] === item.bc);
            
            const newRow = [addr, item.bc, item.name, item.shelf || 0, item.stock || 0, timestamp, userName || 'Мерч'];

            if (rowIndex !== -1) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, range: `Sheet1!A${rowIndex + 1}:G${rowIndex + 1}`,
                    valueInputOption: "USER_ENTERED", resource: { values: [newRow] }
                });
                console.log(`✅ [DEBUG] Строка обновлена в таблице ${tId}`);
            } else {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: tId, range: "Sheet1!A:G",
                    valueInputOption: "USER_ENTERED", resource: { values: [newRow] }
                });
                console.log(`✅ [DEBUG] Новая строка добавлена в таблицу ${tId}`);
            }
            res.sendStatus(200);
        } catch (e) {
            console.error("❌ [DEBUG] Ошибка записи в таблицу:", e.message);
            res.sendStatus(500);
        }
    });

    app.get('/get-shop-stock', async (req, res) => {
        const { key, addr } = req.query;
        const tId = await getTable(key);
        if (!tId) return res.json([]);
        try {
            const result = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = result.data.values || [];
            const filtered = rows.slice(1).filter(r => r[0] === addr);
            res.json(filtered.map(r => ({ bc: r[1], name: r[2], shelf: parseInt(r[3])||0, stock: parseInt(r[4])||0 })));
        } catch (e) { res.json([]); }
    });
};
