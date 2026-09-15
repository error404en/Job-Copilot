import asyncio
from app.services.hermes_agent import run_hermes_apply

async def main():
    # Use a dummy test URL with a form
    url = "https://www.w3schools.com/html/html_forms.asp"
    res = await run_hermes_apply(url, "dummy_job_id")
    print("Result:", res)

if __name__ == "__main__":
    asyncio.run(main())
