#!/usr/bin/env python3
"""JobSpy fallback for Indeed + LinkedIn (any supported country).

Reads JSON config from --config or stdin; writes JSON jobs to stdout.
Bayt is excluded by default — it 403s from cloud IPs via JobSpy.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from datetime import datetime, timezone
from urllib.parse import quote
from job_signals import enrich_linkedin_signals


class _WarnCapture(logging.Handler):
    """Collect JobSpy ERROR/WARNING lines so Node can surface them."""

    def __init__(self):
        super().__init__(level=logging.WARNING)
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record).strip()
        except Exception:  # noqa: BLE001
            msg = record.getMessage()
        if msg:
            self.messages.append(msg)


def _patch_glassdoor_location_encoding() -> None:
    """JobSpy interpolates location into a URL unencoded → HTTP 400 for many locales."""
    try:
        from jobspy.glassdoor import Glassdoor
    except Exception:  # noqa: BLE001
        return

    if getattr(Glassdoor, "_jobscout_location_patched", False):
        return

    original = Glassdoor._get_location

    def _get_location(self, location: str, is_remote: bool):
        if not location or is_remote:
            return original(self, location, is_remote)
        url = (
            f"{self.base_url}/findPopularLocationAjax.htm"
            f"?maxLocationsToReturn=10&term={quote(str(location))}"
        )
        res = self.session.get(url)
        if res.status_code != 200:
            return None, None
        items = res.json()
        if not items:
            raise ValueError(f"Location '{location}' not found on Glassdoor")
        location_type = items[0]["locationType"]
        if location_type == "C":
            location_type = "CITY"
        elif location_type == "S":
            location_type = "STATE"
        elif location_type == "N":
            location_type = "COUNTRY"
        return int(items[0]["locationId"]), location_type

    Glassdoor._get_location = _get_location
    Glassdoor._jobscout_location_patched = True


def iso(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def clean_cell(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if str(value) in {"NaT", "<NA>", "nan", "NaN", "None"}:
        return None
    return value


def salary_text(row, default_currency="USD"):
    lo, hi = row.get("min_amount"), row.get("max_amount")
    currency = row.get("currency") or default_currency
    interval = row.get("interval") or ""
    if lo is None and hi is None:
        return None
    if lo is not None and hi is not None:
        return f"{lo:g}–{hi:g} {currency} {interval}".strip()
    amount = lo if lo is not None else hi
    return f"{amount:g} {currency} {interval}".strip()


def scrape_config(cfg, scrape_jobs):
    boards = [b for b in (cfg.get("boards") or ["indeed", "linkedin"]) if b != "bayt" or cfg.get("forceBayt")]
    search_term = cfg.get("what")
    location = cfg.get("where") or "Remote"
    country_label = cfg.get("country") or "Unknown"
    country_indeed = cfg.get("countryIndeed") or cfg.get("country_indeed") or "usa"
    default_currency = cfg.get("currency") or "USD"
    if not search_term or str(search_term).startswith("YOUR_"):
        return {"ok": False, "error": "missing search term", "jobs": []}, 2
    results_wanted = int(cfg.get("limit") or 20)
    hours_old = int(cfg.get("hoursOld") or 24 * 30)

    warn_capture = _WarnCapture()
    warn_capture.setFormatter(logging.Formatter("%(message)s"))
    logger = logging.getLogger()
    logger.addHandler(warn_capture)
    try:
        kwargs = {
            "site_name": boards,
            "search_term": search_term,
            "location": location,
            "results_wanted": results_wanted,
            "hours_old": hours_old,
            "country_indeed": country_indeed,
            "linkedin_fetch_description": bool(cfg.get("linkedinFetchDescription", False)),
        }
        if "google" in boards:
            kwargs["google_search_term"] = cfg.get("googleSearchTerm") or (
                f"{search_term} jobs near {location}"
            )
        try:
            frame = scrape_jobs(**kwargs)
        except Exception as exc:  # noqa: BLE001
            print(f"JobSpy failed: {exc}", file=sys.stderr)
            return {"ok": False, "error": str(exc), "jobs": [], "warnings": warn_capture.messages}, 1

        jobs = []
        if frame is not None and len(frame) > 0:
            frame = frame.where(frame.notna(), None)
            for row in frame.to_dict(orient="records"):
                site = (clean_cell(row.get("site")) or "unknown").lower()
                url = clean_cell(row.get("job_url")) or clean_cell(row.get("job_url_direct"))
                if not url:
                    continue
                remote = clean_cell(row.get("is_remote"))
                cleaned = {k: clean_cell(v) for k, v in row.items()}
                jobs.append(
                    {
                        "board": site,
                        "via": "jobspy",
                        "nativeId": cleaned.get("id") or url,
                        "title": cleaned.get("title"),
                        "company": cleaned.get("company"),
                        "location": cleaned.get("location"),
                        "country": country_label,
                        "remote": bool(remote) if remote is not None else None,
                        "url": url,
                        "postedAt": iso(cleaned.get("date_posted")),
                        "applicantCount": next((cleaned.get(key) for key in ("applicant_count", "applicants_count", "num_applicants", "applicants") if cleaned.get(key) is not None), None),
                        "employmentType": cleaned.get("job_type"),
                        "salary": salary_text(cleaned, default_currency),
                        "seniority": cleaned.get("job_level"),
                        "emails": cleaned.get("emails"),
                        "companyUrl": cleaned.get("company_url") or cleaned.get("company_url_direct"),
                        "description": cleaned.get("description"),
                        "scrapedAt": datetime.now(timezone.utc).isoformat(),
                    }
                )

        signal_warnings = enrich_linkedin_signals(jobs) if cfg.get("linkedinFetchApplicants", True) and any(j.get("board") == "linkedin" for j in jobs) else []
        warnings = (warn_capture.messages + signal_warnings)[-8:]
        soft_error = None
        if not jobs and warnings:
            soft_error = "; ".join(dict.fromkeys(warnings))
        elif not jobs and set(boards) & {"glassdoor", "google"}:
            soft_error = (
                "JobSpy returned 0 jobs (Glassdoor/Google are often blocked or broken upstream; "
                "Indeed/LinkedIn/Arbeitsagentur are more reliable)"
            )
        return {
            "ok": True,
            "boards": boards,
            "query": {
                "what": search_term,
                "where": location,
                "countryIndeed": country_indeed,
            },
            "count": len(jobs),
            "jobs": jobs,
            "warnings": warnings,
            "error": soft_error,
        }, 0
    finally:
        logger.removeHandler(warn_capture)


def _load_jobspy():
    try:
        from jobspy import scrape_jobs
    except ImportError:
        return None, "python-jobspy missing. pip install -U python-jobspy"
    _patch_glassdoor_location_encoding()
    return scrape_jobs, None


def _emit(payload):
    json.dump(payload, sys.stdout, allow_nan=False)
    sys.stdout.write("\n")
    sys.stdout.flush()


def worker_loop() -> int:
    scrape_jobs, err = _load_jobspy()
    if err:
        print(err, file=sys.stderr)
        _emit({"ok": False, "error": "python-jobspy missing", "jobs": []})
        return 2
    _emit({"ready": True})
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            cfg = json.loads(line)
        except json.JSONDecodeError as exc:
            _emit({"ok": False, "error": f"invalid worker JSON: {exc}", "jobs": []})
            continue
        if cfg.get("cmd") == "quit":
            break
        payload, _code = scrape_config(cfg, scrape_jobs)
        _emit(payload)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config")
    parser.add_argument("--worker", action="store_true", help="Keep Python warm; JSON lines on stdin/stdout")
    args = parser.parse_args()
    if args.worker:
        return worker_loop()

    raw = open(args.config, encoding="utf-8").read() if args.config else sys.stdin.read()
    cfg = json.loads(raw)
    scrape_jobs, err = _load_jobspy()
    if err:
        print(err, file=sys.stderr)
        json.dump({"ok": False, "error": "python-jobspy missing", "jobs": []}, sys.stdout)
        return 2
    if not cfg.get("what") or str(cfg.get("what")).startswith("YOUR_"):
        print("JobSpy config missing a real search term (what).", file=sys.stderr)
        json.dump({"ok": False, "error": "missing search term", "jobs": []}, sys.stdout)
        return 2
    payload, code = scrape_config(cfg, scrape_jobs)
    json.dump(payload, sys.stdout, allow_nan=False)
    return code


if __name__ == "__main__":
    sys.exit(main())
