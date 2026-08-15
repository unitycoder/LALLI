"""
Text-to-speech using the `piper-tts` pip package (module CLI: `python -m piper`).
Piper development moved from the old standalone `rhasspy/piper` binary to the
pip-installable package at https://github.com/OHF-Voice/piper1-gpl.
See README for install + voice download steps.
"""
import subprocess
import sys
import tempfile
import os
from pathlib import Path
from config import PIPER_VOICE_NAME, PIPER_VOICE_DATA_DIR


def available_voices() -> list[str]:
    """Return Piper model names for voices installed in the configured data directory."""
    data_dir = Path(PIPER_VOICE_DATA_DIR or ".")
    return sorted(path.stem for path in data_dir.glob("*.onnx"))


def resolve_voice(voice_name: str | None) -> str:
    selected_voice = voice_name or PIPER_VOICE_NAME
    if selected_voice not in available_voices():
        raise ValueError(f"Voice '{selected_voice}' is not installed.")
    return selected_voice


def synthesize(text: str, voice_name: str | None = None, speed: float = 1.0) -> str:
    """
    Returns the path to a generated wav file. Caller is responsible for
    deleting it after use (main.py cleans up after sending it to the client).
    """
    out_path = tempfile.mktemp(suffix=".wav")
    selected_voice = resolve_voice(voice_name)
    cmd = [
        sys.executable, "-m", "piper",
        "-m", selected_voice,
        "-f", out_path,
        "--length-scale", str(1.0 / speed),
    ]
    if PIPER_VOICE_DATA_DIR:
        cmd += ["--data-dir", PIPER_VOICE_DATA_DIR]
    cmd += ["--", text]

    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0 or not os.path.exists(out_path):
        raise RuntimeError(f"Piper TTS failed: {proc.stderr.decode(errors='ignore')}")
    return out_path
