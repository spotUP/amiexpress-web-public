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
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
