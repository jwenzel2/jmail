import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from './crypto.js';

describe('token crypto', () => {
  it('round-trips a token', () => {
    const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'));
  });

  it('rejects tampered ciphertext', () => {
    const enc = encryptToken('secret');
    const buf = Buffer.from(enc, 'base64');
    const last = buf.length - 1;
    buf[last] = (buf[last] ?? 0) ^ 0xff; // flip a ciphertext byte
    expect(() => decryptToken(buf.toString('base64'))).toThrow();
  });
});
