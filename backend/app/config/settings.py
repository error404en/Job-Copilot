import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Primary Gemini model: gemini-2.5-flash (high quota, production tier, highly reliable)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
# Vision model default: gemini-2.5-flash (multimodal generateContent)
GEMINI_VISION_MODEL = os.getenv("GEMINI_VISION_MODEL", "gemini-2.5-flash")
# Primary Groq model: qwen/qwen3.8-27b (extremely fast, high quota, production)
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")

# Dedicated model for high-nuance writing tasks (like tailoring)
GROQ_TAILORING_MODEL = os.getenv("GROQ_TAILORING_MODEL", "qwen/qwen3.8-27b")


