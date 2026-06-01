import { z } from 'zod';

/** The authenticated user as exposed to the SPA via GET /api/me. */
export const currentUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  isAdmin: z.boolean(),
});

export type CurrentUser = z.infer<typeof currentUserSchema>;

/** Response of GET /api/me — null user means not authenticated. */
export const sessionInfoSchema = z.object({
  user: currentUserSchema.nullable(),
});

export type SessionInfo = z.infer<typeof sessionInfoSchema>;
