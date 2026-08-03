# <Market> shortlist — <date>

Candidate: **YOUR_FULL_NAME** (replace from profile) — target: **YOUR_TARGET_ROLE**  
Market: **YOUR_MARKET** (from search-profile / jobs.json)

<n> fetched · <n> ruled out · <n> worth their time  
Boards: <bayt/indeed/linkedin — via apify or jobspy>

---

## Strong

### 1. <Title> — <Company>

- **Where** · **Type** · **Posted** <n>d ago  
- **Board** via <apify|jobspy> · **Flags** <…>  
- **Link** · **ID** `<id>`

**Why it fits.** <Cite evidence from their pack.>  
**Gaps.** <Including local-experience / visa / license if relevant.>

---

## Worth a shot / Stretch

…

---

## Ruled out

Common reasons this run:

- <n> Nationals only  
- <n> Local experience / license gap  
- <n> wrong field / seniority  
- <n> wrong country  

---

## Open questions for the candidate

1. Work, authorisation / visa for this market?  
2. Preferred cities within the market?  
3. Earliest join date?  
4. Licenses/registrations required in this field?  

---

## Next

They pick one. Record skips:

```bash
node scripts/record-decision.mjs --id <id> --decision skipped --note "…"
```
