const { exec } = require('child_process');

module.exports = function(app, context) {
    // Твой IP проектора из Tailscale
    const PROJ_IP = '100.96.244.67'; 

    // Функция для отправки команд ADB
    const sendAdb = (command) => {
        exec(`adb -s ${PROJ_IP}:5555 shell ${command}`, (err) => {
            if (err) console.log('❌ Ошибка ADB:', err.message);
        });
    };

    // Автоматическое подключение при запуске сервера
    exec(`adb connect ${PROJ_IP}:5555`, (err, stdout) => {
        console.log('🔗 Подключение к проектору:', stdout);
    });

    // API для кнопок пульта
    app.get('/api/remote/:key', (req, res) => {
        const keyMap = {
            up: '19', down: '20', left: '21', right: '22', 
            ok: '23', back: '4', home: '3', power: '26'
        };
        const code = keyMap[req.params.key];
        if (code) {
            sendAdb(`input keyevent ${code}`);
            res.json({ status: 'ok', key: req.params.key });
        } else {
            res.status(400).send('Unknown key');
        }
    });

    // API для голосового ввода (текста)
    app.get('/api/remote/text', (req, res) => {
        const text = req.query.val;
        if (text) {
            // Команда печатает текст, заменяя пробелы на спецсимволы
            sendAdb(`input text "$(printf '%s' '${text}' | sed 's/ /%s/g')"`);
            res.json({ status: 'text_sent', val: text });
        }
    });

    console.log("✅ Плагин управления проектором (100.96.244.67) запущен");
};
