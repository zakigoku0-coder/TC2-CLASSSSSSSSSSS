// TC2 Groupe - Collaborative Hangout App
(function () {
  "use strict";

  // ========== STATE ==========
  let userName = "";
  let userId = "";
  let wallpaper = "";
  let chatMessages = [];
  let memories = [];
  let activeTool = "draw";
  let brushColor = "#ff00ff";
  let brushSize = 4;
  let isMuted = false;
  let isVideoOn = false;
  let isScreenSharing = false;
  let isDeafened = false;
  let screenStream = null;
  let voiceStream = null;
  let currentTrack = 0;
  let musicPlaying = false;
  let musicProgress = 0;
  let musicInterval = null;

  // ========== HELPERS ==========
  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function lsSet(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { }
  }

  function $(sel) { return document.querySelector(sel); }
  function $id(id) { return document.getElementById(id); }
  function ce(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }

  function loadJSPDF() {
    return new Promise((resolve) => {
      if (window.jspdf) { resolve(window.jspdf); return; }
      const s = ce("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js";
      s.onload = () => resolve(window.jspdf);
      document.head.appendChild(s);
    });
  }

  // ========== DOM SETUP ==========
  const root = document.documentElement;

  // ========== INIT ==========
  function init() {
    userName = lsGet("tc2_user", null);
    if (!userName) {
      showLogin();
    } else {
      userId = lsGet("tc2_user_id", crypto.randomUUID());
      lsSet("tc2_user_id", userId);
      showApp();
    }
    wallpaper = lsGet("tc2_wallpaper", "");
    chatMessages = lsGet("tc2_chat", []);
    memories = lsGet("tc2_memories", []);
    if (wallpaper) applyWallpaper(wallpaper);
    loadChat();
    renderMemories();
    renderMusicPlaylist();
    renderGamesGrid();
    initCanvas();
  }

  // ========== LOGIN ==========
  function showLogin() {
    $id("login-screen").style.display = "flex";
    $id("app-container").style.display = "none";
  }

  function showApp() {
    $id("login-screen").style.display = "none";
    $id("app-container").style.display = "flex";
    $id("user-display").textContent = userName;
  }

  // ========== JOIN CHANNEL ==========
  window.joinChannel = function (channel) {
    var names = { general: "General Chat", gaming: "Gaming Room", music: "Music Lounge", drawing: "Art Studio" };
    $id("channels-modal").style.display = "none";
    $id("game-area").style.display = "flex";
    $id("game-area").innerHTML = '<div style="text-align:center;padding:40px">' +
      '<h2>🎙️ ' + names[channel] + '</h2>' +
      '<p>You joined: ' + names[channel] + '</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap">' +
      '<button onclick="startVoice()" style="padding:12px 24px;border-radius:12px;background:linear-gradient(135deg,var(--cyan),var(--purple));border:none;color:var(--bg);font-weight:700;cursor:pointer;font-size:1rem">🎤 Join Call</button>' +
      '<button onclick="startScreen()" style="padding:12px 24px;border-radius:12px;background:linear-gradient(135deg,var(--green),#059669);border:none;color:var(--bg);font-weight:700;cursor:pointer;font-size:1rem">🖥️ Share Screen</button>' +
      '<button onclick="openChatInChannel()" style="padding:12px 24px;border-radius:12px;background:linear-gradient(135deg,var(--pink),var(--purple));border:none;color:var(--bg);font-weight:700;cursor:pointer;font-size:1rem">💬 Open Chat</button>' +
      '</div></div>';
    addSystemMessage("Joined " + names[channel] + "!");
  };
  window.startVoice = function () { $id("btn-call").click(); };
  window.startScreen = async function () {
    if (!isScreenSharing) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        isScreenSharing = true;
        $id("btn-screen").textContent = "⏹️";
        const video = $id("screen-share-video");
        video.srcObject = screenStream;
        video.style.display = "block";
        screenStream.getVideoTracks()[0].onended = function () { stopScreenShare(); };
      } catch (e) { console.log("Screen share cancelled"); }
    } else { stopScreenShare(); }
  };
  window.openChatInChannel = function () {
    const chatPanel = $id("chat-panel");
    chatPanel.style.display = chatPanel.style.display === "none" ? "flex" : "none";
  };

  $id("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const name = $id("login-name").value.trim();
    if (!name) return;
    userName = name;
    userId = crypto.randomUUID();
    lsSet("tc2_user", userName);
    lsSet("tc2_user_id", userId);
    showApp();
    addSystemMessage("Welcome to TC2 Groupe, " + userName + "!");
  });

  // ========== DRAWING CANVAS ==========
  let canvas, ctx, drawing = false, lastX = 0, lastY = 0;
  let canvasHistory = [];
  let historyIndex = -1;
  let selectionRect = null;
  let shapeStart = null;

  function initCanvas() {
    canvas = $id("draw-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    saveCanvasState();

    canvas.addEventListener("mousedown", onCanvasMouseDown);
    canvas.addEventListener("mousemove", onCanvasMouseMove);
    canvas.addEventListener("mouseup", onCanvasMouseUp);
    canvas.addEventListener("mouseleave", onCanvasMouseUp);

    // Touch support
    canvas.addEventListener("touchstart", function (e) {
      e.preventDefault();
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      onCanvasMouseDown({ offsetX: t.clientX - rect.left, offsetY: t.clientY - rect.top });
    });
    canvas.addEventListener("touchmove", function (e) {
      e.preventDefault();
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      onCanvasMouseMove({ offsetX: t.clientX - rect.left, offsetY: t.clientY - rect.top });
    });
    canvas.addEventListener("touchend", onCanvasMouseUp);
  }

  function resizeCanvas() {
    const container = $id("canvas-container");
    if (!container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    if (canvasHistory.length > 0 && historyIndex >= 0) {
      const img = new Image();
      img.onload = function () { ctx.drawImage(img, 0, 0); };
      img.src = canvasHistory[historyIndex];
    }
  }

  function saveCanvasState() {
    if (!canvas) return;
    historyIndex++;
    canvasHistory = canvasHistory.slice(0, historyIndex);
    canvasHistory.push(canvas.toDataURL());
    if (canvasHistory.length > 50) { canvasHistory.shift(); historyIndex--; }
  }

  function restoreCanvasState(index) {
    if (!canvas || index < 0 || index >= canvasHistory.length) return;
    historyIndex = index;
    const img = new Image();
    img.onload = function () { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
    img.src = canvasHistory[index];
  }

  function onCanvasMouseDown(e) {
    drawing = true;
    lastX = e.offsetX;
    lastY = e.offsetY;
    shapeStart = { x: e.offsetX, y: e.offsetY };
    if (activeTool === "text") {
      const txt = prompt("Enter text:");
      if (txt) {
        ctx.fillStyle = brushColor;
        ctx.font = brushSize * 3 + "px sans-serif";
        ctx.fillText(txt, e.offsetX, e.offsetY);
        saveCanvasState();
      }
      drawing = false;
    }
    if (activeTool === "draw" || activeTool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
    }
  }

  function onCanvasMouseMove(e) {
    if (!drawing) return;
    if (activeTool === "draw") {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
      lastX = e.offsetX;
      lastY = e.offsetY;
    } else if (activeTool === "eraser") {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = brushSize * 3;
      ctx.lineCap = "round";
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
      lastX = e.offsetX;
      lastY = e.offsetY;
    } else if (activeTool === "rect" || activeTool === "circle" || activeTool === "line") {
      // preview
      restoreCanvasState(historyIndex);
      drawShape(shapeStart.x, shapeStart.y, e.offsetX, e.offsetY, false);
    }
  }

  function onCanvasMouseUp(e) {
    if (!drawing) return;
    drawing = false;
    if (activeTool === "draw" || activeTool === "eraser") {
      ctx.closePath();
    }
    if (activeTool === "rect" || activeTool === "circle" || activeTool === "line" && shapeStart) {
      const ex = e.offsetX || lastX;
      const ey = e.offsetY || lastY;
      restoreCanvasState(historyIndex);
      drawShape(shapeStart.x, shapeStart.y, ex, ey, true);
    }
    if (activeTool !== "select") {
      saveCanvasState();
    }
    shapeStart = null;
  }

  function drawShape(x1, y1, x2, y2, final) {
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.fillStyle = "transparent";
    if (activeTool === "rect") {
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    } else if (activeTool === "circle") {
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      const cx = x1 + (x2 - x1) / 2;
      const cy = y1 + (y2 - y1) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (activeTool === "line") {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  // Tool buttons
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("tool-btn")) {
      document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      activeTool = e.target.dataset.tool;
    }
    if (e.target.classList.contains("color-swatch")) {
      document.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("active"));
      e.target.classList.add("active");
      brushColor = e.target.dataset.color;
    }
    if (e.target.classList.contains("brush-size-btn")) {
      document.querySelectorAll(".brush-size-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      brushSize = parseInt(e.target.dataset.size);
    }
    if (e.target.id === "btn-clear-canvas") {
      if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); saveCanvasState(); }
    }
    if (e.target.id === "btn-undo") {
      if (historyIndex > 0) restoreCanvasState(historyIndex - 1);
    }
    if (e.target.id === "btn-redo") {
      if (historyIndex < canvasHistory.length - 1) restoreCanvasState(historyIndex + 1);
    }
    if (e.target.id === "btn-export-pdf") {
      exportCanvasToPDF();
    }
  });

  async function exportCanvasToPDF() {
    const jspdf = await loadJSPDF();
    if (!jspdf) return;
    const { jsPDF } = jspdf;
    const doc = new jsPDF({ orientation: "landscape" });
    const img = canvas.toDataURL("image/png");
    doc.addImage(img, "PNG", 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
    doc.save("tc2-groupe-drawing.pdf");
  }

  // ========== TOPBAR BUTTONS ==========
  // Music → Spotify playlist
  $id("btn-music").addEventListener("click", function () {
    window.open("https://open.spotify.com/playlist/3BKaUWQ0QBuNkdQAbR6eez?si=35ed0dd829c3497a", "_blank");
  });

  // Draw → open drawing app in new window
  $id("btn-draw").addEventListener("click", function () {
    window.open(window.location.href, "_blank");
  });

  // Games → open game list modal
  $id("btn-games").addEventListener("click", function () {
    const m = $id("games-modal");
    m.style.display = m.style.display === "none" ? "flex" : "none";
    renderGamesGrid();
  });

  // Call → open channel selection modal
  $id("btn-call").addEventListener("click", function () {
    const m = $id("channels-modal");
    m.style.display = m.style.display === "none" ? "flex" : "none";
  });

  // Wallpaper → open modal
  $id("btn-wallpaper").addEventListener("click", function () {
    $id("wallpaper-modal").style.display = "flex";
  });

  // Memory Book → open modal
  $id("btn-memory-book").addEventListener("click", function () {
    $id("memory-modal").style.display = "flex";
  });

  // ========== VOICE CHANNELS (Discord-like) ==========
  let voiceState = {
    connected: false,
    channel: null,
    voiceStream: null,
    screenStream: null,
    isMuted: false,
    isVideoOn: false,
    isScreenSharing: false,
    isDeafened: false,
    users: []
  };

  const channels = {
    general: { name: "General Chat", icon: "💬", users: [] },
    gaming: { name: "Gaming Room", icon: "🎮", users: [] },
    music: { name: "Music Lounge", icon: "🎵", users: [] },
    drawing: { name: "Art Studio", icon: "✏️", users: [] }
  };

  $id("btn-call").addEventListener("click", function () {
    const m = $id("channels-modal");
    m.style.display = m.style.display === "none" ? "flex" : "none";
    renderChannelsList();
  });

  function renderChannelsList() {
    const grid = $id("channels-grid");
    if (!grid) return;
    grid.innerHTML = "";
    Object.entries(channels).forEach(([key, ch]) => {
      const card = ce("div", "channel-card");
      card.onclick = () => joinChannel(key);
      card.innerHTML = '<span class="channel-icon">' + ch.icon + '</span>' +
        '<span class="channel-name">' + ch.name + '</span>' +
        '<span class="channel-users">' + (ch.users.length || 0) + ' online</span>';
      grid.appendChild(card);
    });
  }

  window.joinChannel = async function (channelKey) {
    const ch = channels[channelKey];
    voiceState.connected = true;
    voiceState.channel = channelKey;
    
    ch.users = [
      { name: userName, id: userId, avatar: userName[0].toUpperCase(), self: true },
      { name: "Alex", id: "u2", avatar: "A" },
      { name: "Sam", id: "u3", avatar: "S" },
      { name: "Jordan", id: "u4", avatar: "J" }
    ];
    voiceState.users = ch.users;
    
    $id("channels-modal").style.display = "none";
    $id("voice-panel").style.display = "flex";
    updateVoicePanel();
    
    try {
      voiceState.voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      const localVideo = $id("local-video");
      if (localVideo) {
        localVideo.srcObject = voiceState.voiceStream;
        localVideo.style.display = "block";
      }
      addSystemMessage("Joined voice channel: " + ch.name);
    } catch (e) {
      console.log("Mic/camera access denied:", e);
      addSystemMessage("Joined " + ch.name + " (mic/camera not available)");
    }
  };

  function updateVoicePanel() {
    const panel = $id("voice-panel");
    const ch = channels[voiceState.channel];
    if (!ch) return;
    
    panel.innerHTML = '<h3>' + ch.icon + ' ' + ch.name + '</h3>' +
      '<div class="voice-users" id="voice-users"></div>' +
      '<div class="voice-controls">' +
        '<button id="btn-mute" class="voice-btn" title="Mute/Unmute">' + (voiceState.isMuted ? "🔇" : "🎤") + '</button>' +
        '<button id="btn-video" class="voice-btn" title="Camera On/Off">' + (voiceState.isVideoOn ? "📹" : "📷") + '</button>' +
        '<button id="btn-screen" class="voice-btn" title="Share Screen">' + (voiceState.isScreenSharing ? "⏹️" : "🖥️") + '</button>' +
        '<button id="btn-deafen" class="voice-btn" title="Deafen">' + (voiceState.isDeafened ? "🔈" : "🔊") + '</button>' +
        '<button id="btn-leave-call" class="voice-btn leave" title="Leave">📴 Leave</button>' +
      '</div>' +
      '<video id="local-video" autoplay muted playsinline style="display:none;max-width:160px;border-radius:8px;margin-top:10px;border:1px solid var(--border)"></video>' +
      '<video id="screen-share-video" autoplay style="display:none;max-width:100%;border-radius:8px;margin-top:10px;border:1px solid var(--border)"></video>';
    
    renderVoiceUsers();
    bindVoiceControls();
  }

  function renderVoiceUsers() {
    const container = $id("voice-users");
    if (!container) return;
    container.innerHTML = voiceState.users.map(u => 
      '<div class="voice-user' + (u.self ? ' self' : '') + '">' +
        '<span class="user-avatar">' + u.avatar + '</span>' +
        '<span class="user-name">' + u.name + (u.self ? ' (You)' : '') + '</span>' +
        '<span class="user-status speaking">' + (u.self && !voiceState.isMuted ? '🔊' : '🔇') + '</span>' +
      '</div>'
    ).join('');
  }

  function bindVoiceControls() {
    $id("btn-mute").onclick = async function() {
      voiceState.isMuted = !voiceState.isMuted;
      this.textContent = voiceState.isMuted ? "🔇" : "🎤";
      if (voiceState.voiceStream) {
        voiceState.voiceStream.getAudioTracks().forEach(t => t.enabled = !voiceState.isMuted);
      }
      renderVoiceUsers();
    };
    
    $id("btn-video").onclick = async function() {
      voiceState.isVideoOn = !voiceState.isVideoOn;
      this.textContent = voiceState.isVideoOn ? "📹" : "📷";
      if (voiceState.voiceStream) {
        voiceState.voiceStream.getVideoTracks().forEach(t => t.enabled = voiceState.isVideoOn);
      }
      const localVideo = $id("local-video");
      if (localVideo) localVideo.style.display = voiceState.isVideoOn ? "block" : "none";
    };
    
    $id("btn-screen").onclick = async function() {
      if (!voiceState.isScreenSharing) {
        try {
          voiceState.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          voiceState.isScreenSharing = true;
          this.textContent = "⏹️";
          const video = $id("screen-share-video");
          video.srcObject = voiceState.screenStream;
          video.style.display = "block";
          voiceState.screenStream.getVideoTracks()[0].onended = stopScreenShare;
        } catch (e) { console.log("Screen share cancelled"); }
      } else {
        stopScreenShare();
      }
    };
    
    $id("btn-deafen").onclick = function() {
      voiceState.isDeafened = !voiceState.isDeafened;
      this.textContent = voiceState.isDeafened ? "🔈" : "🔊";
    };
    
    $id("btn-leave-call").onclick = function() {
      leaveChannel();
    };
  }

  function stopScreenShare() {
    if (voiceState.screenStream) {
      voiceState.screenStream.getTracks().forEach(t => t.stop());
      voiceState.screenStream = null;
    }
    voiceState.isScreenSharing = false;
    const btn = $id("btn-screen");
    if (btn) btn.textContent = "🖥️";
    const video = $id("screen-share-video");
    if (video) { video.srcObject = null; video.style.display = "none"; }
  }

  function leaveChannel() {
    if (voiceState.channel && channels[voiceState.channel]) {
      channels[voiceState.channel].users = channels[voiceState.channel].users.filter(u => u.id !== userId);
    }
    stopScreenShare();
    if (voiceState.voiceStream) {
      voiceState.voiceStream.getTracks().forEach(t => t.stop());
      voiceState.voiceStream = null;
    }
    voiceState.connected = false;
    voiceState.channel = null;
    voiceState.isMuted = false;
    voiceState.isVideoOn = false;
    voiceState.isDeafened = false;
    $id("voice-panel").style.display = "none";
    addSystemMessage("Left voice channel");
  }

  // ========== CHAT ==========
  function loadChat() {
    const container = $id("chat-messages");
    container.innerHTML = "";
    chatMessages.forEach(m => appendChatMessage(container, m, false));
    container.scrollTop = container.scrollHeight;
  }

  function addSystemMessage(text) {
    const msg = { id: crypto.randomUUID(), type: "system", text: text, time: Date.now() };
    chatMessages.push(msg);
    lsSet("tc2_chat", chatMessages);
    const container = $id("chat-messages");
    appendChatMessage(container, msg, true);
    container.scrollTop = container.scrollHeight;
  }

  function addChatMessage(text, emoji) {
    const msg = {
      id: crypto.randomUUID(), type: "user", user: userName, userId: userId,
      text: text, emoji: emoji || "", time: Date.now()
    };
    chatMessages.push(msg);
    lsSet("tc2_chat", chatMessages);
    const container = $id("chat-messages");
    appendChatMessage(container, msg, true);
    container.scrollTop = container.scrollHeight;
  }

  function appendChatMessage(container, msg, animate) {
    const div = ce("div", "chat-msg");
    if (msg.type === "system") {
      div.classList.add("system");
      div.textContent = msg.text;
    } else {
      const isMe = msg.userId === userId;
      if (isMe) div.classList.add("me");
      const time = new Date(msg.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      div.innerHTML = '<span class="msg-user">' + esc(msg.user) + '</span>' +
        '<span class="msg-text">' + esc(msg.text) + (msg.emoji ? ' ' + msg.emoji : '') + '</span>' +
        '<span class="msg-time">' + time + '</span>';
    }
    if (animate) div.classList.add("new-msg");
    container.appendChild(div);
  }

  function esc(s) { const d = ce("div"); d.textContent = s; return d.innerHTML; }

  $id("chat-send").addEventListener("click", function () {
    const input = $id("chat-input");
    const text = input.value.trim();
    if (!text) return;
    addChatMessage(text);
    input.value = "";
  });

  $id("chat-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      $id("chat-send").click();
    }
  });

  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("emoji-btn")) {
      const input = $id("chat-input");
      input.value += e.target.textContent;
      input.focus();
    }
  });

  // ========== MUSIC PLAYER (Real Audio) ==========
  let audioContext = null;
  let currentOscillator = null;
  let currentGainNode = null;
  let musicStartTime = 0;
  let musicPausedAt = 0;

  // Generate musical notes frequencies (A4 = 440Hz)
  const noteFrequencies = {
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
    'G4': 392.00, 'A4': 440.00, 'B4': 493.88, 'C5': 523.25
  };

  // Simple melodies for each track (array of {note, duration})
  const melodies = [
    // Blinding Lights style - synthwave
    [
      {note: 'E4', dur: 0.3}, {note: 'D4', dur: 0.3}, {note: 'C4', dur: 0.3}, {note: 'D4', dur: 0.3},
      {note: 'E4', dur: 0.3}, {note: 'E4', dur: 0.3}, {note: 'E4', dur: 0.6},
      {note: 'D4', dur: 0.3}, {note: 'D4', dur: 0.3}, {note: 'D4', dur: 0.6},
      {note: 'E4', dur: 0.3}, {note: 'G4', dur: 0.3}, {note: 'G4', dur: 0.6}
    ],
    // Levitating style - disco
    [
      {note: 'A4', dur: 0.25}, {note: 'A4', dur: 0.25}, {note: 'G4', dur: 0.25}, {note: 'E4', dur: 0.25},
      {note: 'D4', dur: 0.25}, {note: 'E4', dur: 0.25}, {note: 'G4', dur: 0.25}, {note: 'A4', dur: 0.5},
      {note: 'G4', dur: 0.25}, {note: 'E4', dur: 0.25}, {note: 'D4', dur: 0.5}
    ],
    // Save Your Tears
    [
      {note: 'C5', dur: 0.4}, {note: 'A4', dur: 0.4}, {note: 'F4', dur: 0.4}, {note: 'G4', dur: 0.4},
      {note: 'E4', dur: 0.4}, {note: 'F4', dur: 0.4}, {note: 'G4', dur: 0.8}
    ],
    // Stay
    [
      {note: 'E4', dur: 0.3}, {note: 'E4', dur: 0.3}, {note: 'F4', dur: 0.3}, {note: 'G4', dur: 0.3},
      {note: 'E4', dur: 0.3}, {note: 'D4', dur: 0.3}, {note: 'C4', dur: 0.6}
    ],
    // Peaches
    [
      {note: 'G4', dur: 0.3}, {note: 'E4', dur: 0.3}, {note: 'D4', dur: 0.3}, {note: 'C4', dur: 0.3},
      {note: 'D4', dur: 0.3}, {note: 'E4', dur: 0.3}, {note: 'G4', dur: 0.6}
    ],
    // Montero
    [
      {note: 'A4', dur: 0.25}, {note: 'G4', dur: 0.25}, {note: 'F4', dur: 0.25}, {note: 'E4', dur: 0.25},
      {note: 'F4', dur: 0.25}, {note: 'G4', dur: 0.25}, {note: 'A4', dur: 0.5}
    ]
  ];

  const playlist = [
    { title: "Blinding Lights", artist: "The Weeknd", duration: "3:20", bpm: 171 },
    { title: "Levitating", artist: "Dua Lipa", duration: "3:23", bpm: 103 },
    { title: "Save Your Tears", artist: "The Weeknd", duration: "3:35", bpm: 103 },
    { title: "Stay", artist: "The Kid LAROI & Justin Bieber", duration: "2:21", bpm: 170 },
    { title: "Peaches", artist: "Justin Bieber ft. Daniel Caesar", duration: "3:18", bpm: 90 },
    { title: "Montero", artist: "Lil Nas X", duration: "2:17", bpm: 138 }
  ];

  function ensureAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  function playMelody(melody, bpm) {
    ensureAudioContext();
    stopMelody();
    
    const beatDuration = 60 / bpm; // seconds per beat
    let currentTime = audioContext.currentTime;
    
    currentGainNode = audioContext.createGain();
    currentGainNode.gain.value = 0.15;
    currentGainNode.connect(audioContext.destination);
    
    melody.forEach(function(noteInfo) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.value = noteFrequencies[noteInfo.note] || 440;
      
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.15, currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, currentTime + noteInfo.dur * beatDuration * 0.9);
      
      osc.connect(gain);
      gain.connect(currentGainNode);
      
      osc.start(currentTime);
      osc.stop(currentTime + noteInfo.dur * beatDuration);
      
      currentTime += noteInfo.dur * beatDuration;
    });
    
    // Loop the melody
    const totalDuration = melody.reduce((sum, n) => sum + n.dur * beatDuration, 0);
    setTimeout(function() { if (musicPlaying) playMelody(melody, bpm); }, totalDuration * 1000);
  }

  function stopMelody() {
    if (currentGainNode) {
      currentGainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
      setTimeout(() => {
        if (currentGainNode) {
          currentGainNode.disconnect();
          currentGainNode = null;
        }
      }, 200);
    }
  }

  function renderMusicPlaylist() {
    const list = $id("music-playlist");
    if (!list) return;
    list.innerHTML = "";
    playlist.forEach(function (track, i) {
      const item = ce("div", "playlist-item" + (i === currentTrack ? " active" : ""));
      item.innerHTML = '<span class="track-num">' + (i + 1) + '</span>' +
        '<span class="track-info"><strong>' + esc(track.title) + '</strong><small>' + esc(track.artist) + '</small></span>' +
        '<span class="track-dur">' + track.duration + '</span>';
      item.addEventListener("click", function () { playTrack(i); });
      list.appendChild(item);
    });
  }

  function playTrack(index) {
    if (musicPlaying && index === currentTrack) return;
    currentTrack = index;
    musicPlaying = true;
    musicProgress = 0;
    musicPausedAt = 0;
    $id("music-now-title").textContent = playlist[currentTrack].title;
    $id("music-now-artist").textContent = playlist[currentTrack].artist;
    $id("btn-music-play").textContent = "⏸️";
    renderMusicPlaylist();
    playMelody(melodies[currentTrack], playlist[currentTrack].bpm);
    startMusicProgress();
  }

  function startMusicProgress() {
    if (musicInterval) clearInterval(musicInterval);
    const parts = playlist[currentTrack].duration.split(":");
    const totalSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    musicInterval = setInterval(function () {
      if (!musicPlaying) return;
      musicProgress += 1;
      if (musicProgress >= totalSec) { nextTrack(); return; }
      const pct = (musicProgress / totalSec) * 100;
      $id("music-progress-bar").style.width = pct + "%";
      const cur = Math.floor(musicProgress);
      const m = Math.floor(cur / 60);
      const s = cur % 60;
      $id("music-time-current").textContent = m + ":" + (s < 10 ? "0" : "") + s;
      $id("music-time-total").textContent = playlist[currentTrack].duration;
    }, 1000);
  }

  function nextTrack() {
    stopMelody();
    playTrack((currentTrack + 1) % playlist.length);
  }

  function prevTrack() {
    stopMelody();
    playTrack((currentTrack - 1 + playlist.length) % playlist.length);
  }

  document.addEventListener("click", function (e) {
    if (e.target.id === "btn-music-play") {
      if (!musicPlaying) {
        musicPlaying = true;
        $id("btn-music-play").textContent = "⏸️";
        if (musicPausedAt > 0) {
          // Resume from paused position (simplified - restart melody)
          playMelody(melodies[currentTrack], playlist[currentTrack].bpm);
        }
        startMusicProgress();
      } else {
        musicPlaying = false;
        musicPausedAt = musicProgress;
        $id("btn-music-play").textContent = "▶️";
        stopMelody();
        if (musicInterval) clearInterval(musicInterval);
      }
    }
    if (e.target.id === "btn-music-next") { nextTrack(); }
    if (e.target.id === "btn-music-prev") { prevTrack(); }
  });

  // ========== GAMES HUB ==========
  const games = [
    { id: "tictactoe", name: "Tic Tac Toe", icon: "❌" },
    { id: "rps", name: "Rock Paper Scissors", icon: "✊" },
    { id: "memory", name: "Memory Match", icon: "🧠" },
    { id: "snake", name: "Snake", icon: "🐍" },
    { id: "trivia", name: "Trivia Quiz", icon: "❓" },
    { id: "connect4", name: "Connect 4", icon: "🔴" },
    { id: "whack", name: "Whack-a-Mole", icon: "🔨" },
    { id: "reaction", name: "Reaction Time", icon: "⚡" },
    { id: "truthdare", name: "Truth or Dare", icon: "🎲" }
  ];

  let currentGame = null;
  let gameInstances = {};

  function renderGamesGrid() {
    const grid = $id("games-grid");
    if (!grid) return;
    grid.innerHTML = "";
    games.forEach(function (g) {
      const card = ce("div", "game-card");
      card.dataset.game = g.id;
      card.innerHTML = '<span class="game-icon">' + g.icon + '</span><span class="game-name">' + g.name + '</span>';
      card.addEventListener("click", function () { openGame(g.id); });
      grid.appendChild(card);
    });
    // Add external game links row
    const extRow = ce("div", "ext-games-row");
    extRow.innerHTML = '<h3>🎯 Online Games</h3>';
    var extGames = [
      { name: "2048", url: "https://play2048.co" },
      { name: "Slither.io", url: "https://slither.io" },
      { name: "Agar.io", url: "https://agar.io" },
      { name: "Hex.io", url: "https://hex.io" },
      { name: "Krunker", url: "https://krunker.io" },
      { name: "Shell Shockers", url: "https://shellshock.io" }
    ];
    extGames.forEach(function (eg) {
      var link = ce("a", "ext-game-link", eg.name);
      link.href = eg.url;
      link.target = "_blank";
      link.style.cursor = "pointer";
      extRow.appendChild(link);
    });
    grid.appendChild(extRow);
  }

  function openGame(id) {
    currentGame = id;
    $id("games-grid").style.display = "none";
    $id("game-area").style.display = "flex";
    $id("game-area").innerHTML = "";
    if (gameInstances[id]) { gameInstances[id](); return; }
    switch (id) {
      case "tictactoe": gameTicTacToe(); break;
      case "rps": gameRPS(); break;
      case "memory": gameMemory(); break;
      case "snake": gameSnake(); break;
      case "trivia": gameTrivia(); break;
      case "connect4": gameConnect4(); break;
      case "whack": gameWhack(); break;
      case "reaction": gameReaction(); break;
      case "truthdare": gameTruthOrDare(); break;
    }
  }

  function backToGames() {
    currentGame = null;
    $id("game-area").style.display = "none";
    $id("games-grid").style.display = "grid";
    $id("game-area").innerHTML = "";
    document.removeEventListener("keydown", snakeKeyHandler);
  }

  function gameBackBtn() {
    const btn = ce("button", "game-back-btn", "← Back to Games");
    btn.addEventListener("click", backToGames);
    return btn;
  }

  // ===== TIC TAC TOE =====
  function gameTicTacToe() {
    const area = $id("game-area");
    let board = Array(9).fill("");
    let playerTurn = true;
    let score = { x: 0, o: 0 };
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

    const html = '<div class="tictactoe"><h2>Tic Tac Toe</h2>' +
      '<div class="ttt-score">You (X): <span id="ttt-x">0</span> | Bot (O): <span id="ttt-o">0</span></div>' +
      '<div class="ttt-board" id="ttt-board"></div>' +
      '<div class="ttt-status" id="ttt-status">Your turn (X)</div>' +
      '<button id="ttt-reset" class="game-btn">New Game</button></div>';
    area.innerHTML = html;
    area.prepend(gameBackBtn());

    const boardEl = $id("ttt-board");
    for (let i = 0; i < 9; i++) {
      const cell = ce("div", "ttt-cell");
      cell.dataset.idx = i;
      cell.addEventListener("click", function () { playerClick(i); });
      boardEl.appendChild(cell);
    }

    function playerClick(i) {
      if (!playerTurn || board[i]) return;
      makeMove(i, "X");
      if (checkWin("X")) { score.x++; updateScore(); $id("ttt-status").textContent = "You win!"; return; }
      if (board.every(c => c)) { $id("ttt-status").textContent = "Draw!"; return; }
      playerTurn = false;
      $id("ttt-status").textContent = "Bot's turn...";
      setTimeout(botMove, 500);
    }

    function botMove() {
      // Simple AI: win > block > center > random
      let move = findWinningMove("O");
      if (move === -1) move = findWinningMove("X");
      if (move === -1 && !board[4]) move = 4;
      if (move === -1) { const empty = board.map((v, i) => v === "" ? i : -1).filter(i => i >= 0); move = empty[Math.floor(Math.random() * empty.length)]; }
      makeMove(move, "O");
      if (checkWin("O")) { score.o++; updateScore(); $id("ttt-status").textContent = "Bot wins!"; playerTurn = false; return; }
      if (board.every(c => c)) { $id("ttt-status").textContent = "Draw!"; return; }
      playerTurn = true;
      $id("ttt-status").textContent = "Your turn (X)";
    }

    function findWinningMove(mark) {
      for (const w of wins) {
        const vals = w.map(i => board[i]);
        const counts = vals.filter(v => v === mark).length;
        const empty = w.find(i => board[i] === "");
        if (counts === 2 && empty !== undefined) return empty;
      }
      return -1;
    }

    function makeMove(i, mark) {
      board[i] = mark;
      boardEl.children[i].textContent = mark;
      boardEl.children[i].classList.add("taken");
    }

    function checkWin(mark) {
      return wins.some(w => w.every(i => board[i] === mark));
    }

    function updateScore() {
      $id("ttt-x").textContent = score.x;
      $id("ttt-o").textContent = score.o;
    }

    $id("ttt-reset").addEventListener("click", function () {
      board = Array(9).fill("");
      playerTurn = true;
      boardEl.querySelectorAll(".ttt-cell").forEach(c => { c.textContent = ""; c.classList.remove("taken"); });
      $id("ttt-status").textContent = "Your turn (X)";
    });
  }

  // ===== ROCK PAPER SCISSORS =====
  function gameRPS() {
    const area = $id("game-area");
    let score = { w: 0, l: 0, d: 0 };
    const choices = ["✊", "✋", "✌️"];
    const names = { "✊": "Rock", "✋": "Paper", "✌️": "Scissors" };

    area.innerHTML = '<div class="rps-game"><h2>Rock Paper Scissors</h2>' +
      '<div class="rps-score">W: <span id="rps-w">0</span> | L: <span id="rps-l">0</span> | D: <span id="rps-d">0</span></div>' +
      '<div class="rps-display"><span id="rps-player">?</span> vs <span id="rps-bot">?</span></div>' +
      '<div class="rps-result" id="rps-result"></div>' +
      '<div class="rps-buttons"><button class="rps-btn" data-choice="✊">✊ Rock</button>' +
      '<button class="rps-btn" data-choice="✋">✋ Paper</button>' +
      '<button class="rps-btn" data-choice="✌️">✌️ Scissors</button></div></div>';
    area.prepend(gameBackBtn());

    area.addEventListener("click", function (e) {
      const btn = e.target.closest(".rps-btn");
      if (!btn) return;
      const player = btn.dataset.choice;
      const bot = choices[Math.floor(Math.random() * 3)];
      $id("rps-player").textContent = player;
      $id("rps-bot").textContent = bot;
      let result = "";
      if (player === bot) { score.d++; result = "Draw!"; }
      else if ((player === "✊" && bot === "✌️") || (player === "✋" && bot === "✊") || (player === "✌️" && bot === "✋")) { score.w++; result = "You win!"; }
      else { score.l++; result = "Bot wins!"; }
      $id("rps-result").textContent = result + " (" + names[player] + " vs " + names[bot] + ")";
      $id("rps-w").textContent = score.w;
      $id("rps-l").textContent = score.l;
      $id("rps-d").textContent = score.d;
    });
  }

  // ===== MEMORY MATCH =====
  function gameMemory() {
    const area = $id("game-area");
    const emojis = ["🐱", "🐶", "🦊", "🐻", "🐼", "🐨", "🦁", "🐸"];
    let cards = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
    let flipped = [];
    let matched = 0;
    let moves = 0;
    let locked = false;

    area.innerHTML = '<div class="memory-game"><h2>Memory Match</h2>' +
      '<div class="memory-info">Moves: <span id="mem-moves">0</span> | Pairs: <span id="mem-pairs">0</span>/8</div>' +
      '<div class="memory-grid" id="mem-grid"></div></div>';
    area.prepend(gameBackBtn());

    const grid = $id("mem-grid");
    cards.forEach(function (emoji, i) {
      const card = ce("div", "mem-card");
      card.dataset.idx = i;
      card.innerHTML = '<div class="mem-front">?</div><div class="mem-back">' + emoji + '</div>';
      card.addEventListener("click", function () { flipCard(i); });
      grid.appendChild(card);
    });

    function flipCard(i) {
      if (locked) return;
      const card = grid.children[i];
      if (card.classList.contains("flipped") || card.classList.contains("matched")) return;
      card.classList.add("flipped");
      flipped.push(i);
      if (flipped.length === 2) {
        moves++;
        $id("mem-moves").textContent = moves;
        locked = true;
        const [a, b] = flipped;
        if (cards[a] === cards[b]) {
          grid.children[a].classList.add("matched");
          grid.children[b].classList.add("matched");
          matched++;
          $id("mem-pairs").textContent = matched;
          flipped = [];
          locked = false;
          if (matched === 8) setTimeout(() => alert("You won in " + moves + " moves!"), 300);
        } else {
          setTimeout(function () {
            grid.children[a].classList.remove("flipped");
            grid.children[b].classList.remove("flipped");
            flipped = [];
            locked = false;
          }, 800);
        }
      }
    }
  }

  // ===== SNAKE =====
  let snakeKeyHandler = null;
  function gameSnake() {
    const area = $id("game-area");
    const COLS = 20, ROWS = 20, CELL = 20;
    let snake, dir, food, score, running, interval;

    area.innerHTML = '<div class="snake-game"><h2>Snake</h2>' +
      '<div class="snake-info">Score: <span id="snake-score">0</span></div>' +
      '<canvas id="snake-canvas" width="' + (COLS * CELL) + '" height="' + (ROWS * CELL) + '"></canvas>' +
      '<div class="snake-controls">' +
      '<button id="snake-up" class="game-btn">↑</button>' +
      '<div><button id="snake-left" class="game-btn">←</button>' +
      '<button id="snake-down" class="game-btn">↓</button>' +
      '<button id="snake-right" class="game-btn">→</button></div></div>' +
      '<button id="snake-start" class="game-btn">Start / Restart</button></div>';
    area.prepend(gameBackBtn());

    const sc = $id("snake-canvas");
    const sctx = sc.getContext("2d");

    function init() {
      snake = [{ x: 10, y: 10 }];
      dir = { x: 1, y: 0 };
      score = 0;
      $id("snake-score").textContent = "0";
      placeFood();
      running = true;
      if (interval) clearInterval(interval);
      interval = setInterval(tick, 120);
    }

    function placeFood() {
      do { food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; }
      while (snake.some(s => s.x === food.x && s.y === food.y));
    }

    function tick() {
      if (!running) return;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS || snake.some(s => s.x === head.x && s.y === head.y)) {
        running = false;
        clearInterval(interval);
        alert("Game Over! Score: " + score);
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) { score++; $id("snake-score").textContent = score; placeFood(); }
      else snake.pop();
      draw();
    }

    function draw() {
      sctx.fillStyle = "#1a1a2e";
      sctx.fillRect(0, 0, sc.width, sc.height);
      snake.forEach(function (s, i) {
        sctx.fillStyle = i === 0 ? "#00ff88" : "#00cc66";
        sctx.fillRect(s.x * CELL, s.y * CELL, CELL - 1, CELL - 1);
      });
      sctx.fillStyle = "#ff0055";
      sctx.beginPath();
      sctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 1, 0, Math.PI * 2);
      sctx.fill();
    }

    function setDir(x, y) {
      if (dir.x === -x && dir.y === -y) return;
      dir = { x: x, y: y };
    }

    document.addEventListener("click", function (e) {
      if (e.target.id === "snake-up") setDir(0, -1);
      if (e.target.id === "snake-down") setDir(0, 1);
      if (e.target.id === "snake-left") setDir(-1, 0);
      if (e.target.id === "snake-right") setDir(1, 0);
      if (e.target.id === "snake-start") init();
    });

    if (snakeKeyHandler) document.removeEventListener("keydown", snakeKeyHandler);
    snakeKeyHandler = function (e) {
      if (currentGame !== "snake") return;
      if (e.key === "ArrowUp") { e.preventDefault(); setDir(0, -1); }
      if (e.key === "ArrowDown") { e.preventDefault(); setDir(0, 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); setDir(-1, 0); }
      if (e.key === "ArrowRight") { e.preventDefault(); setDir(1, 0); }
    };
    document.addEventListener("keydown", snakeKeyHandler);

    init();
  }

  // ===== TRIVIA QUIZ =====
  function gameTrivia() {
    const area = $id("game-area");
    const questions = [
      { q: "What planet is known as the Red Planet?", a: ["Mars", "Venus", "Jupiter", "Saturn"], c: 0 },
      { q: "How many legs does a spider have?", a: ["6", "8", "10", "12"], c: 1 },
      { q: "What is the largest ocean on Earth?", a: ["Atlantic", "Indian", "Pacific", "Arctic"], c: 2 },
      { q: "Which element has the symbol 'O'?", a: ["Gold", "Oxygen", "Osmium", "Oganesson"], c: 1 },
      { q: "What year did the Titanic sink?", a: ["1905", "1912", "1920", "1898"], c: 1 },
      { q: "Who painted the Mona Lisa?", a: ["Picasso", "Da Vinci", "Van Gogh", "Monet"], c: 1 }
    ];
    let current = 0, score = 0, answered = false;

    area.innerHTML = '<div class="trivia-game"><h2>Trivia Quiz</h2>' +
      '<div class="trivia-progress" id="trivia-progress"></div>' +
      '<div class="trivia-question" id="trivia-q"></div>' +
      '<div class="trivia-options" id="trivia-opts"></div>' +
      '<div class="trivia-result" id="trivia-result"></div>' +
      '<button id="trivia-next" class="game-btn" style="display:none">Next</button></div>';
    area.prepend(gameBackBtn());

    function showQuestion() {
      answered = false;
      $id("trivia-progress").textContent = "Question " + (current + 1) + " of " + questions.length;
      $id("trivia-q").textContent = questions[current].q;
      $id("trivia-result").textContent = "";
      $id("trivia-next").style.display = "none";
      const opts = $id("trivia-opts");
      opts.innerHTML = "";
      questions[current].a.forEach(function (a, i) {
        const btn = ce("button", "trivia-opt", a);
        btn.dataset.idx = i;
        btn.addEventListener("click", function () { selectAnswer(i); });
        opts.appendChild(btn);
      });
    }

    function selectAnswer(idx) {
      if (answered) return;
      answered = true;
      const correct = questions[current].c;
      const btns = $id("trivia-opts").children;
      btns[correct].classList.add("correct");
      if (idx === correct) {
        score++;
        $id("trivia-result").textContent = "Correct!";
      } else {
        btns[idx].classList.add("wrong");
        $id("trivia-result").textContent = "Wrong! Answer: " + questions[current].a[correct];
      }
      $id("trivia-next").style.display = "inline-block";
    }

    $id("trivia-next").addEventListener("click", function () {
      current++;
      if (current >= questions.length) {
        alert("Quiz finished! Score: " + score + "/" + questions.length);
        current = 0; score = 0;
      }
      showQuestion();
    });

    showQuestion();
  }

  // ===== CONNECT 4 =====
  function gameConnect4() {
    const area = $id("game-area");
    const ROWS = 6, COLS = 7;
    let board, currentPlayer, gameOver, score = { r: 0, y: 0 };

    area.innerHTML = '<div class="connect4-game"><h2>Connect 4</h2>' +
      '<div class="c4-score">Red: <span id="c4-r">0</span> | Yellow: <span id="c4-y">0</span></div>' +
      '<div class="c4-status" id="c4-status">Red\'s turn</div>' +
      '<div class="c4-board" id="c4-board"></div>' +
      '<button id="c4-reset" class="game-btn">New Game</button></div>';
    area.prepend(gameBackBtn());

    function init() {
      board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      currentPlayer = 1;
      gameOver = false;
      $id("c4-status").textContent = "Red's turn";
      renderBoard();
    }

    function renderBoard() {
      const boardEl = $id("c4-board");
      boardEl.innerHTML = "";
      // Column buttons
      for (let c = 0; c < COLS; c++) {
        const colBtn = ce("div", "c4-col-btn");
        colBtn.dataset.col = c;
        colBtn.addEventListener("click", function () { dropDisc(c); });
        boardEl.appendChild(colBtn);
      }
      // Grid
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = ce("div", "c4-cell");
          cell.dataset.row = r;
          cell.dataset.col = c;
          if (board[r][c] === 1) cell.classList.add("red");
          else if (board[r][c] === 2) cell.classList.add("yellow");
          boardEl.appendChild(cell);
        }
      }
    }

    function dropDisc(col) {
      if (gameOver) return;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === 0) {
          board[r][col] = currentPlayer;
          if (checkWin(r, col)) {
            gameOver = true;
            const name = currentPlayer === 1 ? "Red" : "Yellow";
            if (currentPlayer === 1) score.r++; else score.y++;
            $id("c4-r").textContent = score.r;
            $id("c4-y").textContent = score.y;
            $id("c4-status").textContent = name + " wins!";
          } else if (board.flat().every(c => c !== 0)) {
            gameOver = true;
            $id("c4-status").textContent = "Draw!";
          } else {
            currentPlayer = currentPlayer === 1 ? 2 : 1;
            $id("c4-status").textContent = (currentPlayer === 1 ? "Red" : "Yellow") + "'s turn";
          }
          renderBoard();
          return;
        }
      }
    }

    function checkWin(r, c) {
      const p = board[r][c];
      const dirs = [[0,1],[1,0],[1,1],[1,-1]];
      for (const [dr, dc] of dirs) {
        let count = 1;
        for (let d = 1; d < 4; d++) {
          const nr = r + dr * d, nc = c + dc * d;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === p) count++; else break;
        }
        for (let d = 1; d < 4; d++) {
          const nr = r - dr * d, nc = c - dc * d;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === p) count++; else break;
        }
        if (count >= 4) return true;
      }
      return false;
    }

    $id("c4-reset").addEventListener("click", init);
    init();
  }

  // ===== WHACK A MOLE =====
  function gameWhack() {
    const area = $id("game-area");
    let score = 0, timeLeft = 30, moleTimer, countdownTimer, activeMole = -1;

    area.innerHTML = '<div class="whack-game"><h2>Whack-a-Mole</h2>' +
      '<div class="whack-info">Score: <span id="whack-score">0</span> | Time: <span id="whack-time">30</span>s</div>' +
      '<div class="whack-grid" id="whack-grid"></div>' +
      '<button id="whack-start" class="game-btn">Start Game</button></div>';
    area.prepend(gameBackBtn());

    const grid = $id("whack-grid");
    for (let i = 0; i < 9; i++) {
      const cell = ce("div", "whack-cell");
      cell.dataset.idx = i;
      cell.innerHTML = '<span class="mole">🐹</span>';
      cell.addEventListener("click", function () { whack(i); });
      grid.appendChild(cell);
    }

    function startGame() {
      score = 0; timeLeft = 30;
      $id("whack-score").textContent = "0";
      $id("whack-time").textContent = "30";
      clearInterval(moleTimer);
      clearInterval(countdownTimer);
      moleTimer = setInterval(showMole, 800);
      countdownTimer = setInterval(function () {
        timeLeft--;
        $id("whack-time").textContent = timeLeft;
        if (timeLeft <= 0) {
          clearInterval(moleTimer);
          clearInterval(countdownTimer);
          hideMole();
          alert("Time's up! Score: " + score);
        }
      }, 1000);
    }

    function showMole() {
      hideMole();
      activeMole = Math.floor(Math.random() * 9);
      grid.children[activeMole].classList.add("up");
    }

    function hideMole() {
      grid.querySelectorAll(".whack-cell").forEach(c => c.classList.remove("up"));
      activeMole = -1;
    }

    function whack(i) {
      if (i === activeMole) {
        score++;
        $id("whack-score").textContent = score;
        hideMole();
      }
    }

    $id("whack-start").addEventListener("click", startGame);
  }

  // ===== REACTION TIME =====
  function gameReaction() {
    const area = $id("game-area");
    let state = "waiting", startTime = 0, results = [];

    area.innerHTML = '<div class="reaction-game"><h2>Reaction Time</h2>' +
      '<div class="reaction-box" id="reaction-box">Click to Start</div>' +
      '<div class="reaction-results" id="reaction-results"></div></div>';
    area.prepend(gameBackBtn());

    const box = $id("reaction-box");

    box.addEventListener("click", function () {
      if (state === "waiting") {
        state = "ready";
        box.style.background = "#ff0055";
        box.textContent = "Wait for green...";
        const delay = 1000 + Math.random() * 4000;
        setTimeout(function () {
          if (state === "ready") {
            state = "go";
            startTime = performance.now();
            box.style.background = "#00ff88";
            box.textContent = "CLICK NOW!";
          }
        }, delay);
      } else if (state === "ready") {
        state = "waiting";
        box.style.background = "#333";
        box.textContent = "Too early! Click to try again.";
      } else if (state === "go") {
        const ms = Math.round(performance.now() - startTime);
        results.push(ms);
        state = "waiting";
        box.style.background = "#333";
        box.textContent = ms + "ms - Click to try again";
        const list = $id("reaction-results");
        list.innerHTML = "Best: " + Math.min(...results) + "ms | Avg: " + Math.round(results.reduce((a, b) => a + b, 0) / results.length) + "ms | Attempts: " + results.length;
      }
    });
  }

  // ===== TRUTH OR DARE =====
  function gameTruthOrDare() {
    const area = $id("game-area");
    const truths = [
      "What is your biggest fear?",
      "What is the most embarrassing thing that happened to you?",
      "If you could be invisible for a day, what would you do?",
      "What is a secret you've never told anyone?",
      "What is your most unpopular opinion?",
      "If you could swap lives with someone for a day, who?",
      "What is the last lie you told?",
      "What is your guilty pleasure?",
      "If you could change one thing about yourself, what?",
      "What is the worst date you've ever been on?",
      "What would you do with a million dollars?",
      "What is the most childish thing you still do?",
      "If you could relive one day, which one?",
      "What is something you're glad your parents don't know?",
      "What's the strangest dream you've ever had?"
    ];
    const dares = [
      "Do 10 pushups right now",
      "Sing your favorite song out loud",
      "Do your best animal impression",
      "Speak in an accent for the next 3 rounds",
      "Let the group check your phone for 30 seconds",
      "Do a silly dance for 15 seconds",
      "Post an embarrassing selfie on social media",
      "Eat something spicy",
      "Call a friend and sing Happy Birthday",
      "Let someone write on your face with a marker",
      "Do a handstand against the wall",
      "Speak only in rhymes for the next 5 minutes",
      "Let the person to your right tickle you for 10 seconds",
      "Imitate a famous person until someone guesses who",
      "Run around the room 3 times"
    ];
    let history = [];

    function render() {
      area.innerHTML = '<div class="tod-game"><h2>Truth or Dare</h2>' +
        '<div class="tod-player">Current player: <strong>' + esc(userName) + '</strong></div>' +
        '<div class="tod-buttons">' +
        '<button class="tod-btn truth" id="tod-truth">Truth</button>' +
        '<button class="tod-btn dare" id="tod-dare">Dare</button></div>' +
        '<div class="tod-card" id="tod-card">Choose Truth or Dare!</div>' +
        '<div class="tod-actions" id="tod-actions" style="display:none">' +
        '<button class="game-btn" id="tod-done">Done ✓</button>' +
        '<button class="game-btn" id="tod-skip">Skip →</button></div>' +
        '<div class="tod-history"><h3>Round History</h3><div id="tod-history-list"></div></div></div>';
      area.prepend(gameBackBtn());
      renderHistory();
    }

    function renderHistory() {
      const list = $id("tod-history-list");
      if (!list) return;
      list.innerHTML = "";
      history.forEach(function (h) {
        const item = ce("div", "tod-history-item");
        item.textContent = h.type.toUpperCase() + ": " + h.text + " (" + h.result + ")";
        list.appendChild(item);
      });
    }

    function pick(type) {
      const pool = type === "truth" ? truths : dares;
      const text = pool[Math.floor(Math.random() * pool.length)];
      $id("tod-card").innerHTML = '<span class="tod-type">' + type.toUpperCase() + '</span>' + text;
      $id("tod-actions").style.display = "flex";
      $id("tod-card").onclick = null;
      $id("tod-card").dataset.currentText = text;
      $id("tod-card").dataset.currentType = type;
    }

    render();

    document.addEventListener("click", function (e) {
      if (currentGame !== "truthdare") return;
      if (e.target.id === "tod-truth") pick("truth");
      if (e.target.id === "tod-dare") pick("dare");
      if (e.target.id === "tod-done") {
        const card = $id("tod-card");
        history.push({ type: card.dataset.currentType, text: card.dataset.currentText, result: "Done" });
        $id("tod-card").textContent = "Nice! Pick again.";
        $id("tod-actions").style.display = "none";
        renderHistory();
      }
      if (e.target.id === "tod-skip") {
        const card = $id("tod-card");
        history.push({ type: card.dataset.currentType, text: card.dataset.currentText, result: "Skipped" });
        $id("tod-card").textContent = "Skipped. Pick again!";
        $id("tod-actions").style.display = "none";
        renderHistory();
      }
    });
  }

  // ========== WALLPAPER ==========
  function applyWallpaper(dataUrl) {
    document.body.style.backgroundImage = "url(" + dataUrl + ")";
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
  }

  document.addEventListener("click", function (e) {
    if (e.target.id === "btn-wallpaper") {
      $id("wallpaper-modal").style.display = "flex";
    }
    if (e.target.id === "wallpaper-close" || e.target === $id("wallpaper-modal")) {
      $id("wallpaper-modal").style.display = "none";
    }
    if (e.target.id === "btn-remove-wallpaper") {
      wallpaper = "";
      lsSet("tc2_wallpaper", "");
      document.body.style.backgroundImage = "";
      $id("wallpaper-preview").innerHTML = "";
    }
  });

  $id("wallpaper-upload").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      wallpaper = ev.target.result;
      lsSet("tc2_wallpaper", wallpaper);
      applyWallpaper(wallpaper);
      $id("wallpaper-preview").innerHTML = '<img src="' + wallpaper + '" style="max-width:200px;border-radius:8px;">';
    };
    reader.readAsDataURL(file);
  });

  // ========== MEMORY BOOK ==========
  function renderMemories() {
    const list = $id("memories-list");
    if (!list) return;
    list.innerHTML = "";
    memories.forEach(function (m, i) {
      const item = ce("div", "memory-item");
      item.innerHTML = '<span class="memory-text">' + esc(m.text) + '</span>' +
        '<span class="memory-date">' + new Date(m.time).toLocaleDateString() + '</span>' +
        '<button class="memory-delete" data-idx="' + i + '">✕</button>';
      list.appendChild(item);
    });
  }

  document.addEventListener("click", function (e) {
    if (e.target.id === "btn-memory-book") {
      $id("memory-modal").style.display = "flex";
    }
    if (e.target.id === "memory-close" || e.target === $id("memory-modal")) {
      $id("memory-modal").style.display = "none";
    }
    if (e.target.id === "btn-add-memory") {
      const input = $id("memory-input");
      const text = input.value.trim();
      if (!text) return;
      memories.push({ id: crypto.randomUUID(), text: text, time: Date.now() });
      lsSet("tc2_memories", memories);
      input.value = "";
      renderMemories();
    }
    if (e.target.classList.contains("memory-delete")) {
      const idx = parseInt(e.target.dataset.idx);
      memories.splice(idx, 1);
      lsSet("tc2_memories", memories);
      renderMemories();
    }
    if (e.target.id === "btn-export-memories") {
      exportMemoriesToPDF();
    }
  });

  $id("memory-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); $id("btn-add-memory").click(); }
  });

  async function exportMemoriesToPDF() {
    const jspdf = await loadJSPDF();
    if (!jspdf) return;
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("TC2 Groupe - Memory Book", 20, 20);
    doc.setFontSize(11);
    let y = 40;
    memories.forEach(function (m, i) {
      if (y > 270) { doc.addPage(); y = 20; }
      const date = new Date(m.time).toLocaleDateString();
      doc.text((i + 1) + ". [" + date + "] " + m.text, 20, y);
      y += 10;
    });
    doc.save("tc2-memories.pdf");
  }

  // ========== MODAL CLOSE HANDLERS ==========
  document.addEventListener("click", function (e) {
    if (e.target.id === "games-close" || e.target === $id("games-modal")) {
      $id("games-modal").style.display = "none";
    }
    if (e.target.id === "channels-close" || e.target === $id("channels-modal")) {
      $id("channels-modal").style.display = "none";
    }
    if (e.target.id === "wallpaper-close" || e.target === $id("wallpaper-modal")) {
      $id("wallpaper-modal").style.display = "none";
    }
    if (e.target.id === "memory-close" || e.target === $id("memory-modal")) {
      $id("memory-modal").style.display = "none";
    }
  });

  // ========== INIT ==========
  init();
})();
