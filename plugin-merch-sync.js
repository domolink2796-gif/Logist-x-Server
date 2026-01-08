const { google } = require('googleapis'); // <--- БЫЛО Const, СТАЛО const

module.exports = function(app, ctx) {
    const { sheets, drive, readDatabase } = ctx;
    console.log("🚀 Серверный плагин: ЖИВАЯ ТАБЛИЦА подключен");

    async function getTable(key) {
        try {
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            
            // ВАЖНО: Если у ключа нет привязанной папки (folderId), таблица не создастся!
            if (!kData || !kData.folderId) {
                console.log(`⚠️ Для ключа ${key} не найдена папка на Диске (проверь базу данных!)`);
                return null;
            }

            const name = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            const q = `'${kData.folderId}' in parents and name = '${name}' and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id)' });

            if (search.data.files && search.data.files.length > 0) {
                return search.data.files[0].id;
            }

            console.log(`🔨 Создаю новую таблицу остатков для: ${key}`);
            const ss = await sheets.spreadsheets.create({
                resource: { properties: { title: name } }
            });
            const id = ss.data.spreadsheetId;

            await drive.files.update({ fileId: id, addParents: kData.folderId, removeParents: 'root' });
            await drive.permissions.create({ fileId: id, resource: { type: 'anyone', role: 'writer' } });

            await sheets.spreadsheets.values.update({
                spreadsheetId: id, range: "Sheet1!A1:G1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка (шт)", "Склад (шт)", "Время", "Мерч"]] }
            });

            return id;
        } catch (e) { 
            console.error("❌ Ошибка при работе с таблицей:", e.message); 
            return null; 
        }
    }

    // ЗАПИСЬ
    app.post('/save-partial-stock', async (req, res) => {
        const { key, addr, item, userName } = req.body;
        console.log(`📥 Обновление: ${addr} -> ${item.name} (${item.shelf}/${item.stock})`);
        
        const tId = await getTable(key);
        if (!tId) return res.status(500).send("Нет таблицы или папки");

        try {
            const getRes = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = getRes.data.values || [];
            const rowIndex = rows.findIndex(r => r[0] === addr && r[1] === item.bc);
            const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            
            const newRow = [addr, item.bc, item.name, item.shelf || 0, item.stock || 0, timestamp, userName || 'Мерч'];

            if (rowIndex !== -1) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, range: `Sheet1!A${rowIndex + 1}:G${rowIndex + 1}`,
                    valueInputOption: "USER_ENTERED", resource: { values: [newRow] }
                });
            } else {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: tId, range: "Sheet1!A:G",
                    valueInputOption: "USER_ENTERED", resource: { values: [newRow] }
                });
            }
            res.sendStatus(200);
        } catch (e) { 
            console.error(e);
            res.sendStatus(500); 
        }
    });

    // ЧТЕНИЕ
    app.get('/get-shop-stock', async (req, res) => {
        const { key, addr } = req.query;
        const tId = await getTable(key);
        if (!tId) return res.json([]);

        try {
            const result = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = result.data.values || [];
            const filtered = rows.slice(1).filter(r => r[0] === addr);
            
            res.json(filtered.map(r => ({ 
                bc: r[1], 
                name: r[2], 
                shelf: parseInt(r[3]) || 0, 
                stock: parseInt(r[4]) || 0 
            })));
        } catch (e) { res.json([]); }
    });
};
