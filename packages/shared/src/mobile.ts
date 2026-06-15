import { z } from 'zod';

export const mailProtocolSchema = z.enum(['imap', 'pop3']);
export type MailProtocol = z.infer<typeof mailProtocolSchema>;

export const accountAuthTypeSchema = z.enum(['password', 'keycloak', 'google', 'microsoft']);
export type AccountAuthType = z.infer<typeof accountAuthTypeSchema>;

export const mailAccountCapabilitiesSchema = z.object({
  folders: z.boolean(),
  push: z.boolean(),
  rules: z.boolean(),
  vacation: z.boolean(),
});
export type MailAccountCapabilities = z.infer<typeof mailAccountCapabilitiesSchema>;

export const mailAccountSettingsSchema = z.object({
  notifications: z.boolean().default(true),
  syncIntervalMinutes: z.number().int().min(15).max(1440).default(15),
  signature: z.string().max(10000).default(''),
  showRemoteImages: z.boolean().default(false),
  leaveOnServer: z.boolean().default(true),
  archiveFolder: z.string().nullable().default(null),
  sentFolder: z.string().nullable().default(null),
  trashFolder: z.string().nullable().default(null),
  junkFolder: z.string().nullable().default(null),
});
export type MailAccountSettings = z.infer<typeof mailAccountSettingsSchema>;

export const mailAccountSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  protocol: mailProtocolSchema,
  authType: accountAuthTypeSchema,
  imapHost: z.string().nullable(),
  imapPort: z.number().int().positive().nullable(),
  smtpHost: z.string(),
  smtpPort: z.number().int().positive(),
  username: z.string(),
  enabled: z.boolean(),
  status: z.enum(['pending', 'ready', 'error', 'reauth_required']),
  lastError: z.string().nullable(),
  capabilities: mailAccountCapabilitiesSchema,
  settings: mailAccountSettingsSchema,
});
export type MailAccount = z.infer<typeof mailAccountSchema>;

export const mailAccountInputSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().max(200).nullable().default(null),
  protocol: mailProtocolSchema,
  authType: accountAuthTypeSchema,
  imapHost: z.string().trim().min(1).nullable(),
  imapPort: z.number().int().positive().nullable(),
  smtpHost: z.string().trim().min(1),
  smtpPort: z.number().int().positive(),
  username: z.string().trim().min(1),
  secret: z.string().min(1).max(20000).optional(),
  settings: mailAccountSettingsSchema.default({}),
});
export type MailAccountInput = z.infer<typeof mailAccountInputSchema>;

export const mailAccountUpdateSchema = mailAccountInputSchema.partial().extend({
  enabled: z.boolean().optional(),
});
export type MailAccountUpdate = z.infer<typeof mailAccountUpdateSchema>;

export const mobileTokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresAt: z.string().datetime(),
});
export type MobileTokenResponse = z.infer<typeof mobileTokenResponseSchema>;

export const deviceRegistrationSchema = z.object({
  installationId: z.string().min(8).max(200),
  fcmToken: z.string().min(1).max(4096),
  deviceName: z.string().max(200).nullable().default(null),
  notificationsEnabled: z.boolean().default(true),
});
export type DeviceRegistration = z.infer<typeof deviceRegistrationSchema>;
