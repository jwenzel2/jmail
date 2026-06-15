import { describe, expect, it } from 'vitest';
import { deviceRegistrationSchema, mailAccountInputSchema } from './mobile.js';

describe('mobile account contracts', () => {
  it('applies practical account setting defaults', () => {
    const account = mailAccountInputSchema.parse({
      email: 'person@example.com',
      protocol: 'imap',
      authType: 'password',
      imapHost: 'imap.example.com',
      imapPort: 993,
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      username: 'person@example.com',
      secret: 'app-password',
    });

    expect(account.settings.notifications).toBe(true);
    expect(account.settings.showRemoteImages).toBe(false);
    expect(account.settings.leaveOnServer).toBe(true);
  });

  it('rejects invalid device registrations', () => {
    expect(() =>
      deviceRegistrationSchema.parse({ installationId: 'short', fcmToken: '' }),
    ).toThrow();
  });
});
