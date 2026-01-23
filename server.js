// --- [X-STORE BRIDGE] ---
// Подключаем магазин x-platform.ru из соседнего репозитория
try {
    const path = require('path');
    const fs = require('fs');
    
    // Путь к папке x-store, которая лежит рядом с папкой сервера
    const xStorePluginPath = path.join(__dirname, '..', 'x-store', 'plugin-xstore.js');

    if (fs.existsSync(xStorePluginPath)) {
        // Передаем app и наш общий контекст (бот, база и т.д.)
        require(xStorePluginPath)(app, pluginContext);
        console.log("🚀 МОСТ С X-STORE УСТАНОВЛЕН (x-platform.ru)");
    } else {
        console.log("⚠️ ВНИМАНИЕ: Папка x-store не найдена рядом с сервером.");
    }
} catch (e) {
    console.log("❌ КРИТИЧЕСКАЯ ОШИБКА ПОДКЛЮЧЕНИЯ X-STORE: " + e.message);
}
