import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css' // CRITICAL: Import CSS so Vite includes it in production build
// zmodem.js is a UMD bundle that attaches `window.Zmodem` as a side
// effect. The terminal package imports it the same way, but vite
// inside the frontend tree-shakes that side-effect import when
// resolved through a workspace-linked dist file. Importing it here at
// the entry point guarantees it's bundled and `window.Zmodem` is set
// before BBSTerminal mounts.
import 'zmodem.js/dist/zmodem'

// Expose dynamic font paths so the frontend can resolve them regardless of BASE_URL
const baseUrl = import.meta.env.BASE_URL ?? '/'
const fontPaths: Record<string, string> = {
  'mosoul': `${baseUrl}fonts/mOsOul_v1.0.ttf`,
  'microknight': `${baseUrl}fonts/MicroKnight_v1.0.ttf`,
  'microknight-plus': `${baseUrl}fonts/MicroKnightPlus_v1.0.ttf`,
  'pot-noodle': `${baseUrl}fonts/P0T-NOoDLE_v1.0.ttf`,
  'topaz-a500': `${baseUrl}fonts/Topaz_a500_v1.0.ttf`,
  'topaz-a1200': `${baseUrl}fonts/Topaz_a1200_v1.0.ttf`,
  'topazplus-a500': `${baseUrl}fonts/TopazPlus_a500_v1.0.ttf`,
  'topazplus-a1200': `${baseUrl}fonts/TopazPlus_a1200_v1.0.ttf`,
  'petme64': `${baseUrl}fonts/PetMe64.ttf`
}

const rootStyle = document.documentElement.style
Object.entries(fontPaths).forEach(([key, value]) => {
  rootStyle.setProperty(`--font-${key}`, value)
})

// Note: StrictMode disabled because it causes socket connect/disconnect loops
// in development, making the terminal flash. StrictMode is removed in production builds anyway.
ReactDOM.createRoot(document.getElementById('terminal')!).render(
  <App />
)
