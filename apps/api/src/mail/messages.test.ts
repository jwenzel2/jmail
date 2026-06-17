import { describe, expect, it } from 'vitest';
import type { MessageSummary } from '@jmail/shared';
import { applyMessageListOptions, extractRawHeaders } from './messages.js';

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

const baseSummary: MessageSummary = {
  uid: 1,
  subject: 'Alpha',
  from: [{ name: null, address: 'a@example.com' }],
  to: [],
  date: '2026-01-01T00:00:00.000Z',
  seen: true,
  flagged: false,
  answered: false,
  hasAttachments: false,
  preview: '',
  size: 100,
};

describe('applyMessageListOptions', () => {
  const messages: MessageSummary[] = [
    baseSummary,
    {
      ...baseSummary,
      uid: 2,
      subject: 'Bravo',
      from: [{ name: null, address: 'z@example.com' }],
      date: '2026-01-03T00:00:00.000Z',
      seen: false,
      hasAttachments: true,
      size: 300,
    },
    {
      ...baseSummary,
      uid: 3,
      subject: 'Charlie',
      from: [{ name: null, address: 'm@example.com' }],
      date: '2026-01-02T00:00:00.000Z',
      flagged: true,
      answered: true,
      size: 200,
    },
  ];

  it('filters unread and attachment messages', () => {
    expect(applyMessageListOptions(messages, 'unread', 'dateDesc').map((m) => m.uid)).toEqual([2]);
    expect(
      applyMessageListOptions(messages, 'hasAttachments', 'dateDesc').map((m) => m.uid),
    ).toEqual([2]);
  });

  it('sorts by date, sender, and size', () => {
    expect(applyMessageListOptions(messages, 'all', 'dateAsc').map((m) => m.uid)).toEqual([
      1, 3, 2,
    ]);
    expect(applyMessageListOptions(messages, 'all', 'fromDesc').map((m) => m.uid)).toEqual([
      2, 3, 1,
    ]);
    expect(applyMessageListOptions(messages, 'all', 'sizeDesc').map((m) => m.uid)).toEqual([
      2, 3, 1,
    ]);
  });
});
