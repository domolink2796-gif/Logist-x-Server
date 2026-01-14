/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v132.0 | THE HYPER-MONOLITH "MOBILE PRO"
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * ОБНОВЛЕНИЕ: Глубокая мобильная оптимизация, поддержка Safe Areas, App-Feel UX
 * -----------------------------------------------------------------------------------------
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";

module.exports = function(app, context) {
    const { 
        drive, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, saveDatabase 
    } = context;

    const upload = multer({ 
        dest: 'uploads/',
        limits: { fileSize: 500 * 1024 * 1024 }
    });

    /**
     * [РАЗДЕЛ 1]: X-NEURAL CORE v132 (ФОНОВАЯ ОБРАБОТКА)
     */
    async function xNeuralProcess(file, pId, action) {
        setImmediate(async () => {
            try {
                const memoryPath = path.join(__dirname, 'server_memory.json');
                let db = [];
                if (fs.existsSync(memoryPath)) {
                    try {
                        const raw = fs.readFileSync(memoryPath, 'utf8');
                        db = raw ? JSON.parse(raw) : [];
                    } catch(e) { db = []; }
                }

                const n = file.name || "UNNAMED_ASSET";
                let addr = { street: 'Неизвестно', house: '', ent: '' };
                
                const reg = /([^0-9_]+)\s*(\d+)\s*(?:к|корп)?\s*(\d+)?\s*(?:п|под)?\s*(\d+)?/i;
                const m = n.match(reg);
                if (m) {
                    addr.street = m[1].trim();
                    addr.house = m[2];
                    addr.ent = m[4] || "1";
                }

                db.push({
                    id: file.id,
                    ts: new Date().toISOString(),
                    name: n,
                    type: file.mimeType.includes('folder') ? 'folder' : 'file',
                    project: pId === MERCH_ROOT_ID ? 'MERCH' : (pId === MY_ROOT_ID ? 'LOGISTICS' : 'COMMON'),
                    addr: addr
                });

                if (db.length > 50000) db.shift();
                fs.writeFileSync(memoryPath, JSON.stringify(db, null, 2));
            } catch (e) { console.error("🧠 X-NEURAL ERROR:", e.message); }
        });
    }

    const UI = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="theme-color" content="#050505">
    <meta name="format-detection" content="telephone=no">
    <title>X-PLATFORM TITAN</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { 
            --b: #050505; --g: #f0b90b; --s: #ffffff; --t: #1a1a1b; 
            --gr: #5f6368; --bl: #1a73e8; --br: #dadce0;
            --safe-top: env(safe-area-inset-top);
            --safe-bottom: env(safe-area-inset-bottom);
        }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
        
        body, html { 
            height: 100%; width: 100%; font-family: 'Roboto', sans-serif; 
            background: var(--b); color: var(--t); 
            overflow: hidden; position: fixed;
            overscroll-behavior-y: contain;
        }

        header {
            height: calc(70px + var(--safe-top)); background: var(--b); border-bottom: 4px solid var(--g);
            display: flex; align-items: flex-end; justify-content: space-between; 
            padding: 0 20px 15px 20px; z-index: 5000; position: relative; color: #fff;
        }
        .logo { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .logo img { height: 35px; border-radius: 8px; box-shadow: 0 0 15px var(--g); }
        .logo b { font-family: 'Google Sans'; font-size: 20px; }

        .shell { display: flex; height: calc(100% - (70px + var(--safe-top))); width: 100%; background: #fff; }
        
        aside {
            width: 280px; background: #fff; border-right: 1px solid var(--br);
            display: flex; flex-direction: column; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
            z-index: 4000;
        }
        @media (max-width: 900px) { 
            aside { position: absolute; left: 0; transform: translateX(-100%); height: 100%; } 
            aside.open { transform: translateX(0); box-shadow: 15px 0 50px rgba(0,0,0,0.3); } 
        }

        .nav-link {
            height: 54px; margin: 4px 12px; border-radius: 16px; display: flex; align-items: center;
            padding: 0 18px; cursor: pointer; font-size: 15px; font-weight: 500; color: var(--gr);
            transition: 0.2s;
        }
        .nav-link i { width: 35px; font-size: 22px; }
        .nav-link:active { background: #f1f3f4; }
        .nav-link.active { background: #fff8e1; color: #b8860b; font-weight: 700; border: 1px solid var(--g); }

        main { flex: 1; display: flex; flex-direction: column; background: #fff; overflow: hidden; position: relative; }
        
        .search-bar {
            padding: 12px 20px; border-bottom: 1px solid #eee; display: flex; gap: 12px; align-items: center;
            background: #fff; position: sticky; top: 0; z-index: 100;
        }
        .search-bar input {
            flex: 1; padding: 14px 18px; border-radius: 14px; border: 1px solid var(--br);
            background: #f1f3f4; font-size: 16px; -webkit-appearance: none;
        }

        .stats-grid {
            display: grid; grid-template-columns: repeat(2, 1fr);
            gap: 10px; padding: 15px; background: #fafafa; border-bottom: 1px solid #eee;
        }
        .stat-card {
            padding: 12px; border-radius: 16px; border: 1px solid #eee; background: #fff;
            display: flex; align-items: center; gap: 12px;
        }
        .stat-card i { font-size: 20px; color: var(--g); }
        .stat-card div { display: flex; flex-direction: column; }
        .stat-card span { font-size: 10px; color: var(--gr); text-transform: uppercase; }
        .stat-card b { font-size: 16px; }

        .content { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 100px; }
        .grid { width: 100%; border-collapse: collapse; }
        .grid td { padding: 16px 20px; border-bottom: 1px solid #f5f5f5; }
        .grid tr:active { background: #f9f9f9; }
        
        .f-info { display: flex; align-items: center; gap: 15px; }
        .f-icon { font-size: 26px; width: 35px; text-align: center; }
        .f-name { font-weight: 600; font-size: 15px; color: #333; line-height: 1.2; }
        .f-addr { font-size: 11px; background: #eee; padding: 2px 8px; border-radius: 6px; color: #555; margin-top: 4px; display: inline-block; }

        .fab {
            position: fixed; bottom: calc(30px + var(--safe-bottom)); right: 25px; 
            width: 65px; height: 65px; border-radius: 22px; background: var(--b); 
            border: 3px solid var(--g); display: flex; align-items: center; justify-content: center; 
            z-index: 6000; box-shadow: 0 12px 35px rgba(0,0,0,0.4); color: var(--g); font-size: 28px;
            transition: transform 0.1s;
        }
        .fab:active { transform: scale(0.9); }

        #pop, #ctx {
            position: fixed; display: none; background: rgba(255,255,255,0.98); 
            backdrop-filter: blur(15px); border: 1px solid var(--br);
            border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); z-index: 8000; min-width: 260px;
            animation: slideUp 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        #pop { bottom: calc(110px + var(--safe-bottom)); right: 25px; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        .m-row { padding: 18px 25px; display: flex; align-items: center; gap: 15px; cursor: pointer; font-weight: 600; border-bottom: 1px solid #f0f0f0; }
        .m-row:last-child { border: none; }
        .m-row:active { background: #f0f0f0; }
        .m-row i { color: var(--gr); width: 24px; font-size: 18px; }

        #viewer { display: none; position: fixed; inset: 0; background: #000; z-index: 9500; flex-direction: column; }
        .v-h { height: calc(60px + var(--safe-top)); display: flex; align-items: flex-end; justify-content: space-between; padding: 0 20px 15px; color: #fff; background: #000; }
        
        #toast { position: fixed; top: calc(20px + var(--safe-top)); left: 20px; right: 20px; background: #333; color: #fff; padding: 16px; border-radius: 12px; display: none; z-index: 10000; border-left: 6px solid var(--g); box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-weight: 600; }
        
        /* Скрытие полосы прокрутки */
        ::-webkit-scrollbar { width: 0; background: transparent; }
    </style>
</head>
<body>

<header>
    <div class="logo" onclick="toggleSidebar()">
        <img src="${LOGO_URL}"> <b>TITANIUM <span style="color:var(--g)">X</span></b>
    </div>
    <div style="font-size: 12px; font-weight: 900; color: var(--g); background: #1a1a1a; padding: 4px 10px; border-radius: 8px;">
        ЕВГЕНИЙ Н.А.
    </div>
</header>

<div class="shell">
    <aside id="sidebar">
        <div style="padding: 25px 20px 10px; font-weight: 800; color: #bbb; font-size: 11px; letter-spacing: 1.5px;">ГЛАВНОЕ ЯДРО</div>
        <div class="nav-link active" id="n-root" onclick="nav('root')"><i class="fa fa-hdd"></i> Мой диск</div>
        <div class="nav-link" id="n-log" onclick="nav('${MY_ROOT_ID}')"><i class="fa fa-truck-ramp-box"></i> Логистика X</div>
        <div class="nav-link" id="n-merch" onclick="nav('${MERCH_ROOT_ID}')"><i class="fa fa-shop"></i> Мерчандайзинг</div>
        <div class="nav-link" onclick="nav('trash')"><i class="fa fa-trash-can"></i> Корзина</div>
        
        <div style="margin-top: auto; padding: 25px; background: #fafafa;">
            <div style="font-size: 10px; color: #aaa; font-weight: 700;">X-NEURAL ENGINE v132.0</div>
            <div style="height: 5px; background: #eee; border-radius: 10px; margin-top: 8px; overflow: hidden;">
                <div style="width: 92%; height: 100%; background: var(--g);"></div>
            </div>
        </div>
    </aside>
    
    <main>
        <div class="stats-grid">
            <div class="stat-card"><i class="fa fa-folder"></i><div><span>Объекты</span><b id="st-folders">0</b></div></div>
            <div class="stat-card"><i class="fa fa-camera"></i><div><span>Отчеты</span><b id="st-files">0</b></div></div>
        </div>

        <div class="search-bar">
            <input type="text" id="sq" placeholder="Поиск по адресу или улице..." oninput="filterFiles()">
        </div>

        <div class="content" id="scroll-area">
            <table class="grid"><tbody id="f-body"></tbody></table>
        </div>
    </main>
</div>

<div class="fab" id="main-fab" onclick="toggleP(event)"><i class="fa fa-plus"></i></div>

<div id="pop">
    <div class="m-row" onclick="mkdir()"><i class="fa fa-folder-plus"></i> Создать объект</div>
    <div class="m-row" onclick="document.getElementById('fin').click()"><i class="fa fa-cloud-arrow-up"></i> Загрузить фото</div>
    <div class="m-row" onclick="location.reload()"><i class="fa fa-rotate"></i> Синхронизировать</div>
</div>

<div id="ctx">
    <div class="m-row" onclick="pv()"><i class="fa fa-expand"></i> Открыть</div>
    <div class="m-row" onclick="rn()"><i class="fa fa-pen"></i> Переименовать</div>
    <div class="m-row" onclick="dl()" style="color:red"><i class="fa fa-trash"></i> Удалить</div>
</div>

<div id="viewer">
    <div class="v-h"><span id="v-t" style="font-weight:700; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;"></span><i class="fa fa-xmark" onclick="closePv()" style="font-size: 28px; color:var(--g)"></i></div>
    <iframe id="v-f" style="flex:1; border:none; background:#fff"></iframe>
</div>

<input type="file" id="fin" style="display:none" multiple accept="image/*" onchange="hUp(this.files)">
<div id="toast"></div>

<script>
    let curId = 'root'; let cache = []; let sel = null;

    function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

    async function sync(id) {
        curId = id; const b = document.getElementById('f-body');
        b.innerHTML = '<tr><td style="text-align:center; padding:80px;"><i class="fa fa-spinner fa-spin fa-3x" style="color:var(--g)"></i><br><br><small>ПОДКЛЮЧЕНИЕ К X-CORE...</small></td></tr>';
        
        try {
            const r = await fetch('/storage/api/list?folderId=' + id);
            cache = await r.json();
            updateStats();
            render();
            
            document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
            if(id === 'root') document.getElementById('n-root').classList.add('active');
            if(id === '${MY_ROOT_ID}') document.getElementById('n-log').classList.add('active');
            if(id === '${MERCH_ROOT_ID}') document.getElementById('n-merch').classList.add('active');
        } catch(e) { 
            b.innerHTML = '<tr><td style="text-align:center; padding:40px; color:red;">Ошибка X-CORE. Проверьте сеть.</td></tr>';
        }
    }

    function updateStats() {
        document.getElementById('st-folders').innerText = cache.filter(f => f.mimeType.includes('folder')).length;
        document.getElementById('st-files').innerText = cache.filter(f => !f.mimeType.includes('folder')).length;
    }

    function render(data = cache) {
        const body = document.getElementById('f-body');
        body.innerHTML = '';
        if(!data.length) { body.innerHTML = '<tr><td style="text-align:center; color:#aaa; padding:50px;">Пустой сектор</td></tr>'; return; }
        
        data.forEach(f => {
            const isD = f.mimeType.includes('folder');
            const tr = document.createElement('tr');
            
            let addrTag = "";
            const m = f.name.match(/([^0-9_]+)\s*(\d+)/);
            if(m) addrTag = \`<span class="f-addr">\${m[1].trim()} \${m[2]}</span>\`;

            tr.innerHTML = \`<td>
                <div class="f-info">
                    <i class="fa \${isD?'fa-folder':'fa-image'} f-icon" style="color:\${isD?'#fbc02d':'#1a73e8'}"></i>
                    <div>
                        <div class="f-name">\${f.name}</div>
                        \${addrTag}
                        <div style="font-size:10px; color:#aaa; margin-top:2px;">\${isD?'ПАПКА':((f.size/1024/1024).toFixed(2)+' MB')}</div>
                    </div>
                </div>
            </td>\`;
            
            tr.onclick = () => isD ? sync(f.id) : pv(f.id, f.name);
            
            // Долгая задержка для меню на мобильных
            tr.oncontextmenu = (e) => { 
                e.preventDefault(); 
                sel = f; 
                const m = document.getElementById('ctx'); 
                m.style.display='block'; 
                m.style.left='20px'; 
                m.style.right='20px';
                m.style.bottom='100px'; 
            };
            body.appendChild(tr);
        });
    }

    function filterFiles() {
        const q = document.getElementById('sq').value.toLowerCase();
        render(cache.filter(f => f.name.toLowerCase().includes(q)));
    }

    function toggleP(e) { 
        e.stopPropagation(); 
        const m = document.getElementById('pop'); 
        m.style.display = m.style.display==='block'?'none':'block'; 
    }

    function nav(id) { sync(id); if(window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open'); }
    function pv(id, n) { 
        document.getElementById('v-t').innerText = n||sel.name; 
        document.getElementById('v-f').src = 'https://drive.google.com/file/d/'+(id||sel.id)+'/preview'; 
        document.getElementById('viewer').style.display = 'flex'; 
    }
    function closePv() { document.getElementById('viewer').style.display = 'none'; document.getElementById('v-f').src = ''; }
    
    async function hUp(files) { 
        for(let f of files) { 
            msg("🚀 ВЫГРУЗКА: " + f.name); 
            const fd = new FormData(); fd.append('file', f); fd.append('folderId', curId); 
            await fetch('/storage/api/upload', {method:'POST', body:fd}); 
        } 
        sync(curId); 
    }
    
    async function mkdir() { 
        const n = prompt("Адрес объекта (Улица Дом):"); 
        if(n) { 
            await fetch('/storage/api/mkdir', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({parentId:curId, name:n})}); 
            sync(curId); 
        } 
    }
    
    async function dl() { if(confirm("Удалить в корзину?")) { await fetch('/storage/api/delete/'+sel.id, {method:'DELETE'}); sync(curId); } }
    async function rn() { const n = prompt("Новое имя:", sel.name); if(n) { await fetch('/storage/api/rename', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:sel.id, name:n})}); sync(curId); } }
    
    function msg(t) { 
        const b = document.getElementById('toast'); 
        b.innerText = t; b.style.display = 'block'; 
        setTimeout(() => b.style.display = 'none', 4000); 
    }
    
    window.onclick = () => { 
        document.getElementById('pop').style.display='none'; 
        document.getElementById('ctx').style.display='none'; 
    };
    
    sync('root');
</script>
</body>
</html>
    `;

    // --- API ENDPOINTS ---
    app.get('/', (req, res) => res.send(UI));
    app.get('/storage', (req, res) => res.send(UI));

    app.get('/storage/api/list', async (req, res) => {
        try {
            if (!drive) throw new Error("OFFLINE");
            const folderId = req.query.folderId || 'root';
            const q = (folderId === 'trash') ? "trashed = true" : `'${folderId}' in parents and trashed = false`;
            const r = await drive.files.list({ q, fields: 'files(id, name, mimeType, size, modifiedTime)', orderBy: 'folder, name' });
            r.data.files.forEach(f => xNeuralProcess(f, folderId, 'SYNC'));
            res.json(r.data.files);
        } catch (e) { res.status(500).json({error: e.message}); }
    });

    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            const r = await drive.files.create({ 
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) },
                fields: 'id, name, mimeType, parents, size'
            });
            xNeuralProcess(r.data, req.body.folderId, 'UPLOAD');
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); 
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/mkdir', express.json(), async (req, res) => {
        try {
            const r = await drive.files.create({ 
                resource: { name: req.body.name, mimeType: 'application/vnd.google-apps.folder', parents: [req.body.parentId] },
                fields: 'id, name, mimeType, parents'
            });
            xNeuralProcess(r.data, req.body.parentId, 'MKDIR');
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/rename', express.json(), async (req, res) => {
        try { await drive.files.update({ fileId: req.body.id, resource: { name: req.body.name } }); res.sendStatus(200); } catch (e) { res.status(500).send(e.message); }
    });

    app.delete('/storage/api/delete/:id', async (req, res) => {
        try { await drive.files.update({ fileId: req.params.id, resource: { trashed: true } }); res.sendStatus(200); } catch (e) { res.status(500).send(e.message); }
    });

    console.log("📱 TITANIUM v132.0 MOBILE PRO ACTIVATED");
};