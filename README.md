# Local AI Language Learning Instructor (LALLI)

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

You need **Ollama** (the LLM) and Python 3.10 or newer. The Windows installer sets up the Python dependencies and Piper voice automatically.

### a) Ollama (LLM)
1. Install from https://ollama.com (Windows/Mac/Linux installers available)
2. Pull a model:
   ```bash
   ollama pull qwen2.5:7b-instruct
   ```
   (Good multilingual quality. If your machine is weak, try `qwen2.5:3b-instruct` or `llama3.2:3b`.
   If you have a strong GPU, `qwen2.5:14b-instruct` is noticeably better at grammar correction.)
3. Ollama runs automatically as a background service on `localhost:11434` after install.

### b) Python
Install Python 3.10 or newer from https://www.python.org/downloads/windows/.
Make sure the Python launcher (`py`) or `python` is available from Command Prompt.

---

## 2. Install the application (Windows)

From the project folder, double-click `install.bat`. It will:

- Create `backend\venv`
- Update `pip`
- Install the dependencies in `backend\requirements.txt`
- Download the default Piper voice to `backend\voices`

The installer needs an internet connection the first time it runs. `faster-whisper`
will download the Whisper model (`small` by default, about 500 MB) the first time you
transcribe audio.

If the installer reports that Python is missing, install Python and run it again. To
retry the Piper voice download manually:

```bat
backend\venv\Scripts\python.exe -m piper.download_voices en_US-lessac-medium --data-dir backend\voices
```

---

## 3. Configure paths

Open `backend/config.py` and check/adjust:

- `OLLAMA_MODEL` — must match what you `ollama pull`led (e.g. `"qwen2.5:7b-instruct"`)
- `PIPER_VOICE_NAME` — the voice id you downloaded, e.g. `"en_US-lessac-medium"` (no file extension)
- `PIPER_VOICE_DATA_DIR` — the folder you downloaded it into, e.g. `"./voices"`
- `WHISPER_MODEL_SIZE` / `WHISPER_DEVICE` — `"small"` + `"cpu"` works fine on most laptops;
  bump to `"medium"` + `"cuda"` if you have an NVIDIA GPU for better accuracy/speed

---

## 4. Run it (Windows)

Double-click `backend\runserver.bat`, or run this from the project folder:

```bat
backend\runserver.bat
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
