import type { CurrentUser, SessionInfo } from '@jmail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from '../api/client';

export interface SessionState {
  user: CurrentUser | null;
  isLoading: boolean;
}

/** Reads the current session from the API. */
export function useSession(): SessionState {
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<SessionInfo>('/api/me'),
    retry: false,
  });
  return { user: data?.user ?? null, isLoading };
}

/** Logs out and clears cached session state. */
export function useLogout(): () => void {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => apiSend<{ ok: boolean }>('POST', '/auth/logout'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  return () => mutation.mutate();
}

/** Starts the OIDC login flow via a full-page navigation. */
export function startLogin(): void {
  window.location.assign('/auth/login');
}
