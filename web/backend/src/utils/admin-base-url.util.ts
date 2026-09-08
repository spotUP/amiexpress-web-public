/**
 * Where a notification's "click here" should actually send the sysop.
 *
 * Four places built this string by hand as
 * `process.env.BASE_URL || 'http://localhost:3001'`
 * (operator-chat.handler.ts:636, :677, :713, :735). BASE_URL is NOT set on
 * the live container - checked, 2026-09-08 - so every push notification the
 * live board has ever sent carried a link to `http://localhost:3001`. On the
 * sysop's laptop that link goes nowhere.
 *
 * Nobody noticed because the board also had ZERO push subscriptions, so no
 * notification was ever delivered to click. Both halves had to be wrong for
 * the feature to look absent rather than broken.
 *
 * The fallback is the mistake, not the missing variable: a board that knows
 * its own public address should not need an env var to say so. Order:
 *
 *   1. BASE_URL / PUBLIC_URL, if the operator set one - explicit wins.
 *   2. The first non-localhost entry in the configured allowed origins,
 *      which on this board is the real https hostname it serves from.
 *   3. localhost, which is correct for a developer and harmless for a board
 *      that has told us nothing about itself.
 */
import { config } from "../config";

/** Trailing slashes removed; callers append their own path. */
function tidy(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function adminBaseUrl(): string {
  const explicit = process.env.BASE_URL || process.env.PUBLIC_URL;
  if (explicit && explicit.trim() !== "") return tidy(explicit);

  try {
    const origins = (config.getConfig() as { allowedOrigins?: string[] }).allowedOrigins ?? [];
    const publicOrigin = origins.find(
      (o) => typeof o === "string" && /^https?:\/\//i.test(o) && !/localhost|127\.0\.0\.1/i.test(o),
    );
    if (publicOrigin) return tidy(publicOrigin);
  } catch {
    // config not loaded (a unit test, an early call) - fall through
  }

  return "http://localhost:3001";
}

/** The operator-chat page, optionally carrying a page's auth token. */
export function operatorChatUrl(token?: string): string {
  const base = `${adminBaseUrl()}/admin/operator-chat`;
  return token ? `${base}?token=${token}` : base;
}
