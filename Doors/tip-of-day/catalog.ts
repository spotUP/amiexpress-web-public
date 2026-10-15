/**
 * Tip-of-the-day catalog: what the board has, for the spotlight picker.
 *
 * Thin adapter over the SDK (`@amiexpress/bbs-door-sdk/catalog`): the
 * registry scan, binary-safe tooltype parsing and manifest join live
 * there once for every door. What stays here is TIP's own: the Amiga
 * charset rule and the TS-only, port-flagged view the picker eats.
 */
import * as fs from 'fs';
import {
  loadDoorCatalog as sdkLoadDoorCatalog,
  nodeCatalogIO,
  type CatalogEntry,
} from '@amiexpress/bbs-door-sdk/catalog';
import { resolveBbsRoot } from '@amiexpress/bbs-door-sdk/settings';

export type DoorEntry = CatalogEntry;

/**
 * The board speaks Amiga Latin-1 both directions now, so U+0020-U+00FF
 * paints. Anything above (em dashes, ellipses, emoji a sysop pasted
 * into a description) does not - one '?' each, never a crash, never a
 * silent drop of the whole tip. Charset is not catalog, so it stays
 * door-local.
 */
export function amigaSafe(text: string): string {
  return text.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
}

export function resolveBoardRoot(startDir: string): string | null {
  const root = resolveBbsRoot(startDir);
  return fs.existsSync(`${root}/Commands/BBSCmd`) ? root : null;
}

/** Installed TypeScript doors, in-house originals first. */
export function loadDoorCatalog(boardRoot: string | null): DoorEntry[] {
  if (!boardRoot) return [];
  const catalog = sdkLoadDoorCatalog(boardRoot, nodeCatalogIO(fs), { types: ['TS'] });
  for (const entry of catalog) {
    entry.description = amigaSafe(entry.description);
  }
  return catalog;
}
