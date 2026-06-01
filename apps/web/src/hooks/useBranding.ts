import { type Branding, DEFAULT_BRANDING } from '@jmail/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

/** Loads admin-configured branding (app name, logo, theme). Falls back to defaults. */
export function useBranding(): Branding {
  const { data } = useQuery({
    queryKey: ['branding'],
    queryFn: () => apiGet<Branding>('/api/branding'),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? DEFAULT_BRANDING;
}
