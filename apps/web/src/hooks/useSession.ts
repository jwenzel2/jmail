import type { CurrentUser, SessionInfo } from '@jmail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiGet, apiSend, AUTH_INVALIDATED_EVENT } from '../api/client';

export interface SessionState {
  user: CurrentUser | null;
  isLoading: boolean;
}

/** Reads the current session from the API. */
export function useSession(): SessionState {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<SessionInfo>('/api/me'),
    retry: false,
  });
  useEffect(() => {
    const invalidateAuth = () => {
      // Mail query keys do not contain the session id. Remove all user-scoped
      // data so a subsequent login cannot render the previous session's inbox.
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'branding' });
      qc.setQueryData<SessionInfo>(['me'], { user: null });
    };
    window.addEventListener(AUTH_INVALIDATED_EVENT, invalidateAuth);
    return () => window.removeEventListener(AUTH_INVALIDATED_EVENT, invalidateAuth);
  }, [qc]);
  return { user: data?.user ?? null, isLoading };
}

/** Logs out and clears cached session state. */
export function useLogout(): () => void {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => apiSend<{ ok: boolean }>('POST', '/auth/logout'),
    // The UI must always become signed out even if the request loses its
    // connection after the server has already cleared the session.
    onSettled: () => {
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'branding' });
      qc.setQueryData<SessionInfo>(['me'], { user: null });
    },
  });
  return () => mutation.mutate();
}

/** Starts the OIDC login flow via a full-page navigation. */
export function startLogin(): void {
  window.location.assign('/auth/login');
}
