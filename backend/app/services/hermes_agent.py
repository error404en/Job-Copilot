import asyncio
import logging
from playwright.async_api import async_playwright
import sqlite3

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
    logger.info(f"Hermes Agent starting auto-apply for job {job_id} at {url}")
    
    try:
        async with async_playwright() as p:
            # Use chromium, headless for background processing
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            page = await context.new_page()
            
            logger.info("Navigating to URL...")
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            
            # Wait a bit for dynamic content / ATS forms to render
            await page.wait_for_timeout(3000)
            
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
            
            # (In a full implementation, we'd upload a resume here)
            # resume_input = page.locator('input[type="file"]')
            # if await resume_input.count() > 0:
            #     await resume_input.first.set_input_files("resume.pdf")

            logger.info("Form filled successfully by Hermes.")
            
            # We will NOT click submit automatically during testing to avoid spamming real companies.
            # await page.click('button[type="submit"], input[type="submit"]')
            
            await browser.close()
            
            return {"status": "success", "message": "Hermes successfully navigated and filled the application."}
            
    except Exception as e:
        logger.error(f"Hermes Agent encountered an error: {str(e)}")
        return {"status": "error", "message": str(e)}
