module.exports = function(app, ctx) {
    const { sheets, drive, readDatabase } = ctx;
    
    console.log("☀️ [DEBUG] Плагин СОЛНЦЕ: Система синхронизации готова!");

    app.post('/save-partial-stock', async (req, res) => {
        try {
            const { key, addr, item, userName } = req.body;
            
            // 1. Проверяем данные
            if (!key || !addr || !item) {
                console.log("⚠️ Получены пустые данные, пропускаю.");
                return res.sendStatus(200);
            }

            console.log(`📥 [СИГНАЛ] Товар: ${item.name} | Магазин: ${addr}`);

            // 2. Ищем папку клиента
            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            if (!client || !client.folderId) {
                console.log("❌ Ошибка: Папка клиента не найдена.");
                return res.sendStatus(200);
            }

            const tableName = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            const q = `'${client.folderId}' in parents and name = '${tableName}' and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id)' });

            let tId = search.data.files.length > 0 ? search.data.files[0].id : null;

            // 3. Создаем таблицу, если её нет
            if (!tId) {
                console.log("🔨 Создаю новую таблицу остатков...");
                const ss = await sheets.spreadsheets.create({ resource: { properties: { title: tableName } } });
                tId = ss.data.spreadsheetId;
                await drive.files.update({ fileId: tId, addParents: client.folderId, removeParents: 'root' });
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, range: "Sheet1!A1:G1",
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Обновлено", "Мерч"]] }
                });
            }

            // 4. УМНОЕ ОБНОВЛЕНИЕ (Ищем, есть ли уже этот товар в этом магазине)
            const result = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = result.data.values || [];
            const rowIndex = rows.findIndex(r => r[0] === addr && r[1] === item.bc);
            
            const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            const newValues = [addr, item.bc, item.name, item.shelf || 0, item.stock || 0, time, userName];

            if (rowIndex !== -1) {
                // Если нашли — обновляем строку
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, range: `Sheet1!A${rowIndex + 1}:G${rowIndex + 1}`,
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [newValues] }
                });
                console.log(`✅ Данные ОБНОВЛЕНЫ в строке ${rowIndex + 1}`);
            } else {
                // Если нет — добавляем в конец
                await sheets.spreadsheets.values.append({
                    spreadsheetId: tId, range: "Sheet1!A:G",
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [newValues] }
                });
                console.log("✅ Создана НОВАЯ запись в таблице");
            }

            res.sendStatus(200);
        } catch (e) {
            console.error("❌ Ошибка записи:", e.message);
            res.sendStatus(200);
        }
    });
};
