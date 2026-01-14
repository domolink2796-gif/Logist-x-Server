/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v131.0 | THE HYPER-MONOLITH "OVERLORD"
 * -----------------------------------------------------------------------------------------
 * АВТОР: GEMINI AI (2026)
 * ПРАВООБЛАДАТЕЛЬ: Никитин Евгений Анатольевич
 * ОБНОВЛЕНИЕ: Адресный поиск, Дашборд статистики, Глубокая интеграция Мерч/Логистика
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
     * [РАЗДЕЛ 1]: X-NEURAL CORE v131 (ФОНОВАЯ ПАМЯТЬ)
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
                
                // Фирменный парсинг: Улица НомерДома Подъезд
                const reg = /([^0-9_]+)\s*(\d+)\s*(?:к|корп)?\s*(\d+)?\s*(?:п|под)?\s*(\d+)?/i;
                const m = n.match(reg);
                if (m) {
                    addr.street = m[1].trim();
                    addr.house = m[2];
                    addr.ent = m[4] || "1";
                }

                const record = {
                    id: file.id,
                    ts: new Date().toISOString(),
                    name: n,
                    type: file.mimeType.includes('folder') ? 'folder' : 'file',
                    project: pId === MERCH_ROOT_ID ? 'MERCH' : (pId === MY_ROOT_ID ? 'LOGISTICS' : 'COMMON'),
                    addr: addr
                };

                db.push(record);
                if (db.length > 100000) db.shift();
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
    <title>X-PLATFORM OVERLORD</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --b: #050505; --g: #f0b90b; --s: #ffffff; --t: #1a1a1b; --gr: #5f6368; --bl: #1a73e8; --br: #dadce0; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
        body, html { height: 100%; width: 100%; font-family: 'Roboto', sans-serif; background: #fafafa; color: var(--t); overflow: hidden; }

        header {
            height: 70px; background: var(--b); border-bottom: 4px solid var(--g);
            display: flex; align-items: center; justify-content: space-between; padding: 0 20px;
            z-index: 5000; position: relative; color: #fff;
        }
        .logo { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .logo img { height: 40px; border-radius: 8px; box-shadow: 0 0 15px var(--g); }
        .logo b { font-family: 'Google Sans'; font-size: 22px; }

        .shell { display: flex; height: calc(100% - 70px); width: 100%; }
        
        aside {
            width: 280px; background: #fff; border-right: 1px solid var(--br);
            display: flex; flex-direction: column; transition: 0.3s; z-index: 4000;
        }
        @media (max-width: 900px) { aside { position: absolute; left: -280px; height: 100%; } aside.open { left: 0; box-shadow: 10px 0 30px rgba(0,0,0,0.2); } }

        .nav-link {
            height: 50px; margin: 5px 15px; border-radius: 25px; display: flex; align-items: center;
            padding: 0 20px; cursor: pointer; font-size: 15px; font-weight: 500; color: var(--gr);
        }
        .nav-link i { width: 30px; font-size: 20px; }
        .nav-link.active { background: #fff8e1; color: #b8860b; font-weight: 700; border: 1px solid var(--g); }

        main { flex: 1; display: flex; flex-direction: column; background: #fff; overflow: hidden; }
        
        .search-bar {
            padding: 15px 25px; border-bottom: 1px solid #eee; display: flex; gap: 15px; align-items: center;
            background: #fff; sticky; top: 0; z-index: 100;
        }
        .search-bar input {
            flex: 1; padding: 12px 20px; border-radius: 12px; border: 1px solid var(--br);
            background: #f8f9fa; font-size: 16px;
        }

        .stats-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px; padding: 20px; background: #fdfdfd; border-bottom: 1px solid #eee;
        }
        .stat-card {
            padding: 15px; border-radius: 15px; border: 1px solid #eee; background: #fff;
            display: flex; flex-direction: column; align-items: center; text-align: center;
        }
        .stat-card i { font-size: 24px; margin-bottom: 8px; color: var(--g); }
        .stat-card span { font-size: 12px; color: var(--gr); text-transform: uppercase; letter-spacing: 1px; }
        .stat-card b { font-size: 20px; margin-top: 5px; }

        .content { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .grid { width: 100%; border-collapse: collapse; }
        .grid td { padding: 18px 20px; border-bottom: 1px solid #f9f9f9; cursor: pointer; }
        .grid tr:hover { background: #fcfcfc; }
        
        .f-info { display: flex; align-items: center; gap: 15px; }
        .f-icon { font-size: 24px; width: 35px; text-align: center; }
        .f-name { font-weight: 600; font-size: 15px; color: #333; }
        .f-addr { font-size: 11px; background: #eee; padding: 2px 8px; border-radius: 4px; color: #666; margin-top: 4px; display: inline-block; }

        .fab {
            position: fixed; bottom: 30px; right: 30px; width: 70px; height: 70px;
            border-radius: 20px; background: var(--b); border: 2px solid var(--g);
            display: flex; align-items: center; justify-content: center; z-index: 6000;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3); transition: 0.3s; color: var(--g); font-size: 30px;
        }
        .fab:active { transform: scale(0.9); }

        #pop, #ctx {
            position: fixed; display: none; background: #fff; border: 1px solid var(--br);
            border-radius: 20px; box-shadow: 0 15px 50px rgba(0,0,0,0.3); z-index: 8000; min-width: 250px;
        }
        #pop { bottom: 110px; right: 30px; }
        .m-row { padding: 15px 25px; display: flex; align-items: center; gap: 15px; cursor: pointer; font-weight: 500; }
        .m-row:hover { background: #f8f9fa; }
        .m-row i { color: var(--gr); width: 20px; }

        #viewer { display: none; position: fixed; inset: 0; background: #000; z-index: 9000; flex-direction: column; }
        .v-h { height: 60px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; color: #fff; background: #111; }
        
        #toast { position: fixed; top: 85px; right: 20px; background: #333; color: #fff; padding: 15px 25px; border-radius: 10px; display: none; z-index: 10000; border-left: 5px solid var(--g); box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
    </style>
</head>
<body>

<header>
    <div class="logo" onclick="document.getElementById('sidebar').classList.toggle('open')">
        <img src="${LOGO_URL}"> <b>TITANIUM <span style="color:var(--g)">OVERLORD</span></b>
    </div>
    <div style="font-size: 14px; font-weight: 700; color: var(--g);"><i class="fa fa-user-shield"></i> ЕВГЕНИЙ Н.А.</div>
</header>

<div class="shell">
    <aside id="sidebar">
        <div style="padding: 20px; font-weight: 800; color: #ccc; font-size: 12px; letter-spacing: 2px;">МЕНЮ УПРАВЛЕНИЯ</div>
        <div class="nav-link active" id="n-root" onclick="nav('root', 'Мой диск')"><i class="fa fa-database"></i> Мой диск</div>
        <div class="nav-link" id="n-log" onclick="nav('${MY_ROOT_ID}', 'Логистика X')"><i class="fa fa-truck-fast"></i> Логистика X</div>
        <div class="nav-link" id="n-merch" onclick="nav('${MERCH_ROOT_ID}', 'Мерчандайзинг')"><i class="fa fa-box-open"></i> Мерчандайзинг</div>
        <div class="nav-link" onclick="nav('trash', 'Корзина')"><i class="fa fa-trash-arrow-up"></i> Корзина</div>
        
        <div style="margin-top: auto; padding: 20px; border-top: 1px solid #eee;">
            <div style="font-size: 11px; color: #aaa;">X-NEURAL ENGINE v131.0</div>
            <div style="height: 4px; background: #eee; border-radius: 2px; margin-top: 5px;">
                <div style="width: 85%; height: 100%; background: var(--g); border-radius: 2px;"></div>
            </div>
        </div>
    </aside>
    
    <main>
        <div class="stats-grid" id="stats-panel">
            <div class="stat-card"><i class="fa fa-folder"></i><span>Объекты</span><b id="st-folders">0</b></div>
            <div class="stat-card"><i class="fa fa-file-image"></i><span>Отчеты</span><b id="st-files">0</b></div>
            <div class="stat-card"><i class="fa fa-map-location-dot"></i><span>Адреса</span><b id="st-addrs">0</b></div>
            <div class="stat-card" style="border-color: var(--g);"><i class="fa fa-bolt"></i><span>Статус</span><b>ACTIVE</b></div>
        </div>

        <div class="search-bar">
            <i class="fa fa-search" style="color: var(--gr)"></i>
            <input type="text" id="sq" placeholder="Поиск по адресу, улице или названию..." oninput="filterFiles()">
        </div>

        <div class="content">
            <table class="grid"><tbody id="f-body"></tbody></table>
        </div>
    </main>
</div>

<div class="fab" onclick="toggleP(event)"><i class="fa fa-plus"></i></div>

<div id="pop">
    <div class="m-row" onclick="mkdir()"><i class="fa fa-folder-plus"></i> Новый объект</div>
    <div class="m-row" onclick="document.getElementById('fin').click()"><i class="fa fa-upload"></i> Загрузить отчеты</div>
    <div class="m-row" onclick="location.reload()"><i class="fa fa-sync"></i> Обновить систему</div>
</div>

<div id="ctx">
    <div class="m-row" onclick="pv()"><i class="fa fa-eye"></i> Просмотр</div>
    <div class="m-row" onclick="rn()"><i class="fa fa-edit"></i> Переименовать</div>
    <div class="m-row" onclick="dl()" style="color:red"><i class="fa fa-trash"></i> Удалить</div>
</div>

<div id="viewer">
    <div class="v-h"><span id="v-t"></span><i class="fa fa-times" onclick="closePv()" style="cursor:pointer; font-size: 24px;"></i></div>
    <iframe id="v-f" style="flex:1; border:none; background:#fff"></iframe>
</div>

<input type="file" id="fin" style="display:none" multiple onchange="hUp(this.files)">
<div id="toast"></div>

<script>
    let curId = 'root'; let cache = []; let sel = null;

    async function sync(id) {
        curId = id; const b = document.getElementById('f-body');
        b.innerHTML = '<tr><td style="text-align:center; padding:100px;"><i class="fa fa-circle-notch fa-spin fa-3x" style="color:var(--g)"></i><br><br>СИНХРОНИЗАЦИЯ X-CORE...</td></tr>';
        
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
            b.innerHTML = '<tr><td style="text-align:center; padding:50px; color:red;">Ошибка связи с ядром.</td></tr>';
        }
    }

    function updateStats() {
        document.getElementById('st-folders').innerText = cache.filter(f => f.mimeType.includes('folder')).length;
        document.getElementById('st-files').innerText = cache.filter(f => !f.mimeType.includes('folder')).length;
        const addrs = new Set();
        cache.forEach(f => {
             const m = f.name.match(/([^0-9_]+)/);
             if(m) addrs.add(m[1].trim());
        });
        document.getElementById('st-addrs').innerText = addrs.size;
    }

    function render(data = cache) {
        const body = document.getElementById('f-body');
        body.innerHTML = '';
        if(!data.length) { body.innerHTML = '<tr><td style="text-align:center; color:#aaa; padding:50px;">Нет данных в этом секторе</td></tr>'; return; }
        
        data.forEach(f => {
            const isD = f.mimeType.includes('folder');
            const tr = document.createElement('tr');
            
            // Пытаемся вытащить адрес для тега
            let addrTag = "";
            const m = f.name.match(/([^0-9_]+)\s*(\d+)/);
            if(m) addrTag = \`<span class="f-addr"><i class="fa fa-location-dot"></i> \${m[1].trim()} \${m[2]}</span>\`;

            tr.innerHTML = \`<td>
                <div class="f-info">
                    <i class="fa \${isD?'fa-folder':'fa-file-alt'} f-icon" style="color:\${isD?'#FFCA28':'#4285F4'}"></i>
                    <div>
                        <div class="f-name">\${f.name}</div>
                        \${addrTag}
                        <div style="font-size:10px; color:#aaa; margin-top:2px;">\${isD?'ПАПКА':((f.size/1024/1024).toFixed(2)+' MB')} | \${new Date(f.modifiedTime).toLocaleDateString()}</div>
                    </div>
                </div>
            </td>\`;
            
            tr.onclick = () => isD ? sync(f.id) : pv(f.id, f.name);
            tr.oncontextmenu = (e) => { e.preventDefault(); sel = f; const m = document.getElementById('ctx'); m.style.display='block'; m.style.left=e.pageX+'px'; m.style.top=e.pageY+'px'; };
            body.appendChild(tr);
        });
    }

    function filterFiles() {
        const q = document.getElementById('sq').value.toLowerCase();
        const filtered = cache.filter(f => f.name.toLowerCase().includes(q));
        render(filtered);
    }

    function toggleP(e) { e.stopPropagation(); const m = document.getElementById('pop'); m.style.display = m.style.display==='block'?'none':'block'; }
    function nav(id, n) { sync(id); if(window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open'); }
    function pv(id, n) { document.getElementById('v-t').innerText = n||sel.name; document.getElementById('v-f').src = 'https://drive.google.com/file/d/'+(id||sel.id)+'/preview'; document.getElementById('viewer').style.display = 'flex'; }
    function closePv() { document.getElementById('viewer').style.display = 'none'; document.getElementById('v-f').src = ''; }
    async function hUp(files) { for(let f of files) { msg("🚀 ОТПРАВКА: "+f.name); const fd = new FormData(); fd.append('file',f); fd.append('folderId',curId); await fetch('/storage/api/upload',{method:'POST',body:fd}); } sync(curId); }
    async function mkdir() { const n = prompt("Имя нового объекта (Улица Дом Подъезд):"); if(n) { await fetch('/storage/api/mkdir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parentId:curId,name:n})}); sync(curId); } }
    async function dl() { if(confirm("Удалить объект в корзину?")) { await fetch('/storage/api/delete/'+sel.id,{method:'DELETE'}); sync(curId); } }
    async function rn() { const n = prompt("Новое имя:", sel.name); if(n) { await fetch('/storage/api/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:sel.id,name:n})}); sync(curId); } }
    function msg(t) { const b = document.getElementById('toast'); b.innerText = t; b.style.display = 'block'; setTimeout(() => b.style.display = 'none', 4000); }
    
    window.onclick = () => { document.getElementById('pop').style.display='none'; document.getElementById('ctx').style.display='none'; };
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
            if (!drive) throw new Error("DRIVE_OFFLINE");
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

    console.log("👑 TITANIUM v131.0 OVERLORD ACTIVATED");
};