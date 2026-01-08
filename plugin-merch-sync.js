const { google } = require('googleapis');

module.exports = function(app, ctx) {
    const { sheets, drive, readDatabase } = ctx;
    console.log("☀️ ПЛАГИН СОЛНЦЕ: Модуль загружен");

    async function getTable(key) {
        try {
            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            let fId = client ? client.folderId : null;

            if (!fId) {
                const res = await drive.files.list({
                    q: `name = '${key}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'files(id)'
                });
                if (res.data.files && res.data.files.length > 0) fId = res.data.files[0].id;
            }

            if (!fId) return null;

            const tableName = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            const search = await drive.files.list({
                q: `'${fId}' in parents and name = '${tableName}' and trashed = false`,
                fields: 'files(id)'
            });

            if (search.data.files && search.data.files.length > 0) return search.data.files[0].id;

            const ss = await sheets.spreadsheets.create({ resource: { properties: { title: tableName } } });
            const id = ss.data.spreadsheetId;
            await drive.files.update({ fileId: id, addParents: fId, removeParents: 'root' });
            await drive.permissions.create({ fileId: id, resource: { type: 'anyone', role: 'writer' } });

            await sheets.spreadsheets.values.update({
                spreadsheetId: id, range: "Sheet1!A1:G1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Обновлено", "Мерч"]] }
            });
            return id;
        } catch (e) { 
            console.error("Ошибка в getTable:", e.message); 
            return null; 
        }
    }

    app.post('/save-partial-stock', async (req, res) => {
        try {
            const { key, addr, item, userName } = req.body;
            console.log(`📥 Данные: ${item.name} (${addr})`);
            
            const tId = await getTable(key);
            if (!tId) return res.status(500).send("No Folder");

            const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            const getRes = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = getRes.data.values || [];
            const rIdx = rows.findIndex(r => r[0] === addr && r[1] === item.bc);
            const row = [addr, item.bc, item.name, item.shelf || 0, item.stock || 0, time, userName || 'Мерч'];

            if (rIdx !== -1) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, range: `Sheet1!A${rIdx + 1}:G${rIdx + 1}`,
                    valueInputOption: "USER_ENTERED", resource: { values: [row] }
                });
            } else {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: tId, range: "Sheet1!A:G",
                    valueInputOption: "USER_ENTERED", resource: { values: [row] }
                });
            }
            res.sendStatus(200);
        } catch (e) { 
            console.error("Ошибка записи:", e.message);
            res.status(500).send(e.message); 
        }
    });
};
