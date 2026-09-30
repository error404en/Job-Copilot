import gc
import os
import re
import time
import requests
from bs4 import BeautifulSoup
from app.utils.security import validate_safe_url

# Standard browser headers to avoid basic bot blocks on HTTP requests
_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "DNT": "1",
    "Upgrade-Insecure-Requests": "1"
}

_JS_BLOCKER_PHRASES = [
    "please enable javascript",
    "javascript is required",
    "javascript is disabled",
    "turn on javascript",
    "browser does not support javascript",
    "you need to enable javascript to run this app"
]

def _scrape_fast_http(url: str) -> str:
    """
    Lightweight, sub-second HTML scraper using requests and BeautifulSoup.
    Consumes <5MB RAM (compared to ~400MB for Chromium), making it ideal
    for memory-constrained environments like Render's 512MB tier.
    """
    try:
        validate_safe_url(url)
        with requests.get(url, headers=_BROWSER_HEADERS, timeout=8, stream=False) as resp:
            if resp.status_code != 200 or not resp.content:
                return ""

            soup = BeautifulSoup(resp.content, "html.parser")

            # Extract structured JSON-LD data (many ATS portals embed JobPosting schemas)
            structured_parts = []
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    s_text = script.get_text()
                    if "JobPosting" in s_text or "title" in s_text:
                        structured_parts.append(s_text.strip())
                except Exception:
                    pass

            # Remove scripts, styles, headers, footers, and tracking elements
            for tag in soup(["script", "style", "noscript", "svg", "header", "footer", "nav", "aside", "form"]):
                tag.extract()

            body_text = soup.get_text(separator="\n", strip=True)

            # Collapse excess whitespace
            cleaned_text = re.sub(r'\n{3,}', '\n\n', body_text).strip()

            if structured_parts:
                cleaned_text = f"{cleaned_text}\n\n[Structured Job Schema]:\n" + "\n".join(structured_parts[:2])

            return cleaned_text
    except Exception as e:
        print(f"[FastScraper] Quick HTTP fetch failed for {url}: {e}")
        return ""

def scrape_dynamic_page(url: str) -> str:
    """
    Hybrid low-memory scraper:
    1. Attempts lightweight HTTP fetch first (<5MB RAM). If >= 250 characters of valid
       text is extracted and no JS blocker is present, returns immediately without launching Chromium.
    2. If dynamic rendering is strictly required AND ENABLE_PLAYWRIGHT is enabled:
       Launches Chromium in single-process mode with strict resource & memory caps (128MB max heap),
       blocks heavy media/images/fonts, and guarantees memory cleanup via gc.collect().
    """
    try:
        validate_safe_url(url)
    except Exception as e:
        print(f"[Scraper] Invalid URL {url}: {e}")
        return ""

    # STAGE 1: Try Fast HTTP First (Saves 400MB RAM)
    fast_text = _scrape_fast_http(url)
    if fast_text and len(fast_text) >= 250:
        lower_preview = fast_text[:1000].lower()
        if not any(phrase in lower_preview for phrase in _JS_BLOCKER_PHRASES):
            # Fast fetch was sufficient! Return immediately.
            return fast_text

    # STAGE 2: Gatekeeper for Playwright Headless Browser
    enable_playwright = os.getenv("ENABLE_PLAYWRIGHT", "true").lower() in ("true", "1", "yes")
    if not enable_playwright:
        print(f"[Scraper] Playwright browser disabled (ENABLE_PLAYWRIGHT=false). Returning fast HTTP fallback for {url}")
        return fast_text

    # STAGE 3: Low-Memory Chromium Execution
    print(f"[Scraper] Fast HTTP yielded sparse content ({len(fast_text)} chars). Launching constrained Chromium for {url}...")
    text_content = fast_text
    browser = None
    context = None
    page = None

    try:
        from playwright.sync_api import sync_playwright

        chromium_args = [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",      # Render containers have very limited /dev/shm; uses /tmp instead
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--single-process",            # Eliminates multi-process renderer overhead (~250MB RAM savings)
            "--no-zygote",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-default-apps",
            "--disable-sync",
            "--disable-translate",
            "--metrics-recording-only",
            "--mute-audio",
            "--no-first-run",
            "--safebrowsing-disable-auto-update",
            "--js-flags=--max-old-space-size=128",  # Caps V8 JavaScript engine heap to 128MB
        ]

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=chromium_args)
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=_BROWSER_HEADERS["User-Agent"]
            )
            page = context.new_page()

            # Abort heavy assets (images, fonts, stylesheets, media) to minimize memory & network
            def _filter_assets(route):
                if route.request.resource_type in ["image", "media", "font", "stylesheet"]:
                    route.abort()
                else:
                    route.continue_()

            try:
                page.route("**/*", _filter_assets)
            except Exception:
                pass

            try:
                page.goto(url, wait_until="domcontentloaded", timeout=12000)
            except Exception as nav_e:
                print(f"[Playwright] DOM load timeout on {url}: {nav_e}")

            time.sleep(1.5)
            extracted = page.evaluate("document.body.innerText")
            if extracted and len(extracted.strip()) > len(text_content):
                text_content = extracted.strip()

    except Exception as e:
        print(f"[Playwright] Error or missing browser binaries for {url}: {e}")
    finally:
        # Guarantees process cleanup to prevent zombie Chromium instances in cgroups
        if page:
            try:
                page.close()
            except Exception:
                pass
        if context:
            try:
                context.close()
            except Exception:
                pass
        if browser:
            try:
                browser.close()
            except Exception:
                pass
        # Immediate garbage collection to return memory to Linux allocator
        gc.collect()

    return text_content
