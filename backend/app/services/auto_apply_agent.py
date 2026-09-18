import json
import time
from typing import Optional
from playwright.sync_api import sync_playwright, TimeoutError
from app.services.llm_client import _try_groq_json, get_completion
from app.utils.security import validate_safe_url

class AutoApplyAgent:
    def __init__(self, user_profile: dict, resume_text: str):
        self.user_profile = user_profile
        self.resume_text = resume_text

    def _get_llm_action(self, html_snippet: str) -> dict:
        prompt = f"""
        You are an autonomous web-navigation agent named Hermes. Your goal is to fill out a job application form.
        You are looking at a simplified HTML snippet of the current page.
        
        USER PROFILE DATA TO USE:
        First Name: {self.user_profile.get("first_name", "")}
        Last Name: {self.user_profile.get("last_name", "")}
        Email: {self.user_profile.get("email", "")}
        Phone: {self.user_profile.get("phone", "")}
        LinkedIn: {self.user_profile.get("linkedin_url", "")}
        GitHub: {self.user_profile.get("github_url", "")}
        Portfolio: {self.user_profile.get("portfolio_url", "")}
        
        HTML SNIPPET:
        {html_snippet[:8000]}
        
        Decide your next action. You can only choose ONE action.
        Return ONLY a JSON object matching this schema:
        {{
            "action": "fill" | "click" | "upload" | "done" | "error",
            "selector": "CSS selector of the element (e.g. input[name='first_name'], button[type='submit'])",
            "value": "The text to type (if action is fill) or file path (if upload)",
            "reason": "Brief explanation of why you chose this action"
        }}
        """
        
        # We try to use Groq/Hermes for structured JSON
        try:
            raw = _try_groq_json(prompt)
            if not raw:
                # Fallback if Groq JSON fails
                raw = get_completion(prompt + "\nOUTPUT ONLY RAW JSON WITHOUT MARKDOWN FORMATTING.")
            
            raw = raw.strip()
            if raw.startswith("```json"):
                raw = raw[7:-3]
            elif raw.startswith("```"):
                raw = raw[3:-3]
                
            return json.loads(raw.strip())
        except Exception as e:
            print(f"[AutoApplyAgent] LLM failed to decide action: {e}")
            return {"action": "error", "reason": str(e)}

    def apply(self, url: str) -> dict:
        validate_safe_url(url)
        print(f"[AutoApplyAgent] Starting auto-apply for {url}")
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            try:
                validate_safe_url(url)
                page.goto(url, wait_until="networkidle", timeout=30000)
                
                steps_taken = 0
                max_steps = 15
                
                while steps_taken < max_steps:
                    # Clean the DOM slightly to fit in LLM context (remove scripts, svgs)
                    page.evaluate("""
                        document.querySelectorAll('script, style, svg, path, img, noscript').forEach(el => el.remove());
                    """)
                    
                    # Extract inputs and buttons specifically to help the LLM
                    html_snippet = page.evaluate("""
                        () => {
                            const interactables = Array.from(document.querySelectorAll('input, select, textarea, button, a'));
                            let summary = '';
                            interactables.forEach((el, index) => {
                                // Add a data-ai-id to make selection easier
                                el.setAttribute('data-ai-id', index);
                                let attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' ');
                                summary += `<${el.tagName.toLowerCase()} ${attrs}>${el.innerText}</${el.tagName.toLowerCase()}>\n`;
                            });
                            return summary;
                        }
                    """)
                    
                    action_data = self._get_llm_action(html_snippet)
                    print(f"[AutoApplyAgent] Step {steps_taken}: Action decided: {action_data}")
                    
                    action = action_data.get("action")
                    selector = action_data.get("selector")
                    value = action_data.get("value")
                    
                    if action == "done":
                        print("[AutoApplyAgent] LLM determined application is complete.")
                        return {"status": "success", "message": "Successfully submitted application", "steps": steps_taken}
                    elif action == "error":
                        return {"status": "error", "message": action_data.get("reason", "Unknown error")}
                        
                    if not selector:
                        steps_taken += 1
                        continue
                        
                    try:
                        # Find the element by the LLM's chosen selector
                        element = page.locator(selector).first
                        
                        if action == "fill":
                            element.fill(value)
                        elif action == "click":
                            element.click()
                        elif action == "upload":
                            # Note: Actually uploading a file requires writing a temp file first.
                            # For simplicity, if we hit an upload, we just simulate or fail gracefully.
                            print(f"[AutoApplyAgent] Requested upload on {selector}, skipping for safety.")
                            
                        # Wait a moment for UI to update
                        page.wait_for_timeout(1000)
                        
                    except TimeoutError:
                        print(f"[AutoApplyAgent] Timeout interacting with {selector}")
                    except Exception as e:
                        print(f"[AutoApplyAgent] Failed to interact with {selector}: {e}")
                        
                    steps_taken += 1
                    
                return {"status": "error", "message": f"Hit maximum steps ({max_steps}) without finishing."}
                
            except Exception as e:
                print(f"[AutoApplyAgent] Fatal error: {e}")
                return {"status": "error", "message": str(e)}
            finally:
                browser.close()
