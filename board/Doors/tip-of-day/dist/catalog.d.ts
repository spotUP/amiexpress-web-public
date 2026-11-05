import { type CatalogEntry } from '@amiexpress/bbs-door-sdk/catalog';
export type DoorEntry = CatalogEntry;
/**
 * The board speaks Amiga Latin-1 both directions now, so U+0020-U+00FF
 * paints. Anything above (em dashes, ellipses, emoji a sysop pasted
 * into a description) does not - one '?' each, never a crash, never a
 * silent drop of the whole tip. Charset is not catalog, so it stays
 * door-local.
 */
export declare function amigaSafe(text: string): string;
export declare function resolveBoardRoot(startDir: string): string | null;
/** Installed TypeScript doors, in-house originals first. */
export declare function loadDoorCatalog(boardRoot: string | null): DoorEntry[];
//# sourceMappingURL=catalog.d.ts.map