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

import type { ScreenIndex } from './screen-index.service';
import { screenScopeOf, type ScreenScope } from './theme-variant-set';

/**
 * Where a board file lands when the BOARD has been asked which scope reads it.
 *
 * `themeTargetFor` below has to guess from the directory name, and on this
 * board the guess is wrong twice:
 *
 * - 215 nodes read `Screens/Node/`, not `Node<n>/`, so a node screen was
 *   mirrored to `Files/Screens/Node/<file>` - a path the loader reads only for
 *   an absolute-path include - beside the `Node/<file>` the seeder also wrote.
 *   Every theme on the live board carries both copies.
 * - `Screens/flt.txt` is a LOGO, pulled into LOGON by path. It was mirrored to
 *   `Board/flt.txt`, and the Board scope is searched by catalogue screen NAME,
 *   so an artist who redrew a logo drew something no caller could ever be
 *   served.
 *
 * The index knows both answers because it resolved every screen against the
 * real directories, so ask it: a file some screen resolves from takes that
 * screen's scope, and everything else takes the `Files/` mirror, which is the
 * tree the by-path arms of the loader read (`themedPath`).
 */
export function themeTargetForBoardFile(index: ScreenIndex, relativePath: string): string | null {
  const parts = safeParts(relativePath);
  if (!parts) return null;

  const scope = screenScopeOf(index, relativePath);
  if (scope) return themeTargetFor(relativePath, scope);
  return path.join('Files', ...parts);
}

/** The path split, with the traversal and empty cases refused once. */
function safeParts(relativePath: string): string[] | null {
  const parts = relativePath.split(/[\\/]/).filter(part => part !== '' && part !== '.');
  if (parts.length === 0) return null;
  if (parts.includes('..')) return null;
  return parts;
}

export function themeTargetFor(relativePath: string, scope?: ScreenScope): string | null {
  const parts = safeParts(relativePath);
  if (!parts) return null;

  // The board's own answer, when a caller measured it. The name rules below
  // are the fallback for a path nothing resolves from.
  if (scope) {
    const file = parts[parts.length - 1];
    if (scope.kind === 'node') return path.join('Node', file);
    if (scope.kind === 'conf') return path.join('Conf', String(scope.id), file);
    return path.join('Board', file);
  }

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
