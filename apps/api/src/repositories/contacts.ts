import type { Contact, ContactInput, ContactUpdate } from '@jmail/shared';
import { pool } from '../db.js';

const SELECT_CONTACT = `select id,
                               display_name as "displayName",
                               email,
                               phone,
                               company,
                               notes,
                               favorite
                          from contacts`;

function normalizeOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

function resolveOptional(patch: string | null | undefined, current: string | null): string | null {
  if (patch === undefined) return current;
  return normalizeOptional(patch) ?? null;
}

export async function listContacts(userId: string, query = ''): Promise<Contact[]> {
  const search = query.trim();
  const { rows } = await pool.query<Contact>(
    `${SELECT_CONTACT}
      where user_id = $1
        and ($2 = '' or display_name ilike '%' || $2 || '%'
                     or email ilike '%' || $2 || '%'
                     or coalesce(company, '') ilike '%' || $2 || '%'
                     or coalesce(phone, '') ilike '%' || $2 || '%')
      order by favorite desc, lower(display_name), lower(email)`,
    [userId, search],
  );
  return rows;
}

export async function getContact(userId: string, id: string): Promise<Contact | null> {
  const { rows } = await pool.query<Contact>(`${SELECT_CONTACT} where user_id = $1 and id = $2`, [
    userId,
    id,
  ]);
  return rows[0] ?? null;
}

export async function createContact(userId: string, input: ContactInput): Promise<Contact> {
  const { rows } = await pool.query<Contact>(
    `insert into contacts (user_id, display_name, email, phone, company, notes, favorite)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, display_name as "displayName", email, phone, company, notes, favorite`,
    [
      userId,
      input.displayName.trim(),
      input.email.trim().toLowerCase(),
      normalizeOptional(input.phone),
      normalizeOptional(input.company),
      normalizeOptional(input.notes),
      input.favorite,
    ],
  );
  return rows[0] as Contact;
}

export async function updateContact(
  userId: string,
  id: string,
  patch: ContactUpdate,
): Promise<Contact | null> {
  const current = await getContact(userId, id);
  if (!current) return null;

  const next: ContactInput = {
    displayName: patch.displayName?.trim() ?? current.displayName,
    email: patch.email?.trim().toLowerCase() ?? current.email,
    phone: resolveOptional(patch.phone, current.phone),
    company: resolveOptional(patch.company, current.company),
    notes: resolveOptional(patch.notes, current.notes),
    favorite: patch.favorite ?? current.favorite,
  };

  const { rows } = await pool.query<Contact>(
    `update contacts
        set display_name = $3, email = $4, phone = $5, company = $6, notes = $7,
            favorite = $8, updated_at = now()
      where user_id = $1 and id = $2
      returning id, display_name as "displayName", email, phone, company, notes, favorite`,
    [userId, id, next.displayName, next.email, next.phone, next.company, next.notes, next.favorite],
  );
  return rows[0] ?? null;
}

export async function deleteContact(userId: string, id: string): Promise<boolean> {
  const result = await pool.query('delete from contacts where user_id = $1 and id = $2', [
    userId,
    id,
  ]);
  return (result.rowCount ?? 0) > 0;
}
