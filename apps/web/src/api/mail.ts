import type {
  MailFolder,
  MessageAction,
  MessageDetail,
  MessageListResponse,
  SendMessage,
} from '@jmail/shared';
import { apiGet, apiSend } from './client';

const enc = encodeURIComponent;

export const getFolders = () => apiGet<MailFolder[]>('/api/mail/folders');

export const getMessages = (folder: string, page: number, pageSize: number) =>
  apiGet<MessageListResponse>(
    `/api/mail/messages?folder=${enc(folder)}&page=${page}&pageSize=${pageSize}`,
  );

export const getMessage = (folder: string, uid: number) =>
  apiGet<MessageDetail>(`/api/mail/message/${enc(folder)}/${uid}`);

export const searchMessages = (folder: string, q: string) =>
  apiGet<MessageListResponse>(`/api/mail/search?folder=${enc(folder)}&q=${enc(q)}`);

export const applyAction = (action: MessageAction) =>
  apiSend<{ ok: boolean }>('POST', '/api/mail/actions', action);

export const sendMessage = (msg: SendMessage) =>
  apiSend<{ messageId?: string }>('POST', '/api/mail/send', msg);

export const attachmentUrl = (folder: string, uid: number, partId: string) =>
  `/api/mail/message/${enc(folder)}/${uid}/attachment/${enc(partId)}`;

export const messageSourceUrl = (folder: string, uid: number) =>
  `/api/mail/message/${enc(folder)}/${uid}/source.eml`;

export const messageWindowUrl = (folder: string, uid: number) => `/message/${enc(folder)}/${uid}`;
