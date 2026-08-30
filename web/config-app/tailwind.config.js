/** @type {import('tailwindcss').Config} */

/**
 * Every colour resolves to a custom property declared in
 * `src/styles/tokens.css`. The channel form is what lets Tailwind apply
 * opacity modifiers such as `bg-surface-2/50`.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: token('surface-0'),
          1: token('surface-1'),
          2: token('surface-2'),
          3: token('surface-3'),
        },
        border: {
          DEFAULT: token('border'),
          strong: token('border-strong'),
        },
        content: {
          primary: token('text-primary'),
          secondary: token('text-secondary'),
          muted: token('text-muted'),
          inverse: token('text-inverse'),
        },
        brand: token('brand'),
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
        },
        status: {
          ok: token('status-ok'),
          warn: token('status-warn'),
          danger: token('status-danger'),
          info: token('status-info'),
          neutral: token('status-neutral'),
        },

        /*
         * Legacy names, kept as aliases onto the ramp above. The 28 pages that
         * have not been converted yet use these across 11 847 lines; renaming
         * them in one diff would be unreviewable, and aliasing means those
         * pages inherit the new palette for free.
         *
         * bbs-border, bbs-secondary, bbs-background, bbs-hover and bbs-error
         * were used 122 times without ever being defined - see
         * src/test/tailwind-tokens.test.ts, which fails if that happens again.
         */
        'bbs-bg': token('surface-0'),
        'bbs-surface': token('surface-1'),
        'bbs-primary': token('border'),
        'bbs-accent': token('accent'),
        'bbs-text': token('text-primary'),
        'bbs-muted': token('text-secondary'),
        'bbs-border': token('border'),
        'bbs-secondary': token('surface-2'),
        'bbs-background': token('surface-0'),
        'bbs-hover': token('surface-3'),
        'bbs-error': token('status-danger'),
      },
      /*
       * A sysop dashboard is dense: body is 13 px, not 16. Prose and labels
       * are sans; identifiers, paths, tooltype keys, node numbers, byte counts
       * and timestamps are mono, so the typeface marks what is a real value
       * on disk.
       */
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],     /* 11 / 16 */
        xs: ['0.75rem', { lineHeight: '1rem' }],          /* 12 / 16 */
        sm: ['0.8125rem', { lineHeight: '1.125rem' }],    /* 13 / 18 - body */
        base: ['0.9375rem', { lineHeight: '1.375rem' }],  /* 15 / 22 */
        lg: ['1.125rem', { lineHeight: '1.5rem' }],       /* 18 / 24 */
        xl: ['1.375rem', { lineHeight: '1.75rem' }],      /* 22 / 28 */
        '2xl': ['1.75rem', { lineHeight: '2.125rem' }],   /* 28 / 34 */
        '3xl': ['2.125rem', { lineHeight: '2.5rem' }],    /* 34 / 40 */
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        overlay: 'var(--shadow-overlay)',
      },
      height: {
        row: 'var(--row-height)',
        control: 'var(--control-height)',
      },
      minHeight: {
        row: 'var(--row-height)',
        control: 'var(--control-height)',
      },
    },
  },
  // The enter and exit keyframes the Radix data-state attributes expect.
  plugins: [require('tailwindcss-animate')],
}
