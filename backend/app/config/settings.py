import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# gemini-2.0-flash has good quota on the free tier
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
# Vision model same default
GEMINI_VISION_MODEL = os.getenv("GEMINI_VISION_MODEL", "gemini-2.0-flash")
# compound-beta is the correct Groq model ID (not "groq/compound")
GROQ_MODEL = os.getenv("GROQ_MODEL", "compound-beta")

