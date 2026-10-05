import asyncio
import gc
import logging
from playwright.async_api import async_playwright
import sqlite3
from app.utils.security import validate_safe_url

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Basic user profile for auto-applying
USER_PROFILE = {
    "first_name": "Shreyas",
    "last_name": "Doe",
    "email": "shreyas@example.com",
    "phone": "555-010-9999",
    "linkedin": "https://linkedin.com/in/shreyas"
}

async def run_hermes_apply(url: str, job_id: str):
    """
    Spins up a headless browser, navigates to the job URL, and attempts to fill out 
    common ATS forms (like Greenhouse/Lever) with user profile data.
    """
    import os
    enable_playwright = os.getenv("ENABLE_PLAYWRIGHT", "false").lower() in ("true", "1", "yes")
    if not enable_playwright:
        logger.info("[Hermes] Playwright disabled (ENABLE_PLAYWRIGHT=false) to protect 512MB RAM server.")
        return {
            "status": "error",
            "message": "Headless browser auto-apply is disabled on 512MB memory servers to prevent container crashes. Use the JobCopilot Chrome Extension for zero-server-RAM instant autofill directly in your browser."
        }

    logger.info(f"Hermes Agent starting auto-apply for job {job_id} at {url}")
    browser = None
    context = None
    page = None

    try:
        validate_safe_url(url)
        async with async_playwright() as p:
            # Constrained Chromium flags to prevent Linux container OOM
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

            # Abort heavy assets (images, fonts, media)
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
            
            # Wait a bit for dynamic content / ATS forms to render
            await page.wait_for_timeout(2000)
            
            logger.info("Attempting to find and fill form fields...")
            
            # 1. Fill First Name
            first_name_input = page.locator('input[name*="first_name" i], input[name*="FirstName" i], input[id*="first_name" i]')
            if await first_name_input.count() > 0:
                await first_name_input.first.fill(USER_PROFILE["first_name"])
                logger.info("Filled First Name")

            # 2. Fill Last Name
            last_name_input = page.locator('input[name*="last_name" i], input[name*="LastName" i], input[id*="last_name" i]')
            if await last_name_input.count() > 0:
                await last_name_input.first.fill(USER_PROFILE["last_name"])
                logger.info("Filled Last Name")
                
            # 3. Fill Email
            email_input = page.locator('input[type="email"], input[name*="email" i], input[id*="email" i]')
            if await email_input.count() > 0:
                await email_input.first.fill(USER_PROFILE["email"])
                logger.info("Filled Email")

            # 4. Fill Phone
            phone_input = page.locator('input[type="tel"], input[name*="phone" i], input[id*="phone" i]')
            if await phone_input.count() > 0:
                await phone_input.first.fill(USER_PROFILE["phone"])
                logger.info("Filled Phone")

            # 5. LinkedIn
            linkedin_input = page.locator('input[name*="linkedin" i], input[id*="linkedin" i]')
            if await linkedin_input.count() > 0:
                await linkedin_input.first.fill(USER_PROFILE["linkedin"])
                logger.info("Filled LinkedIn")
            
            logger.info("Form filled successfully by Hermes.")
            
            return {"status": "success", "message": "Hermes successfully navigated and filled the application."}
            
    except Exception as e:
        logger.error(f"Hermes Agent encountered an error: {str(e)}")
        return {"status": "error", "message": str(e)}
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
