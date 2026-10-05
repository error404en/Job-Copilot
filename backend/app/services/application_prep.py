from app.services.llm_client import get_completion

ANTI_AI_PROMPT = """
You are an expert at writing highly effective, non-robotic cold emails and cover letters for software engineering roles at startups.
Your goal is to write a short, punchy message to a founder or hiring manager.

RULES (CRITICAL):
1. THE BANNED WORD LIST: You MUST NOT use ANY of the following words or phrases under any circumstances:
   - delve, thrilled, leverage, testament, seamless, foster, hone, eager, synergy, profound interest, navigate, pivotal, dynamic, landscape, robust.
2. TONE: Write this like a Slack message or a cold email from one engineer to another. Do NOT use "Dear Hiring Manager," or "To whom it may concern," or "I hope this finds you well." Start directly with "Hi team," or a direct hook.
3. THE PROOF RULE: You MUST extract at least one concrete metric or specific project from the resume provided to prove competence. Do not make vague claims like "I am a hard worker" or "I am highly motivated."
4. THE SNIPER HOOK: Connect a specific tech requirement from the JD to the user's past experience.
5. LENGTH: MAXIMUM 150 words. 3-4 sentences total. Be extremely concise. Recruiters skim.
6. CLOSING: Close with a low-friction call to action, like "Would love to chat for 10 mins about your engineering roadmap." and sign off with "Best,".
"""

def generate_cover_letter(raw_jd: str, resume_summary: str, use_groq: bool = False) -> str:
    # Use f-strings directly to prevent .format() from crashing on stray { } in scraped raw_jd
    prompt = f"{ANTI_AI_PROMPT}\n\nINPUT DATA:\nHere is the Job Description:\n{raw_jd}\n\nHere is the Candidate's Resume Summary:\n{resume_summary}\n\nOUTPUT INSTRUCTIONS:\nOutput ONLY the final text of the email. Do not include any explanations, preambles, or formatting placeholders like '[Your Name]'. Just the raw message."
    
    # We will use get_completion from llm_client, which handles Gemini or Groq
    try:
        response_text = get_completion(prompt, use_groq=use_groq)
        return response_text.strip()
    except Exception as e:
        print(f"[CoverLetter] Error generating cover letter: {str(e)}")
        import traceback
        traceback.print_exc()
        return f"Error generating cover letter. Please try again. ({str(e)})"

DM_PROMPT = """
You are an expert at writing non-robotic, highly technical cold direct messages (DMs) to an engineer or founder.
Your goal is to write a short, punchy DM (under 50 words).

RULES (CRITICAL):
1. THE BANNED WORD LIST: You MUST NOT use ANY of the following words or phrases: delve, thrilled, leverage, testament, seamless, foster, hone, eager, synergy, profound interest, navigate, pivotal, dynamic, landscape, robust.
2. TONE: Engineer-to-engineer or builder-to-founder. No corporate fluff. 
3. THE PROOF RULE: You MUST identify the single MOST RELEVANT project from the candidate's resume for the given job description. 
4. THE FORMAT (approximate): 
Hi [Name],
Saw [Company] is hiring for [Role] / building [Tech/Problem]. I recently built [Project Name] (🔗 [Project Link]) where I [1-line result/metric]. 
Would love to chat about your engineering roadmap if you're open to it. 
Best,
[Candidate Name]
5. Only return the raw text of the message. Do NOT include preambles. Extract a real project link from the candidate's resume summary.
"""

def generate_founder_dm(raw_jd: str, resume_summary: str, use_groq: bool = False) -> str:
    prompt = f"{DM_PROMPT}\n\nJOB DESCRIPTION:\n{raw_jd}\n\nCANDIDATE RESUME:\n{resume_summary}\n\nOutput only the raw DM."
    try:
        response_text = get_completion(prompt, use_groq=use_groq)
        return response_text.strip()
    except Exception as e:
        return f"Error generating DM: {str(e)}"

