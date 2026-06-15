import type { Contact, ContactInput, ContactList, ContactUpdate } from '@jmail/shared';
import { apiGet, apiSend } from './client';

export const getContacts = (query = '') =>
  apiGet<ContactList>(
    `/api/contacts${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`,
  );

export const createContact = (input: ContactInput) =>
  apiSend<Contact>('POST', '/api/contacts', input);

export const updateContact = (id: string, patch: ContactUpdate) =>
  apiSend<Contact>('PATCH', `/api/contacts/${encodeURIComponent(id)}`, patch);

export const deleteContact = (id: string) =>
  apiSend<{ ok: boolean }>('DELETE', `/api/contacts/${encodeURIComponent(id)}`);
