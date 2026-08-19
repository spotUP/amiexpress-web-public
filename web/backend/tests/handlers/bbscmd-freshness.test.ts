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

  it('picks up an EDITED .info, not just a new one (ACCESS tightened to sysop)', () => {
    // The case the first version of this fix missed. An existing command is
    // a cache HIT, so a lookup never reached the miss-path revalidation and
    // an edited .info kept serving startup's values. That matters most for
    // exactly this edit: a door locked down to sysops would have gone on
    // admitting everyone until the next restart.
    const { loadCommands, commandCache, revalidateBbsCommandsIfChanged } = mod();
    loadCommands(baseDir, undefined, 0);
    expect(commandCache.bbscmd.get('EXISTING').access ?? 0).toBe(0);
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false); // baseline

    fs.writeFileSync(
      path.join(cmdDir, 'EXISTING.info'),
      'TYPE=XIM\nLOCATION=Doors:EXISTING/existing\nSTACK=65536\nACCESS=255\n',
      'latin1'
    );
    const future = new Date(Date.now() + 10_000);
    fs.utimesSync(cmdDir, future, future);

    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(true);
    expect(commandCache.bbscmd.get('EXISTING').access).toBe(255);
  });

  it('picks up an in-place edit WITHOUT the directory mtime moving', () => {
    // The weakness the other edit test hid by calling utimesSync on the
    // directory. Editing a file in place does not touch its directory, so a
    // stamp built from directory mtimes alone never notices - and a door
    // tightened to ACCESS=255 goes on admitting everyone until a restart.
    const { loadCommands, commandCache, revalidateBbsCommandsIfChanged } = mod();
    loadCommands(baseDir, undefined, 0);
    expect(commandCache.bbscmd.get('EXISTING').access ?? 0).toBe(0);

    // Pin the directory FIRST, then take the baseline, so the only thing
    // that can move the stamp afterwards is the file itself. Taking the
    // baseline first would make the pin the change under test - which is
    // how the first version of this test passed against the very stamp it
    // was supposed to condemn.
    const pinned = new Date(Math.floor((Date.now() - 60_000) / 1000) * 1000);
    fs.utimesSync(cmdDir, pinned, pinned);
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false); // baseline
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false); // stable

    const target = path.join(cmdDir, 'EXISTING.info');
    fs.writeFileSync(
      target,
      'TYPE=XIM\nLOCATION=Doors:EXISTING/existing\nSTACK=65536\nACCESS=255\n',
      'latin1'
    );
    // Make the file unambiguously newer without touching the directory.
    const future = new Date(Date.now() + 10_000);
    fs.utimesSync(target, future, future);
    fs.utimesSync(cmdDir, pinned, pinned);   // directory deliberately unchanged

    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(true);
    expect(commandCache.bbscmd.get('EXISTING').access).toBe(255);
  });

  it('picks up content written AFTER the file was created', () => {
    // The reported install bug: fopen() publishes an empty .info and bumps
    // the directory, fclose() writes the content and bumps nothing. A lookup
    // in that window used to cache the empty parse and mark itself fresh.
    const { loadCommands, commandCache, revalidateBbsCommandsIfChanged } = mod();
    loadCommands(baseDir, undefined, 0);
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false); // baseline

    // Step 1: the empty file appears. This DOES change the directory.
    const target = path.join(cmdDir, 'HALFWAY.info');
    fs.writeFileSync(target, '', 'latin1');
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(true);
    expect(commandCache.bbscmd.get('HALFWAY')).toBeFalsy();  // nothing to parse yet

    // Step 2: the content arrives. Pin the directory and re-establish the
    // baseline first, so what follows is measured purely on the file.
    const pinned = new Date(Math.floor((Date.now() - 60_000) / 1000) * 1000);
    fs.utimesSync(cmdDir, pinned, pinned);
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(true);  // the pin
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false); // settled

    fs.writeFileSync(
      target,
      'TYPE=XIM\nLOCATION=Doors:HALFWAY/bin/halfway\nSTACK=65536\nACCESS=0\n',
      'latin1'
    );
    const future = new Date(Date.now() + 10_000);
    fs.utimesSync(target, future, future);
    fs.utimesSync(cmdDir, pinned, pinned);   // directory deliberately unchanged

    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(true);
    expect(commandCache.bbscmd.get('HALFWAY')).toBeTruthy();
  });

  it('ignores a half-written .info.new so it cannot churn the stamp', () => {
    // DoorRepo writes <CMD>.info.new and renames it into place. The
    // temporary must not count as a change on its own, or every install
    // would trigger a reload of a file that is not there yet.
    const { loadCommands, revalidateBbsCommandsIfChanged } = mod();
    loadCommands(baseDir, undefined, 0);
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false); // baseline

    const pinned = new Date(Math.floor((Date.now() - 60_000) / 1000) * 1000);
    fs.utimesSync(cmdDir, pinned, pinned);
    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(true);  // the pin itself

    fs.writeFileSync(path.join(cmdDir, 'PENDING.info.new'), 'TYPE=XIM\n', 'latin1');
    fs.utimesSync(cmdDir, pinned, pinned);

    expect(revalidateBbsCommandsIfChanged(baseDir, undefined, 0)).toBe(false);
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
