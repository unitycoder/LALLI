import json
import re
import requests
from config import OLLAMA_URL, OLLAMA_MODEL


def _extract_json(text: str) -> dict:
    """LLMs sometimes wrap JSON in markdown fences or add stray text. Be forgiving."""
    text = text.strip()
    text = re.sub(r"^```(json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    # If there's leading/trailing junk, grab the first {...} block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)
    return json.loads(text)


def chat(system_prompt: str, history: list[dict], user_message: str | None = None) -> dict:
    """
    history: list of {"role": "user"|"assistant", "content": str}
    user_message: if provided, appended as the latest user turn.
                  If None, this is used to generate the opening line.
    Returns parsed dict matching the schema in prompts.py
    """
    messages = [{"role": "system", "content": system_prompt}] + history
    if user_message is not None:
        messages.append({"role": "user", "content": user_message})

    resp = requests.post(
        OLLAMA_URL,
        json={
            "model": OLLAMA_MODEL,
            "messages": messages,
            "stream": False,
            "format": "json",  # Ollama enforces valid JSON output when supported by the model
            "options": {"temperature": 0.7},
        },
        timeout=120,
    )
    resp.raise_for_status()
    raw_content = resp.json()["message"]["content"]

    try:
        parsed = _extract_json(raw_content)
    except (json.JSONDecodeError, AttributeError):
        # Fallback: treat the whole thing as plain reply text so the app doesn't crash
        parsed = {
            "reply": raw_content.strip(),
            "corrections": [],
            "help_requested": False,
            "repetition_needed": False,
            "new_vocab": [],
        }

    parsed.setdefault("reply", "")
    parsed.setdefault("corrections", [])
    parsed.setdefault("help_requested", False)
    parsed.setdefault("repetition_needed", False)
    parsed.setdefault("new_vocab", [])
    return parsed


def translate_to_english(text: str) -> str:
    system_message = (
        "You are an English translator. Translate the user's sentence into natural English. "
        "The input may be Chinese or another language. Do not repeat the original sentence. "
        "Return JSON with exactly one field: translation. The translation value must contain "
        "English only, with no explanation or quotation marks."
    )
    resp = requests.post(
        OLLAMA_URL,
        json={
            "model": OLLAMA_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": system_message,
                },
                {"role": "user", "content": text},
            ],
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.0},
        },
        timeout=120,
    )
    resp.raise_for_status()
    content = resp.json()["message"]["content"].strip()
    try:
        translation = _extract_json(content).get("translation", "").strip()
        if translation:
            return translation
    except (json.JSONDecodeError, AttributeError):
        pass
    return content
