/**
 * Pure conversion layer for researcher exports. Runs in browsers and Node tests.
 * Participant submissions are untrusted; malformed records stop export rather
 * than silently dropping rows or contaminating statistical analyses.
 */
export const EMOTIONS = Object.freeze([
  'excited', 'joyful', 'elated', 'serene', 'relaxed', 'contented',
  'angry', 'anxious', 'fearful', 'sad', 'gloomy', 'downhearted'
]);
export const COLUMNS = Object.freeze([
  'participant_id', 'experiment_id', 'experiment_version', 'submitted_at',
  'started_at', 'completed_at', 'session_duration_ms', 'randomization_seed',
  'trial_index', 'scenario_id', 'game', 'condition_a', 'condition_b',
  'condition_a_note', 'condition_b_note', 'condition_a_numeric',
  'stake_krw', 'other_endowment_krw', 'decision', 'trial_duration_ms',
  ...EMOTIONS
]);
export const PARTICIPANT_COLUMNS = Object.freeze([
  'participant_id', 'experiment_id', 'experiment_version', 'submitted_at',
  'started_at', 'completed_at', 'session_duration_ms', 'randomization_seed',
  'trial_count'
]);
export const SCENARIO_COLUMNS = Object.freeze([
  'scenario_id', 'game', 'game_ko', 'condition_a', 'condition_b',
  'condition_a_note', 'condition_b_note', 'condition_a_numeric',
  'stake_krw', 'other_endowment_krw', 'decision_type', 'decision_options',
  'decision_min_krw', 'decision_max_krw', 'decision_step_krw'
]);

const prefixes = ['PD', 'UG', 'PG', 'TG', 'DG'];
const EXPECTED = new Set(prefixes.flatMap(prefix =>
  Array.from({length: 6}, (_, n) => `${prefix}${String(n + 1).padStart(2, '0')}`)
));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateCatalog(scenarios) {
  assert(Array.isArray(scenarios) && scenarios.length === 30, '시나리오가 정확히 30개여야 합니다.');
  const ids = scenarios.map(item => item.id);
  assert(ids.length === new Set(ids).size && ids.every(id => EXPECTED.has(id)), '시나리오 ID 구성이 잘못되었습니다.');
  for (const s of scenarios) {
    assert(s.game && s.gameKo && [1, 2, 3].includes(s.conditionA) && [1, 2].includes(s.conditionB), `${s.id}: 설계 메타데이터가 잘못되었습니다.`);
    assert(s.decision && ['choice', 'amount'].includes(s.decision.type), `${s.id}: 행동 선택 정의가 없습니다.`);
  }
  return new Map(scenarios.map(s => [s.id, s]));
}

function isoTimestamp(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  throw new Error('제출 시각 형식이 잘못되었습니다.');
}

function verifyDecision(scenario, value) {
  const spec = scenario.decision;
  if (spec.type === 'choice') return Array.isArray(spec.options) && spec.options.includes(value);
  return Number.isInteger(value) && value >= spec.min && value <= spec.max &&
    Number.isInteger(spec.step) && spec.step > 0 && (value - spec.min) % spec.step === 0;
}

export function flattenRecords(records, scenarios) {
  const lookup = validateCatalog(scenarios);
  assert(Array.isArray(records), '응답 데이터 형식이 잘못되었습니다.');
  const rows = [];
  const participants = [];
  const seenIds = new Set();
  for (const record of records) {
    const p = record?.participantId;
    assert(typeof p === 'string' && /^[a-zA-Z0-9_-]{12,140}$/.test(p), '참가자 ID가 올바르지 않습니다.');
    assert(!seenIds.has(p), `참가자 ${p}: 중복 응답 문서가 있습니다.`);
    seenIds.add(p);
    assert(record.experimentId === 'social-decision-v1' && record.experimentVersion === '1.0.0', `참가자 ${p}: 실험 버전이 다릅니다.`);
    assert(Number.isInteger(record.randomizationSeed) && record.randomizationSeed >= 0, `참가자 ${p}: 무작위화 정보가 잘못되었습니다.`);
    assert(Number.isInteger(record.totalDurationMs) && record.totalDurationMs >= 0, `참가자 ${p}: 응답시간이 잘못되었습니다.`);
    assert(Array.isArray(record.order) && record.order.length === 30 &&
      new Set(record.order).size === 30 && record.order.every(id => lookup.has(id)), `참가자 ${p}: 시나리오 순서가 올바르지 않습니다.`);
    assert(Array.isArray(record.trials) && record.trials.length === 30, `참가자 ${p}: 30개 응답이 저장되지 않았습니다.`);
    const submittedAt = isoTimestamp(record.submittedAt);
    const started = isoTimestamp(record.startedAtISO);
    const completed = isoTimestamp(record.completedAtISO);
    participants.push({
      participant_id: p, experiment_id: record.experimentId,
      experiment_version: record.experimentVersion, submitted_at: submittedAt,
      started_at: started, completed_at: completed,
      session_duration_ms: record.totalDurationMs,
      randomization_seed: record.randomizationSeed, trial_count: 30
    });
    for (let index = 0; index < 30; index++) {
      const trial = record.trials[index];
      const scenarioId = record.order[index];
      assert(trial && trial.trialIndex === index + 1 && trial.scenarioId === scenarioId,
        `참가자 ${p}: ${index + 1}번째 제시 순서가 일치하지 않습니다.`);
      const emotions = trial.emotions;
      assert(emotions && typeof emotions === 'object' && Object.keys(emotions).length === 12 &&
        EMOTIONS.every(key => Number.isInteger(emotions[key]) && emotions[key] >= 1 && emotions[key] <= 7),
        `참가자 ${p}: ${index + 1}번째 정서 평정이 올바르지 않습니다.`);
      assert(Number.isInteger(trial.trialDurationMs) && trial.trialDurationMs >= 0,
        `참가자 ${p}: ${index + 1}번째 응답시간이 잘못되었습니다.`);
      const s = lookup.get(scenarioId);
      assert(verifyDecision(s, trial.decision),
        `참가자 ${p}: ${index + 1}번째 행동 선택이 올바르지 않습니다.`);
      rows.push({
        participant_id: p, experiment_id: record.experimentId,
        experiment_version: record.experimentVersion, submitted_at: submittedAt,
        started_at: started, completed_at: completed,
        session_duration_ms: record.totalDurationMs,
        randomization_seed: record.randomizationSeed,
        trial_index: index + 1, scenario_id: scenarioId,
        game: s.game, condition_a: s.conditionA,
        condition_b: s.conditionB, condition_a_note: s.conditionANote,
        condition_b_note: s.conditionBNote, condition_a_numeric: s.conditionANumeric ?? null,
        stake_krw: s.stakeKRW ?? null, other_endowment_krw: s.otherEndowmentKRW ?? null,
        decision: trial.decision, trial_duration_ms: trial.trialDurationMs,
        ...Object.fromEntries(EMOTIONS.map(key => [key, emotions[key]]))
      });
    }
  }
  return { rows, participants };
}

export function scenarioRows(scenarios) {
  validateCatalog(scenarios);
  return scenarios.map(s => ({
    scenario_id: s.id, game: s.game, game_ko: s.gameKo,
    condition_a: s.conditionA, condition_b: s.conditionB,
    condition_a_note: s.conditionANote, condition_b_note: s.conditionBNote,
    condition_a_numeric: s.conditionANumeric ?? null,
    stake_krw: s.stakeKRW ?? null, other_endowment_krw: s.otherEndowmentKRW ?? null,
    decision_type: s.decision.type,
    decision_options: s.decision.type === 'choice' ? s.decision.options.join(' | ') : '',
    decision_min_krw: s.decision.min ?? null,
    decision_max_krw: s.decision.max ?? null,
    decision_step_krw: s.decision.step ?? null
  }));
}

export const CODEBOOK = [
  ['participant_id', 'Firebase 익명 참가자 식별자', 'string'],
  ['experiment_id', '실험 식별자', 'string'],
  ['experiment_version', '실험 버전', 'string'],
  ['submitted_at', 'Firebase 서버 제출 시각 (UTC ISO 8601)', 'datetime text'],
  ['started_at', '실험 시작 시각 (UTC ISO 8601)', 'datetime text'],
  ['completed_at', '참가자가 마지막 문항 후 제출한 시각 (UTC ISO 8601)', 'datetime text'],
  ['session_duration_ms', '실험 시작부터 제출 준비까지 경과한 시간 (밀리초)', 'integer'],
  ['randomization_seed', '시나리오 순서 생성에 사용한 seed', 'integer'],
  ['trial_index', '해당 참가자의 실제 제시 순번 1~30', 'integer'],
  ['scenario_id', 'PD01 등 시나리오 식별자', 'string'],
  ['game', '경제 게임 종류 (영문)', 'string'],
  ['condition_a', '게임별 사회적 조건 코드 1~3', 'integer'],
  ['condition_b', '중대성 조건 코드 1(낮음), 2(높음)', 'integer'],
  ['condition_a_note', '게임별 사회적 조건의 실질적 의미', 'string'],
  ['condition_b_note', '중대성 조건 설명', 'string'],
  ['condition_a_numeric', '사회적 조건 수치 (게임마다 의미 다름)', 'number or blank'],
  ['stake_krw', '해당 금액 조건의 기준 액수 (원); PD에는 없음', 'integer or blank'],
  ['other_endowment_krw', '상대 초기 보유 금액 (원); DG 등 관련 조건', 'integer or blank'],
  ['decision', '행동 선택 텍스트 또는 원화 정수', 'string/integer'],
  ['trial_duration_ms', '해당 시나리오 화면 활성 시간 (밀리초); 단일 결정 반응시간 아님', 'integer'],
  ['excited', '신남 평정 1~7', 'integer'],
  ['joyful', '기쁨 평정 1~7', 'integer'],
  ['elated', '들뜸 평정 1~7', 'integer'],
  ['serene', '평온함 평정 1~7', 'integer'],
  ['relaxed', '편안함 평정 1~7', 'integer'],
  ['contented', '만족감 평정 1~7', 'integer'],
  ['angry', '분노 평정 1~7', 'integer'],
  ['anxious', '불안 평정 1~7', 'integer'],
  ['fearful', '두려움 평정 1~7', 'integer'],
  ['sad', '슬픔 평정 1~7', 'integer'],
  ['gloomy', '침울함 평정 1~7', 'integer'],
  ['downhearted', '낙담 평정 1~7', 'integer'],
  ['trial_count', '완료된 시나리오 개수 (Participants 시트)', 'integer']
];

/** UTF-8 with BOM, RFC 4180 quoting, and Excel CSV formula-injection protection. */
export function csvText(rows, columns) {
  const safe = value => {
    if (value === undefined || value === null) return '';
    let text = String(value);
    // Avoid spreadsheet formula evaluation when strings come from untrusted clients.
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return '\ufeff' + [columns.join(','), ...rows.map(row => columns.map(key => safe(row[key])).join(','))].join('\r\n') + '\r\n';
}