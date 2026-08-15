import base64
import os
import tempfile
import traceback

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import config
import database as db
import llm_client
import prompts
import stt
import tts
from pypinyin import Style, lazy_pinyin

app = FastAPI(title="Local AI Language Tutor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db.init_db()

# in-memory session state: session_id -> {history, language, topic, level}
SESSIONS: dict[int, dict] = {}


def _language_code(language_name: str) -> str:
    for language in config.LANGUAGES:
        if language["name"] == language_name:
            return language["code"]
    return language_name


# ---------- REST: setup / metadata ----------

@app.get("/api/config")
def get_config():
    return {
        "languages": config.LANGUAGES,
        "topics": config.TOPICS,
        "levels": config.LEVELS,
        "voices": tts.available_voices(),
        "voice_preview_endpoint": "/api/voice/preview",
    }


class StartSessionRequest(BaseModel):
    language: str
    topic: str
    level: str
    voice: str | None = None
    speed: float = Field(default=1.0, ge=0.5, le=1.5)


@app.post("/api/session/start")
def start_session(req: StartSessionRequest):
    try:
        voice = tts.resolve_voice(req.voice)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    session_id = db.create_session(req.language, req.topic, req.level)
    system_prompt = prompts.build_system_prompt(req.language, req.topic, req.level)

    # Generate the bot's opening line
    parsed = llm_client.chat(system_prompt, history=[], user_message=prompts.OPENING_LINE_INSTRUCTION)
    reply_text = parsed["reply"]

    db.add_turn(session_id, "bot", reply_text)

    SESSIONS[session_id] = {
        "history": [
            {"role": "user", "content": prompts.OPENING_LINE_INSTRUCTION},
            {"role": "assistant", "content": reply_text},
        ],
        "language": req.language,
        "topic": req.topic,
        "level": req.level,
        "voice": voice,
        "speed": req.speed,
        "system_prompt": system_prompt,
    }

    audio_b64 = _safe_tts_to_base64(reply_text, voice, req.speed)

    return {
        "session_id": session_id,
        "reply": reply_text,
        "audio_base64": audio_b64,
    }


@app.post("/api/session/{session_id}/end")
def end_session(session_id: int):
    db.end_session(session_id)
    SESSIONS.pop(session_id, None)
    return db.get_session_summary(session_id)


# ---------- REST: progress stats ----------

@app.get("/api/progress")
def get_progress(days: int = 30):
    return db.get_daily_progress(days)


# ---------- Core turn-processing logic (shared by text + audio input) ----------

def _safe_tts_to_base64(text: str, voice: str | None = None, speed: float = 1.0) -> str | None:
    try:
        wav_path = tts.synthesize(text, voice, speed)
        with open(wav_path, "rb") as f:
            audio_bytes = f.read()
        os.remove(wav_path)
        return base64.b64encode(audio_bytes).decode("utf-8")
    except Exception:
        # TTS is optional — if Piper isn't installed yet, chat still works via text.
        traceback.print_exc()
        return None


class VoicePreviewRequest(BaseModel):
    text: str
    voice: str | None = None
    speed: float = Field(default=1.0, ge=0.5, le=1.5)


@app.post("/api/voice/preview")
def voice_preview(req: VoicePreviewRequest):
    try:
        voice = tts.resolve_voice(req.voice)
        audio_b64 = _safe_tts_to_base64(req.text, voice, req.speed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if audio_b64 is None:
        raise HTTPException(status_code=500, detail="Voice preview generation failed.")
    return {"audio_base64": audio_b64}


class TranslationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@app.post("/api/session/{session_id}/translate")
def translate_sentence(session_id: int, req: TranslationRequest):
    if session_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Unknown session_id.")
    try:
        translation = llm_client.translate_to_english(req.text)
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail="Translation failed.") from exc
    return {"translation": translation}


@app.post("/api/session/{session_id}/pinyin")
def convert_to_pinyin(session_id: int, req: TranslationRequest):
    if session_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Unknown session_id.")
    return {"pinyin": " ".join(lazy_pinyin(req.text, style=Style.TONE))}


def process_user_message(session_id: int, user_text: str) -> dict:
    state = SESSIONS[session_id]

    db.add_turn(session_id, "user", user_text)

    parsed = llm_client.chat(
        state["system_prompt"],
        history=state["history"],
        user_message=user_text,
    )
    reply_text = parsed["reply"]

    state["history"].append({"role": "user", "content": user_text})
    state["history"].append({"role": "assistant", "content": reply_text})
    # Keep history bounded so prompts don't grow unbounded over a long session
    state["history"] = state["history"][-24:]

    turn_id = db.add_turn(session_id, "bot", reply_text)

    errors = len(parsed["corrections"])
    db.add_metrics(
        session_id=session_id,
        turn_id=turn_id,
        errors=errors,
        help_needed=parsed["help_requested"],
        repetitions=int(parsed["repetition_needed"]),
        new_vocab_count=len(parsed["new_vocab"]),
    )
    if parsed["new_vocab"]:
        db.add_vocab(session_id, state["language"], parsed["new_vocab"])

    audio_b64 = _safe_tts_to_base64(reply_text, state["voice"], state["speed"])

    return {
        "reply": reply_text,
        "corrections": parsed["corrections"],
        "help_requested": parsed["help_requested"],
        "repetition_needed": parsed["repetition_needed"],
        "new_vocab": parsed["new_vocab"],
        "audio_base64": audio_b64,
    }


# ---------- WebSocket: real-time chat (text or audio) ----------

@app.websocket("/ws/chat/{session_id}")
async def ws_chat(websocket: WebSocket, session_id: int):
    await websocket.accept()

    if session_id not in SESSIONS:
        await websocket.send_json({"type": "error", "message": "Unknown session_id. Call /api/session/start first."})
        await websocket.close()
        return

    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type")

            if msg_type == "text":
                user_text = msg["content"]

            elif msg_type == "audio":
                # content is base64-encoded audio (webm/wav/ogg from the browser)
                audio_bytes = base64.b64decode(msg["content"])
                suffix = msg.get("mime_ext", ".webm")
                with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                    f.write(audio_bytes)
                    tmp_path = f.name
                try:
                    language_name = SESSIONS[session_id]["language"]
                    language_hint = _language_code(language_name)
                    user_text = stt.transcribe(tmp_path, language_hint=language_hint)
                finally:
                    os.remove(tmp_path)

                # Echo back the transcription so the UI can show what was heard
                await websocket.send_json({"type": "transcript", "content": user_text})

            else:
                continue

            if not user_text.strip():
                continue

            result = process_user_message(session_id, user_text)
            await websocket.send_json({"type": "bot_reply", **result})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        traceback.print_exc()
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


# ---------- Serve the frontend ----------
# Run `uvicorn main:app --reload` from backend/, then open http://localhost:8000
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
