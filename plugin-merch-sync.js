const { google } = require('googleapis');

module.exports = function(app, ctx) {
    const { sheets, drive, readDatabase } = ctx;
    console.log("🚀 Плагин: ЖИВАЯ СИНХРОНИЗАЦИЯ готова к работе");

    // --- ЛОВИМ СИГНАЛ ИЗ SERVER.JS ---
    app.on('barcode-scanned', async (data) => {
        console.log(`📡 ПРИНЯТ СИГНАЛ: Товар "${data.name}" | Ключ: ${data.key}`);
        try {
            // Сразу создаем или находим таблицу
            const tId = await getTable(data.key);
            if (tId) {
                console.log(`✅ Таблица готова или уже была: ${tId}`);
            }
        } catch (e) {
            console.error("❌ Ошибка при обработке сигнала:", e.message);
        }
    });

    async function getTable(key) {
        try {
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            if (!kData || !kData.folderId) {
                console.log(`⚠️ У клиента с ключом ${key} не найдена папка folderId`);
                return null;
            }

            const name = `ОСТАТКИ_КОМАНДЫ_${key}`;
            const q = `'${kData.folderId}' in parents and name = '${name}' and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id)' });

            if (search.data.files && search.data.files.length > 0) {
                return search.data.files[0].id;
            }

            // Создаем таблицу, если её нет
            console.log(`🔨 Создаю новую таблицу: ${name}`);
            const ss = await sheets.spreadsheets.create({
                resource: { properties: { title: name } }
            });
            const id = ss.data.spreadsheetId;

            await drive.files.update({ fileId: id, addParents: kData.folderId, removeParents: 'root' });
            await drive.permissions.create({ fileId: id, resource: { type: 'anyone', role: 'writer' } });

            await sheets.spreadsheets.values.update({
                spreadsheetId: id, range: "Sheet1!A1:G1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Обновлено", "Мерч"]] }
            });

            console.log(`🎉 Таблица успешно создана в папке клиента!`);
            return id;
        } catch (e) { 
            console.error("❌ Ошибка getTable:", e.message); 
            return null; 
        }
    }

    // Сохранение данных (когда меняешь цифры на телефоне)
    app.post('/save-partial-stock', async (req, res) => {
        const { key, addr, item, userName } = req.body;
        console.log(`📥 Запрос на обновление строки: ${item.name}`);
        const tId = await getTable(key);
        if (!tId) return res.status(500).send("Ошибка доступа");

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
        } catch (e) { res.sendStatus(500); }
    });

    app.get('/get-shop-stock', async (req, res) => {
        const { key, addr } = req.query;
        const tId = await getTable(key);
        if (!tId) return res.json([]);
        try {
            const result = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = result.data.values || [];
            const filtered = rows.slice(1).filter(r => r[0] === addr);
            res.json(filtered.map(r => ({ bc: r[1], name: r[2], shelf: r[3], stock: r[4] })));
        } catch (e) { res.json([]); }
    });
};
