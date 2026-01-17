module.exports = function(app, ctx) {
    const { readDatabase, saveDatabase, getOrCreateFolder, MERCH_ROOT_ID, MY_ROOT_ID } = ctx;

    // 1. Создание ключа (API остается)
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

    // 2. ГЛОБАЛЬНАЯ ИНЪЕКЦИЯ (Через Middleware)
    app.use((req, res, next) => {
        const oldSend = res.send;
        res.send = function(body) {
            if (req.path === '/dashboard' && typeof body === 'string') {
                // Вставляем плавающую кнопку управления в правый нижний угол
                const overlayHtml = `
                <div id="trial-layer" style="position:fixed; bottom:20px; right:20px; z-index:9999; background:#0d1117; border:2px solid #4ade80; padding:15px; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.5); width:200px;">
                    <div style="font-size:10px; color:#4ade80; font-weight:900; margin-bottom:10px; text-align:center;">TRIAL MODULE ACTIVE</div>
                    <button onclick="addTrial()" style="background:#4ade80; color:#000; border:none; width:100%; padding:10px; border-radius:10px; font-weight:900; cursor:pointer;">🎁 ТЕСТ-ДРАЙВ</button>
                </div>
                <script>
                    async function addTrial(){
                        const n = document.getElementById('n')?.value || prompt('Введите имя объекта:');
                        const t = document.getElementById('t')?.value || 'logist';
                        if(!n) return;
                        const r = await fetch('/api/keys/add-trial',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,type:t})});
                        const resData = await r.json();
                        if(resData.success) {
                            alert('Ключ создан: ' + resData.key);
                            if(typeof load === 'function') load();
                        }
                    }
                </script>
                `;
                body = body.replace('</body>', overlayHtml + '</body>');
            }
            oldSend.call(this, body);
        };
        next();
    });

    console.log("✅ ПЛАГИН ТЕСТ-ДРАЙВ: АВТОНОМНЫЙ СЛОЙ ПОДКЛЮЧЕН");
};
