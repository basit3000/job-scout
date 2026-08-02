#!/usr/bin/env python3
"""JobSpy fallback for Indeed + LinkedIn (any supported country).

Reads JSON config from --config or stdin; writes JSON jobs to stdout.
Bayt is excluded by default — it 403s from cloud IPs via JobSpy.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config")
    args = parser.parse_args()
    raw = open(args.config, encoding="utf-8").read() if args.config else sys.stdin.read()
    cfg = json.loads(raw)

    boards = [b for b in (cfg.get("boards") or ["indeed", "linkedin"]) if b != "bayt" or cfg.get("forceBayt")]
    search_term = cfg.get("what")
    location = cfg.get("where") or "Remote"
    country_label = cfg.get("country") or "Unknown"
    country_indeed = cfg.get("countryIndeed") or cfg.get("country_indeed") or "usa"
    default_currency = cfg.get("currency") or "USD"
    if not search_term or str(search_term).startswith("YOUR_"):
        print("JobSpy config missing a real search term (what).", file=sys.stderr)
        json.dump({"ok": False, "error": "missing search term", "jobs": []}, sys.stdout)
        return 2
    results_wanted = int(cfg.get("limit") or 20)
    hours_old = int(cfg.get("hoursOld") or 24 * 30)

    try:
        from jobspy import scrape_jobs
    except ImportError:
        print("python-jobspy missing. pip install -U python-jobspy", file=sys.stderr)
        json.dump({"ok": False, "error": "python-jobspy missing", "jobs": []}, sys.stdout)
        return 2

    try:
        frame = scrape_jobs(
            site_name=boards,
            search_term=search_term,
            location=location,
            results_wanted=results_wanted,
            hours_old=hours_old,
            country_indeed=country_indeed,
            linkedin_fetch_description=bool(cfg.get("linkedinFetchDescription", True)),
        )
    except Exception as exc:  # noqa: BLE001
        print(f"JobSpy failed: {exc}", file=sys.stderr)
        json.dump({"ok": False, "error": str(exc), "jobs": []}, sys.stdout)
        return 1

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
                    "employmentType": cleaned.get("job_type"),
                    "salary": salary_text(cleaned, default_currency),
                    "seniority": cleaned.get("job_level"),
                    "description": cleaned.get("description"),
                    "scrapedAt": datetime.now(timezone.utc).isoformat(),
                }
            )

    json.dump(
        {
            "ok": True,
            "boards": boards,
            "query": {
                "what": search_term,
                "where": location,
                "countryIndeed": country_indeed,
            },
            "count": len(jobs),
            "jobs": jobs,
        },
        sys.stdout,
        allow_nan=False,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
