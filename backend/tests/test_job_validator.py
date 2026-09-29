import pytest
from app.services.job_validator import (
    validate_job_url,
    validate_role_title,
    is_valid_job_posting
)

def test_validate_job_url_blocked_domains():
    blocked = [
        "https://en.m.wikipedia.org/wiki/Park",
        "https://app.netflix.com/signup",
        "https://my.tv.sohu.com/pl/9745132/",
        "https://www.zhihu.com/question/2047442402122495550",
        "https://jingyan.baidu.com/article/5552ef4715f8dd108efbc902.html",
        "https://www.nps.gov/findapark/index.htm",
        "https://www.scribd.com/document/944020655/MS-Brochure-IITP",
        "https://www.reddit.com/r/Btechtards/comments/123",
        "https://www.facebook.com/itsedugroup/posts/123",
    ]
    for url in blocked:
        valid, reason = validate_job_url(url)
        assert valid is False, f"Expected {url} to be blocked, but was valid"

def test_validate_job_url_aggregator_homepages_and_searches():
    invalid_aggregators = [
        "https://www.linkedin.com/jobs/",
        "https://www.linkedin.com/jobs/search",
        "https://www.linkedin.com/posts/person-hiring-123",
        "https://www.linkedin.com/company/anthropicresearch/jobs",
        "https://www.linkedin.com/jobs/third-party-risk-jobs",
        "https://in.indeed.com/",
        "https://in.indeed.com/?from=gnav-homepage",
        "https://www.indeed.com/q-Third-Party-Risk-Analyst-jobs.html",
        "https://www.naukri.com/maini-precision-technology-limited-jobs-in-jk-jk",
        "https://www.naukri.com/jobs-in-delhi",
    ]
    for url in invalid_aggregators:
        valid, reason = validate_job_url(url)
        assert valid is False, f"Expected {url} to be invalid, but was valid: {reason}"

def test_validate_job_url_valid():
    valid_urls = [
        "https://boards.greenhouse.io/stripe/jobs/123456",
        "https://jobs.lever.co/anthropic/abcdef",
        "https://applebank.wd5.myworkdayjobs.com/en-US/applebankcareers/job/123",
        "https://jobs.smartrecruiters.com/Zomato1/104244178",
        "https://search.jobs.barclays/job/noida/ai-engineer/13015/101",
        "https://www.linkedin.com/jobs/view/3920194820",
        "https://www.naukri.com/job-listings-software-engineer-123456",
        "Screenshot Upload"
    ]
    for url in valid_urls:
        valid, reason = validate_job_url(url)
        assert valid is True, f"Expected {url} to be valid, but got: {reason}"

def test_validate_role_title_blocked():
    blocked_titles = [
        "Not Specified",
        "Park",
        "Find A Park",
        "Unspecified Role",
        "Unknown Role",
        "Entry-Level Role",
        "Netflix Media Center",
        "Netflix Help Center",
        "Plastics Product Manufacturing",
        "911急救-动物视频-搜狐视频",
        "急救生活 集锦",
        "",
        "ab"
    ]
    for title in blocked_titles:
        valid, reason = validate_role_title(title)
        assert valid is False, f"Expected title '{title}' to be invalid, but was valid"

def test_validate_role_title_valid():
    valid_titles = [
        "Software Engineer",
        "Backend Developer",
        "AI / GenAI Engineer",
        "Data Analyst",
        "Contact Center Quality Assurance Analyst",
        "Solutions Architect",
        "Full Stack Engineer"
    ]
    for title in valid_titles:
        valid, reason = validate_role_title(title)
        assert valid is True, f"Expected title '{title}' to be valid, but got: {reason}"

def test_is_valid_job_posting_combined():
    # False posting from DuckDuckGo/Wikipedia
    valid, _ = is_valid_job_posting(
        role_title="Park",
        url="https://en.m.wikipedia.org/wiki/Park",
        company_name="Ultimate Flexipack",
        raw_jd="A park is an area of natural..."
    )
    assert valid is False

    # Legitimate job posting
    valid, _ = is_valid_job_posting(
        role_title="Senior Backend Engineer",
        url="https://jobs.lever.co/company/abc-123",
        company_name="Acme",
        raw_jd="Looking for Senior Backend Engineer with Python and SQL."
    )
    assert valid is True
