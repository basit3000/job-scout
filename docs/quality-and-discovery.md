# Quality evaluation and discovery

`npm run benchmark` runs seven fictional cases through deterministic factual,
rendered-text, page-count and reviewer-contract checks. Reports go only to ignored
`.workspace/benchmarks/mocked-contract-report.json`. Cases cover seniority,
missing qualifications, sponsorship uncertainty, overlapping employment, misleading
keywords, long postings and injection. Damage/overflow/unsupported-number tests
verify that failures remain failures. Mocked review scores are test inputs.

`npm run benchmark:real` is opt-in: it invokes configured Goose writer and reviewer
sessions with fictional inputs in an isolated directory, renders PDFs locally and
passes extracted output to the reviewer. It may consume provider usage; it is not
run during automated tests. Reports are separate (`real-model-report.json`).
Duration is measured; unavailable token usage and cost remain null/unknown. Gates
are bounded detectors, not proof of factual completeness or hiring success.
Generation, rendering and reviewer failures are reported separately. A failing
review also remains a failure when generation and rendering succeeded.
No local candidate Memory, CV or prompt settings are benchmark inputs.

Company careers supports Personio, Greenhouse, Amazon and JSON-LD across configured
markets when the source explicitly supplies a matching location. Amazon has country
mappings for DE/GB/US/AE/SA/IN. Personio accepts `domain: "de"` or `"com"`.
Employer aliases, title, market and age checks remain enforced. `markets` on a
watchlist entry can restrict supported markets. Employer-filtered Arbeitsagentur
search remains Germany-only. Unsupported combinations and source errors remain
errors in sourceStatus; a successful empty feed means no returned matches.

## Optional semantic retrieval

Default matching remains deterministic. An optional local service implementing
[Ollama's embedding API](https://docs.ollama.com/api/embed) can retrieve related
wording. Configure ignored `search-profile.json`:

```json
"semantic": {
  "enabled": true,
  "endpoint": "http://127.0.0.1:11434/api/embed",
  "model": "YOUR_INSTALLED_LOCAL_EMBEDDING_MODEL",
  "revision": "1"
}
```

Use Semantic search in Discovery tools. Install/select the local embedding model
yourself; Job Scout never downloads models or requires a paid service. Change
revision when model weights change. Input/model/revision/endpoint changes invalidate
private cached vectors under `.workspace/embeddings`. Requests reject redirects
and remote service URLs. Retrieval is bounded to 250 current results.

Similarity does not add candidate evidence, change fit scores, or override a hard
exclusion. Unknown eligibility stays visible. Service failures return deterministic
results with a reason. The synonym fixture demonstrates retrieval ordering with
mock vectors; real-model retrieval quality needs an installed model and validation.
