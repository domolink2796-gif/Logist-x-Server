module.exports = function(app, ctx) {
    const { readDatabase, saveDatabase, getOrCreateFolder, MERCH_ROOT_ID, MY_ROOT_ID } = ctx;

    // 1. Создание ключа (оставляем как есть)
    app.post('/api/keys/add-trial', async (req, res) => {
        try {
            const { name, type } = req.body;
            let keys = await readDatabase();
            const trialKey = "TRIAL-" + Math.random().toString(36).substring(2, 7).toUpperCase();
            const exp = new Date();
            exp.setHours(exp.getHours() + 72);
            const projR = (type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
            const fId = await getOrCreateFolder(name + " (TRIAL)", projR);
            keys.push({
                key: trialKey, name: name + " [ТЕСТ]", limit: 2,
                expiry: exp.toISOString(), workers: [], ownerChatId: null,
                folderId: fId, type: type || 'logist', isTrial: true
            });
            await saveDatabase(keys);
            res.json({ success: true, key: trialKey });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // 2. ХИТРЫЙ ПЕРЕХВАТ: Переопределяем существующий путь /dashboard
    const stack = app._router.stack;
    const routeIndex = stack.findIndex(layer => layer.route && layer.route.path === '/dashboard');

    if (routeIndex !== -1) {
        // Запоминаем оригинал, чтобы достать из него HTML
        const originalHandler = stack[routeIndex].route.stack[0].handle;
        
        // Ставим свой обработчик поверх
        app.get('/dashboard', async (req, res) => {
            // Временно перехватываем res.send
            const oldSend = res.send;
            res.send = function(body) {
                if (typeof body === 'string' && body.includes('add()')) {
                    body = body.replace(
                        'onclick="add()">СОЗДАТЬ КЛЮЧ</button>',
                        'onclick="add()">СОЗДАТЬ КЛЮЧ</button><button id="trialBtn" style="background:#4ade80; color:#000; padding:14px; border-radius:8px; border:none; font-weight:700; cursor:pointer; width:100%; margin-top:10px; font-size:14px;" onclick="addTrial()">🎁 ТЕСТ-ДРАЙВ (3 ДНЯ)</button>'
                    );
                    
                    const script = `
                    async function addTrial(){
                        const n = document.getElementById('n').value;
                        const t = document.getElementById('t').value;
                        if(!n) return alert('Введите имя');
                        const r = await fetch('/api/keys/add-trial',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,type:t})});
                        const res = await r.json();
                        if(res.success) alert('Тестовый ключ: ' + res.key);
                        load();
                    }`;
                    body = body.replace('load();', 'load();' + script);
                }
                oldSend.call(this, body);
            };
            originalHandler(req, res);
        });
        console.log("✅ ПЛАГИН ТЕСТ-ДРАЙВ: ПРЯМАЯ ИНЪЕКЦИЯ В РОУТ ВЫПОЛНЕНА");
    } else {
        console.log("⚠️ ПЛАГИН ТЕСТ-ДРАЙВ: Роут /dashboard не найден в памяти сервера");
    }
};
