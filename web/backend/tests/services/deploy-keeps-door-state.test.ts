/**
 * A door's high scores survive the next deploy.
 *
 * A 68K door writes its state BESIDE ITS BINARY - that is how an Amiga door
 * works. There is no `data/` convention to exclude and no manifest to read, and
 * those files are tracked in git, so the image ships them and the entrypoint's
 * blanket `Doors` tar put the image's copy back over the live one on EVERY
 * deploy. The 2026-09-08 backup audit found ten and they have been reverting
 * ever since: mrc's user roster and node stats, STNG's high scores,
 * Kickboxing's champion and fighters, ustats' stats, dRE's wall, zOOtILITY's
 * zOOsTAT.
 *
 * They are VOLUME-OWNED now, which is a different rule from the one the cfg
 * files and Commands use. "The image leads until the sysop takes the file over"
 * is right for CONFIGURATION and wrong for STATE: a newer `mrcusers.dat` in the
 * image is not an upgrade to this board's roster, it is the sample the door
 * shipped with.
 *
 * Driven through the real shell out of the real entrypoint: restating the rule
 * in TypeScript would prove nothing about the script that runs.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENTRYPOINT = path.join(__dirname, '..', '..', '..', '..', 'docker-entrypoint.sh');

/** The state-file list and the seeding pass, lifted verbatim. */
function extractStatePasses(): { excludes: string; seed: string } {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');

  const exStart = source.indexOf('    DOOR_STATE_PATHS="');
  const exEnd = source.indexOf('    for sync_dir in $CODE_SYNC_DIRS; do', exStart);
  if (exStart === -1 || exEnd === -1) throw new Error('the door-state exclude pass was not found');

  const seedStart = source.indexOf('    DOOR_STATE_SEEDED=0');
  const seedEnd = source.indexOf('    # Now the cfg files the tar was told to leave alone', seedStart);
  if (seedStart === -1 || seedEnd === -1) throw new Error('the door-state seeding pass was not found');

  return { excludes: source.slice(exStart, exEnd), seed: source.slice(seedStart, seedEnd) };
}

/** An image and a volume, both with a Doors tree. */
function stage(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-state-'));
  for (const side of ['image', 'volume']) {
    fs.mkdirSync(path.join(root, side, 'Doors'), { recursive: true });
  }
  return root;
}

function write(root: string, side: string, rel: string, body: string): void {
  const full = path.join(root, side, 'Doors', rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

const read = (root: string, side: string, rel: string) =>
  fs.readFileSync(path.join(root, side, 'Doors', rel), 'utf8');

const exists = (root: string, side: string, rel: string) =>
  fs.existsSync(path.join(root, side, 'Doors', rel));

/**
 * Run the two real passes with a real `tar` between them, which is what the
 * deploy does - the excludes only matter because something extracts over the
 * volume straight afterwards.
 */
function runDeploy(root: string): string {
  const { excludes, seed } = extractStatePasses();
  const script = [
    'set -e',
    'DEFAULT_DATA_DIR="$1"',
    'BBS_DATA_DIR="$2"',
    'DOOR_CFG_EXCLUDES=$(mktemp)',
    excludes,
    // The blanket sync, with the excludes the pass above just wrote.
    '(cd "$DEFAULT_DATA_DIR/Doors" && tar cf - --exclude-from="$DOOR_CFG_EXCLUDES" .) | (cd "$BBS_DATA_DIR/Doors" && tar xf -)',
    seed,
  ].join('\n');

  return execFileSync('sh', ['-c', script, 'entrypoint', path.join(root, 'image'), path.join(root, 'volume')], {
    encoding: 'utf8',
  });
}

describe('door state across a deploy', () => {
  let root: string;

  beforeEach(() => { root = stage(); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('keeps the high scores the callers actually set', () => {
    write(root, 'image', 'STNG/HISCORES', 'shipped sample');
    write(root, 'volume', 'STNG/HISCORES', 'SPOT 99999');

    runDeploy(root);

    expect(read(root, 'volume', 'STNG/HISCORES')).toBe('SPOT 99999');
  });

  it('keeps the mrc roster and both node stat files', () => {
    for (const rel of ['mrc/mrcusers.dat', 'mrc/mrcstat1', 'mrc/mrcstat2']) {
      write(root, 'image', rel, 'sample');
      write(root, 'volume', rel, `live ${rel}`);
    }

    runDeploy(root);

    for (const rel of ['mrc/mrcusers.dat', 'mrc/mrcstat1', 'mrc/mrcstat2']) {
      expect(read(root, 'volume', rel)).toBe(`live ${rel}`);
    }
  });

  it('keeps a whole directory of fighters, not just the file beside it', () => {
    write(root, 'image', 'Kickboxing/Fighters/Guy', 'shipped guy');
    write(root, 'volume', 'Kickboxing/Fighters/Guy', 'the champion');
    write(root, 'volume', 'Kickboxing/Fighters/Spot', 'a fighter the image never had');

    runDeploy(root);

    expect(read(root, 'volume', 'Kickboxing/Fighters/Guy')).toBe('the champion');
    expect(read(root, 'volume', 'Kickboxing/Fighters/Spot')).toBe('a fighter the image never had');
  });

  it('keeps a path with an exclamation mark in it - dRE names its wall that way', () => {
    write(root, 'image', 'dRE/dRE!WAll/dRE!WAll.dAtA', 'sample wall');
    write(root, 'volume', 'dRE/dRE!WAll/dRE!WAll.dAtA', 'what the callers wrote');

    runDeploy(root);

    expect(read(root, 'volume', 'dRE/dRE!WAll/dRE!WAll.dAtA')).toBe('what the callers wrote');
  });

  it('seeds a board that has none, so a fresh install still works', () => {
    write(root, 'image', 'zOOtILITY/zOOsTAT', 'shipped stats');

    const out = runDeploy(root);

    expect(read(root, 'volume', 'zOOtILITY/zOOsTAT')).toBe('shipped stats');
    expect(out).toContain('seeded from image (first run)');
  });

  it('still lets the image update everything that is NOT state', () => {
    // The exclusion must be surgical: a door's binary and its art are the
    // image's to replace, and a deploy that stopped updating them would be a
    // worse bug than the one being fixed.
    write(root, 'image', 'STNG/STNG', 'new binary');
    write(root, 'volume', 'STNG/STNG', 'old binary');
    write(root, 'image', 'STNG/HISCORES', 'sample');
    write(root, 'volume', 'STNG/HISCORES', 'SPOT 99999');

    runDeploy(root);

    expect(read(root, 'volume', 'STNG/STNG')).toBe('new binary');
    expect(read(root, 'volume', 'STNG/HISCORES')).toBe('SPOT 99999');
  });

  it('does not invent files the image does not ship', () => {
    runDeploy(root);
    expect(exists(root, 'volume', 'ustats/stats')).toBe(false);
  });
});
