import type {
  MailFolder,
  MessageAction,
  MessageDetail,
  MessageListFilter,
  MessageListResponse,
  MessageListSort,
  SendMessage,
} from '@jmail/shared';
import { apiGet, apiSend } from './client';

const enc = encodeURIComponent;

export const getFolders = () => apiGet<MailFolder[]>('/api/mail/folders');

export const getMessages = (
  folder: string,
  page: number,
  pageSize: number,
  filter: MessageListFilter,
  sort: MessageListSort,
) =>
  apiGet<MessageListResponse>(
    `/api/mail/messages?folder=${enc(folder)}&page=${page}&pageSize=${pageSize}&filter=${filter}&sort=${sort}`,
  );

export const getMessage = (folder: string, uid: number) =>
  apiGet<MessageDetail>(`/api/mail/message/${enc(folder)}/${uid}`);

export const searchMessages = (
  folder: string,
  q: string,
  page: number,
  pageSize: number,
  filter: MessageListFilter,
  sort: MessageListSort,
) =>
  apiGet<MessageListResponse>(
    `/api/mail/search?folder=${enc(folder)}&q=${enc(q)}&page=${page}&pageSize=${pageSize}&filter=${filter}&sort=${sort}`,
  );

/** All UIDs matching the current folder + filter (+ search), for "select all". */
export const getMessageUids = (folder: string, filter: MessageListFilter, q: string) =>
  apiGet<{ uids: number[] }>(
    `/api/mail/message-uids?folder=${enc(folder)}&filter=${filter}${q ? `&q=${enc(q)}` : ''}`,
  );

export const applyAction = (action: MessageAction) =>
  apiSend<{ ok: boolean }>('POST', '/api/mail/actions', action);

export const sendMessage = (msg: SendMessage) =>
  apiSend<{ messageId?: string }>('POST', '/api/mail/send', msg);

export const attachmentUrl = (folder: string, uid: number, partId: string) =>
  `/api/mail/message/${enc(folder)}/${uid}/attachment/${enc(partId)}`;

export const messageSourceUrl = (folder: string, uid: number) =>
  `/api/mail/message/${enc(folder)}/${uid}/source.eml`;

export const messageWindowUrl = (folder: string, uid: number) => `/message/${enc(folder)}/${uid}`;
