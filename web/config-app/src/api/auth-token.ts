/**
 * Where the admin keeps its JWT, and why it is not called `authToken`.
 *
 * The admin and the BBS terminal are served from the SAME ORIGIN - the board
 * at `/`, this at `/admin` - so they share one `localStorage`. Both used the
 * key `authToken`.
 *
 * The BBS chat writes that key when a caller logs in
 * (`web/frontend/src/chat/ChatTerminal.tsx`) and removes it when they log out.
 * The admin listens for exactly that key changing, to keep its tabs in step
 * (`contexts/AuthContext.tsx`). So a caller logging into the BBS in one tab
 * handed their token to the sysop's admin session in another, or cleared it
 * and logged the sysop out - reported on the live board, with the BBS login as
 * `origo` and the admin as `sysop`.
 *
 * A privilege boundary is not a place to share a storage key. The admin has
 * its own, and nothing the terminal does can reach it.
 *
 * Changing the key logs current admin sessions out once, which is the whole
 * cost of the fix.
 */
export const ADMIN_TOKEN_KEY = 'adminAuthToken';

/** The stored admin JWT, or null. */
export function readAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    // A browser with site data blocked still has to render a login screen.
    return null;
  }
}

/** Store the admin JWT, or clear it when given null. */
export function writeAdminToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {
    // Storage is a convenience here; the in-memory token still works for
    // this tab's lifetime.
  }
}

/**
 * The refresh token, under the admin's own key for the same reason.
 *
 * Login is handed one good for seven days while the access token lasts eight
 * hours. Storing it is what lets a session outlive the access token instead of
 * ending at the first 401.
 */
export const ADMIN_REFRESH_TOKEN_KEY = 'adminRefreshToken';

export function readAdminRefreshToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeAdminRefreshToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(ADMIN_REFRESH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(ADMIN_REFRESH_TOKEN_KEY);
    }
  } catch {
    // Same as the access token: storage is a convenience, not a requirement.
  }
}
