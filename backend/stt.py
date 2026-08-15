"""
Speech-to-text using faster-whisper. Model loads once at import time and is reused
across requests (loading it per-request would be very slow).
"""
from faster_whisper import WhisperModel
from config import WHISPER_MODEL_SIZE, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE

_model = None


def get_model():
    global _model
    if _model is None:
        _model = WhisperModel(
            WHISPER_MODEL_SIZE,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
        )
    return _model


def transcribe(audio_path: str, language_hint: str | None = None) -> str:
    """
    audio_path: path to a wav/mp3/webm file on disk.
    language_hint: ISO code like 'en', 'fi' — improves accuracy if you know the
                    target language. Leave None to auto-detect.
    """
    model = get_model()
    segments, _info = model.transcribe(
        audio_path,
        language=language_hint,
        task="transcribe",
        temperature=0.0,
        condition_on_previous_text=False,
        vad_filter=True,  # skip silence automatically
    )
    return " ".join(seg.text.strip() for seg in segments).strip()
