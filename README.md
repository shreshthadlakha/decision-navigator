# Decision Navigator

A free browser-based tool that helps you make better choices by comparing options with weighted criteria, score breakdowns, confidence levels, and a shareable recommendation.

**Live:** https://decision-navigator.vercel.app

---

## What It Does

Most people make important decisions using gut feeling, pros/cons lists, or asking around — none of which surfaces what they *actually* value. Decision Navigator forces the process to be explicit:

1. Enter the decision you're making
2. Add the options you're comparing
3. Define the criteria that matter to you — and assign each an importance weight
4. Score each option on each criterion
5. Get a weighted ranking with a confidence level and plain-English recommendation

The most valuable part isn't the final score. It's step 3 — the moment you write down what actually matters to you and how much.

---

## Features

- **Weighted scoring engine** — importance weights give the right factors proportionally more influence
- **Confidence level** — calculated from the score gap between rank 1 and rank 2
- **Plain-English recommendation** — not just numbers, a readable summary of why the winner won
- **URL hash sharing** — full state encoded in the URL, zero backend required
- **Local storage autosave** — your work is preserved across browser sessions
- **Copy summary** — clean text output you can paste anywhere
- **Load example** — see the tool working with a real decision in one click
- **Heat map scoring** — score cells shift from red (low) to green (high) so the matrix is readable at a glance
- **100% client-side** — no data ever leaves your browser

---

## Tech Stack

Plain HTML, CSS, JavaScript. No framework. No build step. No dependencies. Zero external requests.

---

## Running Locally

```bash
git clone https://github.com/[username]/decision-navigator
cd decision-navigator
open index.html   # or serve with any static file server
```

No npm install. No build command. It opens directly.

---

## Scoring Formula

```
weightedScore = Σ(score × weight) for each criterion
maxPossible   = Σ(10 × weight) for each criterion
percentage    = Math.round((weightedScore / maxPossible) × 100)
```

Confidence is based on the gap between the top two scores:
- 0–4% gap: Low
- 5–12% gap: Medium
- 13%+: High

---

## Deployment

Deployed on Vercel free Hobby plan — no credit card, no paid tier.

```
Framework preset: Other
Build command:    (empty)
Output directory: (empty — serves root)
```

---

## Built For

Digital Marketing Heroes developer trial task — [digitalheroesco.com](https://digitalheroesco.com)

---

## Author

**Shreshth Adlakha** — shreshthadlakha@gmail.com

---

## License

MIT — free to use, fork, and build on.
