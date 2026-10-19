# Social Decision Experiment — EmoLab

An independent, randomized, browser-based class exercise (and a possible starting point for future research): **5 games × 3 social contexts × 2 stakes = 30 scenarios**. Each scenario asks for **12 emotion ratings (1–7)** followed by one behavioral decision. The site does not display scenario headings such as “사회적 의사결정 상황,” game names or condition IDs during trials.

**Live site:** https://jongwankim80.github.io/social-decision-experiment/

**Current state: LIVE SUBMISSIONS — PILOT / SECURITY VERIFICATION.** The owner has confirmed a dummy response in the Firebase Console. Anonymous Authentication and participant response creation are working, but **unauthorized-read denial and researcher-specific admin read access still require live verification** before formal study rollout.

## 연구자 관리 페이지 / Researcher Console

- **Admin dashboard:** https://jongwankim80.github.io/social-decision-experiment/admin.html
- **Troubleshooting:** The dashboard identifies the failing load stage instead of reporting only a generic JavaScript error. A browser exception is different from a `permission-denied` rules rejection; see [ADMIN_SETUP.md](./ADMIN_SETUP.md).
- **First-time setup:** [ADMIN_SETUP.md](./ADMIN_SETUP.md). One researcher Google Firebase UID is now registered in the GitHub [`firestore.rules`](./firestore.rules) allowlist. **The project owner must still copy the rules to Firebase Console and Publish them**; updating GitHub alone does not grant live database access.
- Researchers can review submission counts and download **Excel (.xlsx)** with four sheets (Responses, Participants, Scenarios, Codebook), or a UTF-8 BOM **CSV** containing one row per participant × scenario (30 rows/person, 32 columns).
- The console never stores service account keys and never uploads raw study responses to the public GitHub repository. The updated [firestore.rules](./firestore.rules) leaves anonymous participant CREATE rules unchanged, denies updates/deletes, and grants read/list only to explicitly allowlisted **Google Firebase UIDs**.
- A screenshot of a genuine dummy submission in the owner's Firebase Console confirms that Firestore received at least one record. **Admin read permission and blocking of unauthorized reads have not yet been verified live.**

## Optional compensation contact step (staged / NOT LIVE YET)

- The new **참가자 보상을 위한 연락처 입력** screen appears immediately after trial 30 **only after** the owner publishes the updated Firestore rules and enables `compensationEnabled: true`. Right now it is deliberately `false`, so existing student responses keep working without a rules mismatch.
- Contact = optional Korean mobile phone number + explicit consent for compensation communication. Respondents can skip contact collection and still submit research responses.
- Personal phone numbers are saved to a **separate Firestore collection** `experiments/social-decision-v1/compensation_contacts`, not inside the 30-trial records. When a number is provided, both writes are atomic; a failed write commits neither document.
- Admin downloads compensation phone numbers separately at `contacts.html`; the research Excel/CSV does not contain phone numbers.
- **Before switching it on:** follow [COMPENSATION_SETUP.md](./COMPENSATION_SETUP.md) and make sure the stated manual deletion within 30 days after compensation is operationally acceptable. GitHub's `firestore.rules` must be copied into Firebase Console and **Published**.

## What the student sees

- One complete scenario per screen, with the 30 scenarios newly shuffled at experiment start (seed and actual order are saved).
- A 1–7 rating for each of the 12 emotions. The **1-point label is on the left** and the **7-point label is on the right** for each emotion, e.g. **전혀 분노하지 않음 — 매우 분노함**.
- One behavioral decision (a two-choice answer or an amount in Korean won).
- Progress indicator and required-response validation.
- A draft preserved across refreshes of the **same tab** via `sessionStorage`. Closing the tab or switching devices may discard progress.
- Participant-facing pages work on desktop and mobile.

## Enable Firestore response storage

You need a Firebase project controlled by the research team. Creating a Firebase project and publishing its rules require project-owner permissions. **The GitHub repository is public; never put a Firebase Admin private key, a service-account JSON or identifiable student responses in it.** Firebase's *web app config* (`apiKey`, `authDomain`, `projectId`, `appId`) is intentionally public; server permissions are enforced by Firestore rules.

1. In [Firebase Console](https://console.firebase.google.com/), open the already-created project **`social-decision-experiment`**. Its public Web app configuration is already committed to [`config.js`](./config.js). Choose a Firestore region appropriate to your institution's data-handling requirements; this location is difficult to change after creation.
2. The Web app registration step is complete; no Firebase Hosting is needed because the site is already hosted on GitHub Pages.
3. Enable **Authentication → Sign-in method → Anonymous**. In Authentication's authorized domains, check that `jongwankim80.github.io` is allowed if required for your app's sign-in configuration.
4. Create a **Cloud Firestore** database in Native mode. In **Firestore Database → Rules**, replace the default rules with the complete text in [`firestore.rules`](./firestore.rules) and click **Publish**. **Do not** use permissive/test-mode rules when collecting real responses. These rules grant client-side **create only** for a single document with the same Firebase Anonymous Auth UID, and **deny all client reads, updates and deletes**.
5. **Completed:** `config.js` now sets `submissionsEnabled: true` following the owner's report that the Firebase services and rules are configured. `experimentId: 'social-decision-v1'` and `experimentVersion: '1.0.0'` are unchanged; the rules validate these exact values. The old preview-session draft key has been rotated so preview responses are not submitted as genuine records.
6. Run a **dummy submission from the public GitHub Pages URL**. Check in Firebase Console that one document appears at `experiments/social-decision-v1/submissions/{anonymousUid}` and contains 30 trials with 12 emotion scores each. Run an additional test with the same laptop after the success screen: the experiment should obtain a *new* anonymous UID (the app signs out after confirmed submission).
7. **Verify security rules** with Firebase's Rules Playground/emulator: unauthorized public reads/list queries and updates/deletes must fail, while an authenticated anonymous user can create only a structurally valid document under their own UID. This repository's local tests do **not** replace that live security check.
8. Remove test records from Firestore using the researcher/admin console before real data collection, as appropriate to your data-management plan.

**Optional but recommended for class-wide release:** set up [App Check using reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider) and place its **public site key** in `config.js` as `appCheckSiteKey`. Add `jongwankim80.github.io` as an authorized site in the applicable reCAPTCHA settings, check valid App Check traffic in Firebase Console, **then** enable App Check enforcement for Cloud Firestore. Enforcing too early can block legitimate submissions. Anonymous Auth and rules **do not prevent all automated/fraudulent responses**; monitor usage, limits and costs.

### Example `config.js` after your backend is ready

```js
window.EXPERIMENT_CONFIG = {
  experimentId: 'social-decision-v1',
  experimentVersion: '1.0.0',
  submissionsEnabled: true,  // live pilot; verify the first submission before recruitment
  firebase: {
    apiKey: 'PUBLIC_FIREBASE_WEB_API_KEY',
    authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    appId: 'YOUR_FIREBASE_WEB_APP_ID'
  },
  appCheckSiteKey: null  // or the public reCAPTCHA Enterprise site key
};
```

**Do not** send Firebase service-account credentials or private keys via chat. The public web config is all the frontend needs; the owner must also set Auth and Firestore rules in Firebase Console.

## What gets stored

One document per successful submission is written to:

`experiments/social-decision-v1/submissions/{firebaseAnonymousAuthUid}`

Its fields are:

- `participantId`: pseudonymous Firebase Auth UID (not a student ID)
- `experimentId`, `experimentVersion`
- `randomizationSeed`, `order` (all 30 scenario IDs in actual presentation order)
- `startedAtISO`, `completedAtISO`, `submittedAt` (Firestore server timestamp)
- `totalDurationMs` and 30 `trials`: `{trialIndex, scenarioId, emotions, decision, trialDurationMs}`

`trialDurationMs` is **active time on a scenario screen**, *not* the latency of a single keypress or pure decision reaction time. Monetary choices are stored as whole KRW amounts; ratings are integers 1–7. The browser signs out of its anonymous account after a confirmed save so shared classroom computers can be reused. A lost connection or rejected write shows a failure message and retains a temporary draft; students must not treat a failed write as a successful submission.

## Download the data for analysis (researcher only)

Use [`scripts/export_submissions.py`](./scripts/export_submissions.py) on a researcher's trusted computer. It produces an **Excel-friendly UTF-8 CSV** with **one row per participant × scenario** and 32 columns including scenario metadata, randomized presentation order, the 12 emotions, decision, and timing.

```bash
pip install google-cloud-firestore
gcloud auth application-default login
python scripts/export_submissions.py --project YOUR_PROJECT_ID --output responses.csv
```

The signed-in Google account must have a suitably scoped Firestore **read-only IAM role**. `gcloud` and its ADC credentials stay on the researcher's computer; they are *not* used by or committed to GitHub. If you only want to test the format using a preview JSON downloaded from the site:

```bash
python scripts/export_submissions.py --input-json preview-response.json --output preview.csv
```

CSV files and credential files are intentionally excluded by [`.gitignore`](./.gitignore). These precautions are not a substitute for an institutional data-management plan. A preview JSON downloaded during testing is never automatically uploaded to the study's database.

## Project files

| Path | Purpose |
| --- | --- |
| `index.html`, `assets/styles.css` | Responsive student-facing experiment UI |
| `assets/app.js` | Trial presentation, seeded shuffle, validation, timing, session draft, preview export |
| `assets/firebase-client.js` | Firestore submission via anonymous Firebase Auth; optional App Check |
| `data/scenarios.json` | 30 complete independent scenario texts with game and condition metadata |
| `config.js` | Public Firebase web config; `submissionsEnabled: true` currently enables live pilot submissions |
| `firestore.rules` | Deny-read/deny-update/deny-delete, authenticated create-only rules |
| `scripts/build_data.py` | Regenerate scenario JSON from the Excel source |
| `scripts/export_submissions.py` | Authorized Firestore → wide trial-level CSV export |

## Privacy, research ethics, and validity

The form currently asks no name, email or student number. Firebase authentication/service infrastructure can still process technical metadata; configure regional storage, retention and institutional disclosures appropriately. If class credit is involved, keep course completion tracking separate from the response database. Using these responses for academic research may require ethics review, appropriate consent and a data-retention policy; an acknowledgement checkbox about hypothetical scenarios alone is **not** equivalent to informed consent for a research study.

**Safety checkpoint:** Complete at least one test end-to-end and check its record in Firestore. An authenticated anonymous browser may write one document but must fail to read, list, update or delete participant documents. Firebase rules cannot prevent repeat identities or spam; consider App Check and usage alerts before a full study. Remove test submissions using the Firebase owner/admin console before real recruitment.

The experiment uses hypothetical, rather than incentivized, money and sentence lengths. Do not present responses as real economic-game transactions. The randomized order is reproducible from the stored `randomizationSeed`, but repeated browser starts can generate new orders/UIDs; the website does not independently verify one submission per real human.

## Local preview and tests

Serve over HTTP instead of opening an `index.html` file directly:

```bash
python -m http.server 8080
```

Open `http://localhost:8080/`. The local file has no backend until configured, and can export a JSON preview response. To rebuild scenarios from the original Excel workbook:

```bash
pip install openpyxl
python scripts/build_data.py path/to/scenarios.xlsx
```

The original `.xlsx` is intentionally not duplicated in the public repository. Local browser UI tests do not test the live Firebase service, hosted auth domains, or deployed Firestore Security Rules.