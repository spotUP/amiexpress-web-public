/**
 * Where a board screen lands inside a theme.
 *
 * A theme mirrors the board by SCOPE, not by directory: every node's copy of a
 * screen becomes one `Node/<file>` in the theme, a conference's becomes
 * `Conf/<n>/<file>`, and the board's own becomes `Board/<file>`. Anything
 * deeper is the theme's own file rather than a screen, and lives under
 * `Files/`.
 *
 * It lives here rather than in the router because two callers need it: the
 * copy route, and the seeder that fills a NEW theme from the board.
 */
import * as path from 'path';

export function themeTargetFor(relativePath: string): string | null {
  const parts = relativePath.split(/[\\/]/).filter(part => part !== '' && part !== '.');
  if (parts.length === 0) return null;
  if (parts.includes('..')) return null;

  const [head, ...rest] = parts;

  if (/^Screens$/i.test(head) && rest.length === 1) return path.join('Board', rest[0]);
  if (rest.length === 0) return path.join('Board', head);

  const conf = /^Conf(\d+)$/i.exec(head);
  if (conf) {
    const tail = /^Screens$/i.test(rest[0]) ? rest.slice(1) : rest;
    if (tail.length === 1) return path.join('Conf', conf[1], tail[0]);
    return path.join('Files', ...parts);
  }

  if (/^Node\d+$/i.test(head)) {
    const tail = /^Screens$/i.test(rest[0]) ? rest.slice(1) : rest;
    if (tail.length === 1) return path.join('Node', tail[0]);
    return path.join('Files', ...parts);
  }

  return path.join('Files', ...parts);
}
