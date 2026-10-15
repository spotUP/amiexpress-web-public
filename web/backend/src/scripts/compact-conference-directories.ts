/**
 * Make the conference DIRECTORIES agree with the conference numbers again.
 *
 * Removing a conference renumbers everything keyed by POSITION - NAME.n,
 * LOCATION.n, the icons, every account's access string - but LOCATION.n
 * carries its OLD directory down with it. A board that has had conferences
 * removed ends up like the live one:
 *
 *     1 -> Conf2, 2 -> Conf3, 3 -> Conf5, 4 -> Conf8, 5 -> Conf12
 *
 * That is not only untidy. The deploy syncs the IMAGE's `Conf<n>/Screens` into
 * the volume's directory of the SAME NAME, so with the mapping skewed the
 * repo's conference 2 screens land in the board's conference 1.
 *
 * `conference-directory-plan.ts` works out what would move and what names it;
 * `conference-directory-compaction.ts` does it, through temporary names, with
 * a backup and a rollback. NOTHING CALLED EITHER OF THEM - they were written,
 * tested and left unreachable, which is why the live board still has the skew
 * this fixes. This script is the entry point they were missing.
 *
 *     npx tsx src/scripts/compact-conference-directories.ts
 *         Report only. Reads the board, prints the mapping, the moves, every
 *         place a moving directory is named, and every reason not to run yet.
 *
 *     npx tsx src/scripts/compact-conference-directories.ts --apply
 *         Do it. Refuses while the plan reports blockers.
 *
 *     --root <path>   the board, when it is not the configured data dir
 *     --force         apply even though the plan reports blockers
 *
 * REPORT IS THE DEFAULT AND `--apply` IS TYPED BY HAND, because this renames
 * directories on a live board: a run that surprises the sysop is worse than a
 * run that does not happen. The blockers are refusals for the same reason -
 * a pooled file area's object-key prefix is built from the download path, so
 * renaming the directory strands every object already in the bucket, and no
 * amount of local backup brings those back.
 */
import * as path from 'path';

import { compactConferenceDirectories } from '../conferences/conference-directory-compaction';
import {
  describeCompactionPlan,
  planDirectoryCompaction,
  stoppingBlockers,
} from '../conferences/conference-directory-plan';

export interface CompactionCliOptions {
  root?: string;
  apply: boolean;
  force: boolean;
}

export function parseCompactionArgs(argv: string[]): CompactionCliOptions {
  const opts: CompactionCliOptions = { apply: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') opts.root = argv[++i];
    else if (argv[i] === '--apply') opts.apply = true;
    else if (argv[i] === '--force') opts.force = true;
  }
  return opts;
}

/**
 * The whole script, as a function, so a test can drive it without a process.
 *
 * @returns the exit code: 0 when it reported or moved, 1 when it refused.
 */
export function runConferenceCompaction(
  argv: string[],
  out: (line: string) => void,
  defaultRoot: string,
): number {
  const opts = parseCompactionArgs(argv);
  const root = path.resolve(opts.root ?? defaultRoot);

  out(`Board: ${root}`);
  out('');

  const plan = planDirectoryCompaction(root);
  out(describeCompactionPlan(plan));
  out('');

  if (plan.moves.length === 0) return 0;

  if (!opts.apply) {
    const dry = compactConferenceDirectories(root, { dryRun: true });
    if (dry.refused) {
      out(`REFUSED: ${dry.refused}`);
      return 1;
    }
    if (dry.absorbed.length > 0) {
      out(`Empty directories that would be moved into the backup: ${dry.absorbed.join(', ')}`);
    }
    out(`${dry.rewrites.length} tooltype(s) would be rewritten.`);
    out('');
    out('Nothing was changed. Re-run with --apply to do it.');
    return 0;
  }

  // NOT `plan.blockers` - `stoppingBlockers` drops the collision one, which
  // describes work `compactConferenceDirectories` does for itself. Gating on
  // the whole list would refuse every board that needs compacting at all.
  const stopping = stoppingBlockers(plan);
  if (stopping.length > 0 && !opts.force) {
    out('REFUSED, and each of these is a way to lose data rather than tidy it:');
    for (const blocker of stopping) out(`  - ${blocker}`);
    out('');
    out('Settle them, or re-run with --force if you have read every one and');
    out('none applies to this board.');
    return 1;
  }

  const result = compactConferenceDirectories(root);
  if (result.refused) {
    out(`REFUSED: ${result.refused}`);
    return 1;
  }

  for (const move of result.moved) out(`moved   conference ${move.conference}: ${move.from} -> ${move.to}`);
  for (const name of result.absorbed) out(`absorbed empty ${name} into the backup`);
  for (const rewrite of result.rewrites) out(`rewrote ${rewrite}`);
  out('');
  out(`Backup: ${result.backupDir}`);
  out('');
  out('The tooltypes THIS TOOL owns are rewritten - ConfConfig.info LOCATION.n');
  out('and each Conf<n>.info DL/ULPATH.n. Everything the plan marked [by hand]');
  out('above still names the old directory and is yours to fix.');
  return 0;
}

if (require.main === module) {
  // The config is loaded HERE and not at the top, so importing this module in
  // a test does not drag the board's configuration in with it.
  const { config } = require('../config');
  const code = runConferenceCompaction(
    process.argv.slice(2),
    (line: string) => console.log(line),
    config.get('dataDir'),
  );
  process.exit(code);
}
