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

  return {
    screen, doorList, vm, installed, sampleEntries,
    pushRepo: () => { const rv = new RepoViewReplica(sampleEntries, doorList); vm.push(rv); return rv; },
    topIsRepo: (rv: RepoViewReplica) => (vm as any).stack[(vm as any).stack.length - 1] === rv,
    send: (raw: string) => { (screen as any).program.emit('data', raw); },
    destroy: () => { if (!screen.destroyed) screen.destroy(); },
  };
}

describe('DOORMAN arrow-key navigation: split escape sequences must not evict the active view', () => {
  it('a split down-arrow (ESC[ then B in separate payloads) does not fire Escape and does not pop RepoView', () => {
    const h = buildHarness();
    const rv = h.pushRepo();
    h.send('c'); h.send('c'); // ALL -> XIM -> DD

    h.send('\x1b['); // lead-in only
    h.send('B');      // final letter (down) in a later payload

    expect(h.topIsRepo(rv)).toBe(true); // NOT popped back to InstalledView
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
    const splitSeqs: Array<[string, string]> = [
      ['\x1b[', 'B'], ['\x1b[', 'B'], ['\x1b[', 'A'], ['\x1b[', 'C'], ['\x1b[', 'D'],
      ['\x1bO', 'A'], // SS3-style up, also split
    ];
    for (const [leadIn, final] of splitSeqs) {
      (h.doorList as any)._lastKeyTime = 0; // bypass List's own 50ms nav debounce
      h.send(leadIn);
      h.send(final);
      // Filter and view identity must survive EVERY single navigation step.
      expect(h.topIsRepo(rv)).toBe(true);
      expect(rv.systemFilter).toBe('DD');
      expect(rv.header).toBe('System: DD (3)');
    }

    h.destroy();
  });

  it('control: a genuinely standalone Escape (nothing follows) still pops the view as designed', () => {
    // Guards against over-fixing: real Escape-key presses (no trailing
    // sequence bytes) must still work exactly as before — DOORMAN relies on
    // ESC to back out of RepoView. Uses the 100ms timeout path (bare ESC,
    // length 1) which this fix does not change.
    const h = buildHarness();
    const rv = h.pushRepo();
    jest.useFakeTimers();
    h.send('\x1b'); // bare ESC, nothing follows
    jest.advanceTimersByTime(150);
    expect(h.topIsRepo(rv)).toBe(false); // popped, as intended
    jest.useRealTimers();
    h.destroy();
  });
});
