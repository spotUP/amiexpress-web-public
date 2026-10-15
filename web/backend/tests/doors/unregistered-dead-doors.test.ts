/**
 * GA, L and SENT are unregistered, and stay unregistered.
 *
 * All three came off the reference-boardBBS reference copy (`0b813fbcd`) and named
 * executables this board has never had:
 *
 *   Commands/BBSCmd/ga.info    LOCATION=Doors:GetAnswer/GetAnswer.030
 *   Commands/BBSCmd/L.info     LOCATION=doors:scan.x
 *   Commands/BBSCmd/SENT.info  LOCATION=DOORS:FILEID/FILEID
 *
 * They failed for EVERY caller on every terminal, not only at 40 columns - a
 * registration whose binary is absent is a command that answers with an error
 * and nothing else. The sysop's ruling on 2026-09-06 was to unregister all
 * three rather than repoint them, even though `Doors/GetAnswer/GetAnswer` and
 * `Doors/Fileid/FILEID.000` are sitting right beside the paths that were
 * wrong. Repointing is his call to make later; this file pins the ruling so a
 * fresh sync from the reference BBS cannot quietly bring them back.
 *
 * Deliberately NOT a general "every LOCATION must exist" rule. A registration
 * may legitimately name a door that is installed on the board and absent from
 * git - `registration-matches-the-door.test.ts` says so and names TTT and
 * BestConf. This pins three specific commands the sysop retired.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const COMMANDS_DIR = path.join(REPO_ROOT, 'Commands');

/** Every command directory AmigaCommandParser scans: BBSCmd, SysCmd, Conf<N>Cmd, Node<N>Cmd. */
function commandDirs(): string[] {
  return fs
    .readdirSync(COMMANDS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /Cmd$/i.test(e.name))
    .map((e) => path.join(COMMANDS_DIR, e.name))
    .sort();
}

/** Registration filenames a command directory offers, upper-cased and stripped. */
function commandNamesIn(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /\.info$/i.test(f))
    .map((f) => f.replace(/\.info$/i, '').toUpperCase());
}

describe('the three doors the sysop retired are not registered anywhere', () => {
  it.each(['GA', 'L', 'SENT'])('%s has no registration in any command directory', (command) => {
    const found = commandDirs()
      .filter((dir) => commandNamesIn(dir).includes(command))
      .map((dir) => path.relative(REPO_ROOT, dir).split(path.sep).join('/'));

    expect({ command, found }).toEqual({ command, found: [] });
  });

  it('the executables they named are still absent - repointing was never the fix', () => {
    const missing = [
      'Doors/GetAnswer/GetAnswer.030',
      'Doors/scan.x',
      'Doors/FILEID/FILEID',
    ].filter((p) => fs.existsSync(path.join(REPO_ROOT, p)));

    expect(missing).toEqual([]);
  });
});
