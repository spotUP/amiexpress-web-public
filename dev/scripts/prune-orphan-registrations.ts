/**
 * Renames command registrations whose door is gone.
 *
 * A command registration is a `.info` icon in a `Commands/<leaf>` directory
 * carrying a LOCATION tooltype (express.e:4630-4670). When the door it points
 * at is deleted - by a sysop, by DOORREPO's uninstall, or by an accident like
 * the 30 August wipe of `Doors/` - the icon stays behind. The command still
 * appears, still dispatches, and answers with an error instead of falling
 * through to the next handler. `BR`, `BV`, `BADD` and `BROADCAST` were all
 * this.
 *
 * The registry already refuses to load such a command: `scanCommandDirectory`
 * calls `commandLocationIsLive` and skips what it cannot find. This script is
 * the cleanup behind that guard - it takes the dead icons out of the tree so
 * the directory listing says what the board actually offers, and so a later
 * reader is not misled into restoring a door nobody wants back.
 *
 * Liveness is decided by `commandLocationIsLive` and nothing else. Reusing the
 * registry's own predicate is the point: a file this script renames is exactly
 * a file the registry was already ignoring, so a prune can never remove a
 * command that still worked. That predicate is deliberately generous - an
 * INTERNAL command and an MCI command need nothing on disk, and a LOCATION
 * whose DIRECTORY still exists counts as live, because a door directory that
 * is present with the executable temporarily missing is a different fault from
 * a door that was deleted.
 *
 * Files that do not parse into a definition at all (no LOCATION, no readable
 * tooltypes) are reported and LEFT ALONE. `loadCommandFromInfo` returns null
 * for them, so they never entered the registry either, and there is no
 * evidence in them about what they once pointed at.
 *
 * Renames to `<name>.info.orphaned`; never deletes. Reversible with a `mv`.
 *
 * Usage:
 *
 *     npx tsx dev/scripts/prune-orphan-registrations.ts [--base <dir>] [--apply]
 *
 * Without `--apply` it reports and changes nothing. `--base` defaults to
 * $BBS_DATA_DIR, then to the repository root. Both runs append to
 * `<base>/Commands/.orphan-prune-audit.txt`, so the record of what was renamed
 * outlives the container.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  loadCommandFromInfo,
  commandLocationIsLive,
  CommandDefinition,
} from '../../web/backend/src/utils/amiga-command-parser.util';

interface Finding {
  file: string;          // absolute path to the .info
  relative: string;      // path relative to base, for the report
  command: string;
  location: string;
  type: string;
  renamedTo?: string;
}

interface Unparsed {
  relative: string;
  reason: string;
}

const AUDIT_NAME = '.orphan-prune-audit.txt';

function parseArgs(argv: string[]): { base: string; apply: boolean } {
  let base = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../..');
  let apply = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') {
      apply = true;
    } else if (argv[i] === '--base') {
      const value = argv[++i];
      if (!value) {
        throw new Error('--base needs a directory');
      }
      base = path.resolve(value);
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }

  return { base, apply };
}

/**
 * Every directory that can hold a command registration.
 *
 * express.e:4630-4670 looks commands up in conference, node and global scope,
 * and `getCommandSearchPaths` builds those paths for a given lookup. Here the
 * traversal runs the other way - from the tree to the registrations - so the
 * directories are enumerated rather than constructed: `Commands/<anything>Cmd`
 * at the root, plus a `Commands/<leaf>` under any `Node*` or conference
 * directory that has one.
 */
function commandDirectories(base: string): string[] {
  const dirs: string[] = [];

  const addLeaves = (commandsDir: string) => {
    if (!fs.existsSync(commandsDir)) return;
    for (const entry of fs.readdirSync(commandsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        dirs.push(path.join(commandsDir, entry.name));
      }
    }
  };

  addLeaves(path.join(base, 'Commands'));

  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!/^(Node\d+|Conf\d+|.*Conf)$/i.test(entry.name)) continue;
    addLeaves(path.join(base, entry.name, 'Commands'));
  }

  return dirs;
}

function describeType(cmd: CommandDefinition): string {
  if (cmd.internal) return `INTERNAL=${cmd.internal}`;
  return String(cmd.type);
}

function nextFreeName(target: string): string {
  if (!fs.existsSync(target)) return target;
  for (let n = 2; ; n++) {
    const candidate = `${target}.${n}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
}

function main(): void {
  const { base, apply } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(path.join(base, 'Commands'))) {
    console.error(`[ERROR] ${base} has no Commands directory - wrong --base?`);
    process.exit(1);
  }

  const dead: Finding[] = [];
  const unparsed: Unparsed[] = [];
  let scanned = 0;

  for (const dir of commandDirectories(base)) {
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.toLowerCase().endsWith('.info')) continue;

      const file = path.join(dir, entry);
      const relative = path.relative(base, file);
      scanned++;

      let cmd: CommandDefinition | null;
      try {
        cmd = loadCommandFromInfo(file);
      } catch (err) {
        unparsed.push({ relative, reason: (err as Error).message });
        continue;
      }

      if (!cmd) {
        unparsed.push({ relative, reason: 'no LOCATION, or no readable tooltypes' });
        continue;
      }

      if (commandLocationIsLive(base, cmd)) continue;

      dead.push({
        file,
        relative,
        command: cmd.name,
        location: cmd.location,
        type: describeType(cmd),
      });
    }
  }

  dead.sort((a, b) => a.relative.localeCompare(b.relative));

  const lines: string[] = [];
  const say = (line: string) => {
    lines.push(line);
    console.log(line);
  };

  say(`[INFO] base ${base}`);
  say(`[INFO] mode ${apply ? 'APPLY' : 'DRY RUN'}`);
  say(`[INFO] scanned ${scanned} registrations`);
  say('');

  if (dead.length === 0) {
    say('[OK] no registration points at a door that is gone');
  } else {
    say(`[INFO] ${dead.length} registrations point at a door that is gone:`);
    for (const finding of dead) {
      if (apply) {
        const target = nextFreeName(`${finding.file}.orphaned`);
        fs.renameSync(finding.file, target);
        finding.renamedTo = path.relative(base, target);
      }
      const verb = apply ? '->' : '  ';
      say(`  ${finding.relative} ${verb} ${finding.renamedTo ?? ''}`);
      say(`      ${finding.command}  ${finding.type}  LOCATION=${finding.location}`);
    }
  }

  const sysCmd = dead.filter(f => /(^|[\\/])SysCmd[\\/]/i.test(f.relative));
  if (sysCmd.length > 0) {
    say('');
    say(`[WARN] ${sysCmd.length} of them are SysCmd event hooks - the BBS calls`);
    say('       these itself (logon, password failure, ANSI detection). If the');
    say('       board behaves differently afterwards, restore these first:');
    for (const finding of sysCmd) {
      say(`         mv "${finding.renamedTo ?? finding.relative + '.orphaned'}" "${finding.relative}"`);
    }
  }

  if (unparsed.length > 0) {
    say('');
    say(`[INFO] ${unparsed.length} .info files carry no command definition. The`);
    say('       registry ignores them too. LEFT ALONE - nothing in them says');
    say('       what they once pointed at:');
    for (const item of unparsed) {
      say(`  ${item.relative}  (${item.reason})`);
    }
  }

  say('');
  say(apply
    ? `[OK] ${dead.length} renamed to .orphaned. Nothing was deleted.`
    : `[OK] dry run. Re-run with --apply to rename ${dead.length} of them.`);

  const auditPath = path.join(base, 'Commands', AUDIT_NAME);
  const header = `\n===== ${new Date().toISOString()} ${apply ? 'APPLY' : 'DRY RUN'} =====\n`;
  fs.appendFileSync(auditPath, header + lines.join('\n') + '\n');
  console.log(`\n[INFO] audit appended to ${auditPath}`);
}

main();
