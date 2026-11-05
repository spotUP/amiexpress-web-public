/**
 * The order of the installed-doors list.
 *
 * Three orders, cycled by one key: the board's own order (the .info files
 * as the backend lists them), then minimum access level ascending - the
 * doors every caller can run first - then descending. A disabled door
 * carries the DISABLED sentinel as its level (32767, see
 * door-info-file.service.ts) and therefore sorts last ascending, which is
 * what a sysop scanning for "who can run what" wants: the doors nobody can
 * run at the bottom. Stable: two doors at one level keep their board order.
 */
export type InstalledSortMode = 'default' | 'access-asc' | 'access-desc';

export const SORT_MODES: readonly InstalledSortMode[] = ['default', 'access-asc', 'access-desc'];

export function nextSortMode(mode: InstalledSortMode): InstalledSortMode {
  return SORT_MODES[(SORT_MODES.indexOf(mode) + 1) % SORT_MODES.length];
}

/** What the list label says about the order. Empty for the board's own. */
export function sortLabel(mode: InstalledSortMode): string {
  if (mode === 'access-asc') return 'by access, low first';
  if (mode === 'access-desc') return 'by access, high first';
  return '';
}

export function sortInstalled<T extends { accessLevel?: number }>(doors: readonly T[], mode: InstalledSortMode): T[] {
  const out = doors.slice();
  if (mode === 'default') return out;
  const level = (d: T): number => (typeof d.accessLevel === 'number' ? d.accessLevel : 0);
  const sign = mode === 'access-asc' ? 1 : -1;
  // Array.prototype.sort is stable (ES2019), so equal levels keep their order.
  return out.sort((a, b) => sign * (level(a) - level(b)));
}
