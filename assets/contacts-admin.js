import { createXlsxBlob } from './xlsx-export.mjs';
import { normalizeMobileNumber, COMPENSATION_CONSENT_VERSION } from './compensation.mjs';

const CONFIG = window.EXPERIMENT_CONFIG || {};
const SDK = '11.6.0';
const $ = id => document.getElementById(id);
const ui = {
  login: $('contact-admin-login'), logout: $('contact-admin-logout'), auth: $('contact-admin-auth'),
  identity: $('contact-admin-identity'), email: $('contact-admin-email'), load: $('contact-admin-load'),
  message: $('contact-admin-message'), count: $('contact-admin-count'), newest: $('contact-admin-newest'),
  list: $('contact-admin-list'), export: $('contact-admin-export')
};
let auth, authMod, storeMod, db;
let submissions = null;
let requestSerial = 0;

function say(message, isError = false) {
  ui.message.textContent = message;
  if (isError) ui.message.dataset.tone = 'error';
  else delete ui.message.dataset.tone;
}
function hasGoogleProvider(user) {
  return Boolean(user?.providerData?.some(p => p.providerId === 'google.com'));
}
function forget() {
  submissions = null;
  ui.count.textContent = '—';
  ui.newest.textContent = '—';
  ui.export.disabled = true;
  ui.list.replaceChildren();
  const row = document.createElement('tr'), cell = document.createElement('td');
  cell.colSpan = 2; cell.className = 'admin-empty';
  cell.textContent = '연락처를 불러오면 여기에 표시됩니다.';
  row.append(cell); ui.list.append(row);
}
function readableError(error) {
  if (error?.code === 'permission-denied') return '연락처 조회 권한이 없습니다. Firestore Rules에 보상 연락처 컬렉션 규칙을 게시했는지 확인해 주세요.';
  if (error?.code === 'auth/unauthorized-domain') return 'Firebase Authentication에서 jongwankim80.github.io 도메인을 허용해 주세요.';
  if (error?.code === 'auth/popup-blocked') return 'Google 로그인 팝업 차단을 해제해 주세요.';
  return String(error?.message || error?.code || '알 수 없는 오류');
}
function isoTimestamp(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  throw new Error('연락처의 제출 시각이 잘못되었습니다.');
}
function formatDate(iso) {
  return new Date(iso).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'});
}
function formatPhone(phone) {
  const normalized = normalizeMobileNumber(phone);
  return normalized.startsWith('010')
    ? normalized.slice(0, 3) + '-' + normalized.slice(3, 7) + '-' + normalized.slice(7)
    : normalized.slice(0, 3) + '-' + normalized.slice(3, -4) + '-' + normalized.slice(-4);
}
function render() {
  const items = submissions ?? [];
  ui.count.textContent = items.length.toLocaleString('ko-KR');
  const recent = [...items].sort((a,b)=>b.submitted_at.localeCompare(a.submitted_at));
  ui.newest.textContent = recent.length ? formatDate(recent[0].submitted_at) : '—';
  ui.list.replaceChildren();
  if (!recent.length) {
    const row=document.createElement('tr'), cell=document.createElement('td');
    cell.colSpan=2; cell.className='admin-empty';cell.textContent='수집된 연락처가 없습니다.';
    row.append(cell);ui.list.append(row);
  }
  for (const item of recent.slice(0, 15)) {
    const row=document.createElement('tr');
    const phone=document.createElement('td'), date=document.createElement('td');
    const safe=formatPhone(item.phone);
    phone.textContent=safe.slice(0, 4) + '****-' + safe.slice(-4);
    date.textContent=formatDate(item.submitted_at);
    row.append(phone,date);ui.list.append(row);
  }
  ui.export.disabled = !recent.length;
}
async function init() {
  if (!CONFIG.firebase?.apiKey || !CONFIG.firebase?.projectId || !CONFIG.firebase?.appId) throw new Error('Firebase 설정이 없습니다.');
  const [firebase, authentication, firestore] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`)
  ]);
  const app = firebase.getApps().find(a=>a.name==='social-decision-contacts-admin') ||
    firebase.initializeApp(CONFIG.firebase, 'social-decision-contacts-admin');
  authMod = authentication; storeMod=firestore;
  auth=authentication.getAuth(app);db=firestore.getFirestore(app);
  await authentication.setPersistence(auth, authentication.browserSessionPersistence);
  authentication.onAuthStateChanged(auth, user => {
    requestSerial++;
    forget();
    const ok=hasGoogleProvider(user);
    ui.login.hidden=ok;ui.logout.hidden=!ok;ui.identity.hidden=!ok;ui.load.disabled=!ok;
    if(ok){ui.auth.textContent='Google 로그인됨';ui.email.textContent=user.email||'';say('로그인했습니다. 연락처 불러오기를 눌러 주세요.');}
    else{ui.auth.textContent='로그인되지 않음';say('관리자 Google 계정으로 로그인해 주세요.');}
  }, error => say(readableError(error), true));
  ui.login.disabled=false;
}
async function login(){
  ui.login.disabled=true;
  try{await authMod.signInWithPopup(auth,new authMod.GoogleAuthProvider());}
  catch(error){say(readableError(error),true);}
  finally{ui.login.disabled=false;}
}
async function logout(){
  requestSerial++; forget();
  try{await authMod.signOut(auth);}catch(error){say(readableError(error),true);}
}
async function load(){
  const user=auth?.currentUser;
  if(!hasGoogleProvider(user)){say('관리자 Google 계정으로 로그인해 주세요.',true);return;}
  const serial=++requestSerial, uid=user.uid;
  forget();ui.load.disabled=true;
  try {
    say('Firebase에서 보상 연락처를 불러오는 중입니다…');
    const collection=storeMod.collection(db,'experiments',CONFIG.experimentId,'compensation_contacts');
    const collected=[];
    let last=null, page=0;
    do{
      const q=last
        ? storeMod.query(collection,storeMod.orderBy(storeMod.documentId()),storeMod.startAfter(last),storeMod.limit(200))
        : storeMod.query(collection,storeMod.limit(200));
      const result=await storeMod.getDocs(q);
      if(serial!==requestSerial || auth.currentUser?.uid!==uid)return;
      for(const doc of result.docs){
        const data=doc.data();
        if(Object.keys(data).sort().join(',')!==['consentVersion','consented','experimentId','phone','submittedAt'].sort().join(','))throw new Error('연락처 데이터 항목이 예상과 다릅니다.');
        if(data.experimentId!==CONFIG.experimentId || data.consented!==true || data.consentVersion!==COMPENSATION_CONSENT_VERSION)throw new Error('연락처 동의/버전 정보가 올바르지 않습니다.');
        const phone=normalizeMobileNumber(data.phone);
        const timestamp=isoTimestamp(data.submittedAt);
        collected.push({phone, submitted_at: timestamp, consent_version: data.consentVersion});
      }
      page++;
      if(page>100)throw new Error('연락처가 2만 건을 넘었습니다. 관리자 내보내기 프로그램을 이용해 주세요.');
      last=result.size===200?result.docs[result.docs.length-1]:null;
    }while(last);
    if(serial!==requestSerial || auth.currentUser?.uid!==uid)return;
    submissions=collected;render();
    say(`연락처 ${submissions.length.toLocaleString('ko-KR')}건을 불러왔습니다.`);
  }catch(error){if(serial===requestSerial){forget();say(readableError(error),true);}console.error('[Compensation Console] 조회 실패:',error?.code||error?.message||'unknown');}
  finally{if(serial===requestSerial)ui.load.disabled=false;}
}
function download(){
  if(!hasGoogleProvider(auth?.currentUser)||!submissions?.length)return;
  const rows=submissions.map(item=>({phone:formatPhone(item.phone),submitted_at:item.submitted_at,consent_version:item.consent_version}));
  const blob=createXlsxBlob([{name:'CompensationContacts',columns:['phone','submitted_at','consent_version'],rows}]);
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  const day=new Date().toISOString().slice(0,10);
  anchor.href=url;anchor.download=`social-decision-compensation-${day}.xlsx`;
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  say(`${rows.length}건의 보상 연락처 Excel 다운로드를 시작했습니다.`);
}
ui.login.addEventListener('click',login);
ui.logout.addEventListener('click',logout);
ui.load.addEventListener('click',load);
ui.export.addEventListener('click',download);
init().catch(error=>{ui.auth.textContent='인증 준비 실패';say(readableError(error),true);});