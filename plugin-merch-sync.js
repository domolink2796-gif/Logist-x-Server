// Этот файл просто закидывается в папку плагинов сервера
module.exports = function(app) {
    console.log("🚀 Серверный плагин: Синхронизация остатков команды запущена");

    // Объект для хранения оперативных данных в памяти сервера
    // Ключ: Лицензия_Адрес
    let teamCache = {};

    // 1. Прием данных от мерчендайзера (Катя изменила цифру)
    app.post('/save-partial-stock', (req, res) => {
        const { key, addr, item } = req.body;
        if (!key || !addr || !item) return res.status(400).send("Недостаточно данных");

        const storageKey = `${key}_${addr}`;
        
        if (!teamCache[storageKey]) teamCache[storageKey] = {};
        
        // Записываем товар в память сервера
        teamCache[storageKey][item.bc] = {
            bc: item.bc,
            name: item.name,
            shelf: item.shelf,
            stock: item.stock
        };

        res.sendStatus(200);
    });

    // 2. Раздача данных команде (Ваня открыл ту же точку)
    app.get('/get-shop-stock', (req, res) => {
        const { key, addr } = req.query;
        if (!key || !addr) return res.json([]);

        const storageKey = `${key}_${addr}`;
        
        // Если данные в памяти сервера есть — отдаем, если нет — пустой массив
        const currentData = teamCache[storageKey] ? Object.values(teamCache[storageKey]) : [];
        
        res.json(currentData);
    });
};
