import { describe, expect, it } from 'vitest';
import { senderListUpdateSchema } from './spam.js';

describe('senderListUpdateSchema', () => {
  it('rejects directive injection through sender patterns', () => {
    expect(() =>
      senderListUpdateSchema.parse({
        entries: [{ list: 'allow', pattern: '*@example.com\nrequired_score -100' }],
      }),
    ).toThrow();
  });

  it('normalizes safe patterns', () => {
    expect(
      senderListUpdateSchema.parse({ entries: [{ list: 'block', pattern: ' bad@example.com ' }] }),
    ).toEqual({ entries: [{ list: 'block', pattern: 'bad@example.com' }] });
  });
});
