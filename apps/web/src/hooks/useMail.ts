import type { MailFolder, MessageAction, MessageListResponse } from '@jmail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as mail from '../api/mail';

export function useFolders() {
  return useQuery({ queryKey: ['folders'], queryFn: mail.getFolders });
}

export function useMessages(folder: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['messages', folder, page, pageSize],
    queryFn: () => mail.getMessages(folder, page, pageSize),
    placeholderData: (prev) => prev,
  });
}

export function useSearch(folder: string, query: string) {
  return useQuery({
    queryKey: ['search', folder, query],
    queryFn: () => mail.searchMessages(folder, query),
    enabled: query.trim().length > 0,
  });
}

export function useMessage(folder: string | null, uid: number | null) {
  return useQuery({
    queryKey: ['message', folder, uid],
    queryFn: () => mail.getMessage(folder as string, uid as number),
    enabled: folder !== null && uid !== null,
  });
}

/** Invalidates the views affected by a mailbox mutation. */
function useMailInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['messages'] });
    void qc.invalidateQueries({ queryKey: ['folders'] });
  };
}

export function useMessageAction() {
  const invalidate = useMailInvalidation();
  return useMutation({
    mutationFn: (action: MessageAction) => mail.applyAction(action),
    onSuccess: invalidate,
  });
}

export function useSendMessage() {
  const invalidate = useMailInvalidation();
  return useMutation({
    mutationFn: mail.sendMessage,
    onSuccess: invalidate,
  });
}

export type { MailFolder, MessageListResponse };
