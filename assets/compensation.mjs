/** Validate a Korean mobile number before any network request or persistence. */
export const COMPENSATION_CONSENT_VERSION = 'reward-phone-v1';

export function normalizeMobileNumber(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || !/^[0-9+\s().-]+$/.test(text)) {
    throw new Error('휴대전화 번호를 입력해 주세요.');
  }
  const stripped = text.replace(/[\s().-]/g, '');
  const digits = stripped.startsWith('+82') ? '0' + stripped.slice(3) : stripped;
  if (!/^(?:010[0-9]{8}|01[16789][0-9]{7,8})$/.test(digits)) {
    throw new Error('올바른 휴대전화 번호를 입력해 주세요. 예: 010-1234-5678');
  }
  return digits;
}

/** Personal information is stored in its own collection, never in trials. */
export function makeCompensationRecord(phone, serverTimestamp) {
  return {
    phone: normalizeMobileNumber(phone),
    experimentId: 'social-decision-v1',
    consented: true,
    consentVersion: COMPENSATION_CONSENT_VERSION,
    submittedAt: serverTimestamp
  };
}