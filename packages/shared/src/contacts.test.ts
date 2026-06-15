import { describe, expect, it } from 'vitest';
import { contactInputSchema, contactUpdateSchema } from './contacts.js';

describe('contact schemas', () => {
  it('normalizes contact input', () => {
    expect(
      contactInputSchema.parse({
        displayName: '  Ada Lovelace  ',
        email: ' ada@example.com ',
      }),
    ).toEqual({
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      company: null,
      notes: null,
      favorite: false,
    });
  });

  it('accepts partial updates', () => {
    expect(contactUpdateSchema.parse({ favorite: true })).toEqual({ favorite: true });
  });

  it('rejects invalid email addresses', () => {
    expect(() =>
      contactInputSchema.parse({ displayName: 'Ada Lovelace', email: 'not-an-email' }),
    ).toThrow();
  });
});
