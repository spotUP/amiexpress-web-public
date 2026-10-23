/// <reference types="vite/client" />
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
 *   - But SDK API is on separate server (SDK_PREVIEW_PORT, default 8080)
 *   - So we need explicit URL with that port
 *
 * Environment variables:
 *   - VITE_SDK_API_URL: Override the SDK API base URL (optional)
 */

// The preview backend port, injected at build time by vite.config.ts from
// SDK_PREVIEW_PORT (default 8080).
declare const __SDK_PREVIEW_PORT__: number;
export const SDK_PREVIEW_PORT: number = __SDK_PREVIEW_PORT__;

// SDK API URL - points to SDK preview backend server (SDK_PREVIEW_PORT, default 8080)
// In dev mode, Vite proxy handles this. In production, we need explicit URL
// Use env var VITE_SDK_API_URL to override
export const SDK_API_URL = import.meta.env.VITE_SDK_API_URL ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `${window.location.protocol}//${window.location.hostname}:${SDK_PREVIEW_PORT}`
    : (import.meta.env.DEV ? '' : `http://${window.location.hostname}:${SDK_PREVIEW_PORT}`));

/**
 * Helper to construct full API URL
 */
export function getApiUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${SDK_API_URL}${normalizedPath}`;
}
