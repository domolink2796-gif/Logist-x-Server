const { google } = require('googleapis');

module.exports = function(app, ctx) {
    const { sheets, drive, readDatabase } = ctx;
    
    console.log("☀️ [ПЛАГИН] Память магазинов: АКТИВИРОВАНО");

    // Функция поиска ID таблицы для конкретного клиента
    async function getTableId(key) {
        try {
            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            if (!client || !client.folderId) return null;

            const tableName = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            const q = `'${client.folderId}' in parents and name = '${tableName}' and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id)' });

            if (search.data.files.length > 0) return search.data.files[0].id;

            // Если таблицы нет — создаем
            const ss = await sheets.spreadsheets.create({ resource: { properties: { title: tableName } } });
            const id = ss.data.spreadsheetId;
            await drive.files.update({ fileId: id, addParents: client.folderId, removeParents: 'root' });
            await sheets.spreadsheets.values.update({
                spreadsheetId: id, range: "Sheet1!A1:G1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Обновлено", "Мерч"]] }
            });
            return id;
        } catch (e) { return null; }
    }

    // 1. ОТДАЕМ ОСТАТКИ: Когда мерч заходит в конкретный адрес
    app.get('/get-shop-stock', async (req, res) => {
        try {
            const { key, addr } = req.query;
            const tId = await getTableId(key);
            if (!tId) return res.json([]);

            const result = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = result.data.values || [];
            
            // Фильтруем товары только для этого магазина
            const currentStock = rows.slice(1)
                .filter(r => r[0] === addr)
                .map(r => ({
                    bc: r[1],
                    name: r[2],
                    shelf: parseInt(r[3]) || 0,
                    stock: parseInt(r[4]) || 0
                }));

            res.json(currentStock);
        } catch (e) { res.json([]); }
    });

    // 2. СОХРАНЯЕМ И ОБНОВЛЯЕМ: Когда мерч нажал + или -
    app.post('/save-partial-stock', async (req, res) => {
        try {
            const { key, addr, item, userName } = req.body;
            const tId = await getTableId(key);
            if (!tId) return res.sendStatus(200);

            const getRes = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = getRes.data.values || [];
            
            // Ищем, есть ли уже этот товар в этом магазине
            const rIdx = rows.findIndex(r => r[0] === addr && r[1] === item.bc);
            const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            const newRow = [addr, item.bc, item.name, item.shelf || 0, item.stock || 0, time, userName];

            if (rIdx !== -1) {
                // Если товар найден — обновляем цифры в строке
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, range: `Sheet1!A${rIdx + 1}:G${rIdx + 1}`,
                    valueInputOption: "USER_ENTERED", resource: { values: [newRow] }
                });
            } else {
                // Если товара еще нет в этом магазине — добавляем новую строку
                await sheets.spreadsheets.values.append({
                    spreadsheetId: tId, range: "Sheet1!A:G",
                    valueInputOption: "USER_ENTERED", resource: { values: [newRow] }
                });
            }
            res.sendStatus(200);
        } catch (e) { res.sendStatus(200); }
    });
};
