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
 * (`~/Code/Reference/AmiXDoors-master/Global Wall/gwall.e:1697`)
 * and `readSettings()` reads ENV: back - because the Startup-Sequence copies
 * ENVARC: into ENV: at boot. We modelled only ENV:, and ENV: lives under
 * /tmp. The archive write had no assign at all, so it fell through
 * PathManager's unknown-volume fallback and became "<bbsRoot>/gwall.cfg" -
 * lowercased on the way, because that fallback took its remainder off the
 * lowercased copy of the path - which nothing ever reads. Captured before the
 * fix:
 *
 *   [PathManager] Volume fallback: "ENVARC:GWall.cfg"
 *       => "~/Code/AmiExpress/amiexpress-web/gwall.cfg"
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

/**
 * THE BOARD THIS SUITE RUNS AGAINST - not the sysop's.
 *
 * These cases used to drive the door at `REPO_ROOT`, which IS the live board:
 * they created and deleted `System/Prefs/Env-Archive/GWall.cfg` in the
 * checkout. `tests/live-data-guard.ts` refuses that, correctly - `System/` is
 * one of the protected trees.
 *
 * The guard also SEEDS the replacement. When `BBS_ROOT`/`BBS_DATA_DIR` are
 * unset it creates one temp board per worker process and copies the board's
 * configuration into it - `System/` included, so the committed
 * `System/Prefs/Env-Archive/GWall.cfg` is already there - then points both
 * variables at it. `spawnSync` below hands the whole environment to the
 * harness, and `LibraryManager.resolveBbsRoot()` reads exactly those two
 * variables, so the emulator's `ENVARC:` assign
 * (`amigaEnvArchiveDir(bbsRoot)`) lands inside this board and nowhere near
 * the sysop's. Nothing new is built here; the guard's board is used as it is.
 *
 * The layout under it is spelled out rather than imported from
 * `src/amiga-emulation/utils/env-paths.ts` ON PURPOSE: importing it would
 * make the test follow the production path wherever it moved, and then
 * breaking the `ENVARC:` location again would not turn this suite red.
 */
const BOARD = (() => {
  const root = process.env.BBS_ROOT || process.env.BBS_DATA_DIR;
  if (!root) {
    throw new Error(
      'BBS_ROOT/BBS_DATA_DIR are unset. This suite writes an env archive and must never\n' +
        'do it in the checkout. Run it under dev-scripts/jest.config.ts, whose setupFiles\n' +
        'seeds a temp board (web/backend/tests/live-data-guard.ts).',
    );
  }
  const resolved = path.resolve(root);
  if (resolved === REPO_ROOT) {
    throw new Error(`BBS_ROOT points at the live board (${resolved}). Point it at a temp board.`);
  }
  return resolved;
})();

/**
 * The two halves of the AmigaOS environment, for the test board's root.
 *
 * RAM: - and therefore ENV: - is `/tmp/ram` by default: ONE directory for the
 * whole machine, shared with the sysop's dev board and with every other jest
 * worker. That is not a board of its own, and it bites: a suite that boots
 * the emulator copies ITS board's ENVARC: into that shared ENV:, so a
 * concurrent worker had already put `GWall.cfg` there before this door
 * started, GWall's readSettings() found it, and the door never wrote the
 * archive these cases are about (observed under `--maxWorkers=2`).
 * `RAM_DIR` - the variable src/utils/path-util.ts and bbs-paths.util.ts have
 * always read, and which the emulator now reads too - moves it onto this
 * board. Nothing outside the board is touched, so nothing needs restoring.
 */
const RAM_DIR = path.join(BOARD, 'ram');
const ENV_DIR = path.join(RAM_DIR, 'ENV');
const ENV_COPY = path.join(ENV_DIR, 'GWall.cfg');
const ARCHIVE = path.join(BOARD, 'System', 'Prefs', 'Env-Archive');
const ARCHIVE_COPY = path.join(ARCHIVE, 'GWall.cfg');
/**
 * The same file in the CHECKOUT, read only. It is what a freshly deployed
 * container starts with, because it is tracked; the case below copies those
 * bytes onto the test board rather than trusting the seeded copy.
 */
const COMMITTED_ARCHIVE_COPY = path.join(
  REPO_ROOT,
  'System',
  'Prefs',
  'Env-Archive',
  'GWall.cfg',
);
/** The door's own directory, and the server config that belongs in it. */
const DOOR_DIR = path.join(REPO_ROOT, 'Doors', 'GWall');
const DOOR_CONFIG = path.join(DOOR_DIR, 'GWALL.cfg');
/** What the archive write used to become. Must never come back. */
const STRAY = path.join(BOARD, 'gwall.cfg');
const STRAY_CASED = path.join(BOARD, 'GWall.cfg');

const SETUP_PROMPT = /The wall has not yet been configured|3 digit code/;
/** The door's own placeholder for "no acronym chosen yet" (gwall.e:230). */
const UNCONFIGURED = '???';

const runnable =
  fs.existsSync(GWALL) && fs.existsSync(GLCVIEWER) && fs.existsSync(HARNESS) && fs.existsSync(TSX);
const describeMaybe = runnable ? describe : describe.skip;

/**
 * One door, one emulator, serial.
 *
 * stderr matters as much as stdout here: the harness sends every console.*
 * there, so the emulator's own path resolution and bsdsocket logs are the
 * record of which file the door opened and which host, port and timeout it
 * then used. Asserting on those is the difference between reading a config
 * file and proving the door read it.
 */
function runDoorCapturingBoth(
  binary: string,
  command: string,
  timeoutS: number,
): { stdout: string; stderr: string } {
  const result = spawnSync(
    TSX,
    [HARNESS, binary, '1', '--doortype', 'XIM', '--command', command, '--timeout', String(timeoutS)],
    {
      cwd: BACKEND,
      input: '',
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', RAM_DIR },
      timeout: (timeoutS + 40) * 1000,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}

function runDoor(binary: string, command: string, timeoutS: number): string {
  return runDoorCapturingBoth(binary, command, timeoutS).stdout;
}

const read = (p: string): string | null => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const wipe = (...paths: string[]) => {
  for (const p of paths) if (fs.existsSync(p)) fs.rmSync(p, { force: true });
};

describeMaybe('GWall and the BBS acronym', () => {
  /** The bytes the CHECKOUT commits, read once before any case runs. */
  let committedArchive: string | null = null;

  beforeAll(() => {
    committedArchive = read(COMMITTED_ARCHIVE_COPY);
    // Both halves live on this board, and the seeded board arrives with a
    // copy of the committed archive. Start from nothing so each case states
    // its own starting point; nothing outside the board is disturbed, so
    // there is nothing to put back afterwards.
    wipe(ENV_COPY, ARCHIVE_COPY, STRAY, STRAY_CASED);
  });

  afterAll(() => {
    wipe(ENV_COPY, ARCHIVE_COPY, STRAY, STRAY_CASED);
  });

  /**
   * THE SECOND HALF OF THE SAME BUG, repaired as data on 2026-09-06.
   *
   * The emulated filesystem resolves case-insensitively, so the settings blob
   * the broken fallback dropped as "gwall.cfg" was ALSO what
   * `parseConfigFile('PROGDIR:GWALL.cfg')` (gwall.e:212) opened. GWall's real
   * server config was gone, and parseConfigFile ignores every line without an
   * "=", so the door silently fell back to its compiled defaults: measured
   * before the repair, `WaitSelect(nfds=1, timeout=10000ms)` from
   * `DEF timeout=10` (gwall.e:73) instead of the config's TIMEOUT=5.
   *
   * The repair: GWALL.cfg restored byte-for-byte from
   * `~/Code/Reference/AmiXDoors-master/Global Wall/GWALL.cfg`,
   * the acronym the stray held moved to the ENVARC: file the door reads back,
   * and the stray deleted.
   */
  it('keeps the server config beside the door, with no settings file wearing its name', () => {
    // readdirSync, not existsSync: the Mac this repo is edited on has a
    // case-insensitive filesystem, where existsSync('gwall.cfg') answers TRUE
    // for GWALL.cfg. Exact names are the only honest question, and two files
    // differing only in case is how this went wrong the first time.
    const names = fs.readdirSync(DOOR_DIR);
    expect(names).toContain('GWALL.cfg');
    expect(names).not.toContain('gwall.cfg');

    const cfg = fs.readFileSync(DOOR_CONFIG, 'latin1');
    expect(cfg).toContain('SERVERHOST=scenewall.bbs.io');
    expect(cfg).toContain('SERVERPORT=1541');
    expect(cfg).toContain('TIMEOUT=5');
    // Not the door's own saved settings, whose first line is the style number.
    expect(cfg).not.toMatch(/^\d+\n/);
  });

  it('comes back from the committed env archive after a deploy wipes ENV:', () => {
    // The archive is TRACKED, so a container that has just thrown away its
    // writable layer still has it before the door runs for the first time.
    // committedArchive is those bytes, read out of the checkout in beforeAll
    // ahead of any case; they are then laid down on the TEST board, which is
    // the root the emulator resolves ENVARC: against.
    expect(committedArchive).not.toBeNull();
    expect(committedArchive).toContain('UPT');
    fs.mkdirSync(ARCHIVE, { recursive: true });
    fs.writeFileSync(ARCHIVE_COPY, committedArchive as string);

    wipe(ENV_COPY); // the deploy
    const out = runDoor(GWALL, 'GWALL', 25);

    expect(out).not.toMatch(SETUP_PROMPT);
    expect(read(ENV_COPY)).toContain('UPT');
    expect(read(ENV_COPY)).not.toContain(UNCONFIGURED);
  }, 120000);

  it('dials the host, port and timeout from the restored config, not its compiled defaults', () => {
    // Reaching the wall needs a board that is already configured, but the
    // acronym is not this case's subject - the case above owns it. Supply one
    // in the door's own three-line format (gwall.e:1704) so this case fails
    // for exactly one reason: the server config the door read.
    fs.mkdirSync(ARCHIVE, { recursive: true });
    fs.writeFileSync(ARCHIVE_COPY, '4\nUPT\n42626717772363\n');
    wipe(ENV_COPY);

    const { stderr } = runDoorCapturingBoth(GWALL, 'GWALL', 25);

    // The emulator's own resolution log names the file the door opened.
    expect(stderr).toContain(`"PROGDIR:GWALL.cfg" => "${DOOR_CONFIG}"`);

    // The one value the restored file changes, and therefore the one that
    // proves it was parsed rather than merely opened. gwall.e:73 compiles in
    // 10 seconds; the config says 5. This assertion holds with or without a
    // network - offline the door never reaches WaitSelect at all.
    expect(stderr).not.toContain('WaitSelect(nfds=1, timeout=10000ms)');

    // With DNS, the whole dial is on the record. Guarded, because a run with
    // no route to the internet stops at gethostbyname and the assertions
    // below would then be testing the network, not the config.
    const dialled = stderr.match(/gethostbyname\("([^"]+)"\)/);
    if (dialled) {
      expect(dialled[1]).toBe('scenewall.bbs.io');
      expect(stderr).toMatch(/connect\(fd=\d+, [\d.]+:1541\)/);
      expect(stderr).toContain('WaitSelect(nfds=1, timeout=5000ms)');
    }
  }, 120000);

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
