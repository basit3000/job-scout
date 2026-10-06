"""Best-effort public LinkedIn metadata. No login, paid services or retries."""
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlparse


def parse_linkedin_signals(html):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    result = {}
    # Some pages use the metadata class for other labels. Inspect only count nodes.
    for node in soup.select(".num-applicants__caption, .topcard__flavor--metadata") + soup.select(".num-applicants__figure"):
        text = node.get_text(" ", strip=True)
        numeric_figure = "num-applicants__figure" in node.get("class", []) and re.fullmatch(r"[\d,]+\+?", text)
        if numeric_figure or re.search(r"\b(applicants?|applications?|people clicked apply|Bewerber)\b", text, re.I) and re.search(r"\d", text):
            result["applicantCountText"] = text
            break
    posted = soup.select_one(".posted-time-ago__text, time[datetime]")
    if posted:
        result["postedAt"] = posted.get("datetime") or posted.get_text(" ", strip=True)
    return result


def linkedin_job_id(url):
    try:
        parsed = urlparse(url)
        if parsed.scheme != "https" or not (parsed.hostname == "linkedin.com" or (parsed.hostname or "").endswith(".linkedin.com")):
            return None
        match = re.fullmatch(r"/jobs/view/(?:[^/]*-)?(\d+)/?", parsed.path)
        return match[1] if match else None
    except (ValueError, TypeError):
        return None


def enrich_linkedin_signals(jobs, *, get=None, monotonic=time.monotonic, limit=20, budget=20):
    """Bound requests per query; preserve all rows on missing/blocked metadata."""
    import requests
    get = get or requests.get
    deadline = monotonic() + budget
    warnings = []
    seen = {}
    requests_made = 0
    for job in jobs:
        if job.get("board") != "linkedin":
            continue
        job_id = linkedin_job_id(job.get("url"))
        if not job_id:
            continue
        if job_id not in seen:
            if requests_made >= limit or monotonic() >= deadline:
                warnings.append("LinkedIn applicant lookup budget reached; remaining counts unavailable")
                break
            requests_made += 1
            url = f"https://www.linkedin.com/jobs/view/{job_id}"
            try:
                response = get(url, timeout=min(5, max(0.1, deadline - monotonic())), allow_redirects=False,
                               headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9"})
                if response.status_code in (401, 403, 429, 999) or 300 <= response.status_code < 400:
                    warnings.append("LinkedIn applicant lookup blocked; counts unavailable")
                    break
                response.raise_for_status()
                signals = parse_linkedin_signals(response.text)
                signals["applicantSourceUrl"] = url
                signals["scrapedAt"] = datetime.now(timezone.utc).isoformat()
                seen[job_id] = signals
            except Exception:  # Metadata must never discard otherwise usable listings.
                warnings.append("LinkedIn applicant lookup failed; remaining counts unavailable")
                break
        signals = seen[job_id]
        for key, value in signals.items():
            if key == "postedAt" and job.get("postedAt"):
                continue
            job[key] = value
    return warnings
