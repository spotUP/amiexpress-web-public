/**
 * Turn CENTRAL_ANSWERS on for every node and move the answers already given
 * into the board's Answers/<slot> - sysop decision 2026-10-05.
 *
 * express.e's account editor shows an account's questionnaire answers only
 * from Answers/<slot> on a CENTRAL_ANSWERS node (findUserAnswers,
 * 21177-21196); doNewUserQuestions writes there when the node carries the
 * switch (30332-30340). The live board's nodes did not, so every answer sat
 * in one Node<n>/Answers per node, where the editor never looks.
 *
 * Each Node<n>/Answers is split into blocks at the `*****` banner the board
 * writes before each registration (new-user.handler persistQuestionnaireAnswers).
 * The block's header line is `MM-DD-YY (HH:MM:SS) [slot] name (CONNECT ...)`,
 * but its SLOT cannot be trusted - the writer used the number of accounts,
 * not the account's slot, so on the live board nearly every header named
 * someone else's (fixed 2026-10-05). The NAME is matched to user.data
 * instead, and the block is appended to Answers/<that slot>. A name no
 * account carries (a deleted caller) is left where it was and reported. The node file is renamed
 * to `Answers.pre-central-<date>.backup`, so a second run finds nothing to
 * move. Files are written Latin-1, byte for byte, owned 1001 when run as root.
 *
 *     npx tsx src/scripts/central-answers.ts            # dry run
 *     npx tsx src/scripts/central-answers.ts --apply
 *
 *     --root <path>    the board (default: BBS_DATA_DIR)
 *     --date <stamp>   the date in the backup names (default: today)
 */
import * as fs from 'fs';
import * as path from 'path';
import { applyTooltypes } from '../utils/info-file.util';
import { boardRoot } from '../utils/board-root.util';
import { chownToBoard } from '../utils/board-owner.util';
import { UserFileManager } from '../services/UserFileManager';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = opt('--root') || process.env.BBS_DATA_DIR || boardRoot();
const date = opt('--date') || new Date().toISOString().slice(0, 10).replace(/-/g, '');

const own = chownToBoard;

/** The blocks of one Answers file, each with the caller its header names. */
export function splitAnswers(text: string): Array<{ name: string | null; block: string }> {
  return text
    .split(/(?=^\*{10,}\s*$)/m)
    .filter((b) => b.trim().length > 0)
    .map((block) => {
      const header = block.split('\n').find((l) => l.trim() && !l.startsWith('**')) ?? '';
      const m = /^\S+ \(\S+\) \[\d+\] (.*?) \(CONNECT/.exec(header.trim());
      return { name: m ? m[1] : null, block };
    });
}

function main(): void {
  const nodes = fs.readdirSync(root).filter((e) => /^Node\d+$/i.test(e) && fs.statSync(path.join(root, e)).isDirectory());
  const icons = fs.readdirSync(root).filter((e) => /^Node\d+\.info$/i.test(e));
  const central = path.join(root, 'Answers');
  let moved = 0;
  const unplaced: string[] = [];
  // The account a name belongs to - AmigaDOS names compare case-blind.
  const slotOf = new Map<string, number>();
  for (const u of new UserFileManager(root).readAllUsers()) {
    if (u.username && u.slotNumber && !slotOf.has(u.username.toLowerCase())) slotOf.set(u.username.toLowerCase(), u.slotNumber);
  }

  for (const icon of icons) {
    console.log(`[icon] ${icon}: CENTRAL_ANSWERS on`);
    if (apply) {
      applyTooltypes(path.join(root, icon), [['CENTRAL_ANSWERS', '']]);
      own(path.join(root, icon));
    }
  }

  for (const node of nodes) {
    const file = path.join(root, node, 'Answers');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, 'latin1');
    const blocks = splitAnswers(text);
    if (blocks.length === 0) continue;
    const keep: string[] = [];
    for (const { name, block } of blocks) {
      const slot = name ? slotOf.get(name.toLowerCase()) ?? null : null;
      if (slot === null) {
        keep.push(block);
        unplaced.push(`${node}: ${name ?? '(no name in header)'}`);
        continue;
      }
      console.log(`[move] ${node}/Answers ${name} -> Answers/${slot} (${block.length} bytes)`);
      moved += 1;
      if (apply) {
        if (!fs.existsSync(central)) { fs.mkdirSync(central); own(central); }
        const target = path.join(central, String(slot));
        fs.appendFileSync(target, block.endsWith('\n') ? block : `${block}\n`, 'latin1');
        own(target);
      }
    }
    if (apply) {
      const backup = `${file}.pre-central-${date}.backup`;
      fs.renameSync(file, backup);
      own(backup);
      if (keep.length > 0) {
        fs.writeFileSync(file, keep.join(''), 'latin1');
        own(file);
      }
    }
  }

  console.log(`${apply ? '[OK]' : '[INFO] dry run:'} ${icons.length} node icon(s), ${moved} block(s) moved, ${unplaced.length} left in place`);
  for (const u of unplaced) console.log(`[INFO] no account by that name, left: ${u}`);
}

if (require.main === module) main();
