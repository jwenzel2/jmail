import { useMediaQuery } from '@mantine/hooks';

/**
 * True when the viewport is phone-sized (Mantine `sm` breakpoint, ~768px) so the
 * app can serve a single-column, touch-optimized layout. Falls back to false
 * during the first render before the media query resolves.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 48em)') ?? false;
}
