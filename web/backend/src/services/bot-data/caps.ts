/**
 * WEB_BOT_DATA caps - every list is bounded, every text is cut.
 *
 * Chat budgets are small (tool loop 150 reply tokens) and HTTP callers
 * must not be able to page the whole board out. Defaults are chat-sized;
 * HTTP callers may ask up to the max, never past it.
 */
export const BOT_DEFAULT_LIMIT = 10;
export const BOT_MAX_LIMIT = 50;
export const BOT_MAX_TEXT = 1800;

export function BOT_clampLimit(asked: unknown, def = BOT_DEFAULT_LIMIT): number {
  const n = typeof asked === 'number' ? asked : parseInt(String(asked ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), BOT_MAX_LIMIT);
}

export function BOT_cut(text: string, max = BOT_MAX_TEXT): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

export function BOT_more(total: number, shown: number): string {
  return total > shown ? `\n(+${total - shown} more)` : '';
}
