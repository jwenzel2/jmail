import { describe, expect, it } from 'vitest';
import { parseDumpMagic } from './parseMagic.js';

const SAMPLE = `0.000          0          3          0  non-token data: bayes db version
0.000          0        450          0  non-token data: nspam
0.000          0        612          0  non-token data: nham
0.000          0      85000          0  non-token data: ntokens
0.000          0          0          0  non-token data: last journal sync atime`;

describe('parseDumpMagic', () => {
  it('parses spam/ham/token counts and db version', () => {
    const s = parseDumpMagic(SAMPLE);
    expect(s.nSpam).toBe(450);
    expect(s.nHam).toBe(612);
    expect(s.nTokens).toBe(85000);
    expect(s.dbVersion).toBe(3);
    expect(s.trained).toBe(true);
  });

  it('reports not-trained below the 200/200 threshold', () => {
    const s = parseDumpMagic(
      `0.000 0 10 0  non-token data: nspam\n0.000 0 5 0  non-token data: nham`,
    );
    expect(s.trained).toBe(false);
  });

  it('accepts dump layouts with fewer leading columns', () => {
    const s = parseDumpMagic(
      `0.000 8 0 non-token data: nspam\n0.000 350 0 non-token data: nham`,
    );
    expect(s.nSpam).toBe(8);
    expect(s.nHam).toBe(350);
  });

  it('returns zeros for empty output', () => {
    expect(parseDumpMagic('')).toEqual({
      nSpam: 0,
      nHam: 0,
      nTokens: 0,
      dbVersion: null,
      trained: false,
    });
  });
});
