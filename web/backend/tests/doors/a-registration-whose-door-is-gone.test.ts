/**
 * BROADCAST is on the menu and its door is not on disk.
 *
 * Reported 2026-08-30 and confirmed on the live volume:
 * `Commands/BBSCmd/BROADCAST.info` carries
 * `LOCATION=DOORS:ANNOUNCE/ANNOUNCE.REXX`, and `Doors/ANNOUNCE/` does not
 * exist at all. The command is offered to every caller with access 20 and
 * fails only when one of them runs it:
 *
 *     Error: ARexx script not found: Doors/ANNOUNCE/ANNOUNCE.REXX
 *     Please contact the sysop.
 *
 * The sysop has no way to learn this short of a caller reporting it. The
 * startup scan already warns about a LOCATION that resolves OUTSIDE Doors/,
 * so a LOCATION that resolves nowhere at all belongs in the same pass.
 *
 * These pin the resolution rules that pass depends on. The rule that matters
 * most is the last one: the check must use the SAME path resolution the
 * execution path uses - Amiga-style, case-insensitive, rooted at the BBS -
 * or it warns about doors that work and stays quiet about doors that do not.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { resolveDoorTarget, missingDoorTargets } from '../../src/doors/door-path.util';

describe('a registration whose door is gone', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'doortarget-'));
    fs.mkdirSync(path.join(root, 'Doors', 'pengo'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'pengo', 'index.ts'), '');
    fs.mkdirSync(path.join(root, 'Doors', 'THEMEC'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'THEMEC', 'themec'), '');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('resolveDoorTarget', () => {
    it('finds a door DIRECTORY, which is what a TypeScript door registers', () => {
      expect(resolveDoorTarget(root, 'Doors/pengo')).toBeTruthy();
    });

    it('finds a door FILE, which is what a 68K or ARexx door registers', () => {
      expect(resolveDoorTarget(root, 'Doors/THEMEC/themec')).toBeTruthy();
    });

    // The board's own directories disagree with their .info files about case
    // (GL.info vs gl.info is a live example), so a lexical check would report
    // working doors as broken.
    it('resolves case-insensitively, the way the execution path does', () => {
      expect(resolveDoorTarget(root, 'doors/themec/THEMEC')).toBeTruthy();
      expect(resolveDoorTarget(root, 'DOORS/PENGO')).toBeTruthy();
    });

    it('understands the DOORS: assign, which is how AmiExpress writes it', () => {
      expect(resolveDoorTarget(root, 'DOORS:THEMEC/themec')).toBeTruthy();
    });

    it('answers null when nothing is there - the BROADCAST case', () => {
      expect(resolveDoorTarget(root, 'DOORS:ANNOUNCE/ANNOUNCE.REXX')).toBeNull();
    });

    it('answers null for an empty or absent location rather than the BBS root', () => {
      expect(resolveDoorTarget(root, '')).toBeNull();
      expect(resolveDoorTarget(root, undefined)).toBeNull();
    });
  });

  describe('missingDoorTargets', () => {
    it('names the command, not just the path, because the sysop fixes an .info', () => {
      const missing = missingDoorTargets(
        [
          { command: 'PENGO', path: 'Doors/pengo' },
          { command: 'BROADCAST', path: 'DOORS:ANNOUNCE/ANNOUNCE.REXX' },
        ],
        root,
      );
      expect(missing).toHaveLength(1);
      expect(missing[0].command).toBe('BROADCAST');
      expect(missing[0].location).toBe('DOORS:ANNOUNCE/ANNOUNCE.REXX');
    });

    it('is silent when every registration resolves', () => {
      expect(
        missingDoorTargets(
          [
            { command: 'PENGO', path: 'Doors/pengo' },
            { command: 'THEMEC', path: 'Doors/THEMEC/themec' },
          ],
          root,
        ),
      ).toEqual([]);
    });

    // A door with no LOCATION at all is a different defect and the existing
    // scan already skips it; reporting it here would bury the real ones.
    it('skips a registration that declares no location', () => {
      expect(missingDoorTargets([{ command: 'NOPATH' }], root)).toEqual([]);
    });
  });
});
