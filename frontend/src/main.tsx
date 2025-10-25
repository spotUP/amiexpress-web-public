import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css' // CRITICAL: Import CSS so Vite includes it in production build

// Note: StrictMode disabled because it causes socket connect/disconnect loops
// in development, making the terminal flash. StrictMode is removed in production builds anyway.
ReactDOM.createRoot(document.getElementById('terminal')!).render(
  <App />
)