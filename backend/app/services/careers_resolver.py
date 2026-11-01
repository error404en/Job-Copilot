"""
Careers resolver: finds a company's *genuine* careers page / ATS board.

Design rules (why this module exists):
  * A careers URL is only accepted if it is hosted on ATS infrastructure
    (Greenhouse, Lever, Workday, ...) or on the company's OWN registrable domain.
  * Aggregators, job boards, directories, social networks, news, marketing / blog /
    pricing / landing pages are rejected - they mislead the user to promotional sites.
  * Anything that did not come from a hard-coded registry is verified LIVE
    (reachable, still on the official domain after redirects, looks like a careers
    page and not a homepage). LLM-generated "search results" therefore cannot
    inject hallucinated URLs.
  * When nothing can be verified we return None. We NEVER guess ``www.<name>.com``.
"""
import re
import concurrent.futures
import urllib.parse
from typing import Dict, Iterable, List, Optional, Tuple

import requests

from app.services.job_validator import BLOCKED_DOMAINS
from app.utils.security import validate_safe_url

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
}

# Hosts of real Applicant Tracking Systems. Pages here are employer-owned job boards.
ATS_HOSTS = {
    "greenhouse.io", "lever.co", "ashbyhq.com", "workdayjobs.com", "myworkdayjobs.com",
    "smartrecruiters.com", "icims.com", "breezy.hr", "workable.com", "recruitee.com",
    "jobvite.com", "pinpointhq.com", "keka.com", "oraclecloud.com", "successfactors.com",
    "taleo.net", "eightfold.ai", "phenompeople.com", "rippling-ats.com",
    "yello.co", "mynexthire.com", "joinsuperset.com", "gem.com",
    "zohorecruit.com", "zohorecruit.in", "darwinbox.in", "freshteam.com",
}

# Never an official careers portal: job boards, salary / review sites, social, shorteners,
# search engines, code hosts, gaming / media. Combined with job_validator.BLOCKED_DOMAINS.
_EXTRA_NON_OFFICIAL = {
    "indeed.com", "indeed.co.in", "naukri.com", "linkedin.com", "lnkd.in", "monster.com",
    "monsterindia.com", "simplyhired.com", "ziprecruiter.com", "careerbuilder.com",
    "timesjobs.com", "internshala.com", "unstop.com", "geeksforgeeks.org", "github.com",
    "stackoverflow.com", "wellfound.com", "angel.co", "instahyre.com", "cutshort.io",
    "hirist.tech", "hirist.com", "iimjobs.com", "payscale.com", "levels.fyi", "comparably.com",
    "teamblind.com", "trustpilot.com", "g2.com", "capterra.com", "steamcommunity.com",
    "steampowered.com", "google.com", "bing.com", "duckduckgo.com", "linktr.ee", "bit.ly",
    "tinyurl.com", "forms.gle", "t.co", "play.google.com", "apps.apple.com", "fandom.com",
    "wordpress.com", "blogspot.com", "wixsite.com", "weebly.com", "tumblr.com", "glassdoor.com",
    "himalayas.app", "remote.co", "weworkremotely.com", "builtin.com", "otta.com",
    "ycombinator.com", "justjobs.com", "jobrapido.com", "learn4good.com", "adzuna.in",
    "hirect.in", "apna.co", "workindia.in", "jobsora.com", "cybermatrix.com",
}

_NON_OFFICIAL = set(BLOCKED_DOMAINS) | _EXTRA_NON_OFFICIAL

# Marketing / editorial / commercial paths - not a careers page.
_PROMO_PATH_RE = re.compile(
    r"/(blog|news|newsroom|press|article|articles|insights|stories|story|events?|webinars?|"
    r"pricing|products?|solutions?|ads?|promo|offers?|campaigns?|lp|landing|resources?|"
    r"case-stud(?:y|ies)|customers?|partners?|compare|alternatives?)(/|$)",
    re.I,
)

# Real careers pages carry one of these words in host or path.
_CAREER_PATH_RE = re.compile(
    r"(?<![a-z])(careers?|jobs?|join|join-us|hiring|openings?|vacanc(?:y|ies)|"
    r"work-with-us|workwithus|work-at-[a-z0-9]+|opportunit(?:y|ies))(?![a-z])",
    re.I,
)
_CAREER_VOCAB_RE = re.compile(r"career|job|opening|vacanc|hiring|apply|join our|join us", re.I)

_DOC_EXT = (".pdf", ".doc", ".docx", ".ppt", ".pptx", ".zip")

_CORP_SUFFIXES = {
    "pvt", "private", "ltd", "limited", "llp", "llc", "inc", "incorporated", "corp",
    "corporation", "co", "company", "plc", "gmbh", "technologies", "technology", "tech",
    "software", "solutions", "systems", "services", "labs", "india", "global", "group",
    "holdings", "the", "of", "and", "consulting", "consultancy", "limited",
}

# Words allowed to trail a registry key ("Google India", "Amazon Web Services").
_ALLOWED_TRAILING = _CORP_SUFFIXES | {
    "com", "net", "io", "ai", "in", "web", "analytics", "research", "bank", "cloud", "sciences", "life",
    "associates", "chase", "indian", "pune", "bengaluru", "bangalore", "hyderabad", "mumbai", "delhi",
}

# Alias -> registry key (only used if the target key exists in the registry being queried).
_REGISTRY_ALIASES = {
    "hcl": "hcltech", "hcltechnologies": "hcltech",
    "tataconsultancyservices": "tcs", "tataconsultancy": "tcs",
    "jpmorganchase": "jpmorgan", "jpmc": "jpmorgan",
    "goldman": "goldmansachs", "gs": "goldmansachs",
    "zs": "zsassociates", "zsassociates": "zsassociates",
    "zomato": "eternal", "blinkit": "eternal",
    "gcp": "google", "aws": "amazon",
    "ms": "microsoft", "morgan": "morganstanley",
    "amex": "americanexpress", "americanexpress": "americanexpress",
    "pricewaterhousecoopers": "pwc", "pwc": "pwc",
}

# Domain/brand aliases where the company's common name differs from its primary domain
_BRAND_DOMAIN_ALIASES = {
    "amex": {"americanexpress"},
    "americanexpress": {"amex"},
    "pwc": {"pricewaterhousecoopers"},
    "pricewaterhousecoopers": {"pwc"},
    "ey": {"ernstandyoung"},
    "ernstandyoung": {"ey"},
    "jpmc": {"jpmorgan", "jpmorganchase"},
    "amber": {"amberstudent"},
    "amberstudent": {"amber"},
}


# --------------------------------------------------------------------------
# Name / host helpers
# --------------------------------------------------------------------------
def _alnum_tokens(text: str) -> List[str]:
    return re.findall(r"[A-Za-z0-9]+", text or "")


def brand_tokens(company_name: str) -> List[str]:
    """Distinctive lower-case tokens of a company name (corporate suffixes removed)."""
    toks = _alnum_tokens(company_name)
    brand = [t.lower() for t in toks if t.lower() not in _CORP_SUFFIXES and len(t) >= 2]
    return brand or [t.lower() for t in toks]


def company_slug(company_name: str) -> str:
    return "".join(brand_tokens(company_name))


def _acronyms(company_name: str) -> set:
    """Upper-case tokens such as 'TCS' / 'HCL' plus initials of 3+ word names."""
    toks = _alnum_tokens(company_name)
    out = {t.lower() for t in toks if t.isupper() and 2 <= len(t) <= 5}
    if len(toks) >= 3:
        out.add("".join(t[0].lower() for t in toks))
    return out


def _host(url: str) -> str:
    try:
        h = (urllib.parse.urlparse(url).hostname or "").lower()
    except Exception:
        return ""
    return h[4:] if h.startswith("www.") else h


# Exact hosts of hand-curated, hard-coded careers portals (registry entries). These are
# trusted as official even when the domain doesn't resemble the company name
# (search.jobs.barclays, higher.gs.com, morganstanley.tal.net, ...).
_TRUSTED_HOSTS: Dict[str, set] = {}


def trust_urls(registry: Dict[str, str]) -> None:
    """registry: {company_key: careers_url}. Each host is trusted only for its own company."""
    for key, u in (registry or {}).items():
        h = _host(u)
        if h and not is_ats_host(h):
            _TRUSTED_HOSTS.setdefault(h, set()).add(key)


def _registrable_label(host: str) -> str:
    """'careers.google.com' -> 'google'; 'jobs.foo.co.in' -> 'foo'."""
    labels = [l for l in host.split(".") if l]
    if len(labels) < 2:
        return host
    if len(labels) >= 3 and labels[-1] and len(labels[-1]) == 2 and labels[-2] in {
        "co", "com", "org", "net", "gov", "ac", "edu"
    }:
        return labels[-3]
    return labels[-2]


def _host_in(host: str, domains: Iterable[str]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def is_ats_host(host: str) -> bool:
    return _host_in(host, ATS_HOSTS)


def is_non_official_host(host: str) -> bool:
    return _host_in(host, _NON_OFFICIAL)


def host_matches_company(host: str, company_name: str) -> bool:
    """True if the host's REGISTRABLE domain belongs to the company."""
    label = re.sub(r"[^a-z0-9]", "", _registrable_label(host))
    slug = company_slug(company_name)
    if not label or not slug:
        return False
    if label == slug:
        return True
    if label in _acronyms(company_name):
        return True
    variants = {slug + "careers", "careers" + slug, slug + "jobs", "jobs" + slug, slug + "hq", slug + "hire"}
    if label in variants:
        return True
    if label in _BRAND_DOMAIN_ALIASES.get(slug, set()):
        return True
    if slug in _BRAND_DOMAIN_ALIASES.get(label, set()):
        return True
    if len(slug) >= 5:
        if slug in label and len(label) <= len(slug) + 8:
            return True  # e.g. 'razorpay' in 'razorpaycareers'
        if len(label) >= 4 and slug.startswith(label):
            return True  # e.g. 'hcltech' <- 'hcl', 'goldmansachs' <- 'goldman'
    return False


def classify_careers_url(url: str, company_name: str) -> Tuple[bool, str]:
    """Static (no network) check. Returns (ok, kind) where kind in {'ats', 'official'} or a reject reason."""
    if not url or not isinstance(url, str):
        return False, "empty"
    url = url.strip()
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return False, "malformed"
    if parsed.scheme not in ("http", "https"):
        return False, "bad scheme"
    host = _host(url)
    if not host or "." not in host:
        return False, "bad host"
    path = (parsed.path or "").lower()
    if path.endswith(_DOC_EXT):
        return False, "document"
    if is_ats_host(host):
        return True, "ats"
    if host in _TRUSTED_HOSTS and match_registry_key(company_name, _TRUSTED_HOSTS[host]):
        return True, "official"

    official = host_matches_company(host, company_name)
    if is_non_official_host(host) and not (
        official and re.sub(r"[^a-z0-9]", "", _registrable_label(host)) == company_slug(company_name)
    ):
        return False, "aggregator/promotional domain"
    if not official:
        return False, "domain does not belong to company"
    if _PROMO_PATH_RE.search(path):
        return False, "promotional/editorial path"
    return True, "official"


_PROMO_ONLY_HOSTS = {
    "steamcommunity.com", "steampowered.com", "linktr.ee", "bit.ly", "tinyurl.com", "forms.gle",
    "t.co", "lnkd.in", "fandom.com", "play.google.com", "apps.apple.com", "payscale.com",
    "levels.fyi", "comparably.com", "teamblind.com", "trustpilot.com", "g2.com", "capterra.com",
    "geeksforgeeks.org", "stackoverflow.com",
}


def filter_search_results(results: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Drop spam / promotional / directory hosts from free-form web search results while keeping
    legitimate direct postings (job_validator already knows LinkedIn/Indeed/Naukri rules).
    """
    from app.services.job_validator import validate_job_url

    cleaned = []
    for r in results or []:
        href = r.get("href", "") if isinstance(r, dict) else ""
        host = _host(href)
        if not host or _host_in(host, _PROMO_ONLY_HOSTS):
            continue
        ok, _ = validate_job_url(href)
        if ok:
            cleaned.append(r)
    return cleaned


# --------------------------------------------------------------------------
# Strict registry matching (replaces `key in norm or norm in key`)
# --------------------------------------------------------------------------
def match_registry_key(company_name: str, keys: Iterable[str]) -> Optional[str]:
    """
    Match a user-entered company name to a registry key exactly (after normalisation),
    never by loose substring. 'Google India' -> 'google'; 'Invisalign' -/-> 'visa'.
    """
    keyset = set(keys)
    toks = [t.lower() for t in _alnum_tokens(company_name)]
    if not toks:
        return None
    for n in range(1, len(toks) + 1):
        cand = "".join(toks[:n])
        target = cand if cand in keyset else _REGISTRY_ALIASES.get(cand)
        if target and target in keyset:
            rest = toks[n:]
            if all(t in _ALLOWED_TRAILING or t == target or _REGISTRY_ALIASES.get(t) == target for t in rest):
                return target
    return None


# --------------------------------------------------------------------------
# Live verification
# --------------------------------------------------------------------------
_REACHABLE_BOT_BLOCKED = {401, 403, 405, 429, 999}


def verify_url_live(url: str, company_name: str, timeout: float = 4.0, require_brand: bool = False) -> Optional[str]:
    """
    Fetch the URL and confirm it is a real, reachable careers page on the company's
    official domain (or ATS). Returns the final URL after redirects, or None.
    """
    try:
        validate_safe_url(url)
    except Exception:
        return None
    try:
        with requests.get(url, headers=_HEADERS, timeout=timeout, allow_redirects=True, stream=True) as r:
            status = r.status_code
            final = r.url or url
            if status >= 400 and status not in _REACHABLE_BOT_BLOCKED:
                return None
            ok, kind = classify_careers_url(final, company_name)
            if not ok:
                return None
            f_host = _host(final)
            f_path = urllib.parse.urlparse(final).path or ""
            if kind != "ats" and f_path in ("", "/") and not _CAREER_PATH_RE.search(f_host):
                return None  # redirected to the commercial homepage
            if status < 400:
                ctype = (r.headers.get("content-type") or "").lower()
                if ctype and "html" not in ctype:
                    return None
                chunk = next(r.iter_content(65536), b"") or b""
                text = chunk.decode(r.encoding or "utf-8", "ignore").lower()
                if kind != "ats":
                    if text and not _CAREER_VOCAB_RE.search(text):
                        return None
                    if require_brand and not any(t in text for t in brand_tokens(company_name) if len(t) >= 3):
                        return None
            elif require_brand:
                return None
            return final
    except Exception:
        return None


def verify_careers_url(url: Optional[str], company_name: str) -> Optional[str]:
    """Static + live check for a single candidate. ATS-hosted URLs skip the page fetch."""
    if not url:
        return None
    ok, kind = classify_careers_url(url, company_name)
    if not ok:
        return None
    if kind == "ats":
        return url
    return verify_url_live(url, company_name)


_ATS_API = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{t}/jobs",
    "lever": "https://api.lever.co/v0/postings/{t}?mode=json&limit=1",
    "ashby": "https://api.ashbyhq.com/posting-api/job-board/{t}",
    "smartrecruiters": "https://api.smartrecruiters.com/v1/companies/{t}/postings?limit=1",
}


def verify_ats_token(system, token: str, timeout: float = 4.0) -> bool:
    """
    Confirm an ATS board exists. Only a *definitive* negative (404/410 or an empty
    SmartRecruiters directory) returns False; network trouble returns True so a
    flaky connection never throws away a good result. Workday tokens are parsed from
    real URLs and cannot be guessed, so they are trusted.
    """
    sys_name = getattr(system, "value", system)
    tpl = _ATS_API.get(str(sys_name))
    if not tpl or not token:
        return True
    url = tpl.format(t=urllib.parse.quote(token, safe=""))
    try:
        r = requests.get(url, headers=_HEADERS, timeout=timeout)
    except Exception:
        return True
    if r.status_code in (404, 410):
        return False
    if r.status_code >= 400:
        return True
    if sys_name == "smartrecruiters":
        try:
            return int(r.json().get("totalFound", 0)) > 0
        except Exception:
            return True
    return True


def token_matches_company(token: str, company_name: str) -> bool:
    """Guard against an LLM returning another company's ATS board."""
    t = re.sub(r"[^a-z0-9]", "", (token or "").lower())
    slug = company_slug(company_name)
    if len(t) < 3 or not slug:
        return False
    if slug in t or t in slug:
        return True
    return any(tok in t for tok in brand_tokens(company_name) if len(tok) >= 4)


# --------------------------------------------------------------------------
# Discovery
# --------------------------------------------------------------------------
def _dedupe(seq: Iterable[str]) -> List[str]:
    return list(dict.fromkeys(seq))


def _generated_candidates(root: str) -> List[str]:
    """Common careers locations for an already-verified official domain root."""
    p = urllib.parse.urlparse(root)
    host = _host(root)
    scheme = p.scheme or "https"
    return [
        f"{scheme}://{host}/careers",
        f"{scheme}://careers.{host}",
        f"{scheme}://{host}/jobs",
        f"{scheme}://jobs.{host}",
        f"{scheme}://{host}/company/careers",
        f"{scheme}://{host}/about/careers",
    ]


def _first_verified(candidates: List[str], company_name: str, require_brand: bool = False) -> Optional[str]:
    candidates = _dedupe(candidates)[:8]
    if not candidates:
        return None
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(lambda u: verify_url_live(u, company_name, require_brand=require_brand), candidates))
    for res in results:  # preserves priority order
        if res:
            return res
    return None


def pick_official_careers_url(company_name: str, results: List[Dict[str, str]]) -> Optional[str]:
    """Choose a verified official careers URL from raw search results (or None)."""
    ats, direct, roots = [], [], []
    brands = [t for t in brand_tokens(company_name) if len(t) >= 3]
    for r in results or []:
        href = (r.get("href") or "").strip() if isinstance(r, dict) else ""
        ok, kind = classify_careers_url(href, company_name)
        if not ok:
            continue
        if kind == "ats":
            # An ATS board is only attributed to this company if the board name or the
            # result text relates to it (or the result carries no text to judge by).
            snippet = f"{r.get('title', '')} {r.get('body', '')}".lower().strip()
            first_seg = urllib.parse.urlparse(href).path.strip("/").split("/")[0]
            related = (
                token_matches_company(first_seg, company_name)
                or token_matches_company(_host(href).split(".")[0], company_name)
                or not snippet
                or any(b in snippet for b in brands)
            )
            if related:
                ats.append(href)
            continue
        parsed = urllib.parse.urlparse(href)
        roots.append(f"{parsed.scheme}://{_host(href)}")
        if _CAREER_PATH_RE.search(_host(href) + (parsed.path or "")):
            direct.append(href)

    if ats:
        return ats[0]

    direct = sorted(_dedupe(direct), key=lambda u: len(urllib.parse.urlparse(u).path.strip("/").split("/")))
    candidates = direct[:4]
    for root in _dedupe(roots)[:2]:
        candidates += _generated_candidates(root)
    return _first_verified(candidates, company_name)


def _guess_official_candidates(company_name: str) -> List[str]:
    slug = company_slug(company_name)
    if len(slug) < 3:
        return []
    return [f"https://{slug}.com/careers", f"https://{slug}.in/careers", f"https://{slug}.io/careers",
            f"https://{slug}.ai/careers", f"https://careers.{slug}.com"]


def find_official_careers_url(company_name: str, search_fn=None, max_results: int = 8) -> Optional[str]:
    """
    Search for the company's careers page and return ONLY a verified official/ATS URL.
    Returns None when nothing could be verified - callers must not invent a URL.
    """
    name = (company_name or "").strip()
    if not name or not company_slug(name):
        return None
    if search_fn is None:
        from app.services.search_manager import perform_resilient_search as search_fn
    try:
        results = search_fn(f"{name} official careers page", max_results=max_results) or []
    except Exception as e:
        print(f"[CareersResolver] search failed for {name}: {e}")
        results = []

    found = pick_official_careers_url(name, results)
    if found:
        return found
    # Last resort: probe the obvious official domains, but demand the page mention the brand.
    return _first_verified(_guess_official_candidates(name), name, require_brand=True)
