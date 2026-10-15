/**
 * Round 5: "switch to a system filter (e.g. C to reach System: DD), then
 * browse the list with the ARROW KEYS — the view falls back to ALL."
 *
 * Root cause found by direct reproduction (not guessed) — NOT in RepoView
 * or DoormanLayout at all. `sdk/engines/ui/blessed/core/program.ts`
 * `Program._handleData`'s ESC-sequence buffering: a CSI/SS3 escape sequence
 * (arrow keys, Home/End/PageUp/PageDown, F-keys) that arrives SPLIT across
 * two 'data' events — e.g. a websocket/network chunk boundary lands between
 * `ESC[` and the final letter (`A` for Up, `B` for Down, ...), routine under
 * rapid arrow-key repeat — used to be misparsed: the "wait, this might be
 * the start of a sequence" branch was gated on `this._inputBuffer.length
 * === 1`, true only for a BARE lone ESC byte. With `_inputBuffer = 'ESC['`
 * (length 2), that guard was false, so the code immediately emitted the ESC
 * byte as a STANDALONE Escape keypress and reprocessed the leftover `[` as
 * an unrelated literal-character keypress on the next loop iteration.
 *
 * DOORMAN's `ViewManager` binds a global `screen.key(['escape'], ...)` that
 * calls the active view's `onEsc()` — `RepoView.onEsc()` is `this.vm.pop()`.
 * A spurious Escape from a split arrow-key sequence therefore silently pops
 * RepoView back to InstalledView. Nothing about `RepoView.systemFilter`
 * itself was ever mutated (confirmed directly — see
 * `zzz-investigate-round5.test.ts`-style probing during investigation,
 * removed after the mechanism was found): the object holding the cycled
 * filter simply got evicted from the view stack. Tabbing back into Repo
 * afterward (very natural — the sysop, confused, reaches for Tab) creates a
 * BRAND NEW RepoView instance, whose `systemFilter` field starts at its
 * default `ALL_TYPES` — "the view falls back to the ALL filter."
 *
 * Fixed at the root, in the parser (`program.ts`): the "wait for more"
 * branch now also covers an incomplete CSI prefix (`ESC[` optionally
 * followed by parameter digits/semicolons, no final letter yet) and a bare
 * SS3 lead-in (`ESC O`) — not just a bare lone ESC — so a sequence split
 * across a chunk boundary is buffered and correctly reassembled instead of
 * being torn into a spurious Escape + garbage character. This is shared SDK
 * infrastructure (`sdk/engines/ui/blessed`), used by every blessed-based
 * door, not a DOORMAN-local patch — the defect lives in the parser, not in
 * DOORMAN's use of it, so DOORMAN-local mitigation would have been a
 * band-aid at the wrong layer.
 *
 * This suite proves the full causal chain end-to-end with the REAL
 * `Program`, `Screen`, `ViewManager`, and `BaseView` classes: a split
 * arrow-key sequence must NOT fire a spurious Escape, must NOT pop the
 * active view, and the system filter (and its header) must survive
 * navigation — it should only ever change via the C-cycle hotkey.
 *
 * Round 6 (re-review of the round-5 fix): the round-5 timer body called
 * `this._emitKey(ESC, key)` — which ends with `this.emit('data', ESC)` —
 * BEFORE clearing `_inputBuffer` and without holding `_handlingData`. On
 * the SYNCHRONOUS path, the constructor's guarded 'data' listener blocks
 * that emit's own feedback loop (`_handlingData` is true for the whole
 * `_handleData` call). But the round-5 timer fires from an ASYNC
 * `setTimeout` callback, entirely outside any `_handleData` call, so
 * `_handlingData` is false there — `_emitKey`'s `emit('data', ESC)`
 * genuinely re-entered `_handleData`, and did so while `_inputBuffer`
 * STILL held its stale pre-timeout contents (the clear a few lines later
 * hadn't run yet). Traced for a never-completing `ESC[`: the reentrant
 * call appended the re-emitted ESC onto the stale `ESC[`, producing
 * `ESC[ESC` — which matches no recognized sequence and falls through to
 * the UNGUARDED single-byte fallback, emitting ESC a SECOND time, then
 * finally delivering the leftover `[` as a stray keypress. Two Escapes for
 * one physical ambiguous byte sequence, and — since `ViewManager.pop()`
 * has no depth guard — two views popped in a row from what the sysop
 * experienced as pressing nothing but arrow keys.
 *
 * Fixed by matching the synchronous path's own protection: capture/clear
 * `_inputBuffer` BEFORE calling `_emitKey`, AND hold `_handlingData` true
 * for the duration of that call, so its internal `emit('data', ...)` is
 * blocked outright by the same guard the synchronous path already relies
 * on — not merely operating on an empty buffer as a fallback safety net,
 * but never re-entering `_handleData` at all. The `Describe` block below
 * titled "round 6" asserts exact keypress counts and exact stack-depth
 * deltas (not just "did it pop at all"), per the re-review's explicit
 * point that top-of-stack identity checks alone can't distinguish
 * "popped once" from "popped twice, silently emptying the stack".
 */
import { Screen, List } from '../../../../sdk/engines/ui/blessed';
import { ViewManager, BaseView, KeyBinder } from '../../../../Doors/door-manager/ViewManager';
import { ALL_TYPES, distinctTypes, cycleSystemFilter, filterByDoorType, formatSystemTag } from '../../../../Doors/door-manager/systemFilter';

interface Entry { door_type: string; name: string }

/** Minimal stand-in for InstalledView — just needs to exist on the stack
 * below RepoView and be re-enterable, matching real InstalledView. */
class InstalledViewStub extends BaseView {
  enterCount = 0;
  enter(): void { this.enterCount++; }
  exit(): void { this.keys.release(); }
}

/** Faithful RepoView replica: same systemFilter/entries/visibleEntries
 * fields, same cycleFilter()/refresh()/refreshHeader() logic (copied from
 * app.ts), same onEsc() = vm.pop(). Constructing a NEW instance mirrors
 * InstalledView's real Tab handler (`vm.push(new RepoView(...))`), so this
 * class intentionally is NOT reused across pushes in the test below — a
 * fresh instance is exactly what happens after a real pop-then-Tab.
 */
class RepoViewReplica extends BaseView {
  systemFilter = ALL_TYPES;
  entries: Entry[];
  visibleEntries: Entry[] = [];
  header = '';
  doorList: any;

  constructor(entries: Entry[], doorList: any) {
    super();
    this.entries = entries;
    this.doorList = doorList;
  }

  private typeOf = (e: Entry) => e.door_type || 'XIM';

  private refresh(selectIdx = 0): void {
    this.visibleEntries = filterByDoorType(this.entries, this.systemFilter, this.typeOf);
    this.doorList.setItems(this.visibleEntries.map((e: Entry) => e.name));
    this.doorList.select(selectIdx);
    this.header = formatSystemTag(this.systemFilter, this.visibleEntries.length);
  }

  private cycleFilter(): void {
    const availableTypes = distinctTypes(this.entries, this.typeOf);
    this.systemFilter = cycleSystemFilter(this.systemFilter, availableTypes);
    this.refresh(0);
  }

  enter(): void {
    this.refresh(this.doorList.selected ?? 0);
    this.doorList.focus();
    this.keys.key(['c', 'C'], () => this.cycleFilter());
  }
  exit(): void { this.keys.release(); }
  onEsc(): void { this.vm.pop(); } // matches real RepoView exactly
}

function buildHarness() {
  const screen = new Screen({ title: 'arrow-nav-escape-test', output: () => {} });
  const doorList = new List({
    parent: screen, top: 0, left: 0, width: 30, height: 10,
    keys: true, vi: false, mouse: false, tags: true,
  });
  const _nav = (doorList as any)._onKeypress?.bind(doorList);
  (doorList as any).removeAllListeners('keypress');
  if (_nav) {
    (doorList as any).on('keypress', (ch: string, key: any) => {
      if (ch?.length === 1 && /[a-zA-Z0-9/ ]/.test(ch)) return;
      if (key?.name === 'escape' || ch === '\x1b') return;
      return _nav(ch, key);
    });
  }

  const sampleEntries: Entry[] = [
    { door_type: 'XIM', name: 'a' }, { door_type: 'XIM', name: 'b' },
    { door_type: 'DD', name: 'c' }, { door_type: 'DD', name: 'd' }, { door_type: 'DD', name: 'e' },
    { door_type: 'FIM', name: 'f' },
  ];

  const vm = new ViewManager(screen);
  const installed = new InstalledViewStub();
  vm.push(installed);

  // Phase-3 broadcast (screen.emit('keypress', ...)) fires unconditionally
  // for every key regardless of what handled it (see round-3 report), so
  // counting here directly measures "how many times an Escape/bracket
  // keypress was actually processed" — independent of what ViewManager
  // does with it, which is asserted separately via stack depth below.
  let escapeKeypressCount = 0;
  let bracketKeypressCount = 0;
  (screen as any).on('keypress', (ch: string, key: any) => {
    if (key?.name === 'escape') escapeKeypressCount++;
    if (ch === '[') bracketKeypressCount++;
  });

  return {
    screen, doorList, vm, installed, sampleEntries,
    pushRepo: () => { const rv = new RepoViewReplica(sampleEntries, doorList); vm.push(rv); return rv; },
    topIsRepo: (rv: RepoViewReplica) => (vm as any).stack[(vm as any).stack.length - 1] === rv,
    stackDepth: () => (vm as any).stack.length as number,
    escapeCount: () => escapeKeypressCount,
    bracketCount: () => bracketKeypressCount,
    send: (raw: string) => { (screen as any).program.emit('data', raw); },
    destroy: () => { if (!screen.destroyed) screen.destroy(); },
  };
}

describe('DOORMAN arrow-key navigation: split escape sequences must not evict the active view', () => {
  it('a split down-arrow (ESC[ then B in separate payloads) does not fire Escape and does not pop RepoView', () => {
    const h = buildHarness();
    const rv = h.pushRepo();
    h.send('c'); h.send('c'); // ALL -> XIM -> DD

    const depthBefore = h.stackDepth();
    h.send('\x1b['); // lead-in only
    h.send('B');      // final letter (down) in a later payload

    expect(h.topIsRepo(rv)).toBe(true); // NOT popped back to InstalledView
    expect(h.stackDepth()).toBe(depthBefore); // no net change, not just "still on top"
    expect(h.escapeCount()).toBe(0); // no spurious Escape at all
    expect(rv.systemFilter).toBe('DD'); // filter untouched by navigation
    h.destroy();
  });

  it('cycle to DD, then browse with split arrow keys — filter and header persist across many presses', () => {
    const h = buildHarness();
    const rv = h.pushRepo();

    h.send('c'); h.send('c'); // ALL -> XIM -> DD (matches "press C to reach System: DD")
    expect(rv.systemFilter).toBe('DD');
    expect(rv.header).toBe('System: DD (3)');

    // Browse with split-across-payload arrow keys — the exact network
    // condition that reproduces the bug. Mix down/up/right/left, each sent
    // as (lead-in, final-letter) in two separate program.emit('data', ...)
    // calls, i.e. two separate simulated network packets.
    const depthBefore = h.stackDepth();
    const splitSeqs: Array<[string, string]> = [
      ['\x1b[', 'B'], ['\x1b[', 'B'], ['\x1b[', 'A'], ['\x1b[', 'C'], ['\x1b[', 'D'],
      ['\x1bO', 'A'], // SS3-style up, also split
    ];
    for (const [leadIn, final] of splitSeqs) {
      (h.doorList as any)._lastKeyTime = 0; // bypass List's own 50ms nav debounce
      h.send(leadIn);
      h.send(final);
      // Filter, view identity, and stack DEPTH must survive EVERY single
      // navigation step — depth, not just top-of-stack identity (the
      // round-5 test's blind spot: two pops followed by nothing pushed
      // would leave a wrong top-of-stack too, but "topIsRepo" alone can't
      // tell "never popped" apart from "popped then something else is on
      // top" versus what actually matters here).
      expect(h.topIsRepo(rv)).toBe(true);
      expect(h.stackDepth()).toBe(depthBefore);
      expect(rv.systemFilter).toBe('DD');
      expect(rv.header).toBe('System: DD (3)');
    }
    expect(h.escapeCount()).toBe(0); // not one spurious Escape across the whole session

    h.destroy();
  });

  it('control: a genuinely standalone Escape (nothing follows) still pops the view exactly once, as designed', () => {
    // Guards against over-fixing: real Escape-key presses (no trailing
    // sequence bytes) must still work exactly as before — DOORMAN relies on
    // ESC to back out of RepoView. Uses the 100ms timeout path (bare ESC,
    // length 1).
    const h = buildHarness();
    const rv = h.pushRepo();
    const depthBefore = h.stackDepth();
    jest.useFakeTimers();
    h.send('\x1b'); // bare ESC, nothing follows
    jest.advanceTimersByTime(150);
    expect(h.topIsRepo(rv)).toBe(false); // popped, as intended
    expect(h.stackDepth()).toBe(depthBefore - 1); // exactly one pop, not two
    expect(h.escapeCount()).toBe(1); // exactly one Escape keypress delivered
    jest.useRealTimers();
    h.destroy();
  });
});

describe('DOORMAN arrow-key navigation: round 6 — timer-flush reentrancy no longer double-fires', () => {
  // Round-5 fix's timer body called _emitKey (which ends with
  // emit('data', ESC)) BEFORE clearing _inputBuffer and without holding
  // _handlingData. Fired from an async setTimeout callback (outside any
  // _handleData call), that emit re-entered _handleData for real, while
  // _inputBuffer still held its pre-timeout contents — corrupting the
  // buffer and producing a SECOND _emitKey(ESC, ...) call. Two Escapes for
  // one physical byte sequence; ViewManager.pop() has no depth guard, so
  // two views could pop from what looked like one keystroke.

  it('a never-completing ESC[ (nothing ever follows) fires exactly ONE Escape, pops exactly ONE view, then delivers "[" exactly once', () => {
    const h = buildHarness();
    const rv = h.pushRepo();
    h.pushRepo(); // two Repo-replica views deep, so a double-pop is observable as a SECOND pop landing on `rv` too, not just an emptied stack
    const depthBefore = h.stackDepth();

    jest.useFakeTimers();
    h.send('\x1b['); // CSI lead-in — ambiguous, must wait
    jest.advanceTimersByTime(150); // let the 100ms timeout fire
    jest.useRealTimers();

    expect(h.escapeCount()).toBe(1); // not 2 — this is the round-6 regression
    expect(h.stackDepth()).toBe(depthBefore - 1); // exactly one pop
    expect(h.topIsRepo(rv)).toBe(true); // popped back to the FIRST replica, not past it
    expect(h.bracketCount()).toBe(1); // leftover "[" delivered exactly once, afterward
    h.destroy();
  });

  it('a bare standalone ESC via the timeout fires exactly ONE Escape and pops exactly ONE view (pre-existing latent bug, same mechanism)', () => {
    const h = buildHarness();
    h.pushRepo();
    const rv2 = h.pushRepo();
    const depthBefore = h.stackDepth();

    jest.useFakeTimers();
    h.send('\x1b'); // bare ESC, nothing follows at all
    jest.advanceTimersByTime(150);
    jest.useRealTimers();

    expect(h.escapeCount()).toBe(1);
    expect(h.stackDepth()).toBe(depthBefore - 1);
    expect(h.topIsRepo(rv2)).toBe(false); // rv2 was popped
    expect(h.bracketCount()).toBe(0); // nothing left over to deliver
    h.destroy();
  });

  it('a split arrow key (the round-5 case) still navigates cleanly with no pop at all — round-6 fix does not regress round 5', () => {
    const h = buildHarness();
    const rv = h.pushRepo();
    h.send('c'); h.send('c'); // ALL -> XIM -> DD
    const depthBefore = h.stackDepth();

    jest.useFakeTimers();
    h.send('\x1b['); // lead-in
    jest.advanceTimersByTime(30); // well under the 100ms timeout
    h.send('B');      // completes it before the timeout fires
    jest.advanceTimersByTime(150); // drain any timer that might still be pending
    jest.useRealTimers();

    expect(h.escapeCount()).toBe(0);
    expect(h.stackDepth()).toBe(depthBefore);
    expect(h.topIsRepo(rv)).toBe(true);
    expect(rv.systemFilter).toBe('DD');
    h.destroy();
  });

  it('minor: a complete, non-split sequence (ESC[A in one payload) incurs no artificial delay at all', () => {
    // Confirms the 100ms wait applies only to genuinely ambiguous prefixes
    // (per the re-review's minor point), not to every ESC-prefixed input.
    const h = buildHarness();
    h.pushRepo();
    jest.useFakeTimers();
    h.send('\x1b[A'); // fully formed Up-arrow, all in one chunk
    // No advanceTimersByTime at all — if this needed the timeout to
    // resolve, escapeCount would still be 0 anyway (it's a real arrow, not
    // an Escape), so assert the STRONGER claim: no timer was even armed.
    expect(jest.getTimerCount()).toBe(0);
    expect(h.escapeCount()).toBe(0);
    jest.useRealTimers();
    h.destroy();
  });
});
