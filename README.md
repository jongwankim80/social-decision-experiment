# Social Decision Experiment (EmoLab)

30 standalone scenario-based social-decision trials for class activities and future research.

- 5 games × 3 social-context levels × 2 stakes levels = **30 trials**.
- **12 emotion ratings (1–7)** per scenario. The first button has a specific Korean low anchor and the last button a corresponding high anchor, e.g. **전혀 분노하지 않음 — 매우 분노함**.
- Decisions are recorded separately (binary choice or monetary allocation).
- The experiment shows **no game name, condition labels, or "사회적 의사결정 상황" heading** during trials.
- A Fisher–Yates shuffle randomizes all 30 conditions for each new participant. Each seed and the exact order are saved for reproducibility.
- Drafts survive reloads in the **same tab** using `sessionStorage`. Trial duration measures *active page dwell time*, not a pure decision latency.
- Mobile, tablet and desktop friendly; no frontend build tooling needed.

## Structure

| Path | Purpose |
| --- | --- |
| `index.html` | Student-facing pages |
| `assets/styles.css` | Responsive visual layout |
| `assets/app.js` | Experiment flow, validation, randomization, drafts and data export |
| `assets/firebase-client.js` | Optional Firebase Auth + Firestore submission |
| `data/scenarios.json` | All 30 unabridged scenarios imported from the original `.xlsx` |
| `config.js` | **Public** Firebase web config, initially `null` for preview mode |
| `firestore.rules` | Create-only, no-read Firestore participant permissions |
| `scripts/build_data.py` | Converts original spreadsheet into scenario JSON |

## Deploy to GitHub Pages

1. Commit the files to the repository's default `main` branch.
2. In GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save**.
3. Check `https://jongwankim80.github.io/social-decision-experiment/` once Pages finishes deploying.
4. As currently checked in, this is a **preview-only** deployment: it is **not** collecting real participant data. The page clearly labels preview mode and permits local test JSON export.

## Enable durable response storage (required before recruiting participants)

1. In [Firebase Console](https://console.firebase.google.com/), create a project controlled by the research team. Check institutional privacy and ethics requirements before collecting research data.
2. Add a **Web app** to the project. Copy its **public Firebase web config** into `config.js` as the `firebase` object. This public config is *not* an Admin service-account private key.
3. Go to **Authentication → Sign-in method → Anonymous** and enable it.
4. Create a **Cloud Firestore** database in the intended geographic region. Set the Security Rules to exactly those in `firestore.rules` and **Publish** the rules before enabling submissions.
5. Restrict your Firebase web API key appropriately, configure monitoring/quotas and consider Firebase App Check before large-scale deployment. Treat anonymous authentication as rate-limitable, **not** as robust anti-abuse protection by itself.
6. Test with dummy submissions; verify in Firestore that each submission document is stored at `experiments/social-decision-v1/submissions/{anonymousAuthUid}`. Confirm public client read access is denied.
7. Switch to real deployment only after backend/security, ethics and research-participant communication are reviewed.

**Never** store Firebase Admin credentials, personal identifiers, actual student numbers, exported responses or private access keys in this public GitHub repository. `noindex` in `index.html` is merely a hint to search engines, not protection against public access. Do not use the public repository to store real responses.

## Data structure

A successful Firestore submission contains:

```json
{
  "participantId": "Firebase anonymous auth UID",
  "experimentId": "social-decision-v1",
  "experimentVersion": "1.0.0",
  "randomizationSeed": 12345678,
  "order": ["UG04", "DG01", "... 28 other IDs ..."],
  "startedAtISO": "2026-10-19T00:00:00.000Z",
  "completedAtISO": "2026-10-19T00:35:00.000Z",
  "totalDurationMs": 2100000,
  "trials": [
    {
      "trialIndex": 1,
      "scenarioId": "UG04",
      "emotions": {"excited": 1, "joyful": 2, "elated": 1, "serene": 5, "relaxed": 4, "contented": 3, "angry": 4, "anxious": 3, "fearful": 2, "sad": 2, "gloomy": 2, "downhearted": 1},
      "decision": "수락한다",
      "trialDurationMs": 43000
    }
  ]
}
```

The submission includes all 30 trials. Monetary decisions are stored as **KRW integers**, binary decisions as option text. Do not mistake `trialDurationMs` (time on a multi-question screen) for reaction time to a single decision.

## Run locally

The site uses `fetch()` and ES modules. Use a simple HTTP server rather than opening `index.html` directly from disk:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

To rebuild JSON from an edited source spreadsheet:

```bash
pip install openpyxl
python scripts/build_data.py path/to/scenarios.xlsx
```

The spreadsheet is deliberately **not** committed to the public site as a second source of truth. Save the original `.xlsx` securely and commit only its public scenario JSON.