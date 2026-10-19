import {
  COLUMNS, PARTICIPANT_COLUMNS, SCENARIO_COLUMNS, CODEBOOK,
  flattenRecords, scenarioRows, csvText, validateCatalog
} from './admin-data.mjs';
import { createXlsxBlob } from './xlsx-export.mjs';

const CONFIG = window.EXPERIMENT_CONFIG || {};
const SDK = '11.6.0';
const $ = id => document.getElementById(id);
const ui = {
  login: $('admin-login'), logout: $('admin-logout'), load: $('admin-load'),
  csv: $('admin-csv'), xlsx: $('admin-xlsx'), auth: $('admin-auth-state'),
  message: $('admin-message'), identity: $('admin-identity'),
  uid: $('admin-uid'), email: $('admin-email'), copy: $('admin-copy-uid'),
  participants: $('admin-participants'), trials: $('admin-trials'),
  newest: $('admin-newest'), recent: $('admin-recent')
};
let auth, authMod, db, storeMod;
let loadedRows = null, loadedParticipants = null, catalog = null;
let requestNumber = 0;

function status(message, tone = '') {
  ui.message.textContent = message;
  if (tone) ui.message.dataset.tone = tone;
  else delete ui.message.dataset.tone;
}
function errorMessage(error) {
  switch (error?.code) {
    case 'auth/operation-not-allowed':
      return 'Firebase Authentication에서 Google 로그인 제공업체를 활성화해야 합니다.';
    case 'auth/unauthorized-domain':
      return 'Firebase Authentication → 설정 → 승인된 도메인에 jongwankim80.github.io 를 추가해 주세요.';
    case 'auth/popup-blocked':
      return 'Google 로그인 팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제하고 다시 시도해 주세요.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '로그인이 완료되지 않았습니다. 다시 시도해 주세요.';
    case 'permission-denied':
      return '응답 읽기 권한이 없습니다. 아래에 표시된 Firebase UID를 연구자 허용 목록에 등록하고 firestore.rules 규칙을 Publish해야 합니다. Google 로그인만으로는 응답 열람이 허용되지 않습니다.';
    case 'unavailable':
      return 'Firebase와 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';
    default:
      return '작업이 완료되지 않았습니다. ' + String(error?.message || error?.code || '알 수 없는 오류');
  }
}
function googleAccount(user) {
  return Boolean(user && user.providerData?.some(provider => provider.providerId === 'google.com'));
}
function resetData() {
  loadedRows = null;
  loadedParticipants = null;
  ui.csv.disabled = true; ui.xlsx.disabled = true;
  ui.participants.textContent = '—'; ui.trials.textContent = '—';ui.newest.textContent = '—';
  ui.recent.replaceChildren();
  const tr = document.createElement('tr'), td = document.createElement('td');
  td.colSpan = 4;td.className = 'admin-empty';
  td.textContent = '응답을 불러오면 여기에 표시됩니다.';
  tr.append(td); ui.recent.append(tr);
}
function updateAccount(user) {
  const ok = googleAccount(user);
  requestNumber++;
  resetData();
  ui.identity.hidden = !ok;
  ui.logout.hidden = !ok;
  ui.login.hidden = ok;
  ui.load.disabled = !ok;
  if (ok) {
    ui.email.textContent = user.email || '(이메일 표시 불가)';
    ui.uid.textContent = user.uid;
    ui.auth.textContent = 'Google 로그인됨';
    status('로그인했습니다. 「응답 불러오기」를 누르면 데이터베이스 접근 권한을 확인합니다.');
  } else {
    ui.auth.textContent = user ? 'Google 로그인이 필요합니다' : '로그인되지 않음';
    ui.login.disabled = false;
    status('관리자 Google 계정으로 로그인해 주세요. 익명 참가자 계정에는 읽기 권한이 없습니다.');
  }
}
function displayDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '—';
}
function displayResponses(participants, rows) {
  ui.participants.textContent = participants.length.toLocaleString('ko-KR');
  ui.trials.textContent = rows.length.toLocaleString('ko-KR');
  const ordered = [...participants].sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
  ui.newest.textContent = ordered.length ? displayDate(ordered[0].submitted_at) : '—';
  ui.recent.replaceChildren();
  for (const p of ordered.slice(0, 15)) {
    const tr = document.createElement('tr');
    const values = [p.participant_id.slice(0, 8) + '…', displayDate(p.submitted_at),
      String(p.trial_count), `${(p.session_duration_ms / 60000).toFixed(1)}분`];
    values.forEach(value => {const td = document.createElement('td');td.textContent = value;tr.append(td);});
    ui.recent.append(tr);
  }
  if (!participants.length) resetData();
}

async function initBackend() {
  if (!CONFIG?.firebase?.projectId || !CONFIG.firebase.apiKey || !CONFIG.firebase.appId) {
    throw new Error('Firebase 웹앱 설정이 없습니다.');
  }
  const [appMod, aMod, sMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`)
  ]);
  const app = appMod.getApps().find(x => x.name === 'social-decision-admin') ||
    appMod.initializeApp(CONFIG.firebase, 'social-decision-admin');
  if (CONFIG.appCheckSiteKey) {
    const chk = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app-check.js`);
    try {chk.getAppCheck(app);}
    catch {chk.initializeAppCheck(app, {
      provider: new chk.ReCaptchaEnterpriseProvider(CONFIG.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });}
  }
  authMod = aMod;storeMod = sMod;
  auth = aMod.getAuth(app);
  db = sMod.getFirestore(app);
  await aMod.setPersistence(auth, aMod.browserSessionPersistence);
  aMod.onAuthStateChanged(auth, user => updateAccount(user), e => status(errorMessage(e), 'error'));
}

async function login() {
  if (!auth) return;
  ui.login.disabled = true;
  try {
    // Trigger sign-in directly from this click so browsers permit the popup.
    await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
  } catch (error) {
    status(errorMessage(error), 'error');
  } finally {
    ui.login.disabled = false;
  }
}
async function logout() {
  if (!auth) return;
  requestNumber++;
  resetData();
  ui.logout.disabled = true;
  try {await authMod.signOut(auth);}
  catch (error) {status(errorMessage(error), 'error');}
  finally {ui.logout.disabled = false;}
}

async function loadResponses() {
  const user = auth?.currentUser;
  if (!googleAccount(user)) {status('연구자 Google 계정으로 로그인해 주세요.', 'error');return;}
  const myUid = user.uid;
  const serial = ++requestNumber;
  resetData();
  ui.load.disabled = true;
  let records = [];
  let stage = 'Firebase 응답 조회 준비';
  try {
    status('Firebase에서 응답을 읽는 중입니다…');
    stage = '시나리오 메타데이터 요청';
    const scenariosResponse = await fetch('./data/scenarios.json', {cache: 'no-store'});
    if (!scenariosResponse.ok) throw new Error('시나리오 조건표를 읽지 못했습니다.');
    const scenarios = await scenariosResponse.json();
    stage = '시나리오 메타데이터 검증';
    validateCatalog(scenarios);
    let lastDoc = null;
    let page = 0;
    const collection = storeMod.collection(db, 'experiments', CONFIG.experimentId, 'submissions');
    // Firestore implicitly orders the first page by document name.
    // Avoid an unnecessary explicit orderBy(documentId()) in the first query.
    // If more pages are needed, use a document snapshot as a stable cursor.
    do {
      stage = 'Firestore 문서 조회 (페이지 ' + (page + 1) + ')';
      const queryArgs = lastDoc
        ? [storeMod.orderBy(storeMod.documentId()), storeMod.startAfter(lastDoc), storeMod.limit(200)]
        : [storeMod.limit(200)];
      const q = storeMod.query(collection, ...queryArgs);
      const snap = await storeMod.getDocs(q);
      if (serial !== requestNumber || auth.currentUser?.uid !== myUid) return;
      if (!snap || !Array.isArray(snap.docs)) {
        throw new Error('Firestore 조회 결과의 문서 목록이 올바르지 않습니다.');
      }
      stage = 'Firestore 문서 검증 (페이지 ' + (page + 1) + ')';
      for (const doc of snap.docs) {
        const data = doc.data();
        if (data.participantId !== doc.id) throw new Error('응답 문서 ID와 참가자 ID가 일치하지 않습니다: ' + doc.id);
        records.push(data);
      }
      page++;
      status(`${records.length.toLocaleString('ko-KR')}명 응답을 확인했습니다…`);
      lastDoc = snap.size === 200 ? snap.docs[snap.docs.length - 1] : null;
      if (page > 100) throw new Error('응답 수가 너무 많습니다. 관리자에게 페이지당 내보내기 방식 도입을 요청해 주세요.');
    } while (lastDoc);
    // Data is not displayed or exported until every record passes validation.
    stage = '응답 30문항 검증 및 분석용 데이터 변환';
    const flattened = flattenRecords(records, scenarios);
    if (serial !== requestNumber || auth.currentUser?.uid !== myUid) return;
    catalog = scenarios;
    loadedRows = flattened.rows;
    loadedParticipants = flattened.participants;
    stage = '관리 화면 요약 표시';
    displayResponses(loadedParticipants, loadedRows);
    const count = loadedParticipants.length;
    ui.csv.disabled = count === 0;
    ui.xlsx.disabled = count === 0;
    status(count ? `완료: ${count.toLocaleString('ko-KR')}명 × 30개 = ${loadedRows.length.toLocaleString('ko-KR')}행을 검증했습니다. 이제 내려받을 수 있습니다.` :
      '수집된 응답이 아직 없습니다.', count ? 'success' : '');
  } catch (error) {
    // Log only the error and stage, never participant response payloads.
    console.error('[Research Console] 응답 불러오기 실패 · 단계:', stage, error?.code || '', error?.stack || error?.message || error);
    if (serial === requestNumber) {
      resetData();
      status('[' + stage + '] ' + errorMessage(error), 'error');
    }
  } finally {
    if (serial === requestNumber) ui.load.disabled = false;
    records = [];
  }
}
function exportName(extension) {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return `social-decision-responses-${local.toISOString().replace(/[-:]/g, '').slice(0, 15)}.${extension}`;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;a.download = name;
  document.body.append(a);a.click();a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function ensureExportReady() {
  if (!googleAccount(auth?.currentUser) || !loadedRows || !loadedParticipants || !catalog || loadedRows.length === 0) {
    throw new Error('데이터를 불러온 뒤 내려받을 수 있습니다.');
  }
}
function exportCsv() {
  try {
    ensureExportReady();
    const csv = csvText(loadedRows, COLUMNS);
    download(new Blob([csv], {type: 'text/csv;charset=utf-8'}), exportName('csv'));
    status(`${loadedRows.length.toLocaleString('ko-KR')}행 CSV 파일 다운로드를 시작했습니다.`, 'success');
  } catch (error) {status(errorMessage(error), 'error');}
}
async function exportXlsx() {
  ui.xlsx.disabled = true;
  try {
    ensureExportReady();
    status('Excel 워크북 4개 시트를 생성하는 중입니다…');
    const book = createXlsxBlob([
      {name:'Responses', columns: COLUMNS, rows: loadedRows},
      {name:'Participants', columns: PARTICIPANT_COLUMNS, rows: loadedParticipants},
      {name:'Scenarios', columns: SCENARIO_COLUMNS, rows: scenarioRows(catalog)},
      {name:'Codebook', columns:['variable','description','data_type'],
        rows:CODEBOOK.map(([variable,description,data_type])=>({variable,description,data_type}))}
    ]);
    download(book, exportName('xlsx'));
    status(`${loadedParticipants.length.toLocaleString('ko-KR')}명 응답을 포함한 Excel 파일 다운로드를 시작했습니다.`, 'success');
  } catch (error) {status(errorMessage(error), 'error');}
  finally {ui.xlsx.disabled = !loadedRows?.length;}
}

ui.login.addEventListener('click', login);
ui.logout.addEventListener('click', logout);
ui.load.addEventListener('click', loadResponses);
ui.csv.addEventListener('click', exportCsv);
ui.xlsx.addEventListener('click', exportXlsx);
ui.copy.addEventListener('click', async() => {
  try {await navigator.clipboard.writeText(ui.uid.textContent);status('관리자 UID를 복사했습니다.');}
  catch {status('UID 자동 복사가 제한되었습니다. 화면의 UID를 선택해 복사해 주세요.', 'error');}
});
initBackend().catch(error => {ui.auth.textContent = '인증 준비 오류';status(errorMessage(error), 'error');});