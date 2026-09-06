/**
 * A REGISTRATION MUST ANSWER TO ITS OWN NAME.
 *
 * `Commands/BBSCmd/THEMEC.info` carried `BBSCMD=DOORREPO` and
 * `LOCATION=Doors:ThemeC/theme-picker`. That is not a cosmetic mix-up:
 * `loadCommandFromInfo` (utils/amiga-command-parser.util.ts:662-665) lets the
 * BBSCMD tooltype WIN over the filename, so the file registered the command
 * DOORREPO - shadowing the real `DOORREPO.info` in the same directory with the
 * C theme picker - and THEMEC itself registered nothing at all. The door was
 * unreachable and the sysop's DOORREPO opened a different program.
 *
 * `c754b64aa` had already fixed exactly this, and merge `1b773d8ff` resolved
 * it back to the broken side. A fix that can be re-broken by a merge without
 * anything going red is not fixed, which is what this file is for.
 *
 * It reads the REAL .info BYTES with the parser registration itself uses -
 * never a fixture, never a source pin - and it pins four rules that between
 * them make a crossed registration impossible to merge:
 *
 *   1. a BBSCMD/SYSCMD tooltype must name its own file;
 *   2. no two registrations in a directory may resolve to the same command;
 *   3. no `.info.tooltypes.txt` sidecar may sit beside a registration - the
 *      .info is what runs, and a second store of truth drifts from it (the
 *      THEMEC sidecar held DoorRepo's tooltypes verbatim; `j`'s had already
 *      lost the C64_ADAPT=40 its .info carries);
 *   4. no two tracked paths under Commands/ or Doors/ differ only in case -
 *      one file on a case-insensitive disk, two on the Linux container that
 *      actually serves the board.
 *
 * Prior art for reading real .info bytes: compact-40/marked-doors-launch-on-c64
 * and doors/door-min-columns*.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { readTooltypeMap } from '../../src/utils/info-file.util';

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

function registrationsIn(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.info'))
    .map((f) => path.join(dir, f))
    .sort();
}

function rel(p: string): string {
  return path.relative(REPO_ROOT, p).split(path.sep).join('/');
}

/** The command name `loadCommandFromInfo` would register this file under. */
function declaredName(file: string): string | null {
  const tooltypes = readTooltypeMap(file);
  const declared = tooltypes.get('BBSCMD') ?? tooltypes.get('SYSCMD');
  return declared ? declared.trim().toUpperCase() : null;
}

function fileName(file: string): string {
  return path.basename(file).replace(/\.info$/i, '').toUpperCase();
}

describe('every BBS command registration answers to its own filename', () => {
  it('a BBSCMD/SYSCMD tooltype never names a different command than its file', () => {
    const crossed: string[] = [];
    for (const dir of commandDirs()) {
      for (const file of registrationsIn(dir)) {
        const declared = declaredName(file);
        // Absent is fine and is the majority case - the filename IS the
        // command then (amiga-command-parser.util.ts:664). Present and
        // DIFFERENT is the defect: the tooltype wins, so the file registers
        // somebody else's command and its own name reaches nothing.
        if (declared !== null && declared !== fileName(file)) {
          crossed.push(`${rel(file)} declares ${declared}`);
        }
      }
    }
    expect({
      crossed,
      whatToDo: crossed.length
        ? 'A registration is crossed: its BBSCMD/SYSCMD names another command, which shadows that ' +
          'command and leaves this file unreachable. Repair the .info BYTES with applyTooltypes ' +
          '(utils/info-file.util.ts), never an editor.'
        : 'none',
    }).toEqual({ crossed: [], whatToDo: 'none' });
  });

  it('no two registrations in one directory resolve to the same command name', () => {
    const collisions: string[] = [];
    for (const dir of commandDirs()) {
      const byName = new Map<string, string[]>();
      for (const file of registrationsIn(dir)) {
        const name = declaredName(file) ?? fileName(file);
        byName.set(name, [...(byName.get(name) ?? []), rel(file)]);
      }
      for (const [name, files] of byName) {
        if (files.length > 1) collisions.push(`${name}: ${files.join(', ')}`);
      }
    }
    expect({ collisions }).toEqual({ collisions: [] });
  });

  it('no .info.tooltypes.txt sidecar sits beside a registration', () => {
    const sidecars: string[] = [];
    for (const dir of commandDirs()) {
      for (const f of fs.readdirSync(dir)) {
        if (/\.info\.tooltypes\.txt$/i.test(f)) sidecars.push(rel(path.join(dir, f)));
      }
    }
    expect({
      sidecars,
      whatToDo: sidecars.length
        ? 'Two stores of truth. The .info is the one the BBS reads; a sidecar drifts from it ' +
          'silently. Fold anything the sidecar knows into the .info with applyTooltypes and delete it.'
        : 'none',
    }).toEqual({ sidecars: [], whatToDo: 'none' });
  });

  it('no two tracked paths under Commands/ or Doors/ differ only in case', () => {
    const tracked = execFileSync('git', ['ls-files', '--', 'Commands', 'Doors'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
      .split('\n')
      .filter(Boolean);

    const byLower = new Map<string, string[]>();
    for (const p of tracked) {
      const key = p.toLowerCase();
      byLower.set(key, [...(byLower.get(key) ?? []), p]);
    }
    const collisions = [...byLower.values()].filter((v) => v.length > 1).map((v) => v.join(' == '));

    expect({
      collisions,
      whatToDo: collisions.length
        ? 'One file on the sysop\'s case-insensitive disk, two in the Linux container that serves ' +
          'the board. Keep one spelling and drop the others from the index.'
        : 'none',
    }).toEqual({ collisions: [], whatToDo: 'none' });
  });
});

describe('THEMEC specifically - the registration merge 1b773d8ff re-broke', () => {
  const themec = path.join(COMMANDS_DIR, 'BBSCmd', 'THEMEC.info');

  it('registers THEMEC, not DOORREPO', () => {
    expect(readTooltypeMap(themec).get('BBSCMD')).toBe('THEMEC');
  });

  it('points at an executable that exists', () => {
    const location = readTooltypeMap(themec).get('LOCATION');
    expect(location).toBe('Doors/THEMEC/themec');
    expect(fs.existsSync(path.join(REPO_ROOT, location!))).toBe(true);
  });

  it('leaves DOORREPO to DOORREPO.info', () => {
    const doorrepo = path.join(COMMANDS_DIR, 'BBSCmd', 'DOORREPO.info');
    const tooltypes = readTooltypeMap(doorrepo);
    expect(tooltypes.get('BBSCMD')).toBe('DOORREPO');
    expect(tooltypes.get('LOCATION')).toBe('Doors:DoorRepo/doorrepo.amiga');
  });
});
