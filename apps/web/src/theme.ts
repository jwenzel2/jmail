import { createTheme, rem } from '@mantine/core';

/**
 * Dense, "pro mail" theme (Superhuman/Spark feel): a tighter type scale, a
 * modern system font stack, and smaller default radii/spacing so list rows and
 * toolbars pack more in without feeling cramped.
 */
export const theme = createTheme({
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  defaultRadius: 'sm',
  // Slightly smaller base scale than Mantine's defaults for a denser UI.
  fontSizes: {
    xs: rem(11),
    sm: rem(12.5),
    md: rem(14),
    lg: rem(16),
    xl: rem(18),
  },
  lineHeights: {
    xs: '1.3',
    sm: '1.35',
    md: '1.45',
  },
  spacing: {
    xs: rem(8),
    sm: rem(10),
    md: rem(14),
    lg: rem(18),
    xl: rem(26),
  },
  headings: {
    fontWeight: '650',
  },
  components: {
    Button: {
      defaultProps: { fw: 600 },
    },
  },
});
