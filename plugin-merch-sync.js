const { google } = require('googleapis');

module.exports = function(app, ctx) {
    const { sheets, drive, readDatabase } = ctx;
    
    console.log("☀️ [PLUGIN] Мерч-Память: Система учета остатков активна");

    // 1. ПОИСК ТАБЛИЦЫ В ПАПКЕ КЛИЕНТА
    async function getTableId(key) {
        try {
            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            if (!client || !client.folderId) return null;

            const tableName = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            const q = `'${client.folderId}' in parents and name = '${tableName}' and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id)' });

            if (search.data.files.length > 0) return search.data.files[0].id;

            // Если таблицы нет — создаем её с нуля
            const ss = await sheets.spreadsheets.create({ resource: { properties: { title: tableName } } });
            const id = ss.data.spreadsheetId;
            await drive.files.update({ fileId: id, addParents: client.folderId, removeParents: 'root' });
            await drive.permissions.create({ fileId: id, resource: { type: 'anyone', role: 'writer' } });
            await sheets.spreadsheets.values.update({
                spreadsheetId: id, range: "Sheet1!A1:G1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Обновлено", "Мерч"]] }
            });
            return id;
        } catch (e) { return null; }
    }

    // 2. ЗАГРУЗКА ОСТАТКОВ (Когда мерч открывает магазин)
    app.get('/get-shop-stock', async (req, res) => {
        try {
            const { key, addr } = req.query;
            const tId = await getTableId(key);
            if (!tId) return res.json([]);

            const result = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = result.data.values || [];
            
            // Фильтруем: берем только те товары, где адрес совпадает
            const shopData = rows.slice(1)
                .filter(r => r[0] === addr)
                .map(r => ({
                    bc: r[1],
                    name: r[2],
                    shelf: parseInt(r[3]) || 0,
                    stock: parseInt(r[4]) || 0
                }));

            res.json(shopData);
        } catch (e) { res.json([]); }
    });

    // 3. СОХРАНЕНИЕ ОСТАТКОВ (Когда мерч нажимает + или -)
    app.post('/save-partial-stock', async (req, res) => {
        try {
            const { key, addr, item, userName } = req.body;
            const tId = await getTableId(key);
            if (!tId) return res.sendStatus(200);

            const getRes = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = getRes.data.values || [];
            
            // Ищем строку: совпадение АДРЕСА и ШТРИХКОДА
            const rIdx = rows.findIndex(r => r[0] === addr && r[1] === item.bc);
            const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            const newRow = [addr, item.bc, item.name, item.shelf || 0, item.stock || 0, time, userName];

            if (rIdx !== -1) {
                // Обновляем существующий товар
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, range: `Sheet1!A${rIdx + 1}:G${rIdx + 1}`,
                    valueInputOption: "USER_ENTERED", resource: { values: [newRow] }
                });
            } else {
                // Добавляем новый товар в этот магазин
                await sheets.spreadsheets.values.append({
                    spreadsheetId: tId, range: "Sheet1!A:G",
                    valueInputOption: "USER_ENTERED", resource: { values: [newRow] }
                });
            }
            res.sendStatus(200);
        } catch (e) { res.sendStatus(200); }
    });
};
