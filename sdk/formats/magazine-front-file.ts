/**
 * Writing `Magazine/frontpage.json`: the ONE writer.
 *
 * The front page is edited from two places - the MAG door's sysop mode and the
 * admin's Magazine page - and both must leave the same file behind. The pure
 * edits (`normalizeFront`, `frontToggle`, `frontMove`, `frontLead`) live in
 * `./magazine`, which carries no Node imports so a browser can use it. This
 * half touches the disk and so lives apart from it.
 *
 * The write is atomic: a temp file in the same directory, then a rename, so a
 * reader (the door re-reads on every entry, the publisher on every tick) sees
 * the old list or the new one and never half of either.
 */
import * as fs from 'fs';
import * as path from 'path';
import { MAGAZINE_FRONTPAGE_FILE } from './magazine';

/**
 * Write the front page ids to `<magazineDir>/frontpage.json`. Ids are written
 * as given: normalising against the stories that exist is the caller's edit,
 * made with `normalizeFront` before this.
 */
export function writeFrontFile(magazineDir: string, ids: readonly string[]): void {
  const target = path.join(magazineDir, MAGAZINE_FRONTPAGE_FILE);
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(magazineDir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(ids, null, 2), 'utf8');
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* the target is untouched */ }
    throw err;
  }
}
