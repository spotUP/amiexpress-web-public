/**
 * The launch path reports its own phases.
 *
 * A real BBS door launch spends ~13 seconds between "ROM mapped" and
 * "libraries initialized" with the event loop BLOCKED throughout - measured
 * 2026-09-13, when the sysop reported a door as "stuck" and every other caller
 * was waiting behind it. The plan for that
 * (thoughts/shared/plans/2026-09-08-68k-door-launch-speed.md) carried no
 * diagnosis, because the window had no marks inside it: probed one at a time,
 * every obvious suspect came back in single-digit milliseconds (ROM candidate
 * lookup 3ms, the Libs scans 0-4ms, ExecBase construction is memory writes,
 * loadLibrary("AEDoor.library") 7ms, the romtool split 143ms).
 *
 * So the fix for "where does it go" is to make the path say so. These marks
 * are what the next launch will answer with, and this test is what stops them
 * being dropped as noise later.
 *
 * Note the harness attaches no DoorLogger, which is why they are invisible
 * there and only appear on a real BBS launch - the exact path that is slow.
 */
import { LibraryManager } from '../../src/amiga-emulation/LibraryManager';

/** A logger that only remembers, so the marks can be read back. */
function recordingLogger() {
  const lines: string[] = [];
  return {
    lines,
    log: (tag: string, message: string) => { lines.push(`${tag} ${message}`); },
    info: (message: string) => { lines.push(`INFO ${message}`); },
    warn: () => {},
    error: () => {},
  };
}

/** Enough of the emulator surface for the launch path to run through. */
function stubEmulator() {
  return {
    loadROM: () => {},
    loadExtensionROM: () => {},
    writeMemory32: () => {},
    writeMemory16: () => {},
    writeMemory8: () => {},
    readMemory32: () => 0,
    readMemory16: () => 0,
    readMemory8: () => 0,
    writeMemory: () => {},
    getMemory: () => new Uint8Array(0),
    setTrapHandler: () => {},
    registerTrap: () => {},
  } as never;
}

describe('a door launch', () => {
  it('reports each phase of library initialization, with the loop lag it caused', async () => {
    const logger = recordingLogger();
    const manager = new LibraryManager(
      stubEmulator(),
      { id: 'test', on: () => {}, emit: () => {} } as never,
      { doorType: 'XIM', bbsSession: { nodeId: 1, username: 'sysop' } } as never,
      logger as never,
      null
    );

    // The launch path touches a great deal of machinery and a stub emulator
    // will not carry it all the way; what matters is that it SAYS where it got
    // to, which is precisely what was missing.
    await manager.initialize().catch(() => undefined);

    const timings = logger.lines.filter((l) => l.includes('[timing] exec:'));
    expect(timings.length).toBeGreaterThan(0);

    // The first thing it does, and the shape every mark carries: a phase name,
    // a cumulative offset, and the worst event-loop lag seen so far - the
    // figure that says "this blocked the whole board" rather than "this was
    // slow for this caller".
    expect(timings[0]).toMatch(/\[timing\] exec: bbs root resolved \+\d+ms \(loop lag max \d+ms\)/);
  });
});
