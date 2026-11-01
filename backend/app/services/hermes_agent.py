import asyncio
import gc
import logging
from typing import Optional
from playwright.async_api import async_playwright
from app.utils.security import validate_safe_url

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def run_hermes_apply(url: str, job_id: str, profile_data: Optional[dict] = None):
    """
    Prepares the Copilot Auto-Fill packet and, if ENABLE_PLAYWRIGHT=true, spins up a
    Playwright browser to pre-populate ATS form fields using the user's real profile data.
    """
    import os
    p_data = profile_data or {}
    enable_playwright = os.getenv("ENABLE_PLAYWRIGHT", "false").lower() in ("true", "1", "yes")
    if not enable_playwright:
        logger.info("[Hermes] Returning Live Browser Auto-Fill Kit (ENABLE_PLAYWRIGHT=false).")
        return {
            "status": "ready",
            "mode": "browser_kit",
            "message": "Copilot Auto-Fill Kit ready! Launch the official application portal and use 1-Click Auto-Fill.",
            "autofill": p_data,
        }

    logger.info(f"Hermes Agent starting auto-apply for job {job_id} at {url}")
    browser = None
    context = None
    page = None

    try:
        validate_safe_url(url)
        async with async_playwright() as p:
            chromium_args = [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--single-process",
                "--no-zygote",
                "--disable-extensions",
                "--js-flags=--max-old-space-size=128"
            ]
            browser = await p.chromium.launch(headless=True, args=chromium_args)
            context = await browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            page = await context.new_page()

            async def _filter_assets(route):
                if route.request.resource_type in ["image", "media", "font"]:
                    await route.abort()
                else:
                    await route.continue_()

            try:
                await page.route("**/*", _filter_assets)
            except Exception:
                pass
            
            logger.info("Navigating to URL...")
            validate_safe_url(url)
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            await page.wait_for_timeout(2000)
            
            logger.info("Attempting to find and fill form fields...")
            filled_fields = []

            if p_data.get("first_name"):
                first_name_input = page.locator('input[name*="first_name" i], input[name*="FirstName" i], input[id*="first_name" i]')
                if await first_name_input.count() > 0:
                    await first_name_input.first.fill(p_data["first_name"])
                    filled_fields.append("first_name")

            if p_data.get("last_name"):
                last_name_input = page.locator('input[name*="last_name" i], input[name*="LastName" i], input[id*="last_name" i]')
                if await last_name_input.count() > 0:
                    await last_name_input.first.fill(p_data["last_name"])
                    filled_fields.append("last_name")

            if p_data.get("full_name"):
                full_name_input = page.locator('input[name="name" i], input[name*="full_name" i]')
                if await full_name_input.count() > 0:
                    await full_name_input.first.fill(p_data["full_name"])
                    filled_fields.append("full_name")

            if p_data.get("email"):
                email_input = page.locator('input[type="email"], input[name*="email" i], input[id*="email" i]')
                if await email_input.count() > 0:
                    await email_input.first.fill(p_data["email"])
                    filled_fields.append("email")

            if p_data.get("phone"):
                phone_input = page.locator('input[type="tel"], input[name*="phone" i], input[id*="phone" i]')
                if await phone_input.count() > 0:
                    await phone_input.first.fill(p_data["phone"])
                    filled_fields.append("phone")

            if p_data.get("linkedin_url"):
                linkedin_input = page.locator('input[name*="linkedin" i], input[id*="linkedin" i]')
                if await linkedin_input.count() > 0:
                    await linkedin_input.first.fill(p_data["linkedin_url"])
                    filled_fields.append("linkedin_url")

            if p_data.get("cover_letter"):
                cl_input = page.locator('textarea[name*="cover" i], textarea[name*="comment" i], textarea[id*="cover" i]')
                if await cl_input.count() > 0:
                    await cl_input.first.fill(p_data["cover_letter"])
                    filled_fields.append("cover_letter")

            return {
                "status": "success",
                "mode": "playwright",
                "filled_fields": filled_fields,
                "message": f"Hermes verified and pre-filled {len(filled_fields)} field(s) on the application page.",
                "autofill": p_data,
            }
            
    except Exception as e:
        logger.error(f"Hermes Agent encountered an error: {str(e)}")
        return {
            "status": "ready",
            "mode": "browser_kit",
            "message": "Copilot Auto-Fill Kit prepared for browser execution.",
            "autofill": p_data,
        }
    finally:
        if page:
            try:
                await page.close()
            except Exception:
                pass
        if context:
            try:
                await context.close()
            except Exception:
                pass
        if browser:
            try:
                await browser.close()
            except Exception:
                pass
        gc.collect()
