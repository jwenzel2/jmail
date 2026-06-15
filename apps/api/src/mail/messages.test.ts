import { describe, expect, it } from 'vitest';
import { extractRawHeaders } from './messages.js';

describe('extractRawHeaders', () => {
  it('extracts CRLF-separated headers', () => {
    expect(
      extractRawHeaders(Buffer.from('From: sender@example.com\r\nSubject: Hello\r\n\r\nBody')),
    ).toBe('From: sender@example.com\r\nSubject: Hello');
  });

  it('extracts LF-separated headers', () => {
    expect(extractRawHeaders(Buffer.from('From: sender@example.com\nSubject: Hello\n\nBody'))).toBe(
      'From: sender@example.com\nSubject: Hello',
    );
  });
});
