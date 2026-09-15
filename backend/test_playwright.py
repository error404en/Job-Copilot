from app.services.playwright_scraper import scrape_dynamic_page

if __name__ == "__main__":
    url = "https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers"
    print(f"Testing playwright on {url}")
    text = scrape_dynamic_page(url)
    print(f"Extracted length: {len(text)}")
    print(f"Sample:\n{text[:500]}")
