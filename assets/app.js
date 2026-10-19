import { saveToFirestore } from './firebase-client.js';

const CONFIG = window.EXPERIMENT_CONFIG || {};
const STORAGE_KEY = 'emolab-social-decision-v1';
const EMOTIONS = [
  { key: 'excited', label: '신남', low: '전혀 신나지 않음', high: '매우 신남' },
  { key: 'joyful', label: '기쁨', low: '전혀 기쁘지 않음', high: '매우 기쁨' },
  { key: 'elated', label: '들뜸', low: '전혀 들뜨지 않음', high: '매우 들뜸' },
  { key: 'serene', label: '평온함', low: '전혀 평온하지 않음', high: '매우 평온함' },
  { key: 'relaxed', label: '편안함', low: '전혀 편안하지 않음', high: '매우 편안함' },
  { key: 'contented', label: '만족감', low: '전혀 만족스럽지 않음', high: '매우 만족스러움' },
  { key: 'angry', label: '분노', low: '전혀 분노하지 않음', high: '매우 분노함' },
  { key: 'anxious', label: '불안', low: '전혀 불안하지 않음', high: '매우 불안함' },
  { key: 'fearful', label: '두려움', low: '전혀 두렵지 않음', high: '매우 두려움' },
  { key: 'sad', label: '슬픔', low: '전혀 슬프지 않음', high: '매우 슬픔' },
  { key: 'gloomy', label: '침울함', low: '전혀 침울하지 않음', high: '매우 침울함' },
  { key: 'downhearted', label: '낙담', low: '전혀 낙담하지 않음', high: '매우 낙담함' }
];

const $ = (id) => document.getElementById(id);
let scenarioMap = new Map();
let state = null;
let currentScreen = 'loading';
let activeSince = null;
// Prevent accidental real submissions before Authentication and Firestore rules are verified.
const isPreview = CONFIG.submissionsEnabled !== true ||
  !(CONFIG.firebase && CONFIG.firebase.apiKey && CONFIG.firebase.projectId && CONFIG.firebase.appId);

function showScreen(which) {
  for (const id of ['loading', 'welcome', 'trial', 'finish', 'success', 'error']) {
    $(id + '-view').hidden = id !== which;
  }
  currentScreen = which;
  window.scrollTo(0, 0);
}

function seededRandom(seed) {
  let x = seed >>> 0;
  return function () {
    x += 0x6D2B79F5;
    let y = x;
    y = Math.imul(y ^ (y >>> 15), y | 1);
    y ^= y + Math.imul(y ^ (y >>> 7), y | 61);
    return ((y ^ (y >>> 14)) >>> 0) / 4294967296;
  };
}

function randomOrder(ids, seed) {
  const result = [...ids];
  const random = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function readSaved() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}
function persist() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { /* Browser may prohibit session storage; the current session remains usable. */ }
}
function clearSaved() {
  try { sessionStorage.removeItem(STORAGE_KEY); }
  catch { /* Ignore restricted storage. */ }
}
function startActiveTiming() {
  if (currentScreen === 'trial' && !document.hidden) activeSince = Date.now();
}
function checkpointTiming() {
  if (currentScreen === 'trial' && state && activeSince !== null) {
    state.draft.activeDurationMs += Math.max(0, Date.now() - activeSince);
  }
  activeSince = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { checkpointTiming(); persist(); }
  else startActiveTiming();
});
window.addEventListener('pagehide', () => { checkpointTiming(); persist(); });

function createState() {
  const bytes = new Uint32Array(1);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else bytes[0] = Date.now() >>> 0;
  return {
    experimentVersion: CONFIG.experimentVersion || '1.0.0',
    seed: Number(bytes[0]),
    order: randomOrder([...scenarioMap.keys()], Number(bytes[0])),
    index: 0,
    startedAtISO: new Date().toISOString(),
    trials: [],
    draft: { emotions: {}, choice: null, activeDurationMs: 0 }
  };
}

function validateScenarios(data) {
  if (!Array.isArray(data) || data.length !== 30) throw new Error('시나리오가 정확히 30개가 아닙니다.');
  const ids = new Set(); const grouped = {};
  for (const sc of data) {
    if (!/^(PD|UG|PG|TG|DG)0[1-6]$/.test(sc.id) || ids.has(sc.id)) throw new Error('시나리오 ID에 오류가 있습니다.');
    if (!sc.body || !sc.question || !sc.decision) throw new Error(sc.id + '에 필수 내용이 없습니다.');
    if (sc.decision.type === 'choice' && (!Array.isArray(sc.decision.options) || sc.decision.options.length !== 2)) throw new Error(sc.id + '의 행동 선택지가 잘못되었습니다.');
    if (sc.decision.type === 'amount' && (!(sc.decision.step > 0) || sc.decision.max <= sc.decision.min)) throw new Error(sc.id + '의 금액 범위가 잘못되었습니다.');
    ids.add(sc.id); grouped[sc.game] = (grouped[sc.game] || 0) + 1;
  }
  if (Object.values(grouped).length !== 5 || !Object.values(grouped).every(x => x === 6)) throw new Error('게임별 시나리오 수가 잘못되었습니다.');
}

function validSaved(saved) {
  return saved && saved.experimentVersion === (CONFIG.experimentVersion || '1.0.0') &&
    Array.isArray(saved.order) && saved.order.length === 30 &&
    new Set(saved.order).size === 30 && saved.order.every(id => scenarioMap.has(id)) &&
    Number.isInteger(saved.index) && saved.index >= 0 && saved.index <= 30 &&
    Array.isArray(saved.trials) && saved.trials.length === saved.index &&
    saved.draft && typeof saved.draft.emotions === 'object';
}

function makeEmotionRow(emotion) {
  const item = document.createElement('div'); item.className = 'emotion-item';
  const name = document.createElement('div'); name.className = 'emotion-name'; name.textContent = emotion.label;
  const wrap = document.createElement('div');
  const mobile = document.createElement('div'); mobile.className = 'scale-label-mobile';
  const mobileLow = document.createElement('span'); mobileLow.className = 'scale-label'; mobileLow.textContent = emotion.low;
  const mobileHigh = document.createElement('span'); mobileHigh.className = 'scale-label right'; mobileHigh.textContent = emotion.high;
  mobile.append(mobileLow, mobileHigh);
  const row = document.createElement('div'); row.className = 'scale-row';
  const left = document.createElement('span'); left.className = 'scale-label left'; left.textContent = emotion.low;
  const right = document.createElement('span'); right.className = 'scale-label right'; right.textContent = emotion.high;
  const options = document.createElement('div'); options.className = 'scale-options';
  options.setAttribute('role', 'radiogroup'); options.setAttribute('aria-label', emotion.label + ' 강도');
  for (let value = 1; value <= 7; value++) {
    const label = document.createElement('label'); label.className = 'scale-choice';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'emotion-' + emotion.key; input.value = String(value);
    input.setAttribute('aria-label', emotion.label + ' ' + value + '점');
    input.checked = state.draft.emotions[emotion.key] === value;
    input.addEventListener('change', () => {
      state.draft.emotions[emotion.key] = value;
      persist(); updateCompletion();
    });
    const square = document.createElement('span'); square.className = 'scale-button'; square.textContent = String(value);
    label.append(input, square); options.append(label);
  }
  row.append(left, options, right);
  wrap.append(mobile, row); item.append(name, wrap); return item;
}

function makeDecision(sc) {
  const target = $('decision-controls'); target.replaceChildren();
  if (sc.decision.type === 'choice') {
    for (const answer of sc.decision.options) {
      const label = document.createElement('label'); label.className = 'decision-choice';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'decision'; radio.value = answer;
      radio.checked = state.draft.choice === answer;
      radio.addEventListener('change', () => { state.draft.choice = answer; persist(); updateCompletion(); });
      const text = document.createElement('span'); text.textContent = answer;
      label.append(radio, text); target.append(label);
    }
  } else {
    const select = document.createElement('select'); select.className = 'amount-select'; select.setAttribute('aria-label', '선택할 금액');
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '금액을 선택해 주세요'; select.append(placeholder);
    for (let n = sc.decision.min; n <= sc.decision.max; n += sc.decision.step) {
      const option = document.createElement('option'); option.value = String(n); option.textContent = n.toLocaleString('ko-KR') + '원'; select.append(option);
    }
    select.value = state.draft.choice === null ? '' : String(state.draft.choice);
    select.addEventListener('change', () => {
      state.draft.choice = select.value === '' ? null : Number(select.value);
      persist(); updateCompletion();
    });
    target.append(select);
    const note = document.createElement('span'); note.className = 'amount-label';
    note.textContent = sc.decision.step.toLocaleString('ko-KR') + '원 단위로 선택';
    target.append(note);
  }
}

function updateCompletion() {
  const filled = EMOTIONS.filter(e => Number.isInteger(state.draft.emotions[e.key]) && state.draft.emotions[e.key] >= 1 && state.draft.emotions[e.key] <= 7).length;
  const chosen = state.draft.choice !== null && state.draft.choice !== undefined && state.draft.choice !== '';
  const ready = filled === 12 && chosen;
  $('next-btn').disabled = !ready;
  $('response-check').textContent = ready ? '모든 응답이 완료되었습니다.' : '정서 ' + filled + '/12 · 행동 선택 ' + (chosen ? '완료' : '미완료');
}

function showTrial() {
  if (!state || state.index >= 30) { showFinish(); return; }
  showScreen('trial');
  const sc = scenarioMap.get(state.order[state.index]);
  $('trial-progress-label').textContent = String(state.index + 1).padStart(2, '0') + ' / 30';
  const pct = Math.round(100 * (state.index + 1) / 30);
  $('trial-percentage').textContent = pct + '%';
  $('progress-fill').style.width = pct + '%';
  // No condition name, game name or "사회적 의사결정 상황" heading appears here.
  $('scenario-body').textContent = sc.body;
  const list = $('emotion-list'); list.replaceChildren();
  for (const emotion of EMOTIONS) list.append(makeEmotionRow(emotion));
  $('decision-legend').textContent = sc.question;
  makeDecision(sc); updateCompletion(); startActiveTiming();
}

function validateChoice(sc, choice) {
  if (sc.decision.type === 'choice') return sc.decision.options.includes(choice);
  return Number.isInteger(choice) && choice >= sc.decision.min && choice <= sc.decision.max &&
    (choice - sc.decision.min) % sc.decision.step === 0;
}

function advance(event) {
  event.preventDefault();
  const sc = scenarioMap.get(state.order[state.index]);
  if (!EMOTIONS.every(e => Number.isInteger(state.draft.emotions[e.key]) && state.draft.emotions[e.key] >= 1 && state.draft.emotions[e.key] <= 7) || !validateChoice(sc, state.draft.choice)) return;
  checkpointTiming();
  const captured = {};
  for (const e of EMOTIONS) captured[e.key] = state.draft.emotions[e.key];
  state.trials.push({
    trialIndex: state.index + 1,
    scenarioId: sc.id,
    emotions: captured,
    decision: state.draft.choice,
    trialDurationMs: Math.round(state.draft.activeDurationMs)
  });
  state.index++;
  state.draft = { emotions: {}, choice: null, activeDurationMs: 0 };
  persist();
  if (state.index === 30) showFinish();
  else showTrial();
}

function buildPayload() {
  return {
    experimentId: CONFIG.experimentId || 'social-decision-v1',
    experimentVersion: CONFIG.experimentVersion || '1.0.0',
    randomizationSeed: state.seed,
    order: state.order,
    startedAtISO: state.startedAtISO,
    completedAtISO: new Date().toISOString(),
    trials: state.trials,
    totalDurationMs: Date.now() - Date.parse(state.startedAtISO)
  };
}

function showFinish() {
  showScreen('finish');
  $('finish-preview-notice').hidden = !isPreview;
  $('export-btn').hidden = !isPreview;
  $('submit-btn').textContent = isPreview ? '미리보기 종료' : '응답 제출하기 →';
  $('finish-description').textContent = isPreview ? '30개 문항을 모두 완료했습니다. 현재는 미리보기 모드입니다.' : '30개 문항을 모두 완료했습니다. 마지막으로 제출 버튼을 눌러 주세요.';
  $('submit-error').hidden = true;
}

function exportDraft() {
  const text = JSON.stringify(buildPayload(), null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'social-decision-preview-' + Date.now() + '.json';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function submit() {
  if (!state || state.trials.length !== 30) return;
  if (isPreview) {
    showScreen('success');
    $('success-view').querySelector('h1').textContent = '미리보기가 완료되었습니다.';
    $('success-description').textContent = '응답은 연구 서버에 저장되지 않았습니다. 테스트하려면 이 페이지에서 새로 시작할 수 있습니다.';
    clearSaved(); state = null;
    return;
  }
  $('submit-error').hidden = true;
  const button = $('submit-btn'); button.disabled = true; button.textContent = '안전하게 저장 중…';
  try {
    await saveToFirestore(CONFIG, buildPayload());
    clearSaved(); state = null;
    showScreen('success');
    $('success-description').textContent = '응답이 안전하게 저장되었습니다. 참여해 주셔서 감사합니다.';
  } catch (error) {
    console.error('Save error:', error.code || error.name || 'unknown');
    $('submit-error').textContent = '응답이 아직 저장되지 않았습니다. 네트워크 또는 서버 설정을 확인한 후 다시 시도해 주세요. 입력한 내용은 이 탭에 임시 보관됩니다.';
    $('submit-error').hidden = false;
    $('export-btn').hidden = false;
  } finally {
    button.disabled = false; button.textContent = '응답 제출 다시 시도';
  }
}

async function init() {
  try {
    const response = await fetch('./data/scenarios.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('시나리오 파일을 불러올 수 없습니다.');
    const scenarios = await response.json(); validateScenarios(scenarios);
    scenarioMap = new Map(scenarios.map(s => [s.id, s]));
    state = readSaved();
    if (validSaved(state)) {
      if (state.index === 30) showFinish(); else showTrial();
    } else {
      state = null; clearSaved(); showScreen('welcome');
    }
    $('preview-notice').hidden = !isPreview;
  } catch (error) {
    showScreen('error'); $('error-message').textContent = error.message || '알 수 없는 오류가 발생했습니다.';
  }
}

$('acknowledge').addEventListener('change', (e) => { $('start-btn').disabled = !e.target.checked; });
$('start-btn').addEventListener('click', () => { state = createState(); persist(); showTrial(); });
$('response-form').addEventListener('submit', advance);
$('submit-btn').addEventListener('click', submit);
$('export-btn').addEventListener('click', exportDraft);
$('reload-btn').addEventListener('click', () => location.reload());
init();