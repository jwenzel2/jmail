import { describe, expect, it } from 'vitest';
import { MAX_SEND_ATTACHMENTS_BYTES, sendMessageSchema } from './mail.js';

const baseMessage = {
  to: ['person@example.com'],
  subject: 'Hello',
  text: 'Body',
};

describe('sendMessageSchema', () => {
  it('accepts attachment payloads', () => {
    const parsed = sendMessageSchema.parse({
      ...baseMessage,
      attachments: [
        {
          filename: 'notes.txt',
          contentType: 'text/plain',
          size: 5,
          contentBase64: 'aGVsbG8=',
        },
      ],
    });

    expect(parsed.attachments).toEqual([
      {
        filename: 'notes.txt',
        contentType: 'text/plain',
        size: 5,
        contentBase64: 'aGVsbG8=',
      },
    ]);
  });

  it('rejects messages above the total attachment size limit', () => {
    expect(() =>
      sendMessageSchema.parse({
        ...baseMessage,
        attachments: Array.from({ length: 3 }, (_, index) => ({
          filename: `file-${index}.bin`,
          contentType: 'application/octet-stream',
          size: Math.ceil(MAX_SEND_ATTACHMENTS_BYTES / 3),
          contentBase64: 'AA==',
        })),
      }),
    ).toThrow();
  });
});
