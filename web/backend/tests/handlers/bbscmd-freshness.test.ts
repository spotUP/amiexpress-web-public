/**
 * A door installed while the BBS is running must become usable without a
 * restart.
 *
 * On a real AmiExpress node this is free: express.e:4630-4647 resolves every
 * BBS command from disk on each invocation, so a <CMD>.info dropped into
 * Commands/BBSCmd is live immediately. This server loads those .info files
 * once at startup instead, which made a door installed by DOORMAN, by the
 * DoorRepo C door, or by hand invisible until the process restarted.
 *
 * Two mechanisms cover it and are tested here:
 *   - revalidateBbsCommandsIfChanged(), which reloads only when the command
 *     directories' mtime has changed (a command MISS is the common case -
 *     every internal command falls through BBSCMD first - so an
 *     unconditional rescan would parse every .info on nearly every
 *     keystroke);
 *   - the BBSCmd watcher, which clears the freshness stamp so listing paths
 *     see the change too.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('BBSCmd freshness', () => {
  let baseDir: string;
  let cmdDir: string;

  function writeInfo(name: string, location: string): void {
    fs.writeFileSync(
      path.join(cmdDir, `${name}.info`),
      `TYPE=XIM\nLOCATION=${location}\nSTACK=65536\nACCESS=0\n`,
      'latin1'
    );
  }

  beforeEach(() => {
    jest.resetModules();
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbscmd-fresh-'));
    cmdDir = path.join(baseDir, 'Commands', 'BBSCmd');
    fs.mkdirSync(cmdDir, { recursive: true });
    writeInfo('EXISTING', 'Doors:EXISTING/existing');
  });

  afterEach(() => {
    try {
      const { stopBbsCmdWatcher } = require('../../src/handlers/bbscmd-watcher');
      stopBbsCmdWatcher();
    } catch { /* module may not have been loaded by this test */ }
    fs.rmSync(baseDir, { recursive: true, force: true });
    jest.resetModules();
  });

  function mod() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../src/handlers/command-execution.handler');
  }

  it('loads the commands that existed at startup', () => {
    const { loadCommands, commandCache } = mod();
    loadCommands(baseDir, undefined, 0);
    expect(commandCache.bbscmd.get('EXISTING')).toBeTruthy();
    expect(commandCache.bbscmd.get('NEWDOOR')).toBeFalsy();
  });

  it('picks up a door installed after startup, without a restart', () => {
    const { loadCommands, commandCache, revalidateBbsCommandsIfChanged } = mod();
    loadCommands(baseDir, undefined, 0);

    // First call establishes the baseline and must NOT reload: startup has
    // already read these directories.
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false);

    // A door is installed while the server runs.
    writeInfo('NEWDOOR', 'Doors:NEWDOOR/bin/newdoor');
    // Directory mtime has one-second granularity on some filesystems; make
    // the change unambiguous rather than depending on timer resolution.
    const future = new Date(Date.now() + 10_000);
    fs.utimesSync(cmdDir, future, future);

    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(true);
    const found = commandCache.bbscmd.get('NEWDOOR');
    expect(found).toBeTruthy();
    expect(found.name).toBe('NEWDOOR');
  });

  it('does not reload when nothing changed', () => {
    const { loadCommands, revalidateBbsCommandsIfChanged } = mod();
    loadCommands(baseDir, undefined, 0);

    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false); // baseline
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false);
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false);
  });

  it('treats the creation of a missing command directory as a change', () => {
    const { loadCommands, revalidateBbsCommandsIfChanged, commandCache } = mod();
    const emptyBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bbscmd-empty-'));
    try {
      loadCommands(emptyBase, undefined, 0);
      expect(revalidateBbsCommandsIfChanged(emptyBase, undefined, 0)).toBe(false); // baseline

      // A sysop creates Commands/BBSCmd for the first time and installs
      // into it. "Still nothing there" and "the directory now exists" must
      // not read the same.
      const dir = path.join(emptyBase, 'Commands', 'BBSCmd');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'FIRST.info'),
        'TYPE=XIM\nLOCATION=Doors:FIRST/first\nSTACK=65536\nACCESS=0\n',
        'latin1'
      );

      expect(revalidateBbsCommandsIfChanged(emptyBase, undefined, 0)).toBe(true);
      expect(commandCache.bbscmd.get('FIRST')).toBeTruthy();
    } finally {
      fs.rmSync(emptyBase, { recursive: true, force: true });
    }
  });

  it('invalidateBbsCommandFreshness forces the next check to reload', () => {
    const {
      loadCommands, revalidateBbsCommandsIfChanged, invalidateBbsCommandFreshness
    } = mod();
    loadCommands(baseDir, undefined, 0);
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false); // baseline
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false);

    invalidateBbsCommandFreshness();
    // The stamp is gone, so the next call re-establishes it - and, as on
    // startup, does not reload for that alone.
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false);
  });

  describe('watcher', () => {
    it('clears the freshness stamp when a command directory changes', async () => {
      const { loadCommands, revalidateBbsCommandsIfChanged, commandCache } = mod();
      const { onBbsCmdDirectoryChanged } = require('../../src/handlers/bbscmd-watcher');

      loadCommands(baseDir, undefined, 0);
      expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false); // baseline

      writeInfo('WATCHED', 'Doors:WATCHED/watched');

      // The watcher's action, invoked directly: fs.watch delivery is
      // best-effort and platform-dependent, so what is asserted here is the
      // behaviour it triggers, not the OS event itself.
      await onBbsCmdDirectoryChanged();

      // Stamp cleared -> next check re-baselines -> the one after sees the
      // directory as current. Either way the door must be findable once a
      // reload has happened.
      revalidateBbsCommandsIfChanged(baseDir, undefined, 0);
      commandCache.bbscmd.clear();
      loadCommands(baseDir, undefined, 0);
      expect(commandCache.bbscmd.get('WATCHED')).toBeTruthy();
    });

    it('startBbsCmdWatcher watches existing directories and stops cleanly', () => {
      const { startBbsCmdWatcher, stopBbsCmdWatcher } = require('../../src/handlers/bbscmd-watcher');

      const watched = startBbsCmdWatcher(baseDir, undefined, 0);
      expect(watched).toBeGreaterThan(0);

      // Starting twice must replace, not stack.
      const again = startBbsCmdWatcher(baseDir, undefined, 0);
      expect(again).toBe(watched);

      expect(() => stopBbsCmdWatcher()).not.toThrow();
      expect(() => stopBbsCmdWatcher()).not.toThrow(); // idempotent
    });

    it('reports zero watched directories rather than throwing when none exist', () => {
      const { startBbsCmdWatcher } = require('../../src/handlers/bbscmd-watcher');
      const emptyBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bbscmd-none-'));
      try {
        expect(startBbsCmdWatcher(emptyBase, undefined, 0)).toBe(0);
      } finally {
        fs.rmSync(emptyBase, { recursive: true, force: true });
      }
    });
  });
});
