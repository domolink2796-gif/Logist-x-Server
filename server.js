<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>LOGIST_X | MERCH PRO</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <style>
        :root { --bg: #000000; --card: #111111; --accent: #f59e0b; --green: #00ff00; --border: #222222; --text: #ffffff; --blue: #007aff; --red: #ff3b30; }
        body { font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding-bottom: 80px; user-select: none; }
        #auth-screen { position: fixed; inset: 0; background: #000; z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 30px; }
        .header { background: var(--bg); padding: 20px 15px; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; }
        .logo { font-size: 1.4rem; font-weight: 900; letter-spacing: -1px; margin-bottom: 15px; }
        .logo span { color: var(--accent); }
        .stats-main { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
        .s-box { background: var(--card); border: 1px solid var(--border); padding: 12px; border-radius: 12px; text-align: center; }
        .s-v { display: block; font-size: 1.1rem; font-weight: 800; }
        .s-t { font-size: 0.6rem; text-transform: uppercase; opacity: 0.5; margin-top: 4px; font-weight: 700; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
        .sync-active { animation: blink 1.5s infinite; background: var(--green) !important; color: #000 !important; }
        #syncIndicator { background: var(--accent); color: #000; padding: 8px 16px; border-radius: 20px; font-weight: 900; font-size: 0.75rem; border: none; cursor: pointer; display: none; margin-left: auto; }
        .btn-blue { background: var(--blue); color: white; padding: 16px; border-radius: 14px; text-align: center; font-weight: 700; cursor: pointer; border: none; width: 100%; display: block; box-sizing: border-box; margin-bottom: 10px; text-decoration: none; }
        #srch { width: calc(100% - 30px); margin: 10px 15px; padding: 14px; background: var(--card); border: 1px solid var(--border); color: white; border-radius: 12px; box-sizing: border-box; }
        .card { background: var(--card); border: 1px solid var(--border); margin: 10px 15px; padding: 18px; border-radius: 16px; position: relative; }
        .card-net { font-size: 0.7rem; color: var(--accent); font-weight: 800; text-transform: uppercase; }
        .card-addr { font-size: 1rem; font-weight: 600; }
        .dot { position: absolute; right: 18px; top: 18px; width: 10px; height: 10px; border-radius: 50%; background: #222; }
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 1000; display: none; align-items: center; justify-content: center; padding: 15px; }
        .m-form { background: #000; width: 100%; max-width: 420px; padding: 25px; border-radius: 28px; border: 1px solid var(--border); box-sizing: border-box; max-height: 95vh; overflow-y: auto; }
        .f-label { font-size: 0.65rem; text-transform: uppercase; opacity: 0.5; font-weight: 800; margin-top: 15px; display: block; }
        input { width: 100%; padding: 14px; background: #111; border: 1px solid var(--border); color: white; border-radius: 12px; margin-top: 5px; font-size: 16px; box-sizing: border-box; }
        .photo-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 10px; }
        .cam-btn { background: #111; border: 1px solid var(--border); height: 75px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 12px; font-size: 0.55rem; font-weight: 800; color: #666; cursor: pointer; }
        .cam-btn.ok { border-color: var(--green); color: var(--green); background: rgba(0,255,0,0.05); }
        #pdf-render { position: absolute; left: -9999px; width: 600px; background: #fff; color: #000; padding: 40px; box-sizing: border-box; }
        .hidden { display: none; }
    </style>
</head>
<body>
<div id="auth-screen">
    <div style="width:100%;">
        <center><div class="logo">LOGIST_X <span>MERCH</span></div></center>
        <input type="text" id="lic-key" placeholder="Ключ" style="text-align:center; margin-bottom:10px;">
        <input type="text" id="work-name" placeholder="Твое Имя" style="text-align:center; margin-bottom:15px;">
        <div id="auth-btn" class="btn-blue" onclick="saveAuth()">АКТИВИРОВАТЬ</div>
    </div>
</div>
<div class="header">
    <div style="display:flex; justify-content:space-between; align-items:center;">
        <div class="logo">LOGIST_X <span>MERCH</span></div>
        <button id="syncIndicator" onclick="checkQueue()">📦 <span id="qCount">0</span></button>
    </div>
    <div class="stats-main">
        <div class="s-box"><span class="s-v" id="st-total">0</span><span class="s-t">Точек</span></div>
        <div class="s-box"><span class="s-v" id="st-done" style="color:var(--green)">0</span><span class="s-t">Визитов</span></div>
    </div>
    <div style="display:flex; gap:10px;">
        <label class="btn-blue" for="file-in" style="flex:1;">ПЛАН (.XLSX)</label>
        <div class="btn-blue" onclick="clearData()" style="flex:0.3; background:var(--red);">🗑️</div>
    </div>
    <input type="file" id="file-in" class="hidden" onchange="handleFile(this)">
</div>
<input type="text" id="srch" placeholder="Поиск по адресу..." oninput="render()">
<div id="list"></div>
<div id="task-modal" class="modal">
    <div class="m-form">
        <div id="m-net" style="color:var(--accent); font-weight:800; font-size:0.8rem; text-transform:uppercase;"></div>
        <div id="start-block">
            <div id="disp-addr" style="font-size: 1.2rem; font-weight: 700; margin: 15px 0;"></div>
            <button class="btn-blue" id="begin-btn" style="background:var(--green); color:black;" onclick="begin()">НАЧАТЬ ВИЗИТ</button>
        </div>
        <div id="report-block" class="hidden">
            <span class="f-label">Адрес точки</span>
            <input type="text" id="inp-addr" readonly>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div><span class="f-label">Остаток</span><input type="number" id="i-stock" value="0"></div>
                <div><span class="f-label">Наш Фейсинг</span><input type="number" id="i-faces" value="0" oninput="calcShare()"></div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div><span class="f-label">Всего на полке</span><input type="number" id="i-total-faces" value="0" oninput="calcShare()"></div>
                <div style="text-align:center;"><span class="f-label">Доля полки</span><div style="color:var(--accent); font-weight:900; font-size:1.2rem; margin-top:8px;"><span id="share-val">0</span>%</div></div>
            </div>
            <span class="f-label">Срок годности / Фото (3шт)</span>
            <input type="date" id="i-exp">
            <div class="photo-grid">
                <label class="cam-btn" id="l-p1" for="c-p1">📸<br>ДО</label><input type="file" id="c-p1" accept="image/*" capture="camera" class="hidden" onchange="cam(this, 'pre')">
                <label class="cam-btn" id="l-p2" for="c-p2">📸<br>ПОСЛЕ</label><input type="file" id="c-p2" accept="image/*" capture="camera" class="hidden" onchange="cam(this, 'post')">
                <label class="cam-btn" id="l-p3" for="c-p3">📸<br>ЦЕННИК</label><input type="file" id="c-p3" accept="image/*" capture="camera" class="hidden" onchange="cam(this, 'price')">
            </div>
            <button class="btn-blue" id="finish-btn" style="background:var(--green); color:black; margin-top:20px;" onclick="saveToQueue()">ЗАВЕРШИТЬ</button>
        </div>
        <button class="btn-blue" style="background:none; color:#555;" onclick="closeModal()">ОТМЕНА</button>
    </div>
</div>

<div id="pdf-render">
    <div style="display:flex; justify-content:space-between; border-bottom:4px solid #000; padding-bottom:10px;">
        <div style="font-size:32px; font-weight:900; letter-spacing:-1px;">LOGIST_X <span style="color:#f59e0b">MERCH</span></div>
        <div style="font-size:14px; opacity:0.7; padding-top:15px;" id="p-date"></div>
    </div>
    <div style="margin-top:20px;">
        <div id="p-net" style="color:#f59e0b; font-weight:800; font-size:16px; text-transform:uppercase;"></div>
        <div id="p-addr-val" style="font-size:28px; font-weight:900; margin-bottom:5px;"></div>
        <div style="font-size:14px; opacity:0.6;">Мерчендайзер: <span id="p-worker"></span></div>
        <div style="background:#f59e0b; color:#000; padding:8px 15px; border-radius:6px; display:inline-block; font-weight:900; font-size:14px; margin-top:10px;">ВРЕМЯ ПРОВЕДЕННОЕ В МАГАЗИНЕ: <span id="p-dur"></span></div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:25px;">
        <div style="background:#f8f8f8; padding:20px; border-radius:20px;">
            <div style="font-size:10px; text-transform:uppercase; opacity:0.5; font-weight:800;">Остаток / Фейсинг</div>
            <div style="font-size:38px; font-weight:900; margin:10px 0;"><span id="p-stock"></span> / <span id="p-faces"></span></div>
            <div style="font-size:10px; text-transform:uppercase; opacity:0.5; font-weight:800;">Доля на полке</div>
            <div style="font-size:24px; font-weight:900; color:#f59e0b;"><span id="p-share"></span>%</div>
        </div>
        <div style="background:#f8f8f8; padding:20px; border-radius:20px;">
            <div style="font-size:10px; text-transform:uppercase; opacity:0.5; font-weight:800;">Срок годности</div>
            <div id="p-exp-val" style="color:#ff3b30; font-weight:900; font-size:20px; margin-top:10px;"></div>
        </div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:35px; text-align:center;">
        <div><div style="font-size:10px; font-weight:800; margin-bottom:5px;">ДО</div><img id="p-i1" style="width:100%; border-radius:10px; aspect-ratio:3/4; object-fit:cover;"></div>
        <div><div style="font-size:10px; font-weight:800; margin-bottom:5px;">ПОСЛЕ</div><img id="p-i2" style="width:100%; border-radius:10px; aspect-ratio:3/4; object-fit:cover;"></div>
        <div><div style="font-size:10px; font-weight:800; margin-bottom:5px;">ЦЕННИК</div><img id="p-i3" style="width:100%; border-radius:10px; aspect-ratio:3/4; object-fit:cover;"></div>
    </div>
</div>

<script>
    const API = 'https://logist-x-server-production.up.railway.app';
    let DATA = { shops: [], name: "", key: "" }, IMGS = { pre: null, post: null, price: null }, cur = null, db, syncing = false, lastError = "...";

    function getDist(lat1, lon1, lat2, lon2) {
        const R = 6371e3; const p1 = lat1 * Math.PI/180; const p2 = lat2 * Math.PI/180;
        const dp = (lat2-lat1) * Math.PI/180; const dl = (lon2-lon1) * Math.PI/180;
        const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function openDB() {
        const req = indexedDB.open("MerchX_Final_Sync", 4);
        req.onupgradeneeded = (e) => { const dbRef = e.target.result; if(!dbRef.objectStoreNames.contains("reports")) dbRef.createObjectStore("reports", { keyPath: "id", autoIncrement: true }); };
        req.onsuccess = (e) => { db = e.target.result; updateQueueUI(); setInterval(sync, 8000); };
    }

    window.onload = () => {
        DATA.name = localStorage.getItem('m_name') || ""; DATA.key = localStorage.getItem('m_key') || "";
        if(DATA.key && DATA.name) document.getElementById('auth-screen').style.display='none';
        DATA.shops = JSON.parse(localStorage.getItem('m_shops') || "[]"); openDB(); render();
    };

    async function saveAuth() {
        const n = document.getElementById('work-name').value.trim(), k = document.getElementById('lic-key').value.trim().toUpperCase();
        if(!n || !k) return alert("Введите данные");
        try {
            const res = await fetch(`${API}/check-license`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ licenseKey: k, workerName: n }) });
            const d = await res.json();
            if(d.status === 'active') { DATA.name = n; DATA.key = k; localStorage.setItem('m_name', n); localStorage.setItem('m_key', k); document.getElementById('auth-screen').style.display='none'; } else alert(d.message);
        } catch(e) { alert("Сервер недоступен"); }
    }

    function calcShare() {
        const mine = parseFloat(document.getElementById('i-faces').value) || 0, total = parseFloat(document.getElementById('i-total-faces').value) || 0;
        document.getElementById('share-val').innerText = total > 0 ? Math.round((mine / total) * 100) : 0;
    }

    function render() {
        const list = document.getElementById('list'), s = document.getElementById('srch').value.toLowerCase();
        document.getElementById('st-total').innerText = DATA.shops.length; document.getElementById('st-done').innerText = DATA.shops.filter(x => x.done).length;
        list.innerHTML = DATA.shops.filter(x => x.addr.toLowerCase().includes(s)).map(x => `<div class="card" onclick="openModal(${x.id})"><div class="dot" style="background:${x.done ? 'var(--green)' : (x.start ? 'var(--blue)' : '#222')}"></div><div class="card-net">${x.net}</div><div class="card-addr">${x.addr}</div></div>`).join('');
    }

    function openModal(id) {
        cur = DATA.shops.find(x => x.id === id); if(cur.done) return;
        document.getElementById('disp-addr').innerText = cur.addr; document.getElementById('inp-addr').value = cur.addr; document.getElementById('m-net').innerText = cur.net;
        document.getElementById('task-modal').style.display = 'flex';
        if(cur.start) { document.getElementById('start-block').classList.add('hidden'); document.getElementById('report-block').classList.remove('hidden'); }
        else { document.getElementById('start-block').classList.remove('hidden'); document.getElementById('report-block').classList.add('hidden'); }
    }

    async function begin() {
        const btn = document.getElementById('begin-btn'); btn.innerText = "ПОИСК GPS...";
        if(!cur.lat || !cur.lon) {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cur.city + ' ' + cur.addr)}`);
                const d = await res.json(); if(d[0]) { cur.lat = parseFloat(d[0].lat); cur.lon = parseFloat(d[0].lon); }
            } catch(e) { console.log("Geocode error"); }
        }
        cur.start = Date.now(); localStorage.setItem('m_shops', JSON.stringify(DATA.shops)); render(); openModal(cur.id); btn.innerText = "НАЧАТЬ ВИЗИТ";
    }

    async function saveToQueue() {
        if(!IMGS.pre || !IMGS.post || !IMGS.price) return alert("Нужно 3 фото");
        const btn = document.getElementById('finish-btn'); btn.innerText = "ПРОВЕРКА GPS..."; btn.disabled = true;
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const dist = getDist(pos.coords.latitude, pos.coords.longitude, cur.lat, cur.lon);
            if(dist > 600) { alert(`ВЫ СЛИШКОМ ДАЛЕКО!\nРасстояние: ${Math.round(dist)}м.\nНужно быть ближе 600м.`); btn.disabled = false; btn.innerText = "ЗАВЕРШИТЬ"; return; }
            const now = new Date(), durMin = Math.round((now - cur.start) / 60000);
            document.getElementById('p-date').innerText = now.toLocaleString(); document.getElementById('p-dur').innerText = durMin + " МИН";
            document.getElementById('p-net').innerText = cur.net; document.getElementById('p-addr-val').innerText = cur.addr;
            document.getElementById('p-worker').innerText = DATA.name; document.getElementById('p-stock').innerText = document.getElementById('i-stock').value;
            document.getElementById('p-faces').innerText = document.getElementById('i-faces').value; document.getElementById('p-share').innerText = document.getElementById('share-val').innerText;
            document.getElementById('p-exp-val').innerText = document.getElementById('i-exp').value || "-";
            document.getElementById('p-i1').src = IMGS.pre; document.getElementById('p-i2').src = IMGS.post; document.getElementById('p-i3').src = IMGS.price;
            setTimeout(async () => {
                const canvas = await html2canvas(document.getElementById('pdf-render'), { scale: 1 });
                const pdfFull = canvas.toDataURL('image/jpeg', 0.5);
                const pdfName = (cur.net + "_" + cur.addr).replace(/[^а-яёa-z0-9]/gi, '_');
                const report = { worker: DATA.name, net: cur.net, city: cur.city || "Орёл", address: cur.addr, stock: document.getElementById('i-stock').value, faces: document.getElementById('i-faces').value, share: document.getElementById('share-val').innerText, expDate: document.getElementById('i-exp').value, duration: durMin + " МИН", pdf: pdfFull, pdfName: pdfName, lat: pos.coords.latitude, lon: pos.coords.longitude, sending: 0 };
                const tx = db.transaction("reports", "readwrite"); tx.objectStore("reports").add(report);
                tx.oncomplete = () => { cur.done = true; localStorage.setItem('m_shops', JSON.stringify(DATA.shops)); closeModal(); render(); updateQueueUI(); sync(); };
                btn.disabled = false; btn.innerText = "ЗАВЕРШИТЬ";
            }, 500);
        }, (err) => { alert("Включите GPS!"); btn.disabled = false; btn.innerText = "ЗАВЕРШИТЬ"; }, { enableHighAccuracy: true, timeout: 10000 });
    }

    async function sync() {
        if(syncing || !navigator.onLine || !db) return; syncing = true;
        const tx = db.transaction("reports", "readwrite"), store = tx.objectStore("reports"), req = store.openCursor();
        req.onsuccess = async (e) => {
            const cursor = e.target.result;
            if(cursor) {
                const report = cursor.value; if(report.sending === 1) { cursor.continue(); return; }
                const rid = cursor.key; report.sending = 1; cursor.update(report);
                try {
                    const res = await fetch(`${API}/merch-upload`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(report) });
                    const d = await res.json(); if(d.success) { const delTx = db.transaction("reports", "readwrite"); delTx.objectStore("reports").delete(rid); lastError = "ОК"; } else throw new Error(d.error);
                } catch(err) { lastError = err.message; report.sending = 0; const errTx = db.transaction("reports", "readwrite"); errTx.objectStore("reports").put(report, rid); }
                syncing = false; updateQueueUI();
            } else { syncing = false; updateQueueUI(); }
        };
        req.onerror = () => syncing = false;
    }

    function updateQueueUI() {
        if(!db) return; const tx = db.transaction("reports", "readonly");
        tx.objectStore("reports").count().onsuccess = (e) => {
            const count = e.target.result; const ind = document.getElementById('syncIndicator');
            ind.style.display = count > 0 ? 'block' : 'none'; document.getElementById('qCount').innerText = count;
            if(syncing && count > 0) ind.classList.add('sync-active'); else ind.classList.remove('sync-active');
        };
    }

    function checkQueue() { const tx = db.transaction("reports", "readonly"); tx.objectStore("reports").count().onsuccess = (e) => alert(`ОЧЕРЕДЬ: ${e.target.result}\nСТАТУС: ${lastError}`); }

    function cam(i, t) {
        if(!i.files[0]) return; const r = new FileReader();
        r.onload = (e) => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const c = document.createElement('canvas'); let w = img.width, h = img.height, m = 800;
                if(w > h) { if(w > m) { h *= m/w; w = m; } } else { if(h > m) { w *= m/h; h = m; } }
                c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
                IMGS[t] = c.toDataURL('image/jpeg', 0.5); document.getElementById(t==='pre'?'l-p1':(t==='post'?'l-p2':'l-p3')).classList.add('ok');
            };
        }; r.readAsDataURL(i.files[0]);
    }

    function handleFile(inp) {
        const r = new FileReader(); r.onload = (e) => {
            const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            DATA.shops = rows.map((r, i) => ({ id: i, net: r['Сеть'] || 'МАРКЕТ', city: r['Город'] || 'Орёл', addr: r['Адрес'] || '?', lat: parseFloat(r['Широта']) || 0, lon: parseFloat(r['Долгота']) || 0, done: false, start: null }));
            localStorage.setItem('m_shops', JSON.stringify(DATA.shops)); render();
        }; r.readAsArrayBuffer(inp.files[0]);
    }

    function closeModal() { document.getElementById('task-modal').style.display='none'; IMGS = { pre:null, post:null, price:null }; document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('ok')); }
    function clearData() { if(confirm("Очистить данные?")) { localStorage.clear(); location.reload(); } }
</script>
</body>
</html>
