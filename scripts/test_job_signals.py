import unittest
from unittest.mock import Mock

from job_signals import parse_linkedin_signals, enrich_linkedin_signals, linkedin_job_id
from jobspy_fallback import scrape_config


class SignalsTest(unittest.TestCase):
    def test_parse(self):
        data = parse_linkedin_signals('<span class="topcard__flavor--metadata">Berlin</span><span class="num-applicants__caption">Be among the first 25 applicants</span><span class="posted-time-ago__text">5 days ago</span>')
        self.assertEqual(data, {"applicantCountText": "Be among the first 25 applicants", "postedAt": "5 days ago"})
        self.assertEqual(parse_linkedin_signals('<p>200 views and 15 applicants in a description</p>'), {})
        self.assertEqual(parse_linkedin_signals('<span class="num-applicants__figure">200+</span>')['applicantCountText'], '200+')
        self.assertEqual(parse_linkedin_signals('<span class="num-applicants__figure">25</span><span class="num-applicants__caption">Under 25 applicants</span>')['applicantCountText'], 'Under 25 applicants')
        self.assertEqual(linkedin_job_id('https://www.linkedin.com/jobs/view/example-role-123?trk=test'), '123')
        self.assertIsNone(linkedin_job_id('https://linkedin.com.example.org/jobs/view/123'))

    def test_enrichment_budget_blocking_and_missing(self):
        jobs = [{"board": "linkedin", "url": f"https://www.linkedin.com/jobs/view/{i}"} for i in range(4)]
        get = Mock(return_value=Mock(status_code=200, text='<span class="num-applicants__caption">20 applicants</span>'))
        warnings = enrich_linkedin_signals(jobs, get=get, limit=2)
        self.assertEqual(get.call_count, 2)
        self.assertEqual(jobs[0]['applicantCountText'], '20 applicants')
        self.assertNotIn('applicantCountText', jobs[2])
        self.assertTrue(warnings)
        get = Mock(return_value=Mock(status_code=429))
        self.assertTrue(enrich_linkedin_signals(jobs, get=get))
        self.assertEqual(get.call_count, 1)
        get = Mock(side_effect=TimeoutError())
        self.assertTrue(enrich_linkedin_signals(jobs, get=get))
        self.assertEqual(get.call_count, 1)
        get = Mock()
        self.assertTrue(enrich_linkedin_signals(jobs, get=get, budget=0))
        get.assert_not_called()

    def test_duplicate_requests_and_original_date(self):
        jobs = [{"board": "linkedin", "url": "https://www.linkedin.com/jobs/view/123", "postedAt": "2026-10-01"} for _ in range(2)]
        get = Mock(return_value=Mock(status_code=200, text='<time datetime="2026-10-03"></time>'))
        enrich_linkedin_signals(jobs, get=get)
        self.assertEqual(get.call_count, 1)
        self.assertEqual(jobs[0]['postedAt'], '2026-10-01')
        self.assertNotIn('applicantCountText', jobs[0])

    def test_jobspy_mapping_zero_and_disabled_enrichment(self):
        import pandas as pd
        scrape = Mock(return_value=pd.DataFrame([{"site": "linkedin", "job_url": "https://www.linkedin.com/jobs/view/123", "title": "Example role", "num_applicants": 0, "date_posted": "2026-10-01"}]))
        data, code = scrape_config({"what": "Example role", "linkedinFetchApplicants": False}, scrape)
        self.assertEqual(code, 0)
        self.assertEqual(data['jobs'][0]['applicantCount'], 0)
        self.assertEqual(data['jobs'][0]['postedAt'], '2026-10-01')


if __name__ == '__main__':
    unittest.main()
