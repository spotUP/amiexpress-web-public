/**
 * "It asks for the BBS acronym on EVERY start." - the sysop, 2026-09-06.
 *
 * Two things, driven through the REAL 68K binary and the REAL emulator:
 *
 *   1. GWall asks for the BBS acronym ONCE, not on every start - including
 *      across the loss of the RAM disk, which is what a container restart is.
 *   2. The config it saves lands in the BBS env archive, spelled the way the
 *      door spelled it, and never loose in the BBS root.
 *
 * WHY IT REGRESSED. GWall persists its acronym the standard AmigaOS way:
 * `saveSettings()` writes ENV:GWall.cfg AND ENVARC:GWall.cfg
 * (`Documentation/7-Reference Sources/AmiXDoors-master/Global Wall/gwall.e:1697`)
 * and `readSettings()` reads ENV: back - because the Startup-Sequence copies
 * ENVARC: into ENV: at boot. We modelled only ENV:, and ENV: lives under
 * /tmp. The archive write had no assign at all, so it fell through
 * PathManager's unknown-volume fallback and became "<bbsRoot>/gwall.cfg" -
 * lowercased on the way, because that fallback took its remainder off the
 * lowercased copy of the path - which nothing ever reads. Captured before the
 * fix:
 *
 *   [PathManager] Volume fallback: "ENVARC:GWall.cfg"
 *       => "~/Code/amiexpress-web/gwall.cfg"
 *
 * Wipe /tmp - every deploy does - and the acronym was gone.
 *
 * WHY THE SECOND RUN IS THE ONE THAT MATTERS. Run 1 on an unconfigured board
 * prompts before AND after the fix. The regression only shows up on the run
 * after that, with ENV: cleared and the archive intact: before the fix there
 * was nothing in the archive to come back from.
 *
 * NO SCRIPTED TYPING. The door writes its config to ENVARC: on its own, with
 * no input at all: readSettings() falling through calls saveSettings()
 * (gwall.e:1692) before the prompt is ever posted. That write is what these
 * cases follow, and it is deterministic - driving the JH_PM prompt from a
 * timed input script is not (measured 2026-09-06: identical scripts saved
 * "UPT" on one run and "T" on the next).
 *
 * NOTE ON GLC. The sysop named GLOBAL LAST CALLERS, but the prompt is
 * GWall's. `Doors/glc/glcviewer` contains no such string; the last case pins
 * that so a future reader does not go hunting in the wrong door.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BACKEND = path.resolve(__dirname, '..', '..');
const HARNESS = path.join(BACKEND, 'src', 'scripts', 'run-amiga-door.ts');
const TSX = path.join(BACKEND, 'node_modules', '.bin', 'tsx');
const GWALL = path.join(REPO_ROOT, 'Doors', 'GWall', 'GWall');
const GLCVIEWER = path.join(REPO_ROOT, 'Doors', 'glc', 'glcviewer');

/** The two halves of the AmigaOS environment, for this BBS root. */
const ENV_DIR = '/tmp/ram/ENV';
const ENV_COPY = path.join(ENV_DIR, 'GWall.cfg');
const ARCHIVE = path.join(REPO_ROOT, 'System', 'Prefs', 'Env-Archive');
const ARCHIVE_COPY = path.join(ARCHIVE, 'GWall.cfg');
/** What the archive write used to become. Must never come back. */
const STRAY = path.join(REPO_ROOT, 'gwall.cfg');
const STRAY_CASED = path.join(REPO_ROOT, 'GWall.cfg');

const SETUP_PROMPT = /The wall has not yet been configured|3 digit code/;
/** The door's own placeholder for "no acronym chosen yet" (gwall.e:230). */
const UNCONFIGURED = '???';

const runnable =
  fs.existsSync(GWALL) && fs.existsSync(GLCVIEWER) && fs.existsSync(HARNESS) && fs.existsSync(TSX);
const describeMaybe = runnable ? describe : describe.skip;

/** One door, one emulator, serial. */
function runDoor(binary: string, command: string, timeoutS: number): string {
  const result = spawnSync(
    TSX,
    [HARNESS, binary, '1', '--doortype', 'XIM', '--command', command, '--timeout', String(timeoutS)],
    {
      cwd: BACKEND,
      input: '',
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0' },
      timeout: (timeoutS + 40) * 1000,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  return result.stdout || '';
}

const read = (p: string): string | null => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const wipe = (...paths: string[]) => {
  for (const p of paths) if (fs.existsSync(p)) fs.rmSync(p, { force: true });
};

describeMaybe('GWall and the BBS acronym', () => {
  // A dev tree carries the sysop's own saved acronym in these two places.
  // Put back exactly what was there.
  let savedEnv: string | null = null;
  let savedArchive: string | null = null;
  let archiveExisted = false;

  beforeAll(() => {
    savedEnv = read(ENV_COPY);
    savedArchive = read(ARCHIVE_COPY);
    archiveExisted = fs.existsSync(ARCHIVE);
  });

  afterAll(() => {
    wipe(ENV_COPY, ARCHIVE_COPY, STRAY, STRAY_CASED);
    if (savedEnv !== null) {
      fs.mkdirSync(ENV_DIR, { recursive: true });
      fs.writeFileSync(ENV_COPY, savedEnv);
    }
    if (savedArchive !== null) {
      fs.mkdirSync(ARCHIVE, { recursive: true });
      fs.writeFileSync(ARCHIVE_COPY, savedArchive);
    } else if (!archiveExisted && fs.existsSync(ARCHIVE)) {
      fs.rmSync(ARCHIVE, { recursive: true, force: true });
    }
  });

  it('asks for the BBS acronym once, not on every start', () => {
    // A board that has never been configured.
    wipe(ENV_COPY, ARCHIVE_COPY, STRAY, STRAY_CASED);

    const first = runDoor(GWALL, 'GWALL', 20);
    expect(first).toMatch(SETUP_PROMPT); // the "once"

    // The sysop answers. Rather than race a timed input script against the
    // JH_PM cycle, put his answer into the file the DOOR itself just wrote,
    // in the door's own format - which is all answering the prompt does.
    const placeholder = read(ARCHIVE_COPY);
    expect(placeholder).toContain(UNCONFIGURED);
    fs.writeFileSync(ARCHIVE_COPY, (placeholder as string).replace(UNCONFIGURED, 'UPT'));

    // The container restarts: RAM: comes back empty. The archive is on the
    // data volume and does not.
    wipe(ENV_COPY);

    const second = runDoor(GWALL, 'GWALL', 20);
    expect(second).not.toMatch(SETUP_PROMPT);
    // And it came back with the acronym the sysop chose, not the placeholder.
    expect(read(ENV_COPY)).toContain('UPT');
    expect(read(ENV_COPY)).not.toContain(UNCONFIGURED);
  }, 150000);

  it("a door's config lands beside the door, not loose in the BBS root", () => {
    wipe(ENV_COPY, ARCHIVE_COPY, STRAY, STRAY_CASED);

    runDoor(GWALL, 'GWALL', 20);

    // The archive write goes to the AmigaOS location under the BBS root...
    expect(read(ARCHIVE_COPY)).toContain(UNCONFIGURED);
    // ...spelled the way the door spelled it, not lowercased by the resolver...
    expect(fs.readdirSync(ARCHIVE)).toContain('GWall.cfg');
    // ...and nothing is dropped at the top of the BBS.
    expect(fs.existsSync(STRAY)).toBe(false);
    expect(fs.existsSync(STRAY_CASED)).toBe(false);
  }, 90000);

  it('GLOBAL LAST CALLERS never asks for a BBS acronym', () => {
    // The sysop reported this against GLC. GLC has no such prompt in it: it
    // reads PROGDIR:GLCViewer.cfg and writes PROGDIR:glc.glcdata, both beside
    // the door, and stores no acronym at all.
    expect(fs.readFileSync(GLCVIEWER).toString('latin1')).not.toContain('3 digit');

    const out = runDoor(GLCVIEWER, 'GLC', 20);
    expect(out).not.toMatch(SETUP_PROMPT);
    expect(out.length).toBeGreaterThan(0);
  }, 90000);
});
