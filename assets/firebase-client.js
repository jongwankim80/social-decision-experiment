/**
 * Write-only research submissions. The browser is untrusted: Firestore Security
 * Rules, Anonymous Auth and (optionally) Firebase App Check must be configured.
 * No response data is sent to GitHub or stored in the public repository.
 */
const SDK = '11.6.0';
const APP_NAME = 'social-decision-experiment';
const EMOTIONS = [
  'excited', 'joyful', 'elated', 'serene', 'relaxed', 'contented',
  'angry', 'anxious', 'fearful', 'sad', 'gloomy', 'downhearted'
];
const GAME_IDS = ['PD', 'UG', 'PG', 'TG', 'DG'].flatMap(prefix =>
  Array.from({ length: 6 }, (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`)
);

function validateSubmission(payload) {
  if (!payload || payload.experimentId !== 'social-decision-v1' || payload.experimentVersion !== '1.0.0') {
    throw new Error('실험 버전 정보가 올바르지 않습니다.');
  }
  if (!Number.isInteger(payload.randomizationSeed) || payload.randomizationSeed < 0 || payload.randomizationSeed > 0xffffffff) {
    throw new Error('시나리오 무작위화 정보가 올바르지 않습니다.');
  }
  if (!Array.isArray(payload.order) || payload.order.length !== 30 ||
      new Set(payload.order).size !== 30 || !GAME_IDS.every(id => payload.order.includes(id)) ||
      !Array.isArray(payload.trials) || payload.trials.length !== 30) {
    throw new Error('30개 시나리오 응답이 완성되지 않았습니다.');
  }
  if (!Number.isInteger(payload.totalDurationMs) || payload.totalDurationMs < 0 ||
      !Number.isFinite(Date.parse(payload.startedAtISO)) || !Number.isFinite(Date.parse(payload.completedAtISO))) {
    throw new Error('응답 시간 정보가 올바르지 않습니다.');
  }
  payload.trials.forEach((trial, index) => {
    const id = payload.order[index];
    if (!trial || trial.trialIndex !== index + 1 || trial.scenarioId !== id ||
        !Number.isInteger(trial.trialDurationMs) || trial.trialDurationMs < 0 ||
        !trial.emotions || Object.keys(trial.emotions).length !== EMOTIONS.length ||
        !EMOTIONS.every(key => Number.isInteger(trial.emotions[key]) && trial.emotions[key] >= 1 && trial.emotions[key] <= 7)) {
      throw new Error(`${index + 1}번째 시나리오 응답이 올바르지 않습니다.`);
    }
    const prefix = id.slice(0, 2);
    if (prefix === 'PD' && !['침묵한다', '자백한다'].includes(trial.decision)) {
      throw new Error(`${index + 1}번째 행동 선택이 올바르지 않습니다.`);
    }
    if (prefix === 'UG' && !['수락한다', '거절한다'].includes(trial.decision)) {
      throw new Error(`${index + 1}번째 행동 선택이 올바르지 않습니다.`);
    }
    if (['PG', 'TG', 'DG'].includes(prefix)) {
      const highStake = Number(id.slice(-2)) % 2 === 0;
      const step = highStake ? 100000 : 10000;
      if (!Number.isInteger(trial.decision) || trial.decision < 0 || trial.decision > step * 10 || trial.decision % step !== 0) {
        throw new Error(`${index + 1}번째 금액 선택이 올바르지 않습니다.`);
      }
    }
  });
}

/**
 * Optional site key is a PUBLIC reCAPTCHA Enterprise site key (not a secret).
 * App Check must be initialized before accessing Firebase Auth / Firestore.
 * Enforce App Check in Firebase Console only after verifying test traffic.
 */
async function getBackend(config) {
  if (!config?.firebase?.apiKey || !config.firebase.projectId || !config.firebase.appId) {
    throw new Error('Firebase 설정이 완료되지 않았습니다.');
  }
  const [appMod, authMod, storeMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`)
  ]);
  const app = appMod.getApps().find(item => item.name === APP_NAME) ||
    appMod.initializeApp(config.firebase, APP_NAME);

  if (config.appCheckSiteKey) {
    const checkMod = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app-check.js`);
    if (!checkMod.getAppCheck) throw new Error('Firebase App Check를 초기화하지 못했습니다.');
    try {
      checkMod.getAppCheck(app);
    } catch {
      checkMod.initializeAppCheck(app, {
        provider: new checkMod.ReCaptchaEnterpriseProvider(config.appCheckSiteKey),
        isTokenAutoRefreshEnabled: true
      });
    }
  }

  const auth = authMod.getAuth(app);
  // Same-tab refresh resumes the same anonymous account; closing the tab ends
  // its persistence. Subsequent participants on shared devices get a new UID.
  await authMod.setPersistence(auth, authMod.browserSessionPersistence);
  return { auth, authMod, storeMod, db: storeMod.getFirestore(app) };
}

export async function saveToFirestore(config, payload) {
  validateSubmission(payload);
  const { auth, authMod, storeMod, db } = await getBackend(config);
  // The SDK reuses an existing anonymous user in this browser session.
  const user = (await authMod.signInAnonymously(auth)).user;
  if (!user.isAnonymous) throw new Error('익명 로그인에 실패했습니다.');

  const record = {
    ...payload,
    participantId: user.uid,
    submittedAt: storeMod.serverTimestamp()
  };
  const ref = storeMod.doc(db, 'experiments', config.experimentId, 'submissions', user.uid);
  // Rule permits CREATE only. It never permits browser reads or overwrites.
  await storeMod.setDoc(ref, record);

  // A shared classroom computer can now be used by a different participant.
  // If logging out fails, the successful write must still count as success.
  try { await authMod.signOut(auth); }
  catch (error) { console.warn('Could not clear anonymous auth session:', error?.code || 'unknown'); }
  return { participantId: user.uid };
}