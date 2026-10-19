/** Submissions are write-only from participants. Firestore rules must be installed first. */
export async function saveToFirestore(config, payload) {
  if (!config.firebase || !config.firebase.apiKey || !config.firebase.projectId || !config.firebase.appId) {
    throw new Error('Firebase 설정이 완료되지 않았습니다.');
  }
  const [appMod, authMod, storeMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js')
  ]);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(config.firebase);
  const auth = authMod.getAuth(app);
  const currentUser = auth.currentUser || (await authMod.signInAnonymously(auth)).user;
  const db = storeMod.getFirestore(app);
  const toWrite = {
    ...payload,
    participantId: currentUser.uid,
    submittedAt: storeMod.serverTimestamp()
  };
  const ref = storeMod.doc(db, 'experiments', config.experimentId, 'submissions', currentUser.uid);
  // Security rules intentionally permit CREATE only; a second submission cannot overwrite data.
  await storeMod.setDoc(ref, toWrite);
  return { participantId: currentUser.uid };
}