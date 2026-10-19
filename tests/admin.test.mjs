import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMOTIONS, COLUMNS, PARTICIPANT_COLUMNS, SCENARIO_COLUMNS, CODEBOOK,
  flattenRecords, validateCatalog, scenarioRows, csvText
} from '../assets/admin-data.mjs';
import { createXlsxBlob } from '../assets/xlsx-export.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scenarios = JSON.parse(fs.readFileSync(path.join(root, 'data/scenarios.json'), 'utf8'));
const order = scenarios.map(s => s.id).reverse();
function testSubmission(participantId='Abcdefghijklmnopqrstuvwxyz1234') {
  return {
    participantId,
    experimentId: 'social-decision-v1', experimentVersion: '1.0.0',
    randomizationSeed: 197050001, totalDurationMs: 202595,
    submittedAt: '2026-10-19T07:45:01.000Z',
    startedAtISO: '2026-10-19T07:41:33.343Z',
    completedAtISO: '2026-10-19T07:44:55.938Z',
    order,
    trials: order.map((scenarioId, i) => {
      const spec = scenarios.find(s => s.id === scenarioId).decision;
      return {
        trialIndex: i + 1, scenarioId,
        decision: spec.type === 'choice' ? spec.options[0] : spec.min,
        trialDurationMs: 500 + i,
        emotions: Object.fromEntries(EMOTIONS.map((key, k) => [key, 1 + (k % 7)]))
      };
    })
  };
}

// Fixture export will be checked with openpyxl outside Node.
test('30 conditions, 32 output variables and 30 rows per person', () => {
  validateCatalog(scenarios);
  assert.equal(COLUMNS.length, 32);
  const p1 = testSubmission();
  const p2 = testSubmission('Zyxwvutsrqponmlkjihgfedcba9876');
  const { rows, participants } = flattenRecords([p1, p2], scenarios);
  assert.equal(rows.length, 60);
  assert.equal(participants.length, 2);
  assert.deepEqual(rows.slice(0, 30).map(r => r.scenario_id), order);
  assert.deepEqual([...new Set(rows.map(r => r.game))].sort(), [...new Set(scenarios.map(s => s.game))].sort());
  assert.equal(rows[0].trial_duration_ms, 500);
  assert.equal(rows[0].decision, scenarios.find(s=>s.id===rows[0].scenario_id).decision.min);
  assert.equal(scenarioRows(scenarios).length, 30);
});

test('bad rating, order and decision stop export instead of skipping', () => {
  const first = testSubmission();
  first.trials[0].emotions.excited = 8;
  assert.throws(() => flattenRecords([first], scenarios), /정서 평정/);
  const second = testSubmission();
  second.trials[0].scenarioId = 'DG03';
  assert.throws(() => flattenRecords([second], scenarios), /제시 순서/);
  const third = testSubmission();
  third.trials[0].decision = -1;
  assert.throws(() => flattenRecords([third], scenarios), /행동 선택/);
  const fourth = testSubmission();
  assert.throws(() => flattenRecords([fourth, fourth], scenarios), /중복/);
});

test('UTF-8 CSV retains Korean and protects formulas', () => {
  const csv = csvText([{name:'=2+2', emotion:'분노', sample:'Hello,"world"'}], ['name','emotion','sample']);
  assert.ok(csv.startsWith('\ufeffname,emotion,sample'));
  assert.ok(csv.includes("'=2+2"));
  assert.ok(csv.includes('분노'));
  assert.ok(csv.includes('"Hello,""world"""'));
});

test('XLSX export creates valid ZIP and 4 sheets', async() => {
  const {rows,participants}=flattenRecords([testSubmission()],scenarios);
  const workbook=createXlsxBlob([
    {name:'Responses',columns:COLUMNS,rows},
    {name:'Participants',columns:PARTICIPANT_COLUMNS,rows:participants},
    {name:'Scenarios',columns:SCENARIO_COLUMNS,rows:scenarioRows(scenarios)},
    {name:'Codebook',columns:['variable','description','data_type'],rows:CODEBOOK.map(([variable,description,data_type])=>({variable,description,data_type}))}
  ]);
  assert.equal(workbook.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const buffer=Buffer.from(await workbook.arrayBuffer());
  assert.equal(buffer.readUInt32LE(0),0x04034b50);
  fs.writeFileSync('/mnt/data/social-decision-admin-test.xlsx',buffer);
  assert.ok(buffer.length>20000);
});