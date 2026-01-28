<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>X-CONECT</title>
    <link rel="manifest" href="manifest.json">
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
    <style>
        :root { 
            --gold: #ff6600; 
            --dark: #0b0b0b; 
            --card: rgba(26, 26, 26, 0.8); 
            --read-color: #4ea4f6; 
        }
        
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        
        html, body { 
            height: 100%; margin: 0; padding: 0; background: var(--dark); 
            overflow: hidden; position: fixed; width: 100%; 
        }
        
        body { 
            color: #fff; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
            display: flex; 
            flex-direction: column; 
            background: radial-gradient(circle at top right, #1a1a1a, #0b0b0b); 
        }

        /* === ВЕРХНЯЯ ПАНЕЛЬ === */
        .header { 
            background: var(--card); backdrop-filter: blur(10px); padding: 10px 15px; 
            display: flex; justify-content: space-between; align-items: center; 
            border-bottom: 2px solid var(--gold); z-index: 100; flex-shrink: 0; 
        }
        
        /* === ПАНЕЛЬ ВКЛАДОК (ТЕПЕРЬ ДЛЯ ВСЕХ) === */
        #adminPanel { 
            display: flex; background: rgba(17, 17, 17, 0.7); backdrop-filter: blur(5px); 
            padding: 8px; overflow-x: auto; white-space: nowrap; border-bottom: 1px solid #333; 
            gap: 10px; flex-shrink: 0; 
        }
        
        .chat-tab-container { 
            display: inline-flex; align-items: center; background: rgba(50, 50, 50, 0.3); 
            border-radius: 15px; padding-right: 8px; margin-right: 8px; border: 1px solid #444; 
            position: relative; 
        }
        
        .chat-tab { 
            display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 15px; 
            font-size: 13px; color: #888; cursor: pointer; gap: 5px; 
        }
        
        .chat-tab.active { color: var(--gold); background: rgba(42, 26, 10, 0.6); }
        
        .del-chat-btn { color: #ff4444; font-size: 14px; cursor: pointer; padding: 0 5px; opacity: 0.6; }
        .del-chat-btn:hover { opacity: 1; }
        
        .unread-badge { 
            background: #ff3b30; color: white; border-radius: 50%; padding: 2px 6px; 
            font-size: 10px; font-weight: bold; margin-left: 5px; display: none; 
            box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        }
        .unread-badge.show { display: inline-block; }

        .status-dot { width: 10px; height: 10px; background: #444; border-radius: 50%; display: inline-block; margin-right: 5px; transition: 0.3s; }
        .online { background: #00ff00; box-shadow: 0 0 10px #00ff00; }
        .offline { background: #ff0000; box-shadow: 0 0 10px #ff0000; }
        
        .edit-btn { background: none; border: none; color: var(--gold); font-size: 20px; cursor: pointer; padding: 5px; margin-left: 5px; }

        /* === ОКНО СООБЩЕНИЙ === */
        .messages { 
            flex: 1; overflow-y: auto; padding: 15px; display: flex; 
            flex-direction: column; gap: 12px; -webkit-overflow-scrolling: touch; 
        }
        
        .bubble { 
            max-width: 85%; padding: 10px 14px; border-radius: 18px; font-size: 15px; 
            line-height: 1.4; animation: fadeIn 0.2s ease; position: relative; 
            display: flex; flex-direction: column; cursor: pointer;
            backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); 
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }
        
        .mine { align-self: flex-end; background: rgba(255, 102, 0, 0.25); color: #fff; border-bottom-right-radius: 2px; border-color: rgba(255, 102, 0, 0.4); text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
        .theirs { align-self: flex-start; background: rgba(42, 42, 42, 0.6); color: #eee; border-bottom-left-radius: 2px; border: 1px solid rgba(255, 255, 255, 0.05); }
        
        .msg-avatar { width: 28px; height: 28px; border-radius: 50%; background-size: cover; border: 1px solid var(--gold); margin-bottom: 4px; }
        .msg-footer { display: flex; align-items: center; justify-content: flex-end; margin-top: 4px; gap: 4px; opacity: 0.7; }
        .msg-time { font-size: 10px; font-weight: bold; }
        .msg-status { font-size: 14px; line-height: 10px; color: #ccc; transition: color 0.3s; }
        .msg-status.read { color: var(--read-color); text-shadow: 0 0 5px rgba(78, 164, 246, 0.5); }
        
        .msg-img { max-width: 100%; border-radius: 10px; margin-top: 5px; opacity: 0.95; transition: transform 0.2s; }

        /* === ПАНЕЛЬ ВВОДА === */
        .bottom-nav { background: var(--card); backdrop-filter: blur(15px); border-top: 1px solid #333; padding-bottom: env(safe-area-inset-bottom); flex-shrink: 0; position: relative; }
        .emoji-bar { display: flex; justify-content: space-around; padding: 8px 10px; border-bottom: 1px solid #222; font-size: 22px; }
        .input-area { padding: 10px; display: flex; gap: 6px; align-items: center; width: 100%; overflow: hidden; }
        input#msgInput { flex: 1; min-width: 0; background: rgba(0, 0, 0, 0.6); border: 1px solid #444; padding: 10px 15px; border-radius: 25px; color: #fff; outline: none; font-size: 16px; }
        
        .send-btn { 
            background: var(--gold); border: none; width: 40px; height: 40px; 
            border-radius: 50%; color: white; cursor: pointer; display: flex; 
            align-items: center; justify-content: center; flex-shrink: 0; 
        }
        
        #voiceBtn { background: rgba(51, 51, 51, 0.7); font-size: 18px; }
        #voiceBtn.recording { background: #ff0000; animation: pulse 1s infinite; border: 2px solid white; }
        #attachBtn { background: rgba(34, 34, 34, 0.7); border: 1px solid #444; font-size: 18px; }
        
        .rec-timer { font-size: 12px; color: #ff4444; text-align: center; font-weight: bold; display: none; margin-bottom: 2px; position: absolute; top: -18px; left: 50%; transform: translateX(-50%); }

        /* === ЭКРАНЫ НАЛОЖЕНИЯ === */
        #setupOverlay { position: fixed; inset: 0; background: var(--dark); z-index: 2000; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
        #avatarPreview { width: 100px; height: 100px; border-radius: 50%; border: 2px solid var(--gold); margin-bottom: 25px; background: #222 center/cover; }
        .elegant-input { width: 70%; background: none; border: none; border-bottom: 2px solid #333; color: #fff; padding: 10px; text-align: center; font-size: 18px; outline: none; margin-bottom: 15px; }
        
        #fullImgOverlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 3000;
            display: none; align-items: center; justify-content: center; backdrop-filter: blur(15px);
        }
        #fullImgOverlay img { max-width: 95%; max-height: 90%; border-radius: 10px; }

        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>

    <div id="fullImgOverlay" onclick="this.style.display='none'">
        <img id="fullImgContent" src="">
    </div>

    <div id="setupOverlay">
        <h2 style="color:var(--gold); letter-spacing: 2px;">X-CONECT</h2>
        <div id="avatarPreview" onclick="document.getElementById('fileInput').click()"></div>
        <input type="file" id="fileInput" style="display:none" accept="image/*">
        
        <input type="text" id="nameInput" class="elegant-input" placeholder="Введите Ник..." maxlength="15">
        <input type="password" id="passInput" class="elegant-input" placeholder="Пароль..." maxlength="20">
        
        <label style="color:#888; font-size:14px; margin-bottom:20px; display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="rememberMe" checked> Запомнить меня
        </label>

        <button class="send-btn" style="width:auto; border-radius:20px; padding:0 35px; font-weight:bold;" onclick="saveProfile()">СОХРАНИТЬ</button>
    </div>

    <div class="header">
        <div>
            <span id="statusDot" class="status-dot"></span>
            <b id="headerTitle">X-CONECT</b>
        </div>
        <div>
            <button class="edit-btn" onclick="findUser()">🔍</button>
            <button class="edit-btn" onclick="openSettings()">⚙️</button>
        </div>
    </div>

    <div id="adminPanel"></div>

    <div class="messages" id="chatBox"></div>

    <div class="bottom-nav">
        <div id="recTimer" class="rec-timer">00:00</div>
        <div class="emoji-bar">
            <span onclick="insertEmoji('❤️')">❤️</span>
            <span onclick="insertEmoji('🔥')">🔥</span>
            <span onclick="insertEmoji('🚀')">🚀</span>
            <span onclick="insertEmoji('👍')">👍</span>
            <span onclick="sendTestPush()">🔔</span> 
        </div>
        <div class="input-area">
            <input type="file" id="imgInput" style="display:none" accept="image/*" onchange="sendImage(this)">
            <button id="attachBtn" class="send-btn" onclick="document.getElementById('imgInput').click()">📎</button>
            <button id="voiceBtn" class="send-btn" onclick="toggleVoice()">🎤</button>
            <input type="text" id="msgInput" placeholder="Текст..." onkeypress="if(event.key==='Enter') sendMsg()">
            <button class="send-btn" onclick="sendMsg()">🚀</button>
        </div>
    </div>

<script>
    const API_BASE = "https://logist-x.store";
    const chatBox = document.getElementById('chatBox');
    const setupOverlay = document.getElementById('setupOverlay');
    const statusDot = document.getElementById('statusDot');
    const msgInput = document.getElementById('msgInput');
    const voiceBtn = document.getElementById('voiceBtn');
    const adminPanel = document.getElementById('adminPanel');
    const recTimer = document.getElementById('recTimer');
    const notifySound = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
    
    // ПЕРЕМЕННЫЕ ИДЕНТИФИКАЦИИ
    let myChatId = localStorage.getItem('x_chat_id') || ('chat_' + Math.random().toString(36).substr(2, 9));
    localStorage.setItem('x_chat_id', myChatId);

    let myName = localStorage.getItem('x_user_name');
    let myPass = localStorage.getItem('x_user_pass');
    let myAvatar = localStorage.getItem('x_user_avatar');
    
    let mediaRecorder, timerInterval;
    let audioChunks = [];
    let isRecording = false;
    let currentActiveChat = myChatId;

    const socket = io(API_BASE, { reconnection: true });

    // === ОБРАБОТЧИКИ СОБЫТИЙ SOCKET.IO ===
    socket.on('connect', () => {
        statusDot.className = 'status-dot online';
        if (myName && myPass) autoLogin();
        joinRoom(currentActiveChat);
        subscribeToPush();
        loadAllChats(); // Загружаем вкладки при подключении
    });

    socket.on('disconnect', () => { statusDot.className = 'status-dot offline'; });

    socket.on('new_message', (m) => {
        if (m.user !== myName) {
            if (currentActiveChat === m.roomId || currentActiveChat === myChatId) {
                socket.emit('message_read', { msgId: m.id, roomId: m.roomId });
            }
            addBubble(m, 'theirs');
            notifySound.play().catch(()=>{});
        }
    });

    socket.on('refresh_chat_list', () => {
        loadAllChats(); // Сигнал от сервера обновить вкладки
    });

    socket.on('msg_read_status', (data) => {
        data.msgIds.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                const tick = el.querySelector('.msg-status');
                if(tick) { tick.innerHTML = '✓✓'; tick.classList.add('read'); }
            }
        });
    });

    // === ЛОГИКА АВТОРИЗАЦИИ ===
    async function autoLogin() {
        try {
            const res = await fetch(`${API_BASE}/x-api/register-nick`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname: myName, password: myPass, chatId: myChatId })
            });
            const data = await res.json();
            if (data.success) { updateUI(); } else { openSettings(); }
        } catch (e) { openSettings(); }
    }

    async function saveProfile() {
        const name = document.getElementById('nameInput').value.trim();
        const pass = document.getElementById('passInput').value.trim();
        const remember = document.getElementById('rememberMe').checked;

        if (!name || !pass) return alert("Введите Ник и Пароль!");

        try {
            const res = await fetch(`${API_BASE}/x-api/register-nick`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname: name, password: pass, chatId: myChatId })
            });
            const data = await res.json();
            
            if (data.success) {
                myName = name; myPass = pass;
                localStorage.setItem('x_user_name', name);
                localStorage.setItem('x_user_avatar', myAvatar || '');
                if (remember) localStorage.setItem('x_user_pass', pass);
                else localStorage.removeItem('x_user_pass');
                
                setupOverlay.style.display = 'none';
                updateUI();
                socket.emit('join_room', currentActiveChat);
            } else { alert(data.message || "Ошибка входа!"); }
        } catch (e) { alert("Сервер недоступен!"); }
    }

    function updateUI() { 
        document.getElementById('headerTitle').innerText = myName;
        loadAllChats();
        loadHistory(currentActiveChat, true); 
    }

    // === ВКЛАДКИ ЧАТОВ (ДЛЯ ВСЕХ) ===
    async function loadAllChats() {
        try {
            const res = await fetch(`${API_BASE}/x-api/chat-list?myId=${myChatId}&myName=${myName}`);
            const chats = await res.json();
            adminPanel.innerHTML = '';
            
            chats.forEach(chat => {
                const container = document.createElement('div');
                container.className = 'chat-tab-container';
                const btn = document.createElement('div');
                btn.className = `chat-tab ${currentActiveChat === chat.id ? 'active' : ''}`;
                
                const dot = `<span class="status-dot ${chat.isOnline ? 'online' : 'offline'}"></span>`;
                const badge = `<span class="unread-badge ${chat.unreadCount > 0 ? 'show' : ''}">${chat.unreadCount}</span>`;
                
                btn.innerHTML = `${dot} ${chat.lastUser} ${badge}`;
                btn.onclick = () => { 
                    currentActiveChat = chat.id; 
                    chatBox.innerHTML = ''; 
                    loadHistory(chat.id, true); 
                    joinRoom(chat.id);
                    document.getElementById('headerTitle').innerText = "Чат: " + chat.lastUser;
                    loadAllChats(); 
                };

                const del = document.createElement('span');
                del.className = 'del-chat-btn';
                del.innerHTML = '🗑️';
                del.onclick = async (e) => {
                    e.stopPropagation();
                    if(confirm("Удалить этот чат?")) {
                        await fetch(`${API_BASE}/x-api/chat-room-delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: chat.id }) });
                        loadAllChats();
                    }
                };
                container.appendChild(btn); container.appendChild(del); adminPanel.appendChild(container);
            });
        } catch (e) {}
    }

    // === РАБОТА С СООБЩЕНИЯМИ ===
    function joinRoom(roomId) {
        if(socket.connected) {
            socket.emit('join_room', roomId);
            socket.emit('mark_seen', { roomId: roomId, userId: myName });
        }
    }

    async function loadHistory(chatId, force = false) {
        if (!chatId) return;
        try {
            const res = await fetch(`${API_BASE}/x-api/chat-history?roomId=${chatId}`);
            const messages = await res.json();
            if (force) chatBox.innerHTML = '';
            messages.forEach(m => addBubble(m, m.user === myName ? 'mine' : 'theirs'));
            scrollBottom();
        } catch (e) {}
    }

    function addBubble(m, type) {
        if (m.id && document.getElementById(m.id)) return;
        const div = document.createElement('div');
        div.className = `bubble ${type}`;
        if (m.id) div.id = m.id;
        
        div.onclick = () => { if(confirm("Удалить сообщение?")) deleteMsg(m.id, div); };
        
        let body = m.text;
        if (m.isAudio) body = `<audio src="${m.text}" controls style="width:200px"></audio>`;
        if (m.isImage) body = `<img src="${m.text}" class="msg-img" onclick="openFullImg('${m.text}', event)">`;
        
        let status = type === 'mine' ? `<span class="msg-status ${m.read?'read':''}">${m.read?'✓✓':'✓'}</span>` : '';

        div.innerHTML = `
            ${m.avatar ? `<div class="msg-avatar" style="background-image:url(${m.avatar})"></div>` : ''}
            <div>${body}</div>
            <div class="msg-footer"><span class="msg-time">${m.time || getMskTime()}</span>${status}</div>
        `;
        chatBox.appendChild(div);
        scrollBottom();
    }

    async function sendMsg() {
        const text = msgInput.value.trim();
        if (!text) return;
        msgInput.value = '';
        addBubble({ user: myName, text: text, avatar: myAvatar, time: getMskTime(), read: false }, 'mine');
        try {
            await fetch(`${API_BASE}/x-api/chat-send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: currentActiveChat, user: myName, avatar: myAvatar, text: text, myChatId: myChatId })
            });
            loadAllChats();
        } catch (e) {}
    }

    async function deleteMsg(msgId, el) {
        await fetch(`${API_BASE}/x-api/chat-delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: currentActiveChat, msgId }) });
        el.remove();
    }

    // === ПОИСК (ЛУПА) ===
    async function findUser() {
        const nick = prompt("Введите Ник собеседника:");
        if (!nick) return;
        try {
            const res = await fetch(`${API_BASE}/x-api/find-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ myId: myChatId, searchNick: nick })
            });
            const data = await res.json();
            if (data.success) {
                currentActiveChat = data.roomId;
                chatBox.innerHTML = '';
                loadHistory(currentActiveChat, true);
                joinRoom(currentActiveChat);
                document.getElementById('headerTitle').innerText = "Чат: " + nick;
                loadAllChats();
            } else { alert("Пользователь не найден"); }
        } catch (e) { alert("Ошибка поиска"); }
    }

    // === МЕДИА (ГОЛОС И ФОТО) ===
    async function toggleVoice() {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = async () => {
                    const blob = new Blob(audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                        await fetch(`${API_BASE}/x-api/chat-send`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ roomId: currentActiveChat, user: myName, avatar: myAvatar, text: reader.result, isAudio: true, myChatId: myChatId })
                        });
                        loadHistory(currentActiveChat);
                    };
                    reader.readAsDataURL(blob);
                };
                mediaRecorder.start();
                startTimer();
                isRecording = true; voiceBtn.classList.add('recording');
            } catch (err) { alert("Микрофон!"); }
        } else {
            mediaRecorder.stop();
            stopTimer();
            isRecording = false; voiceBtn.classList.remove('recording');
        }
    }

    function startTimer() {
        let sec = 0;
        recTimer.style.display = 'block';
        timerInterval = setInterval(() => {
            sec++;
            const m = Math.floor(sec/60).toString().padStart(2,'0');
            const s = (sec%60).toString().padStart(2,'0');
            recTimer.innerText = `${m}:${s}`;
        }, 1000);
    }
    function stopTimer() { clearInterval(timerInterval); recTimer.style.display = 'none'; recTimer.innerText = "00:00"; }

    async function sendImage(input) {
        if (!input.files[0]) return;
        const reader = new FileReader();
        reader.onload = async () => {
            await fetch(`${API_BASE}/x-api/chat-send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: currentActiveChat, user: myName, avatar: myAvatar, text: reader.result, isImage: true, myChatId: myChatId })
            });
            loadHistory(currentActiveChat);
        };
        reader.readAsDataURL(input.files[0]);
    }

    // === УТИЛИТЫ ===
    function openSettings() { setupOverlay.style.display = 'flex'; }
    function insertEmoji(e) { msgInput.value += e; msgInput.focus(); }
    function scrollBottom() { setTimeout(() => { chatBox.scrollTop = chatBox.scrollHeight; }, 50); }
    function getMskTime() { return new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false }); }
    function openFullImg(s, e) { e.stopPropagation(); document.getElementById('fullImgContent').src = s; document.getElementById('fullImgOverlay').style.display = 'flex'; }

    async function checkOnline() {
        try { const res = await fetch(`${API_BASE}/x-api/ping`); statusDot.className = res.ok ? 'status-dot online' : 'status-dot offline'; } catch { statusDot.className = 'status-dot offline'; }
    }
    setInterval(checkOnline, 10000);

    // === ПУШИ ===
    async function subscribeToPush() {
        if (!('serviceWorker' in navigator)) return;
        try {
            const reg = await navigator.serviceWorker.ready;
            const res = await fetch(`${API_BASE}/x-api/vapid-key`);
            const key = await res.text();
            const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
            await fetch(`${API_BASE}/x-api/save-subscription`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: myChatId, subscription: sub }) });
        } catch (e) {}
    }

    function sendTestPush() {
        Notification.requestPermission().then(p => { if (p === 'granted') { alert("Сверните браузер, пуш придет через 5 сек."); setTimeout(() => { navigator.serviceWorker.ready.then(reg => { reg.showNotification("X-CONECT", { body: "Проверка связи! 🚀", icon: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png" }); }); }, 5000); } });
    }

    document.getElementById('fileInput').onchange = (e) => {
        const reader = new FileReader();
        reader.onload = (ev) => { myAvatar = ev.target.result; document.getElementById('avatarPreview').style.backgroundImage = `url(${myAvatar})`; };
        reader.readAsDataURL(e.target.files[0]);
    };
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
</script>
</body>
</html>
