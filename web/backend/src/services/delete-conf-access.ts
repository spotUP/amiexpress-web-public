/**
 * deleteConfAccess (express.e:22335-22377): a deleted account's record in
 * every conference's Conf.DB is cleared - pointers, byte and file counters,
 * ratio, post count, access - at the account's slot. The `handle` bytes (scan
 * flags and votes) are left as they were, as express.e leaves them.
 *
 * Which files: express.e walks every conference and every message base of it
 * (22341-22343) and opens getConfDbFileName(conf, base) (2102-2111): the
 * message base's location when the conference has more than one base, else
 * the conference's own directory, plus confDBName (Conf.DB unless the node's
 * CONF_DB tooltype says otherwise, 31931-31932). A file that does not exist is
 * skipped (`IF(bi<>0)`). CONFDB_SHARED only redirects one conference to
 * another conference's file, which this walk reaches anyway.
 *
 * One deliberate difference: express.e calls `deleteConfAccess(stat)` where
 * `stat` is saveAccount's RESULT_SUCCESS, 0 (21368-21370), not the slot. Slot 0
 * seeks before the start of each file, the Seek fails, and the zeroed record
 * lands on slot 2 with slot 1's handle - another caller's record. The account
 * being deleted is the one whose record is cleared here.
 */

import * as fs from 'fs';
import * as path from 'path';
import { conferenceDir, conferenceNumbers } from '../conferences/conference-paths';
import { MessageBaseLoaderService } from './message-base-loader.service';
import { CONFBASE_RECORD_SIZE } from './MessagePointerFileManager';
import * as amigafs from '../utils/amigafs';

/** Every Conf.DB file getConfDbFileName can name on this board. */
export function confDbFiles(bbsRoot: string, confDbName: string = 'Conf.DB'): string[] {
  const loader = new MessageBaseLoaderService(bbsRoot);
  const files = new Set<string>();
  for (const conf of conferenceNumbers(bbsRoot)) {
    const dir = conferenceDir(bbsRoot, conf);
    // The loader takes the conference location relative to the board root.
    const location = path.relative(bbsRoot, dir);
    const count = loader.getConfMsgBaseCount(location);
    if (count > 1) {
      for (let base = 1; base <= count; base++) {
        files.add(path.join(loader.getMsgBaseLocation(location, base, count), confDbName));
      }
    } else {
      files.add(path.join(dir, confDbName));
    }
  }
  // AmigaDOS names have no case; the container's filesystem does.
  return [...files].map(file => amigafs.resolveExistingAncestors(file));
}

/**
 * express.e zeroes every field after `handle[16]` (22350-22369): the two BCD
 * counters, the pointers and counters, ratio, post count, access, active.
 * Done on the bytes: `handle` is a bit array (amiga-confbase.ts), and a
 * round trip through a text field would lose the bits after its first zero.
 */
const HANDLE_SIZE = 16;

/** Clear `slot`'s record in every Conf.DB that has one. Returns the files touched. */
export function deleteConfAccess(bbsRoot: string, slot: number, confDbName: string = 'Conf.DB'): string[] {
  if (!Number.isInteger(slot) || slot < 1) {
    throw new Error(`deleteConfAccess: invalid slot ${slot}`);
  }
  const touched: string[] = [];
  const offset = (slot - 1) * CONFBASE_RECORD_SIZE;
  for (const file of confDbFiles(bbsRoot, confDbName)) {
    if (!fs.existsSync(file)) continue;
    const fd = fs.openSync(file, 'r+');
    try {
      // A record past the end of the file was never written: nothing to clear.
      if (fs.fstatSync(fd).size < offset + CONFBASE_RECORD_SIZE) continue;
      const zeroes = Buffer.alloc(CONFBASE_RECORD_SIZE - HANDLE_SIZE);
      fs.writeSync(fd, zeroes, 0, zeroes.length, offset + HANDLE_SIZE);
      touched.push(file);
    } finally {
      fs.closeSync(fd);
    }
  }
  return touched;
}
