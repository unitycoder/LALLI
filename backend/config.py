"""
Static configuration for the tutor: languages, topics, and CEFR skill levels.
Edit these lists to customize what shows up in the UI dropdowns.
"""

LANGUAGES = [
    {"code": "en", "name": "English"},
    {"code": "es", "name": "Spanish"},
    {"code": "fr", "name": "French"},
    {"code": "de", "name": "German"},
    {"code": "it", "name": "Italian"},
    {"code": "pt", "name": "Portuguese"},
    {"code": "nl", "name": "Dutch"},
    {"code": "sv", "name": "Swedish"},
    {"code": "fi", "name": "Finnish"},
    {"code": "pl", "name": "Polish"},
    {"code": "ru", "name": "Russian"},
    {"code": "uk", "name": "Ukrainian"},
    {"code": "tr", "name": "Turkish"},
    {"code": "ja", "name": "Japanese"},
    {"code": "ko", "name": "Korean"},
    {"code": "zh", "name": "Chinese"},
    {"code": "ar", "name": "Arabic"},
    {"code": "hi", "name": "Hindi"},
    {"code": "el", "name": "Greek"},
    {"code": "cs", "name": "Czech"},
]

TOPICS = [
    "Total beginner — greetings, introductions, and everyday basics",
    "Small talk / getting to know you",
    "Ordering food at a restaurant",
    "Job interview practice",
    "Travel & asking for directions",
    "Daily routine",
    "Shopping",
    "Talking about hobbies",
    "Debate / giving opinions",
    "Doctor's appointment",
    "Making plans with a friend",
]

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

LEVEL_DESCRIPTIONS = {
    "A1": "beginner — very simple words, short sentences, present tense only",
    "A2": "elementary — simple everyday vocabulary, basic past/future tense",
    "B1": "intermediate — everyday vocabulary, common idioms, connected sentences",
    "B2": "upper intermediate — more complex sentences, opinions, some abstract topics",
    "C1": "advanced — nuanced vocabulary, complex grammar, natural pace",
    "C2": "near-native — full complexity, idioms, fast natural conversation",
}

# ---- Model / engine settings ----
OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "qwen2.5:7b-instruct"  # change to any model you've pulled with `ollama pull`

WHISPER_MODEL_SIZE = "small"  # tiny/base/small/medium/large-v3
WHISPER_DEVICE = "cuda"  # "cuda" if you have a GPU
WHISPER_COMPUTE_TYPE = "int8"  # int8 is fast on CPU; use "float16" on GPU

# Piper TTS (https://github.com/OHF-Voice/piper1-gpl) — installed via `pip install piper-tts`
# and invoked as `python -m piper`. Voice name is the model id without file extension,
# e.g. "en_US-lessac-medium" — download it with:
#   python -m piper.download_voices en_US-lessac-medium
PIPER_VOICE_NAME = "en_US-lessac-medium"
PIPER_VOICE_DATA_DIR = "./voices"  # directory the voice was downloaded into

DB_PATH = "./tutor.db"
