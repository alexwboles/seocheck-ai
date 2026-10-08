# SEOCheck AI

**Audit your local SEO in 10 minutes. Fix what matters first.**

## Problem

Small businesses lose local customers every day because of invisible SEO problems: an unclaimed Google Business Profile, mismatched listings, too few reviews, a slow mobile site. Hiring an agency costs hundreds of dollars; free checklists online are vague and never tell you *what to fix first*.

## Solution

SEOCheck AI is a single-page, zero-dependency web app with a guided 28-point local SEO audit across four sections:

- **Google Business Profile** (8 items) — claimed, categories, hours, photos…
- **Citations & Directories** (6 items) — NAP consistency, Yelp, Apple Maps, Bing…
- **Reviews** (6 items) — count, rating, recency, responses…
- **Website Basics** (8 items) — mobile, titles, click-to-call, SSL…

Features:

- **Weighted 0–100 score** with animated progress bar and band label
- **Prioritized fix list** — unchecked items sorted by impact (high → medium → low), each with a "why it matters" tip
- **Per-section progress bars** so you can see where you're weakest
- **Progress saved in `localStorage`** (key `seocheck.v1`): business name, checked items, audit date
- **Audit history** — complete an audit and it’s saved with date + score, each entry showing its point change vs the previous audit
- **Search the audit** — a search box filters the 28 items live so you can jump to what matters
- **Filter the action queue** — narrow the prioritized fix list by impact level or section
- **Copy action plan** — one click copies the full ranked fix list as plain text for a task manager or email
- **Print report** — a clean printable audit report for clients or your files
- **Plain-English summary** generated locally; optionally via OpenAI if you add your own key (never required)

## How scoring works

Each item has an integer weight by impact level:

| Impact | Weight | Items | Points |
|--------|--------|-------|--------|
| high   | 5      | 14    | 70     |
| medium | 3      | 8     | 24     |
| low    | 1      | 6     | 6      |

Weights sum to exactly 100, so checking everything scores 100. Bands:

| Score | Band |
|-------|------|
| 0–39  | Needs work |
| 40–69 | Getting there |
| 70–89 | Strong |
| 90–100 | Excellent |

All scoring is local heuristics — no API keys, no network calls, no sign-up.

## How to run

Open the file directly, or serve it locally:

```bash
open index.html
# or
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Pricing idea

- **Free** — the full 28-point audit, score, fix list, history. Everything local.
- **Pro — $9/mo** — AI-written action plans per fix, automated re-audit reminders, multi-location tracking, white-label PDF reports.

## Tests

Pure logic lives in `js/logic.js` (no DOM), so the whole scoring engine is tested in Node:

```bash
bash test/smoke.sh   # file/existence + syntax + bank invariants + basic scoring
bash test/e2e.sh     # end-to-end flows through the logic layer
```

Both must be fully green before shipping.

## License

MIT
