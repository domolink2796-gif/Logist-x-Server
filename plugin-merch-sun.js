module.exports = function(app, ctx) {
    const { sheets, drive, readDatabase } = ctx;
    
    console.log("☀️ [DEBUG] Плагин СОЛНЦЕ: Глубокая синхронизация активирована!");

    // Вспомогательная функция для записи данных (чтобы не дублировать код)
    async function writeToSheet(spreadsheetId, range, values) {
        return await sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: "USER_ENTERED",
            resource: { values: [values] }
        });
    }

    // --- 1. ПРИЕМ ДАННЫХ ОТ ТЕЛЕФОНА ---
    app.post('/save-partial-stock', async (req, res) => {
        try {
            const { key, addr, item, userName } = req.body;
            if (!key || !addr || !item) return res.sendStatus(200);

            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            if (!client || !client.folderId) return res.sendStatus(200);

            const tableName = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            const search = await drive.files.list({ 
                q: `'${client.folderId}' in parents and name = '${tableName}' and trashed = false`,
                fields: 'files(id, name)'
            });
            
            let tId = search.data.files.length > 0 ? search.data.files[0].id : null;

            // Если таблицы нет — создаем
            if (!tId) {
                const ss = await sheets.spreadsheets.create({ resource: { properties: { title: tableName } } });
                tId = ss.data.spreadsheetId;
                await drive.files.update({ fileId: tId, addParents: client.folderId, removeParents: 'root' });
                
                // СРАЗУ ПИШЕМ ШАПКУ. Используем "A1:G1" без указания имени листа
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId,
                    range: "A1:G1",
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Обновлено", "Мерч"]] }
                });
            }

            // Получаем данные. Читаем просто "A:G"
            const result = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "A:G" });
            const rows = result.data.values || [];
            
            // Ищем строку: совпадение Адреса (0) и Штрихкода (1)
            const rowIndex = rows.findIndex(r => r[0] === addr && String(r[1]) === String(item.bc));
            
            const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            const newValues = [
                addr, 
                String(item.bc), 
                item.name || "Товар", 
                item.shelf || 0, 
                item.stock || 0, 
                time, 
                userName || ""
            ];

            if (rowIndex !== -1) {
                // Обновляем (A + индекс + 1)
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, 
                    range: `A${rowIndex + 1}:G${rowIndex + 1}`,
                    valueInputOption: "USER_ENTERED", 
                    resource: { values: [newValues] }
                });
            } else {
                // Добавляем в конец
                await sheets.spreadsheets.values.append({
                    spreadsheetId: tId, 
                    range: "A:G",
                    valueInputOption: "USER_ENTERED", 
                    resource: { values: [newValues] }
                });
            }
            res.sendStatus(200);
        } catch (e) { 
            console.log("❌ Ошибка СОЛНЦЕ:", e.message);
            res.sendStatus(200); 
        }
    });

    // --- 2. ПЕРЕДАЧА ДАННЫХ В ТЕЛЕФОН (Чтобы товары не пропадали) ---
    app.get('/get-shop-stock', async (req, res) => {
        try {
            const { key, addr } = req.query;
            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            if (!client || !client.folderId) return res.json([]);

            const tableName = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            const search = await drive.files.list({ q: `'${client.folderId}' in parents and name = '${tableName}' and trashed = false` });
            if (search.data.files.length === 0) return res.json([]);

            const tId = search.data.files[0].id;
            const result = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "A:G" });
            const rows = result.data.values || [];

            // Фильтруем данные: берем только те строки, где адрес совпадает
            // Важно: берем r[1] (штрихкод), r[2] (имя), r[3] (полка), r[4] (склад)
            const shopItems = rows.slice(1) // пропускаем шапку
                .filter(r => r[0] === addr)
                .map(r => ({ 
                    bc: String(r[1]), 
                    name: r[2] || "Товар", 
                    shelf: parseInt(r[3]) || 0, 
                    stock: parseInt(r[4]) || 0 
                }));

            console.log(`📤 Отправлено для визита: ${shopItems.length} поз. для ${addr}`);
            res.json(shopItems);
        } catch (e) { 
            console.log("❌ Ошибка загрузки:", e.message);
            res.json([]); 
        }
    });
};
