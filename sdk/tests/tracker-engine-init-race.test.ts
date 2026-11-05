/**
 * TrackerEngine play/init race (engines/audio/tracker-engine.ts).
 *
 * Symptom (arkanoid, 2026-08-24): menu music never started. chiptune3
 * loads its AudioWorklet asynchronously and postCmd() silently drops any
 * command sent before the processNode exists - so a play() issued while
 * the worklet was still loading vanished, and a caller that dedupes by
 * track name never retried. The engine must queue a play() that arrives
 * before initialization and start it the moment the player reports ready.
 */

// Minimal fake of the chiptune3 player: records calls, lets the test fire
// the initialized event when it chooses - exactly the async gap the real
// AudioWorklet loading creates.
const fakePlayers: FakeChiptunePlayer[] = [];

class FakeChiptunePlayer {
  public calls: Array<{ method: string; arg?: unknown }> = [];
  public initialized = false;
  /** Mirrors chiptune3: a caller-supplied context means destination=false
   *  and the CALLER must connect the gain, or audio goes nowhere. */
  public destination: unknown;
  public gain = { connect: (target: unknown) => { this.calls.push({ method: 'gain.connect', arg: target }); } };
  private initHandlers: Array<() => void> = [];

  constructor(config: any) {
    this.destination = config && config.context ? false : { speakers: true };
    fakePlayers.push(this);
  }

  setVol(v: number) { this.calls.push({ method: 'setVol', arg: v }); }
  onInitialized(h: () => void) { this.initHandlers.push(h); }
  onMetadata(_h: unknown) {}
  onProgress(_h: unknown) {}
  onEnded(_h: unknown) {}
  onError(_h: unknown) {}
  play(buffer: ArrayBuffer) {
    this.calls.push({ method: 'play', arg: buffer });
    if (!this.initialized) {
      // The real chiptune3 would silently drop this - a play recorded
      // before initialization is exactly the regression.
      this.calls.push({ method: 'play-before-init' });
    }
  }
  stop() { this.calls.push({ method: 'stop' }); }

  fireInitialized() {
    this.initialized = true;
    this.initHandlers.forEach((h) => h());
  }
}

jest.mock('chiptune3', () => ({ ChiptuneJsPlayer: FakeChiptunePlayer }), { virtual: true });

// TrackerEngine only builds a player in a "browser": globalThis.window
// with an AudioContext constructor must exist before the import runs.
(globalThis as any).window = { AudioContext: class {} };

import { TrackerEngine } from '../engines/audio/tracker-engine';

/** The dynamic import('chiptune3') inside initPlayer resolves on a
 *  microtask; flush it so the fake player exists. */
const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

afterAll(() => {
  delete (globalThis as any).window;
});

beforeEach(() => {
  fakePlayers.length = 0;
});

describe('TrackerEngine initialization race', () => {
  it('queues a play() issued before the worklet initializes and starts it on ready', async () => {
    const engine = new TrackerEngine();
    await flushMicrotasks();
    const player = fakePlayers[0];
    expect(player).toBeDefined();

    const buffer = new ArrayBuffer(8);
    engine.play(buffer); // worklet not initialized yet

    expect(player.calls.some((c) => c.method === 'play-before-init')).toBe(false);

    player.fireInitialized();

    const plays = player.calls.filter((c) => c.method === 'play');
    expect(plays).toHaveLength(1);
    expect(plays[0].arg).toBe(buffer);
    expect(player.calls.some((c) => c.method === 'play-before-init')).toBe(false);
  });

  it('the latest pre-init play wins - no stale track after init', async () => {
    const engine = new TrackerEngine();
    await flushMicrotasks();
    const player = fakePlayers[0];

    const first = new ArrayBuffer(4);
    const second = new ArrayBuffer(4);
    engine.play(first);
    engine.play(second);
    player.fireInitialized();

    const plays = player.calls.filter((c) => c.method === 'play');
    expect(plays).toHaveLength(1);
    expect(plays[0].arg).toBe(second);
  });

  it('stop() before init cancels the queued play', async () => {
    const engine = new TrackerEngine();
    await flushMicrotasks();
    const player = fakePlayers[0];

    engine.play(new ArrayBuffer(4));
    engine.stop();
    player.fireInitialized();

    expect(player.calls.filter((c) => c.method === 'play')).toHaveLength(0);
  });

  it('routes the gain to the destination of a caller-supplied AudioContext', async () => {
    // chiptune3 sets destination=false for a supplied context and never
    // connects its gain - the engine must do it, or every note plays into
    // the void (the silent-arkanoid bug).
    const destination = { speakers: true };
    const ctx = { destination, state: 'running' } as unknown as AudioContext;
    new TrackerEngine({ audioContext: ctx });
    await flushMicrotasks();
    const player = fakePlayers[0];

    const connects = player.calls.filter((c) => c.method === 'gain.connect');
    expect(connects).toHaveLength(1);
    expect(connects[0].arg).toBe(destination);
  });

  it('does not double-connect when chiptune3 owns the context', async () => {
    new TrackerEngine(); // no context supplied - chiptune3 self-wires
    await flushMicrotasks();
    const player = fakePlayers[0];

    expect(player.calls.filter((c) => c.method === 'gain.connect')).toHaveLength(0);
  });

  it('plays immediately once initialized - no queue detour', async () => {
    const engine = new TrackerEngine();
    await flushMicrotasks();
    const player = fakePlayers[0];
    player.fireInitialized();

    const buffer = new ArrayBuffer(8);
    engine.play(buffer);

    const plays = player.calls.filter((c) => c.method === 'play');
    expect(plays).toHaveLength(1);
    expect(plays[0].arg).toBe(buffer);
  });
});
