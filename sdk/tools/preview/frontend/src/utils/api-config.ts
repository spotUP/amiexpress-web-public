/**
 * SDK API Configuration
 *
 * This file configures the base URL for SDK preview backend API requests.
 *
 * In development mode (npm run dev):
 *   - Vite proxy handles /api requests → no prefix needed
 *
 * In production mode (npm run build):
 *   - Frontend is served from main backend (port 3001) at /sdk/
 *   - But SDK API is on separate server (port 8080)
 *   - So we need explicit URL with port 8080
 *
 * Environment variables:
 *   - VITE_SDK_API_URL: Override the SDK API base URL (optional)
 */

// SDK API URL - points to SDK preview backend server (default port 8080)
// In dev mode, Vite proxy handles this. In production, we need explicit URL
// Use env var VITE_SDK_API_URL to override
export const SDK_API_URL = import.meta.env.VITE_SDK_API_URL ||
  (import.meta.env.DEV ? '' : `http://${window.location.hostname}:8080`);

/**
 * Helper to construct full API URL
 */
export function getApiUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${SDK_API_URL}${normalizedPath}`;
}
