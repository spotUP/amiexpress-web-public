/**
 * REPAIR user.data / user.keys / user.misc after the append-and-renumber bug.
 *
 * The three files are arrays indexed by slot. Two defects put them out of
 * that shape (both fixed in UserFileManager and regenerate-user-files):
 *
 *   writeUserFiles APPENDED instead of writing at the slot, so every rewrite
 *   added a record rather than replacing one.
 *
 *   regenerate-user-files renumbered accounts by query order, so each run
 *   laid the whole board down again, alphabetically, at the end.
 *
 * The live board ended with 46 accounts in 100 populated records across three
 * such blocks (slots 1-47, 48-73, 74-100), 37650 records of file, and
 * user.misc - which was NOT renumbered - still keyed to the first block. A
 * lockout recorded for one account therefore sat on whoever occupies that
 * offset now: "coffe was blocked but dalton is shown as blocked".
 *
 * WHAT THIS DOES
 *
 *   Keeps ONE record per username: the one with the most calls, which is the
 *   liveliest and the one the admin already displays. Ties go to the earliest
 *   slot.
 *
 *   Puts it at the LOWEST slot that username ever occupied, so anything that
 *   refers to an account by slot keeps pointing at the same person.
 *
 *   Rebuilds all three files together from that one record, so data, keys and
 *   misc finally describe the same account at the same index.
 *
 *   CLEARS THE LOCKOUT BYTES. accountLocked and invalidAttempts live in
 *   user.misc, which was misaligned: there is no honest way to say whose lock
 *   a given byte was. A stale lock on an innocent account is worse than none,
 *   and a caller who really should be locked will be again on their next
 *   failed password. Said out loud in the report rather than done quietly.
 *
 * Reads nothing from the database: the disk files are the board.
 *
 *   npx tsx src/scripts/repair-user-files.ts            # report only
 *   npx tsx src/scripts/repair-user-files.ts --apply    # write, after backup
 */
import * as fs from 'fs';
import * as path from 'path';

import { boardRoot } from '../utils/board-root.util';
import { userFileManager } from '../services/UserFileManager';

const DATA_REC = 232;
const KEYS_REC = 56;
const MISC_REC = 248;
/** Record-relative offsets in user.misc. */
const OFF_LOCKED = 0x94;
const OFF_ATTEMPTS = 0x95;

interface Record0 { slot: number; name: string; calls: number }

/**
 * Read a record through the board's OWN deserializer rather than hand-counting
 * field offsets here. The struct's layout has moved before, and a second copy
 * of it in a repair tool is the kind of thing that repairs a file into a
 * different wrong shape.
 */
function recordAt(data: Buffer, i: number): { name: string; calls: number } {
  const st = userFileManager.deserializeUserStruct(data, i * DATA_REC);
  return { name: (st.name ?? '').trim(), calls: st.timesCalled ?? 0 };
}

/**
 * A NAME, or rubbish that survived a trim.
 *
 * The live file ends with a record of control bytes - \x03\x83\x00... - and
 * readString stops at the first NUL, so it came back as a two-character
 * "name" that is not empty. Left alone it would have been treated as an
 * account at slot 37053 and sized the rebuilt file to 37053 records, which is
 * the very thing being repaired. A caller's name is printable.
 */
function isRealName(name: string): boolean {
  if (!name) return false;
  for (const ch of name) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 || c === 0x7f) return false;
  }
  return true;
}

export interface RepairPlan {
  keep: Array<{ name: string; fromSlot: number; toSlot: number; calls: number }>;
  drop: Array<{ name: string; slot: number }>;
  locksCleared: number[];
  slots: number;
}

export function planRepair(data: Buffer, misc: Buffer): RepairPlan {
  const byName = new Map<string, Record0[]>();
  for (let i = 0; (i + 1) * DATA_REC <= data.length; i++) {
    const { name, calls } = recordAt(data, i);
    if (!isRealName(name)) continue;
    const rec = { slot: i + 1, name, calls };
    const list = byName.get(name) ?? [];
    list.push(rec);
    byName.set(name, list);
  }

  const keep: RepairPlan['keep'] = [];
  const drop: RepairPlan['drop'] = [];
  for (const [name, records] of byName) {
    // Liveliest record wins; earliest slot breaks a tie.
    const best = [...records].sort((a, b) => b.calls - a.calls || a.slot - b.slot)[0]!;
    const home = Math.min(...records.map((r) => r.slot));
    keep.push({ name, fromSlot: best.slot, toSlot: home, calls: best.calls });
    for (const r of records) if (r.slot !== best.slot) drop.push({ name, slot: r.slot });
  }
  keep.sort((a, b) => a.toSlot - b.toSlot);

  const locksCleared: number[] = [];
  for (let s = 1; (s - 1) * MISC_REC < misc.length; s++) {
    const o = (s - 1) * MISC_REC;
    if (misc[o + OFF_LOCKED] || misc[o + OFF_ATTEMPTS]) locksCleared.push(s);
  }

  return { keep, drop, locksCleared, slots: keep.length ? Math.max(...keep.map((k) => k.toSlot)) : 0 };
}

function main(): void {
  const apply = process.argv.includes('--apply');
  const root = boardRoot();
  const paths = {
    data: path.join(root, 'user.data'),
    keys: path.join(root, 'user.keys'),
    misc: path.join(root, 'user.misc'),
  };
  for (const [what, p] of Object.entries(paths)) {
    if (!fs.existsSync(p)) { console.error(`[repair] no ${what} at ${p}`); process.exit(1); }
  }

  const data = fs.readFileSync(paths.data);
  const keys = fs.readFileSync(paths.keys);
  const misc = fs.readFileSync(paths.misc);

  const plan = planRepair(data, misc);
  console.log(`[repair] board: ${root}`);
  console.log(`[repair] data ${data.length}B (${Math.floor(data.length / DATA_REC)} records), ` +
              `keys ${keys.length}B, misc ${misc.length}B`);
  console.log(`[repair] ${plan.keep.length} accounts, ${plan.drop.length} duplicate records to drop`);
  for (const k of plan.keep) {
    const moved = k.fromSlot === k.toSlot ? '' : `  (content from slot ${k.fromSlot})`;
    console.log(`   slot ${String(k.toSlot).padStart(3)}  ${k.name}${moved}`);
  }
  if (plan.locksCleared.length) {
    console.log(`[repair] lockout bytes cleared at slots: ${plan.locksCleared.join(', ')}`);
    console.log('[repair] (user.misc was misaligned; whose lock a byte was cannot be known)');
  }

  if (!apply) { console.log('[repair] report only - pass --apply to write'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const [what, p] of Object.entries(paths)) {
    const backup = `${p}.before-repair-${stamp}`;
    fs.copyFileSync(p, backup);
    console.log(`[repair] backed up ${what} -> ${path.basename(backup)}`);
  }

  const outData = Buffer.alloc(plan.slots * DATA_REC);
  const outKeys = Buffer.alloc(plan.slots * KEYS_REC);
  const outMisc = Buffer.alloc(plan.slots * MISC_REC);
  for (const k of plan.keep) {
    const from = k.fromSlot - 1;
    const to = k.toSlot - 1;
    data.copy(outData, to * DATA_REC, from * DATA_REC, from * DATA_REC + DATA_REC);
    if ((from + 1) * KEYS_REC <= keys.length) {
      keys.copy(outKeys, to * KEYS_REC, from * KEYS_REC, from * KEYS_REC + KEYS_REC);
    }
    if ((from + 1) * MISC_REC <= misc.length) {
      misc.copy(outMisc, to * MISC_REC, from * MISC_REC, from * MISC_REC + MISC_REC);
    }
    // The lock cannot be attributed; it goes, for everybody.
    outMisc[to * MISC_REC + OFF_LOCKED] = 0;
    outMisc[to * MISC_REC + OFF_ATTEMPTS] = 0;
  }

  fs.writeFileSync(paths.data, outData);
  fs.writeFileSync(paths.keys, outKeys);
  fs.writeFileSync(paths.misc, outMisc);
  console.log(`[repair] wrote ${plan.slots} slots to all three files`);
}

if (require.main === module) main();
