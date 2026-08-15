# Local AI Language Tutor

Runs 100% on your machine: local LLM (Ollama), local speech-to-text (faster-whisper),
local text-to-speech (Piper). No cloud API calls, no accounts, no data leaving your computer.

## What you get
- Text chat and push-to-talk mic chat with an AI conversation partner
- Pick language, topic, and CEFR skill level (A1–C2) before each session
- The tutor speaks back out loud in an AI voice
- Every turn is scored: grammar/vocab corrections, "help needed", "repetition needed", new vocab taught
- A Progress page with daily stats and a chart, stored locally in SQLite

---

## 1. Install prerequisites

You need three things running locally: **Ollama** (the LLM), **Piper** (the voice), and Python 3.10+.

### a) Ollama (LLM)
1. Install from https://ollama.com (Windows/Mac/Linux installers available)
2. Pull a model:
   ```bash
   ollama pull qwen2.5:7b-instruct
   ```
   (Good multilingual quality. If your machine is weak, try `qwen2.5:3b-instruct` or `llama3.2:3b`.
   If you have a strong GPU, `qwen2.5:14b-instruct` is noticeably better at grammar correction.)
3. Ollama runs automatically as a background service on `localhost:11434` after install.

### b) Piper (TTS / the AI voice)
Piper development moved from the old `rhasspy/piper` standalone-binary repo to a
pip-installable package maintained by the Open Home Foundation:
https://github.com/OHF-Voice/piper1-gpl (the old repo is archived and just points here now).

It's installed automatically via `requirements.txt` in step 2 below (`piper-tts` on PyPI),
so there's no separate binary download. You just need to grab a voice:

```bash
cd ai-tutor/backend
python -m piper.download_voices en_US-lessac-medium --data-dir ./voices
```

Browse other voices (different languages/genders) at:
https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md
or listen to samples at https://rhasspy.github.io/piper-samples

Note: Piper is GPL-3.0 licensed as of this repo (the old MIT-licensed version is
unmaintained) — worth knowing if you plan to redistribute this project commercially.

### c) Python
Python 3.10 or newer.

---

## 2. Install Python dependencies

```bash
cd ai-tutor/backend
python -m venv venv
source venv/bin/activate       # on Windows: venv\Scripts\activate
pip install -r requirements.txt
```

`faster-whisper` will download the Whisper model (`small` by default, ~500MB) the first
time you run a transcription — this needs internet once, then works fully offline.

---

## 3. Configure paths

Open `backend/config.py` and check/adjust:

- `OLLAMA_MODEL` — must match what you `ollama pull`led (e.g. `"qwen2.5:7b-instruct"`)
- `PIPER_VOICE_NAME` — the voice id you downloaded, e.g. `"en_US-lessac-medium"` (no file extension)
- `PIPER_VOICE_DATA_DIR` — the folder you downloaded it into, e.g. `"./voices"`
- `WHISPER_MODEL_SIZE` / `WHISPER_DEVICE` — `"small"` + `"cpu"` works fine on most laptops;
  bump to `"medium"` + `"cuda"` if you have an NVIDIA GPU for better accuracy/speed

---

## 4. Run it

```bash
cd ai-tutor/backend
uvicorn main:app --reload
```

Then open your browser to:

```
http://localhost:8000
```

Pick a language, topic, and level, hit "Start conversation" — the tutor will greet you
and speak out loud. Type replies, or press-and-hold the 🎤 button to talk.

Visit `http://localhost:8000/progress.html` (or click "Progress" in the nav) any time
to see your daily stats chart.

---

## How the scoring works

After every one of your turns, the LLM is instructed to also return structured metadata
alongside its spoken reply: any grammar/vocab mistakes you made, whether you seemed to
need help, whether it had to repeat/simplify itself, and any new vocabulary it introduced.
This is stored per-turn in `backend/tutor.db` (plain SQLite file) and aggregated by day
for the Progress chart. No manual logging needed — it all happens automatically as you talk.

---

## Troubleshooting

- **No sound comes back**: check `PIPER_VOICE_NAME` and `PIPER_VOICE_DATA_DIR` in `config.py`
  actually match a downloaded voice (the `.onnx` + `.onnx.json` pair should be sitting in that folder).
  The app still works via text if TTS fails — check the terminal running uvicorn for the actual error.
- **Mic button does nothing**: browsers require HTTPS or `localhost` for mic access —
  `localhost:8000` is fine, but accessing via a LAN IP (`192.168.x.x`) will be blocked.
- **LLM replies aren't valid JSON / app looks broken**: smaller/weaker models sometimes
  ignore the JSON formatting instruction. Try a different model in `OLLAMA_MODEL`, or a
  larger size of the same model family.
- **Whisper is slow**: drop to `WHISPER_MODEL_SIZE = "base"` or `"tiny"` for near-instant
  transcription at the cost of some accuracy.

---

## Where to go next (ideas)
- Stream LLM output sentence-by-sentence into Piper for lower perceived latency
- Auto voice-activity-detection (silero-vad) instead of push-to-talk
- Per-language voice switching (map each language to a different Piper voice model)
- Spaced-repetition review screen for the `vocab` table
- Adjustable TTS speaking rate for lower levels
