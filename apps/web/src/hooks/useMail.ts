import type {
  MailFolder,
  MessageAction,
  MessageListFilter,
  MessageListResponse,
  MessageListSort,
} from '@jmail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as mail from '../api/mail';

/** Opens a Server-Sent Events connection and invalidates message/folder caches on new mail. */
export function useMailEvents() {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource('/api/mail/events', { withCredentials: true });
    es.addEventListener('message', (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { type: string; folder?: string };
        if (data.type === 'mail') {
          void qc.invalidateQueries({ queryKey: ['messages', data.folder ?? 'INBOX'] });
          void qc.invalidateQueries({ queryKey: ['folders'] });
        }
      } catch { /* ignore malformed events */ }
    });
    return () => es.close();
  }, [qc]);
}

export function useFolders() {
  return useQuery({ queryKey: ['folders'], queryFn: mail.getFolders });
}

export function useMessages(
  folder: string,
  page: number,
  pageSize: number,
  filter: MessageListFilter,
  sort: MessageListSort,
) {
  return useQuery({
    queryKey: ['messages', folder, page, pageSize, filter, sort],
    queryFn: () => mail.getMessages(folder, page, pageSize, filter, sort),
    placeholderData: (prev) => prev,
  });
}

export function useSearch(
  folder: string,
  query: string,
  page: number,
  pageSize: number,
  filter: MessageListFilter,
  sort: MessageListSort,
) {
  return useQuery({
    queryKey: ['search', folder, query, page, pageSize, filter, sort],
    queryFn: () => mail.searchMessages(folder, query, page, pageSize, filter, sort),
    enabled: query.trim().length > 0,
    placeholderData: (prev) => prev,
  });
}

export function useMessage(folder: string | null, uid: number | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['message', folder, uid],
    queryFn: () => mail.getMessage(folder as string, uid as number),
    enabled: folder !== null && uid !== null,
  });

  useEffect(() => {
    if (query.data && folder) {
      void qc.invalidateQueries({ queryKey: ['messages', folder] });
      void qc.invalidateQueries({ queryKey: ['search', folder] });
      void qc.invalidateQueries({ queryKey: ['folders'] });
    }
  }, [query.data, folder, qc]);

  return query;
}

export function useMessageAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: MessageAction) => mail.applyAction(action),
    onSuccess: (_, action) => {
      // MOVE/DELETE updates the API's source-folder cache in place. Refetch only
      // active source views; inactive pages can remain cached until revisited.
      void qc.invalidateQueries({
        queryKey: ['messages', action.folder],
        refetchType: 'active',
      });
      if (action.targetFolder) {
        void qc.invalidateQueries({
          queryKey: ['messages', action.targetFolder],
          refetchType: 'none',
        });
      }
      void qc.invalidateQueries({ queryKey: ['search', action.folder], refetchType: 'active' });
      void qc.invalidateQueries({ queryKey: ['folders'] });
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mail.sendMessage,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['messages'] });
      void qc.invalidateQueries({ queryKey: ['folders'] });
    },
  });
}

export type { MailFolder, MessageListResponse };
