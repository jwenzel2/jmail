import type { SenderListEntry, UserSpamSettings } from '@jmail/shared';
import { apiGet, apiSend } from './client';

export const getSpamSettings = () => apiGet<UserSpamSettings>('/api/spam/settings');

export const updateSpamLists = (entries: SenderListEntry[]) =>
  apiSend<{ entries: SenderListEntry[] }>('PUT', '/api/spam/lists', { entries });
