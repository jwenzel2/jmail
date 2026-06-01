import { z } from 'zod';

/** Admin-configurable branding. Served publicly so the login page can be branded. */
export const brandingSchema = z.object({
  appName: z.string().min(1).max(64).default('jmail'),
  logoUrl: z.string().url().nullable().default(null),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#2f6fed'),
  loginMessage: z.string().max(2000).nullable().default(null),
});

export type Branding = z.infer<typeof brandingSchema>;

export const DEFAULT_BRANDING: Branding = {
  appName: 'jmail',
  logoUrl: null,
  primaryColor: '#2f6fed',
  loginMessage: null,
};

/** Payload accepted by the admin branding update endpoint. */
export const brandingUpdateSchema = brandingSchema.partial();
export type BrandingUpdate = z.infer<typeof brandingUpdateSchema>;
