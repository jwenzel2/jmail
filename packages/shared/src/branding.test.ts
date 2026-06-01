import { describe, expect, it } from 'vitest';
import { brandingSchema, DEFAULT_BRANDING } from './branding.js';

describe('branding', () => {
  it('applies defaults for an empty object', () => {
    expect(brandingSchema.parse({})).toEqual(DEFAULT_BRANDING);
  });

  it('rejects an invalid primary color', () => {
    expect(() => brandingSchema.parse({ primaryColor: 'blue' })).toThrow();
  });

  it('defaults the app name to jmail', () => {
    expect(brandingSchema.parse({}).appName).toBe('jmail');
  });
});
