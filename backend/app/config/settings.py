import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# gemini-3.6-flash has much higher free-tier quota than gemini-2.5-flash (20 RPD limit)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
# Vision model same default
GEMINI_VISION_MODEL = os.getenv("GEMINI_VISION_MODEL", "gemini-3.6-flash")
# groq/compound is universally available on Groq free tier
GROQ_MODEL = os.getenv("GROQ_MODEL", "groq/compound")
