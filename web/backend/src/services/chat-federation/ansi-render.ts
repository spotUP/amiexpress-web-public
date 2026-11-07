/**
 * Terminal rendering of a federated chat line for telnet and SSH callers.
 *
 * A role colour travels as `roleColor`, the ANSI palette index (0-15) as a
 * decimal string, or empty for no role. 0-7 map to SGR 30-37 and 8-15 to
 * 90-97. Foreground only: SGR 40 paints black blocks in macOS Terminal and
 * Amiga clients ignore SGR 49, so no background is ever set, and the reset is
 * SGR 0.
 *
 * `!` in event text is the wire form of `|` for the sub-fields of react,
 * banned, muted and role events (`actor!reason`); `splitSubFields` is the one
 * place that reads them. A message body is shown as sent.
 */

const RESET = '\x1b[0m';

/** SGR foreground for an ANSI palette index, or null for none/invalid. */
export function roleSgr(roleColor: string): string | null {
  if (!/^\d{1,2}$/.test(roleColor)) return null;
  const n = Number(roleColor);
  if (n < 0 || n > 15) return null;
  return `\x1b[${n < 8 ? 30 + n : 90 + (n - 8)}m`;
}

export function colorName(name: string, roleColor: string): string {
  const sgr = roleSgr(roleColor);
  return sgr ? `${sgr}${name}${RESET}` : name;
}

/** `actor!reason` style text into its fields. */
export function splitSubFields(text: string): string[] {
  return text.split('!');
}

function clock(at: number): string {
  const ms = at < 1e12 ? at * 1000 : at;
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** One chat line, ending CRLF: `[HH:MM] name: text` with the name in its role colour. */
export function renderMessageLine(user: string, roleColor: string, text: string, at: number): string {
  return `[${clock(at)}] ${colorName(user, roleColor)}: ${text}\r\n`;
}

/** A system line (`*** text ***`) in yellow, ending CRLF. */
export function renderSystemLine(text: string): string {
  return `\x1b[33m*** ${text} ***${RESET}\r\n`;
}
