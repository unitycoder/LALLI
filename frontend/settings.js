const API_BASE = "http://localhost:8000";

let selectedVoice = localStorage.getItem("aiTutor.voice") || "";
let selectedSpeed = Number(localStorage.getItem("aiTutor.speed")) || 1;
let voicePreviewEndpoint = "/api/voice/preview";

const el = (id) => document.getElementById(id);

function playAudioUrl(url) {
  if (!url) return;
  const audio = new Audio(url);
  audio.play().catch(() => { /* autoplay may be blocked until user interacts once */ });
}

function playAudioBase64(b64) {
  if (!b64) return;
  playAudioUrl(`data:audio/wav;base64,${b64}`);
}

async function loadConfig() {
  const res = await fetch(`${API_BASE}/api/config`);
  const cfg = await res.json();
  if (cfg.voice_preview_endpoint) {
    voicePreviewEndpoint = cfg.voice_preview_endpoint;
  }

  const voiceSel = el("voiceSelect");
  const speedSel = el("speedSelect");
  const voiceHint = el("voiceHint");
  const voices = Array.isArray(cfg.voices) ? cfg.voices : [];

  speedSel.value = String(Math.min(1.5, Math.max(0.5, selectedSpeed)));
  selectedSpeed = Number(speedSel.value);
  el("speedValue").textContent = `${selectedSpeed.toFixed(2)}x`;

  if (!voices.length) {
    voiceSel.value = "";
    voiceSel.disabled = true;
    voiceHint.textContent = "No voice list from backend yet. Using default voice.";
    return;
  }

  voiceSel.disabled = false;
  voiceHint.textContent = `Loaded ${voices.length} voice option${voices.length === 1 ? "" : "s"}.`;

  voices.forEach((voice) => {
    const opt = document.createElement("option");
    if (typeof voice === "string") {
      opt.value = voice;
      opt.textContent = voice;
    } else {
      const voiceValue = voice.id || voice.name || "";
      opt.value = voiceValue;
      opt.textContent = voice.name || voice.id || "Unnamed voice";
    }
    if (opt.value) {
      voiceSel.appendChild(opt);
    }
  });

  const hasSavedVoice = Array.from(voiceSel.options).some((o) => o.value === selectedVoice);
  voiceSel.value = hasSavedVoice ? selectedVoice : "";
  selectedVoice = voiceSel.value;
}

async function testVoice() {
  const testBtn = el("testVoiceBtn");
  const voiceHint = el("voiceHint");
  const previewText = "Hello! This is your selected AI tutor voice.";

  testBtn.disabled = true;
  voiceHint.textContent = "Generating voice preview...";

  const payload = { text: previewText, speed: selectedSpeed };
  if (selectedVoice) payload.voice = selectedVoice;

  try {
    const res = await fetch(`${API_BASE}${voicePreviewEndpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error("Voice preview request failed.");
    }

    const data = await res.json();
    if (data.audio_base64) {
      playAudioBase64(data.audio_base64);
      voiceHint.textContent = "Playing voice preview.";
    } else if (data.audio_url) {
      playAudioUrl(data.audio_url);
      voiceHint.textContent = "Playing voice preview.";
    } else {
      voiceHint.textContent = data.message || "Voice preview is unavailable.";
    }
  } catch (err) {
    voiceHint.textContent = "Voice preview is unavailable.";
    console.error(err);
  } finally {
    testBtn.disabled = false;
  }
}

el("voiceSelect").addEventListener("change", (event) => {
  selectedVoice = event.target.value;
  localStorage.setItem("aiTutor.voice", selectedVoice);
});
el("speedSelect").addEventListener("input", (event) => {
  selectedSpeed = Number(event.target.value);
  localStorage.setItem("aiTutor.speed", String(selectedSpeed));
  el("speedValue").textContent = `${selectedSpeed.toFixed(2)}x`;
});
el("testVoiceBtn").addEventListener("click", testVoice);

loadConfig().catch((err) => {
  el("voiceHint").textContent = "Could not load voice settings.";
  console.error(err);
});
