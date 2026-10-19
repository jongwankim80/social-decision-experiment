# Compensation contact collection (optional mobile phone)

The experiment displays **참가자 보상을 위한 연락처 입력** immediately after trial 30 and before the final research-data submission **only after** `compensationEnabled: true` is enabled in `config.js`. While the flag is false the existing student workflow stays unchanged and no contact input is collected.

## Privacy decision to verify before rollout

- Purpose: participant compensation notification / delivery.
- Collected item: **Korean mobile phone number**, and an explicit consent acknowledgement.
- The previously proposed **30-day deletion promise has been removed**. Before activating contact collection, the project owner must establish and disclose a truthful, institutionally appropriate retention period and disposal procedure. No specific period is configured or automatically enforced in the site.
- Contact is **optional**. Participants can decline contact collection and still submit their 30 research responses (without compensation messaging). If a number is provided, explicit consent and a valid phone number are required.
- Only masked phone digits appear in the researcher web console; downloading the separate XLSX exposes full phone numbers and must be stored privately.
- Research data and contact numbers go to **separate Firestore collections**, not the same submission document. The contact record contains no participant UID, name, randomization order or trial answers. Separation limits direct linkage but it does **not** guarantee mathematical anonymity: timestamps, infrastructure metadata and dataset context may still permit association.

## Rollout checklist (Firebase Console)

1. Open the latest **firestore.rules** in this repo. Copy the entire text.
2. Go to Firebase Console > Firestore Database > **Rules**, paste it, and **Publish**. GitHub Pages publishing **does not** update rules.
3. Keep existing Anonymous and Google Authentication providers enabled.
4. **Decide the actual retention period and update the participant-facing privacy notice before collecting any phone numbers.** After privacy review and publishing the matching rules, change `compensationEnabled: false` to `true` in `config.js` (the assistant can commit this setting when informed). NEVER activate the client UI before the matching rules are published.
5. Test 30 trials followed by the new phone screen. Submit an **artificial test phone number**, and confirm both collections are created:
   - `experiments/social-decision-v1/submissions/<anonymousUid>`: 30 trial responses, no phone.
   - `experiments/social-decision-v1/compensation_contacts/<randomId>`: phone, consentVersion, consented, submittedAt, experimentId; no UID or ratings.
6. Test **skip**: after another complete 30-trial session, choose '연락처 없이 제출'. Research submission should save and **no** contact record should be created.
7. Log in with the allowlisted Google account and use `contacts.html` to load/export compensation contacts. Anonymous users and other Google accounts must not be able to list/read contacts.
8. Delete test contact and submission records before distributing to participants. Handle any actual contact records according to the explicitly approved retention/disposal policy and the institution's secure storage and transport requirements.

## Atomic writes

When a phone number is provided, the browser uses a Firestore write batch that creates the research submission and contact record **together**. The contact-collection rule calls `getAfter()` on the same anonymous Firebase UID's submission and checks that its new server timestamp equals this request's server time. If the batch fails, neither document is committed. Without a phone number, the normal one-document submission path remains unchanged.

## Admin export

- `admin.html` exports anonymized research ratings/decisions in trial-level Excel/CSV as before.
- `contacts.html` exports the **separate** `CompensationContacts` Excel sheet (phone, submitted_at, consent_version). No research ratings appear in this workbook.
- The admin page does **not** offer deletion; delete through Firebase Console as the project owner.
- This optional reward-contact acknowledgement does not replace formal consent/IRB review if the work is later used for a research publication.