import crypto from 'node:crypto';

const PIN_PATTERN = /^\d{4,6}$/;
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export function isValidPin(pin) {
  return PIN_PATTERN.test(String(pin ?? '').trim());
}

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS).toString('hex');
  return { salt, hash };
}

export function verifyPin(pin, storedHash, storedSalt) {
  if (!storedHash || !storedSalt) return false;
  try {
    const candidate = crypto.scryptSync(String(pin ?? ''), storedSalt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
    const expected = Buffer.from(storedHash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}