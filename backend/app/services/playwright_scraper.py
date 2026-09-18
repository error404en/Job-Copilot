from playwright.sync_api import sync_playwright
import time
from app.utils.security import validate_safe_url

def scrape_dynamic_page(url: str) -> str:
    """
    Navigates to a URL using a headless browser, waits for JS frameworks
    like Workday to fully render, and extracts the visible text.
    """
    text_content = ""
    
    # We use sync_playwright since the calling functions are synchronous
    try:
        validate_safe_url(url)
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            # Mask as a real user to avoid basic bot blocks
            page.set_extra_http_headers({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })
            
            print(f"[Playwright] Navigating to {url}...")
            # Navigate and wait for network idle (critical for Workday/SPA)
            try:
                page.goto(url, wait_until="networkidle", timeout=15000)
            except Exception as e:
                print(f"[Playwright] timeout on networkidle, continuing anyway: {e}")
            
            # Additional small wait just in case of delayed renders
            time.sleep(2)
            
            # Extract visible text instead of HTML to save LLM context window
            text_content = page.evaluate("document.body.innerText")
            
            browser.close()
    except Exception as e:
        print(f"[Playwright] Error scraping {url}: {repr(e)}")
        
    return text_content
