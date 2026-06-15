import { z } from 'zod';

export const contactSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
  notes: z.string().nullable(),
  favorite: z.boolean(),
});
export type Contact = z.infer<typeof contactSchema>;

export const contactInputSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(100).nullable().default(null),
  company: z.string().trim().max(200).nullable().default(null),
  notes: z.string().trim().max(5000).nullable().default(null),
  favorite: z.boolean().default(false),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export const contactUpdateSchema = contactInputSchema.partial();
export type ContactUpdate = z.infer<typeof contactUpdateSchema>;

export const contactListSchema = z.object({
  contacts: z.array(contactSchema),
});
export type ContactList = z.infer<typeof contactListSchema>;
