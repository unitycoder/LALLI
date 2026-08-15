const API_BASE = "http://localhost:8000";

let ws = null;
let sessionId = null;
let mediaRecorder = null;
let audioChunks = [];
let alwaysOnStream = null;
let alwaysOnContext = null;
let alwaysOnAnalyser = null;
let alwaysOnFrame = null;
let alwaysOnRecorder = null;
let alwaysOnChunks = [];
let alwaysOnSpeechStartedAt = 0;
let alwaysOnSilenceStartedAt = 0;
let alwaysOnActive = false;
let selectedVoice = localStorage.getItem("aiTutor.voice") || "";
let selectedSpeed = Math.min(1.5, Math.max(0.5, Number(localStorage.getItem("aiTutor.speed")) || 1));
let lastBotAudioUrl = "";

const el = (id) => document.getElementById(id);

function restoreSavedSelect(selectId) {
  const select = el(selectId);
  const savedValue = localStorage.getItem(`aiTutor.${selectId}`);
  const hasSavedValue = Array.from(select.options).some((option) => option.value === savedValue);
  if (hasSavedValue) {
    select.value = savedValue;
  }
  localStorage.setItem(`aiTutor.${selectId}`, select.value);
}

async function loadConfig() {
  const res = await fetch(`${API_BASE}/api/config`);
  const cfg = await res.json();

  const langSel = el("language");
  cfg.languages.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l.name; opt.textContent = l.name;
    langSel.appendChild(opt);
  });

  const topicSel = el("topic");
  cfg.topics.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t; opt.textContent = t;
    topicSel.appendChild(opt);
  });

  const levelSel = el("level");
  cfg.levels.forEach(lv => {
    const opt = document.createElement("option");
    opt.value = lv; opt.textContent = lv;
    levelSel.appendChild(opt);
  });

  restoreSavedSelect("language");
  restoreSavedSelect("topic");
  restoreSavedSelect("level");
}

function playAudioUrl(url) {
  if (!url) return;
  const audio = new Audio(url);
  audio.play().catch(() => { /* autoplay may be blocked until user interacts once */ });
}

function addMessage(role, text, extra = {}) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  wrap.textContent = text;

  if (role === "bot") {
    const messageActions = document.createElement("div");
    messageActions.className = "message-actions";

    const translateBtn = document.createElement("button");
    translateBtn.className = "translate-btn";
    translateBtn.type = "button";
    translateBtn.title = "Translate this sentence to English";
    translateBtn.textContent = "?";
    translateBtn.addEventListener("click", () => translateBotMessage(wrap, text, translateBtn));
    messageActions.appendChild(translateBtn);

    const pinyinBtn = document.createElement("button");
    pinyinBtn.className = "translate-btn pinyin-btn";
    pinyinBtn.type = "button";
    pinyinBtn.title = "Show pinyin pronunciation";
    pinyinBtn.textContent = "拼";
    pinyinBtn.addEventListener("click", () => showPinyin(wrap, text, pinyinBtn));
    messageActions.appendChild(pinyinBtn);
    wrap.appendChild(messageActions);
  }

  if (extra.corrections && extra.corrections.length) {
    const c = document.createElement("div");
    c.className = "corrections";
    c.textContent = "Corrections: " + extra.corrections
      .map(x => `"${x.mistake}" → "${x.fix}" (${x.note || ""})`).join("; ");
    wrap.appendChild(c);
  }
  if (extra.new_vocab && extra.new_vocab.length) {
    const v = document.createElement("div");
    v.className = "vocab";
    v.textContent = "New vocab: " + extra.new_vocab.join(", ");
    wrap.appendChild(v);
  }

  el("messages").appendChild(wrap);
  el("messages").scrollTop = el("messages").scrollHeight;
}

async function translateBotMessage(messageElement, text, button) {
  const existingTranslation = messageElement.querySelector(".english-translation");
  if (existingTranslation) {
    const isHidden = existingTranslation.classList.toggle("hidden");
    button.title = isHidden ? "Show English translation" : "Hide English translation";
    return;
  }

  button.disabled = true;
  button.textContent = "Translating...";
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("Translation request failed.");
    const data = await res.json();
    const translation = document.createElement("div");
    translation.className = "translation english-translation";
    translation.textContent = `English: ${data.translation}`;
    messageElement.appendChild(translation);
    button.textContent = "?";
    button.title = "Hide English translation";
  } catch (err) {
    button.textContent = "?";
    button.title = "Translate this sentence to English";
    button.setAttribute("aria-label", "Translation unavailable");
    console.error(err);
  } finally {
    button.disabled = false;
  }
}

async function showPinyin(messageElement, text, button) {
  const existingPinyin = messageElement.querySelector(".pinyin");
  if (existingPinyin) {
    existingPinyin.classList.toggle("hidden");
    return;
  }

  button.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/pinyin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("Pinyin request failed.");
    const data = await res.json();
    const pinyin = document.createElement("div");
    pinyin.className = "translation pinyin";
    pinyin.textContent = `Pinyin: ${data.pinyin}`;
    messageElement.appendChild(pinyin);
  } catch (err) {
    console.error(err);
  } finally {
    button.disabled = false;
  }
}

function playAudioBase64(b64, remember = false) {
  if (!b64) return;
  const audioUrl = `data:audio/wav;base64,${b64}`;
  if (remember) {
    lastBotAudioUrl = audioUrl;
    el("repeatBtn").disabled = false;
  }
  const audio = new Audio(audioUrl);
  audio.play().catch(() => { /* autoplay may be blocked until user interacts once */ });
}

function repeatLastBotAudio() {
  if (!lastBotAudioUrl) return;
  const audio = new Audio(lastBotAudioUrl);
  audio.play().catch(() => { /* autoplay may be blocked until user interacts once */ });
}

async function startSession() {
  const language = el("language").value;
  const topic = el("topic").value;
  const level = el("level").value;
  const voice = selectedVoice;
  const startBtn = el("startBtn");
  const startLoading = el("startLoading");

  startBtn.disabled = true;
  startLoading.classList.remove("hidden");

  try {
    const payload = { language, topic, level, speed: selectedSpeed };
    if (voice) payload.voice = voice;

    const res = await fetch(`${API_BASE}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error("Failed to start session.");
    }

    const data = await res.json();
    sessionId = data.session_id;

    startLoading.classList.add("hidden");
    startLoading.querySelector("span:last-child").textContent = "Connecting to tutor...";
    el("setup").classList.add("hidden");
    el("chatSection").classList.remove("hidden");
    el("metaLine").textContent = `${language} · ${topic} · ${level}`;
    el("messages").innerHTML = "";
    lastBotAudioUrl = "";
    el("repeatBtn").disabled = true;
    addMessage("bot", data.reply);
    playAudioBase64(data.audio_base64, true);

    connectWebSocket();
    if (el("alwaysMic").checked) {
      startAlwaysOnMic();
    }
    el("status").textContent = "";
  } catch (err) {
    startLoading.classList.remove("hidden");
    startLoading.querySelector("span:last-child").textContent =
      "Could not start. Check backend and try again.";
    console.error(err);
  } finally {
    startBtn.disabled = false;
    if (!el("setup").classList.contains("hidden")) {
      setTimeout(() => {
        startLoading.classList.add("hidden");
        startLoading.querySelector("span:last-child").textContent = "Connecting to tutor...";
      }, 1500);
    }
  }
}

function connectWebSocket() {
  const wsUrl = API_BASE.replace("http", "ws") + `/ws/chat/${sessionId}`;
  ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "transcript") {
      addMessage("user", msg.content);
    } else if (msg.type === "bot_reply") {
      addMessage("bot", msg.reply, {
        corrections: msg.corrections,
        new_vocab: msg.new_vocab,
      });
      playAudioBase64(msg.audio_base64, true);
      el("status").textContent = "";
    } else if (msg.type === "error") {
      el("status").textContent = "Error: " + msg.message;
    }
  };

  ws.onclose = () => { el("status").textContent = "Disconnected."; };
}

function sendText() {
  const input = el("textInput");
  const text = input.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  addMessage("user", text);
  ws.send(JSON.stringify({ type: "text", content: text }));
  input.value = "";
  el("status").textContent = "Thinking...";
}

async function endSession() {
  if (!sessionId) return;
  stopAlwaysOnMic();
  await fetch(`${API_BASE}/api/session/${sessionId}/end`, { method: "POST" });
  if (ws) ws.close();
  sessionId = null;
  el("chatSection").classList.add("hidden");
  el("setup").classList.remove("hidden");
  const startLoading = el("startLoading");
  startLoading.classList.add("hidden");
  startLoading.querySelector("span:last-child").textContent = "Connecting to tutor...";
  lastBotAudioUrl = "";
  el("repeatBtn").disabled = true;
}

// ---- Mic recording (push and hold) ----
async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];
  mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    const buffer = await blob.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    ws.send(JSON.stringify({ type: "audio", content: b64, mime_ext: ".webm" }));
    el("status").textContent = "Transcribing...";
    stream.getTracks().forEach(t => t.stop());
  };
  mediaRecorder.start();
  el("micBtn").classList.add("recording");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  el("micBtn").classList.remove("recording");
}

async function startAlwaysOnMic() {
  if (alwaysOnActive || !sessionId) return;

  try {
    alwaysOnStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    alwaysOnContext = new AudioContext();
    alwaysOnAnalyser = alwaysOnContext.createAnalyser();
    alwaysOnAnalyser.fftSize = 512;
    alwaysOnContext.createMediaStreamSource(alwaysOnStream).connect(alwaysOnAnalyser);
    alwaysOnActive = true;
    monitorAlwaysOnMic();
    el("status").textContent = "Listening...";
  } catch (err) {
    el("alwaysMic").checked = false;
    localStorage.setItem("aiTutor.alwaysMic", "false");
    el("status").textContent = "Microphone permission is required for always-on mode.";
    console.error(err);
  }
}

function monitorAlwaysOnMic() {
  if (!alwaysOnActive || !alwaysOnAnalyser) return;

  const samples = new Uint8Array(alwaysOnAnalyser.fftSize);
  alwaysOnAnalyser.getByteTimeDomainData(samples);
  let sum = 0;
  samples.forEach((sample) => {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  });
  const volume = Math.sqrt(sum / samples.length);
  const now = performance.now();
  const speechDetected = volume > 0.025;

  if (speechDetected) {
    alwaysOnSilenceStartedAt = 0;
    if (!alwaysOnRecorder) {
      alwaysOnRecorder = new MediaRecorder(alwaysOnStream);
      alwaysOnChunks = [];
      alwaysOnSpeechStartedAt = now;
      alwaysOnRecorder.ondataavailable = (event) => alwaysOnChunks.push(event.data);
      alwaysOnRecorder.onstop = sendAlwaysOnRecording;
      alwaysOnRecorder.start();
      el("micBtn").classList.add("recording");
    }
  } else if (alwaysOnRecorder && alwaysOnRecorder.state === "recording") {
    if (!alwaysOnSilenceStartedAt) alwaysOnSilenceStartedAt = now;
    if (now - alwaysOnSilenceStartedAt > 900 && now - alwaysOnSpeechStartedAt > 350) {
      alwaysOnRecorder.stop();
      alwaysOnRecorder = null;
      el("micBtn").classList.remove("recording");
    }
  }

  alwaysOnFrame = requestAnimationFrame(monitorAlwaysOnMic);
}

async function sendAlwaysOnRecording() {
  if (!alwaysOnActive || !sessionId || !ws || ws.readyState !== WebSocket.OPEN) return;
  const blob = new Blob(alwaysOnChunks, { type: "audio/webm" });
  if (blob.size < 1000) return;
  const buffer = await blob.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  ws.send(JSON.stringify({ type: "audio", content: b64, mime_ext: ".webm" }));
  el("status").textContent = "Transcribing...";
}

function stopAlwaysOnMic() {
  alwaysOnActive = false;
  if (alwaysOnFrame) cancelAnimationFrame(alwaysOnFrame);
  alwaysOnFrame = null;
  if (alwaysOnRecorder && alwaysOnRecorder.state !== "inactive") alwaysOnRecorder.stop();
  alwaysOnRecorder = null;
  if (alwaysOnStream) alwaysOnStream.getTracks().forEach((track) => track.stop());
  alwaysOnStream = null;
  if (alwaysOnContext) alwaysOnContext.close();
  alwaysOnContext = null;
  alwaysOnAnalyser = null;
  el("micBtn").classList.remove("recording");
}

// ---- Event wiring ----
el("startBtn").addEventListener("click", startSession);
el("endBtn").addEventListener("click", endSession);
el("repeatBtn").addEventListener("click", repeatLastBotAudio);
el("sendBtn").addEventListener("click", sendText);
el("textInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendText(); });
[
  "language",
  "topic",
  "level",
].forEach((selectId) => {
  el(selectId).addEventListener("change", (event) => {
    localStorage.setItem(`aiTutor.${selectId}`, event.target.value);
  });
});

const micBtn = el("micBtn");
micBtn.addEventListener("mousedown", () => { if (!el("alwaysMic").checked) startRecording(); });
micBtn.addEventListener("mouseup", () => { if (!el("alwaysMic").checked) stopRecording(); });
micBtn.addEventListener("mouseleave", () => {
  if (!el("alwaysMic").checked && mediaRecorder && mediaRecorder.state === "recording") stopRecording();
});
micBtn.addEventListener("touchstart", (event) => {
  if (!el("alwaysMic").checked) { event.preventDefault(); startRecording(); }
});
micBtn.addEventListener("touchend", (event) => {
  if (!el("alwaysMic").checked) { event.preventDefault(); stopRecording(); }
});

const alwaysMic = el("alwaysMic");
alwaysMic.checked = localStorage.getItem("aiTutor.alwaysMic") === "true";
alwaysMic.addEventListener("change", () => {
  localStorage.setItem("aiTutor.alwaysMic", String(alwaysMic.checked));
  if (alwaysMic.checked) startAlwaysOnMic();
  else stopAlwaysOnMic();
});

loadConfig();
