/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // AmiExpress BBS theme colors
        'bbs-bg': '#1a1a2e',
        'bbs-surface': '#16213e',
        'bbs-primary': '#0f3460',
        'bbs-accent': '#e94560',
        'bbs-text': '#eaeaea',
        'bbs-muted': '#94a1b2',
        // Used across the admin pages but previously undefined, so 122 class
        // names compiled to nothing: invisible borders, missing panel
        // backgrounds. See tailwind-tokens.test.ts, which fails if a bbs-*
        // class is used without a definition here.
        'bbs-border': '#2a3a5f',
        'bbs-secondary': '#1e2b4d',
        'bbs-background': '#1a1a2e',
        'bbs-hover': '#22304f',
        'bbs-error': '#f85149',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
