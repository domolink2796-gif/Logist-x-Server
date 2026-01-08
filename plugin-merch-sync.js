const { google } = require('googleapis');

module.exports = function(app, ctx) {
    // Используем инструменты из твоего server.js
    const { sheets, drive, readDatabase } = ctx;
    console.log("🚀 Плагин: ЖИВАЯ СИНХРОНИЗАЦИЯ ОСТАТКОВ запущен");

    async function getTable(key) {
        try {
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            if (!kData || !kData.folderId) return null;

            const name = `ОСТАТКИ_КОМАНДЫ_${key}`;
            const q = `'${kData.folderId}' in parents and name = '${name}' and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id)' });

            if (search.data.files && search.data.files.length > 0) return search.data.files[0].id;

            // Если таблицы нет, создаем её
            const ss = await sheets.spreadsheets.create({
                resource: { properties: { title: name } }
            });
            const id = ss.data.spreadsheetId;

            // Переносим в папку клиента и даем доступ
            await drive.files.update({ fileId: id, addParents: kData.folderId, removeParents: 'root' });
            await drive.permissions.create({ fileId: id, resource: { type: 'anyone', role: 'writer' } });

            // Шапка таблицы
            await sheets.spreadsheets.values.update({
                spreadsheetId: id, range: "Sheet1!A1:G1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Обновлено", "Мерч"]] }
            });

            return id;
        } catch (e) { console.error("❌ Ошибка getTable:", e.message); return null; }
    }

    app.post('/save-partial-stock', async (req, res) => {
        const { key, addr, item, userName } = req.body;
        const tId = await getTable(key);
        if (!tId) return res.status(500).send("Ошибка доступа к таблице");

        try {
            // Читаем данные, чтобы найти существующую строку
            const getRes = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = getRes.data.values || [];
            
            // Ищем строку: совпадение Магазина (A) и Штрихкода (B)
            const rowIndex = rows.findIndex(r => r[0] === addr && r[1] === item.bc);
            const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            const newRow = [addr, item.bc, item.name, item.shelf, item.stock, timestamp, userName || 'Мерч'];

            if (rowIndex !== -1) {
                // ОБНОВЛЯЕМ существующую строку
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId,
                    range: `Sheet1!A${rowIndex + 1}:G${rowIndex + 1}`,
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [newRow] }
                });
                console.log(`🔄 Обновлено: ${item.name} в ${addr}`);
            } else {
                // ДОБАВЛЯЕМ новую строку
                await sheets.spreadsheets.values.append({
                    spreadsheetId: tId,
                    range: "Sheet1!A:G",
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [newRow] }
                });
                console.log(`➕ Добавлено: ${item.name} в ${addr}`);
            }
            res.sendStatus(200);
        } catch (e) { 
            console.error("❌ Ошибка записи:", e.message);
            res.sendStatus(500); 
        }
    });

    // Получение данных для команды (чтобы Ваня видел данные Кати)
    app.get('/get-shop-stock', async (req, res) => {
        const { key, addr } = req.query;
        const tId = await getTable(key);
        if (!tId) return res.json([]);

        try {
            const result = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = result.data.values || [];
            const filtered = rows.slice(1).filter(r => r[0] === addr);
            
            const lastState = filtered.map(r => ({
                bc: r[1], name: r[2], shelf: r[3], stock: r[4]
            }));
            res.json(lastState);
        } catch (e) { res.json([]); }
    });
};
