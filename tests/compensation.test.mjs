import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMobileNumber, makeCompensationRecord, COMPENSATION_CONSENT_VERSION } from '../assets/compensation.mjs';

test('phone normalization accepts common Korean mobile formats', () => {
  assert.equal(normalizeMobileNumber('010-1234-5678'), '01012345678');
  assert.equal(normalizeMobileNumber('010 1234 5678'), '01012345678');
  assert.equal(normalizeMobileNumber('+82 10-1234-5678'), '01012345678');
  assert.equal(normalizeMobileNumber('011-123-4567'), '0111234567');
});

test('rejects invalid, fixed-line, scripts, arbitrary strings', () => {
  for (const bad of ['', 'abc', '<script>', '010-1234-567', '010-1234-56789', '02-1234-5678', '010-0000-123a']) {
    assert.throws(() => normalizeMobileNumber(bad));
  }
});

test('compensation document does not store participant ID or experimental data', () => {
  const record = makeCompensationRecord('010-1234-5678', 'SERVER_TS');
  assert.deepEqual(Object.keys(record).sort(), ['consentVersion','consented','experimentId','phone','submittedAt'].sort());
  assert.equal(record.consentVersion, COMPENSATION_CONSENT_VERSION);
  assert.equal(record.phone, '01012345678');
  assert.equal(record.submittedAt, 'SERVER_TS');
});