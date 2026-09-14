from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from app.middleware.auth import get_current_user

router = APIRouter()

CURATED_COMPANIES = [
    {
        "id": "barclays",
        "name": "Barclays",
        "industry": "Banking & Fintech",
        "badge": "🏦 Global Investment Bank",
        "locations": ["Pune", "Noida", "Chennai", "Mumbai"],
        "careers_url": "https://search.jobs.barclays/",
        "search_query": "Barclays India careers jobs",
        "compensation_highlight": "Analyst: ₹19.66L CTC (Base ₹16.8L) | Associate: ₹27.06L | Sr Associate: ₹39.64L",
        "fresher_friendly": True,
        "description": "British multinational universal bank. Major tech and operations centers in Pune and Noida hiring Analysts and Associates for cloud, API, and algorithmic trading systems.",
        "verified_levels": [
            {"role": "Analyst (502 / BA3)", "base": "₹16.8L", "bonus": "₹2.86L", "ctc": "₹19.66L"},
            {"role": "Associate (601 / BA4)", "base": "₹24.34L", "bonus": "₹2.72L", "ctc": "₹27.06L"},
            {"role": "Senior Associate (602)", "base": "₹36.9L", "bonus": "₹2.74L", "ctc": "₹39.64L"}
        ]
    },
    {
        "id": "hsbc",
        "name": "HSBC",
        "industry": "Banking & Fintech",
        "badge": "🏦 Multinational Financial Services",
        "locations": ["Bengaluru", "Mumbai", "Pune", "Hyderabad", "Delhi"],
        "careers_url": "https://mycareer.hsbc.com/",
        "search_query": "HSBC India technology careers associate",
        "compensation_highlight": "Associate (0-2 Yrs): ₹14.5L Base | ₹16.7L CTC | Trainee: ₹12L CTC",
        "fresher_friendly": True,
        "description": "Global banking leader with extensive Technology and Global Operations Hubs in India. Regular hiring alerts for Freshers and 0-2 years Associate roles across wealth and commercial banking tech.",
        "verified_levels": [
            {"role": "Graduate Analyst", "base": "₹10.5L", "bonus": "₹1.5L", "ctc": "₹12.0L"},
            {"role": "Associate (0-2 Yrs)", "base": "₹14.5L", "bonus": "₹2.2L", "ctc": "₹16.7L"},
            {"role": "Senior Software Engineer", "base": "₹22.0L", "bonus": "₹3.5L", "ctc": "₹25.5L"}
        ]
    },
    {
        "id": "google",
        "name": "Google",
        "industry": "Tech & Product",
        "badge": "⭐ Tier-1 Big Tech",
        "locations": ["Bengaluru", "Hyderabad", "Gurugram", "Mumbai"],
        "careers_url": "https://careers.google.com/jobs/results/?location=India",
        "search_query": "Google careers software engineer India",
        "compensation_highlight": "L3 SDE: ₹53.13L CTC (Base ₹21L, Stock ₹23L, Bonus ₹3.15L, Sign-on ₹3.25L)",
        "fresher_friendly": True,
        "description": "Global technology leader. Hiring for Google Cloud, Search, YouTube, Android, and Core infrastructure engineering teams across Bengaluru and Hyderabad.",
        "verified_levels": [
            {"role": "Software Engineer (L3 Entry)", "base": "₹21.0L", "bonus": "₹3.15L + ₹3.25L", "ctc": "₹53.13L"},
            {"role": "Software Engineer II (L4)", "base": "₹32.0L", "bonus": "₹4.8L + ₹35L stock", "ctc": "₹71.8L"},
            {"role": "Senior Software Engineer (L5)", "base_pay": "₹48.0L", "bonus": "₹7.2L + ₹55L stock", "ctc": "₹1.10Cr"}
        ]
    },
    {
        "id": "hcltech",
        "name": "HCLTech",
        "industry": "IT Services & Consulting",
        "badge": "💻 Global IT & Engineering",
        "locations": ["Pan India", "Noida", "Bengaluru", "Chennai", "Hyderabad", "Pune", "Lucknow"],
        "careers_url": "https://www.hcltech.com/careers",
        "search_query": "HCLTech careers software engineer",
        "compensation_highlight": "Pan India Lateral / Product SDE: ₹12,00,600 CTC (Fixed ₹11.25L) | GET: ₹4.25L",
        "fresher_friendly": True,
        "description": "Global technology services and digital engineering powerhouse. Offers both pan-India IT solutions and specialized digital product engineering divisions.",
        "verified_levels": [
            {"role": "Graduate Engineer Trainee", "base": "₹3.5L", "bonus": "₹75K", "ctc": "₹4.25L"},
            {"role": "Software Engineer (Lateral / Tier 1)", "base": "₹4.5L + ₹6.75L Flexi", "bonus": "₹75.6K", "ctc": "₹12.0L"},
            {"role": "Senior Developer (3-5 Yrs)", "base": "₹8.5L", "bonus": "₹1.2L", "ctc": "₹16.5L"}
        ]
    },
    {
        "id": "jpmorgan",
        "name": "JPMorgan Chase",
        "industry": "Banking & Fintech",
        "badge": "🏦 Premier Global Bank",
        "locations": ["Bengaluru", "Mumbai", "Hyderabad"],
        "careers_url": "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001",
        "search_query": "JPMorgan Chase software engineer careers India",
        "compensation_highlight": "Software Engineer (601): ₹19.5L CTC (Base ₹16.5L) | Associate (602): ₹30.5L",
        "fresher_friendly": True,
        "description": "World's leading investment and commercial bank. Massive engineering presence developing high-frequency trading platforms, risk systems, and payment infrastructure.",
        "verified_levels": [
            {"role": "Software Engineer Analyst (601)", "base": "₹16.5L", "bonus": "₹3.0L", "ctc": "₹19.5L"},
            {"role": "Associate (602)", "base": "₹26.0L", "bonus": "₹4.5L", "ctc": "₹30.5L"}
        ]
    },
    {
        "id": "microsoft",
        "name": "Microsoft",
        "industry": "Tech & Product",
        "badge": "⭐ Tier-1 Big Tech",
        "locations": ["Bengaluru", "Hyderabad", "Noida"],
        "careers_url": "https://careers.microsoft.com/v2/global/en/home.html",
        "search_query": "Microsoft careers India software engineer",
        "compensation_highlight": "SDE-1 (L59/60): ₹45L - ₹50L CTC (Base ₹18L - ₹20L, Stock $30K USD, Bonus ₹3L)",
        "fresher_friendly": True,
        "description": "Pioneer in operating systems, cloud (Azure), enterprise AI, and developer tools. Active fresher and experienced hiring across Hyderabad IDC and Bengaluru.",
        "verified_levels": [
            {"role": "Software Engineer (L59/60)", "base": "₹19.0L", "bonus": "₹3.0L + stock", "ctc": "₹48.0L"},
            {"role": "Software Engineer II (L61/62)", "base": "₹28.0L", "bonus": "₹5.0L + stock", "ctc": "₹68.0L"}
        ]
    },
    {
        "id": "amazon",
        "name": "Amazon",
        "industry": "Tech & Product",
        "badge": "⭐ Tier-1 Big Tech",
        "locations": ["Bengaluru", "Hyderabad", "Chennai", "Delhi / NCR", "Pune"],
        "careers_url": "https://www.amazon.jobs/en/locations/india",
        "search_query": "Amazon jobs software development engineer India",
        "compensation_highlight": "SDE-1: ₹44L CTC (Base ₹18.5L, Signing Bonus ₹9.5L/yr, RSUs)",
        "fresher_friendly": True,
        "description": "E-commerce and AWS cloud infrastructure leader. Extensive SDE, frontend, backend, and data roles across multiple Indian campuses.",
        "verified_levels": [
            {"role": "SDE I (L4)", "base": "₹18.5L", "bonus": "₹9.5L Sign-on", "ctc": "₹44.0L"},
            {"role": "SDE II (L5)", "base": "₹34.0L", "bonus": "₹12.0L + RSUs", "ctc": "₹75.0L"}
        ]
    },
    {
        "id": "goldmansachs",
        "name": "Goldman Sachs",
        "industry": "Banking & Fintech",
        "badge": "🏦 Global Investment Bank",
        "locations": ["Bengaluru", "Hyderabad"],
        "careers_url": "https://www.goldmansachs.com/careers/index.html",
        "search_query": "Goldman Sachs engineering careers India",
        "compensation_highlight": "Analyst (New Grad): ₹24L - ₹28L CTC (Base ₹20L - ₹22L, Bonus ₹4L - ₹6L)",
        "fresher_friendly": True,
        "description": "Elite financial institution. The Bengaluru and Hyderabad engineering teams build core algorithmic engines, market analytics, and low-latency exchange interfaces.",
        "verified_levels": [
            {"role": "Engineering Analyst", "base": "₹21.0L", "bonus": "₹5.0L", "ctc": "₹26.0L"},
            {"role": "Associate", "base": "₹32.0L", "bonus": "₹8.0L", "ctc": "₹40.0L"}
        ]
    },
    {
        "id": "razorpay",
        "name": "Razorpay",
        "industry": "Tech & Product",
        "badge": "🦄 Indian Fintech Unicorn",
        "locations": ["Bengaluru", "Mumbai", "Delhi / NCR", "Remote"],
        "careers_url": "https://jobs.lever.co/razorpay",
        "search_query": "Razorpay careers software engineer",
        "compensation_highlight": "SDE-1: ₹22L - ₹28L CTC (Base ₹16L - ₹20L + ESOPs) | SDE-2: ₹35L - ₹48L",
        "fresher_friendly": True,
        "description": "India's premier full-stack financial solutions and payment gateway platform. Fast-moving engineering team known for high engineering standards and culture.",
        "verified_levels": [
            {"role": "Software Engineer I", "base": "₹18.0L", "bonus": "₹2.0L + ESOPs", "ctc": "₹24.0L"},
            {"role": "Software Engineer II", "base": "₹28.0L", "bonus": "₹4.0L + ESOPs", "ctc": "₹40.0L"}
        ]
    },
    {
        "id": "swiggy",
        "name": "Swiggy",
        "industry": "Tech & Product",
        "badge": "🦄 Quick Commerce & Consumer Tech",
        "locations": ["Bengaluru", "Hyderabad", "Delhi / NCR", "Remote"],
        "careers_url": "https://careers.swiggy.com/",
        "search_query": "Swiggy careers software engineer",
        "compensation_highlight": "SDE-1: ₹22L - ₹27L CTC | SDE-2: ₹38L - ₹52L CTC",
        "fresher_friendly": True,
        "description": "Hyperlocal on-demand convenience and quick-commerce pioneer. Complex logistics algorithms, high-throughput backend services, and remote-first engineering culture.",
        "verified_levels": [
            {"role": "Software Development Engineer I", "base": "₹18.0L", "bonus": "₹2.0L + ESOPs", "ctc": "₹25.0L"},
            {"role": "Software Development Engineer II", "base": "₹29.0L", "bonus": "₹4.0L + ESOPs", "ctc": "₹42.0L"}
        ]
    },
    {
        "id": "morganstanley",
        "name": "Morgan Stanley",
        "industry": "Banking & Fintech",
        "badge": "🏦 Global Investment Bank",
        "locations": ["Mumbai", "Bengaluru"],
        "careers_url": "https://morganstanley.tal.net/vx/lang-en-GB/mobile-0/appcentre-1/brand-2/xf-4fa9b47e24a8/candidate",
        "search_query": "Morgan Stanley technology careers India",
        "compensation_highlight": "Technology Analyst: ₹20L - ₹24L CTC (Base ₹16L - ₹18L)",
        "fresher_friendly": True,
        "description": "Global financial services firm. Engineering offices in Mumbai and Bengaluru developing institutional trading, asset management, and risk computation platforms.",
        "verified_levels": [
            {"role": "Technology Analyst", "base": "₹17.0L", "bonus": "₹3.5L", "ctc": "₹20.5L"},
            {"role": "Senior Associate", "base": "₹27.0L", "bonus": "₹5.0L", "ctc": "₹32.0L"}
        ]
    },
    {
        "id": "tcs",
        "name": "Tata Consultancy Services (TCS)",
        "industry": "IT Services & Consulting",
        "badge": "💻 Enterprise IT Pioneer",
        "locations": ["Pan India", "Mumbai", "Bengaluru", "Delhi / NCR", "Hyderabad", "Pune", "Chennai", "Kolkata"],
        "careers_url": "https://www.tcs.com/careers",
        "search_query": "TCS digital prime careers software engineer",
        "compensation_highlight": "TCS Prime: ₹9.0L - ₹11.5L CTC | TCS Digital: ₹7.0L - ₹8.5L CTC | Ninja: ₹3.6L",
        "fresher_friendly": True,
        "description": "India's largest IT company. Offers differentiated cadres for top engineers: TCS Prime (₹9L-₹11.5L) and TCS Digital (₹7L-₹8.5L) working on GenAI and cloud solutions.",
        "verified_levels": [
            {"role": "TCS Ninja", "base": "₹3.36L", "bonus": "₹24K", "ctc": "₹3.6L"},
            {"role": "TCS Digital", "base": "₹6.5L", "bonus": "₹50K", "ctc": "₹7.2L"},
            {"role": "TCS Prime / Innovator", "base": "₹9.5L", "bonus": "₹1.5L", "ctc": "₹11.0L"}
        ]
    }
]

@router.get("")
def list_target_companies(
    location: Optional[str] = Query(None, description="Filter by city/location"),
    industry: Optional[str] = Query(None, description="Filter by industry sector"),
    fresher_only: Optional[bool] = Query(None, description="Filter to fresher-friendly companies"),
    user_id: str = Depends(get_current_user)
):
    """
    Returns curated list of high-value companies to apply to,
    with place filters, verified CTC breakdowns, and direct careers links.
    """
    results = CURATED_COMPANIES

    if location and location.lower() != "all":
        loc_clean = location.lower().strip()
        results = [
            c for c in results
            if any(loc_clean in l.lower() for l in c["locations"]) or "pan india" in [l.lower() for l in c["locations"]]
        ]

    if industry and industry.lower() != "all":
        ind_clean = industry.lower().strip()
        results = [c for c in results if ind_clean in c["industry"].lower()]

    if fresher_only is True:
        results = [c for c in results if c["fresher_friendly"]]

    return results
