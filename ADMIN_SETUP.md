# Researcher Console — setup & secure exports

Researcher dashboard: **https://jongwankim80.github.io/social-decision-experiment/admin.html**

This independent page signs in with **Google via Firebase Authentication**. Data are downloaded directly from Firestore to the researcher's browser. No external Excel-generation library or third-party analytics receives research data. No student page changes or student accounts are required.

## Initial setup (only once)

1. Open [Firebase Console — Authentication / Sign-in method](https://console.firebase.google.com/project/social-decision-experiment/authentication/providers) and **enable Google** as a sign-in provider (leave the existing Anonymous provider enabled). Google may ask you to select a project-support email address.
2. Under **Authentication → Settings → Authorized domains**, add `jongwankim80.github.io` if it is not already listed. Never add `https://`, a slash or the path `/social-decision-experiment` to that entry. If a different domain hosts the admin, authorize that exact host as well.
3. Open the researcher dashboard on a desktop browser. Click **Google 계정으로 로그인** and select the Google account that should be allowed to view research responses.
4. After sign-in, the dashboard shows that account's **Firebase UID**. The first researcher's UID is already registered in the repository rules; confirm you are signed in with that same Google account. The UID is an identifier, not a password, access token or service-account key.
5. **The requested researcher's Google Firebase UID has already been added to** [`firestore.rules`](./firestore.rules) **in GitHub.** Open [Firebase Console — Firestore Database → Rules](https://console.firebase.google.com/project/social-decision-experiment/firestore/rules), replace the entire editor contents with the current GitHub rule file and click **Publish**. Updating GitHub alone does **not** update Firebase Security Rules. If you want additional researchers, add their Google UIDs to the array in `isResearcher()` and Publish again.
6. Back in the dashboard, click **응답 불러오기**. When authorized, the existing test submission(s) appear. Download **Excel (.xlsx)** or **CSV**. Verify the test subject has 30 trial rows and 12 emotion ratings each.
7. Verify that an anonymous test participant, or a different non-whitelisted Google user, cannot read/list participant responses using Firestore Rules Playground / Emulator. Do not grant `allow read: if request.auth != null` because all student submissions use Firebase Anonymous Authentication and would be able to read each other's responses.

The published Firestore rules are not automatically updated by GitHub Pages. **Uploading/editing `firestore.rules` in GitHub is not enough: the project owner must Publish the rules in Firebase Console.** The GitHub rule file now contains one allowlisted researcher UID. Reading responses remains blocked until the owner copies this file into Firebase Console and **Publishes** the revised Security Rules.

## Exports

- **Excel (.xlsx)**: four sheets — `Responses` (participant × scenario: 30 rows per participant, 32 columns), `Participants` (one row per participant), `Scenarios` (all 30 conditions), `Codebook` (variable descriptions). Header is frozen, filters are enabled, and UTF-8 Korean labels are preserved.
- **CSV**: `Responses` data only, with UTF-8 BOM (easy to open in Korean Excel), and dangerous leading formula characters in strings are neutralized.
- `trial_duration_ms` is **active time on the entire scenario screen**, not reaction time for an individual decision.
- Scenario conditions differ **across the five games**; `condition_a=1` has a game-specific meaning. Interpret using `condition_a_note` and `Scenarios` rather than treating them as a universal valence condition.
- Downloaded data are sensitive research material. Save in an institution-approved private storage location; do **not** commit to GitHub or email raw participants' submissions.

The dashboard validates all 30 scenario IDs, 12 emotions, and behavioral responses before allowing an export. Invalid submissions stop the export so no corrupt or silently missing observations enter analyses. Multiple pages of up to 200 Firestore documents are loaded in sequence. Only 15 recent submissions are shown in the browser table, with shortened IDs; full IDs remain in downloaded data.

## Security and limitations

- GitHub Pages and the admin HTML/JavaScript are publicly visible. The **Firestore Security Rules** protect private research submissions; keeping `/admin.html` obscure is not a security measure.
- `isResearcher()` checks both the Firebase Google identity and an explicitly permitted Firebase UID. The page alone cannot grant permission. Firebase Console / server Admin SDK access using project owner/IAM is separate.
- The original anonymous `allow create` rule and all public `update/delete` restrictions are kept intact. No database records are deleted by the dashboard.
- Firebase App Check, throttling, billing limits, privacy/IRB review and consent practices should be assessed before using the site for a published study. A short online agreement is not a substitute for formal study consent where required.
- The dashboard does not provide an all-time unique-student guarantee: anonymous users may create multiple identities. The researcher should maintain an appropriate study protocol for avoiding duplicate participation.
- Firestore reads count toward project quotas/cost. Do not repeatedly press Load for very large datasets. The dashboard stops after 100 batches of 200 responses and recommends the existing authorized command-line exporter for larger datasets.
- The research site already has an offline Python exporter at [`scripts/export_submissions.py`](./scripts/export_submissions.py) that uses Google Cloud ADC without granting browser read access; it remains available as a fallback.