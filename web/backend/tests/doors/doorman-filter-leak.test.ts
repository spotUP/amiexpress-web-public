/**
 * Bug fix: RepoView's filter-activation keypress leaking into the
 * newly-focused filter input — round 2.
 *
 * Round 1 deferred the mode flip + focus() with `process.nextTick`, which
 * fixed the SINGLE-keystroke case but not the general one: `Program.
 * _handleData` (sdk/engines/ui/blessed/core/program.ts) parses and
 * dispatches EVERY key in one input payload inside a single synchronous
 * `while` loop, calling `Screen._handleKey` per key with NO tick boundary
 * in between. A `process.nextTick` scheduled while processing the first key
 * of a payload does not run until the whole payload is drained, so on
 * coalesced/pasted/batched input (multiple keys landing in one payload —
 * routine for a BBS door served over telnet/websocket) the keys immediately
 * following the activator are dispatched while the mode flag is STILL
 * false, misrouting them (to hotkeys, or into the buffer once the deferred
 * flip finally lands) instead of typing them into the filter as intended.
 * Also: `KeyBinder`'s wrapped handler (ViewManager.ts) never returns `true`,
 * so `Screen._handleKey`'s final phase-3 broadcast to plain
 * `screen.on('keypress', ...)` listeners still runs for every key
 * regardless — including the activating one.
 *
 * The fix (this round) is fully synchronous, no deferral at all — the only
 * approach correct regardless of how keys are chunked into payloads. Two
 * one-shot guard flags, both armed AND consumed within the SAME
 * `Screen._handleKey` call for the activating keystroke (mirroring the
 * skipFirst/blockNextSelect idiom already used in InfoEditorOverlay.ts):
 *   1. `DoormanLayout.suppressNextFilterKeypress` (armed by `focusFilter()`
 *      right before `filterBox.focus()`) — swallows the ONE keystroke that
 *      `Screen._handleKey`'s phase-2 emit re-delivers to whichever element
 *      JUST became focused during phase 1 of the same dispatch, so
 *      `Textbox`'s own `_onKeypress`/`insertChar` never sees it.
 *   2. `suppressNextFilterChar` (RepoView's `filterKeypress` closure) —
 *      swallows the same keystroke on phase 3's broadcast, so it never gets
 *      appended to `this.filter` either.
 *
 * This suite drives REAL SDK `Screen`/`List`/`Textbox` objects through the
 * REAL `Program._handleData` parser/dispatcher — the only way to genuinely
 * reproduce the same-payload race `_handleData`'s single synchronous loop
 * can produce; a hand-rolled dispatch stub can't. `buildHarness()` below is
 * copied verbatim from `DoormanLayout`'s constructor (filterBox wrap +
 * `focusFilter()`) and `RepoView.enter()` (`filterKeypress` +
 * `suppressNextFilterChar` + the activation handler + `KeyBinder` guard) in
 * `Doors/door-manager/app.ts`, parameterized by `variant` so the SAME
 * same-chunk payload can be run against the original bug, round 1's
 * process.nextTick fix, and round 2's fix side by side — direct evidence
 * that only the synchronous guard is airtight, not just an assertion on
 * the current state.
 *
 * Round 3: 'tab' is one of the activator keys ('f'/'F'/'/'/'tab'), and
 * `Screen._handleKey` (screen.ts:2163-2174) has a DEFAULT fallback for an
 * *unhandled* Tab that fires its own `focusNext()` and returns BEFORE the
 * phase-3 broadcast ever runs. Round 2's activation handler never returned
 * `true`, so it never marked the keystroke `handled` — meaning every Tab
 * press hit that fallback: blessed's `focusNext()` immediately re-stole
 * focus away from `filterBox` right after `focusFilter()` had just set it,
 * AND `suppressNextFilterChar` (armed but never reached by phase 3) stayed
 * stuck `true`, silently swallowing the sysop's next real keystroke
 * whenever it arrived in a later payload. Root cause: `KeyBinder.key()`'s
 * wrapped handler (ViewManager.ts) discarded the inner handler's return
 * value instead of propagating it, so there was no way for a hotkey to
 * signal `handled` back to `Screen._handleKey` at all. Fixed at that root
 * — `wrapped` now `return`s the inner handler's result — and the
 * activation handler returns `true`, so Tab's own dispatch skips the
 * default fallback exactly like every other activator key already did.
 */
import { Screen, List, Textbox } from '../../../../sdk/engines/ui/blessed';
import { KeyBinder } from '../../../../Doors/door-manager/ViewManager';
import { ALL_TYPES, distinctTypes, cycleSystemFilter } from '../../../../Doors/door-manager/systemFilter';

// 'fixed-round2' reproduces round 2's committed state exactly: both
// synchronous suppress flags, but the activation handler does not `return
// true`, so it never signals `handled` — isolates the round-3 Tab bug
// (focus stolen back + stuck suppressNextFilterChar) from round 2's fix,
// which already resolved the leak for every other activator key.
type Variant = 'buggy-sync' | 'buggy-nexttick' | 'fixed-round2' | 'fixed';

interface Harness {
  screen: any;
  filterBox: any;
  getFilterText: () => string;
  getFilterActive: () => boolean;
  getSystemFilter: () => string;
  cycleCount: () => number;
  /** Feeds raw bytes through the REAL Program input path — one call = one
   * payload/chunk, exactly like one 'data' event off the telnet/websocket
   * connection. Multiple characters in one string are parsed and dispatched
   * in Program._handleData's own single synchronous while loop. Goes
   * through `program.emit('data', ...)` (not `_handleData()` directly) —
   * `_handleData` is only safe to call via that emit, which is guarded by
   * Program's `_handlingData` re-entry flag against the feedback loop
   * `_emitKey` creates by also emitting 'data'; calling `_handleData`
   * directly bypasses that guard and double/triple-dispatches. */
  send: (raw: string) => void;
  isFilterFocused: () => boolean;
  destroy: () => void;
}

const sampleRows = [{ door_type: 'XIM' }, { door_type: 'FIM' }, { door_type: 'REXX' }];

function buildHarness(variant: Variant): Harness {
  // A no-op output callback (matches how app.ts's real createApp() always
  // passes one, e.g. `output: (data) => bbs.write(data)`) keeps the test
  // run's stdout free of raw ANSI escape noise without changing any of the
  // input-dispatch behavior under test.
  const screen = new Screen({ title: 'filter-leak-test', output: () => {} });

  const doorList = new List({
    parent: screen, top: 0, left: 0, width: 30, height: 10,
    keys: true, vi: false, mouse: false, tags: true,
  });
  doorList.setItems(['one', 'two', 'three']);

  const filterBox = new Textbox({ parent: screen, top: 11, left: 0, width: 30, height: 1 });

  // 'fixed' and 'fixed-round2' both have the two synchronous suppress
  // flags — they differ only in whether the activation handler signals
  // `handled` (round 3's fix). The buggy variants never had either flag.
  const hasSyncGuards = variant === 'fixed' || variant === 'fixed-round2';

  // Copied from DoormanLayout constructor (app.ts): disable doorList's
  // built-in type-ahead so letter keys reach hotkeys instead of jumping
  // list selection.
  const _nav = (doorList as any)._onKeypress?.bind(doorList);
  (doorList as any).removeAllListeners('keypress');
  if (_nav) {
    (doorList as any).on('keypress', (ch: string, key: any) => {
      if (ch?.length === 1 && /[a-zA-Z0-9/ ]/.test(ch)) return;
      if (key?.name === 'escape' || ch === '\x1b') return;
      return _nav(ch, key);
    });
  }

  // Copied from DoormanLayout constructor + focusFilter() (app.ts) — 'fixed'
  // and 'fixed-round2' only, the buggy variants never had this guard.
  let suppressNextFilterKeypress = false;
  if (hasSyncGuards) {
    const _filterNav = (filterBox as any)._onKeypress?.bind(filterBox);
    (filterBox as any).removeAllListeners('keypress');
    if (_filterNav) {
      (filterBox as any).on('keypress', (ch: string, key: any) => {
        if (suppressNextFilterKeypress) { suppressNextFilterKeypress = false; return; }
        return _filterNav(ch, key);
      });
    }
  }
  function focusFilter(): void {
    if (hasSyncGuards) suppressNextFilterKeypress = true;
    (filterBox as any).focus();
  }
  function focusList(): void { (doorList as any).focus(); }

  // Copied from RepoView.enter() (app.ts), branched by variant.
  let filterActive = false;
  let suppressNextFilterChar = false;
  let filterText = '';
  let systemFilter = ALL_TYPES;
  let cycles = 0;

  const filterKeypress = (ch: string, key: any) => {
    if (hasSyncGuards && suppressNextFilterChar) { suppressNextFilterChar = false; return; }
    if (!filterActive) return;
    const kn = key?.name ?? '';
    if (kn === 'tab' || kn === 'down' || kn === 'enter' || kn === 'return') {
      filterActive = false; focusList(); return;
    }
    if (kn === 'escape') {
      filterActive = false; filterText = ''; (filterBox as any).setValue(''); focusList(); return;
    }
    if (kn === 'backspace' || kn === 'delete') {
      filterText = filterText.slice(0, -1);
    } else if (ch && ch.length === 1 && ch.charCodeAt(0) >= 32) {
      filterText += ch;
    } else { return; }
    (filterBox as any).setValue(filterText);
  };
  (screen as any).on('keypress', filterKeypress);

  const keys = new KeyBinder(screen);
  keys.setGuard(() => !filterActive);
  keys.key(['f', 'F', '/', 'tab'], () => {
    if (filterActive) return;
    if (variant === 'buggy-sync') {
      filterActive = true;
      focusFilter();
    } else if (variant === 'buggy-nexttick') {
      process.nextTick(() => {
        filterActive = true;
        focusFilter();
      });
    } else if (variant === 'fixed-round2') {
      // Round 2's actual committed state: synchronous guards, but the
      // handler never returns true — never signals `handled`, so an
      // unhandled Tab still hits Screen._handleKey's own focusNext()
      // fallback and returns before phase 3 ever runs.
      filterActive = true;
      suppressNextFilterChar = true;
      focusFilter();
    } else {
      filterActive = true;
      suppressNextFilterChar = true;
      focusFilter();
      return true; // round 3: see app.ts's activation handler for why
    }
  });
  keys.key(['c', 'C'], () => {
    const types = distinctTypes(sampleRows, r => r.door_type);
    systemFilter = cycleSystemFilter(systemFilter, types);
    cycles++;
  });

  focusList();

  return {
    screen, filterBox,
    getFilterText: () => filterText,
    getFilterActive: () => filterActive,
    getSystemFilter: () => systemFilter,
    cycleCount: () => cycles,
    send: (raw: string) => { (screen as any).program.emit('data', raw); },
    isFilterFocused: () => (screen as any)._focused === filterBox,
    destroy: () => { if (!screen.destroyed) screen.destroy(); },
  };
}

describe('DOORMAN RepoView filter: c cycles, never leaks into the buffer', () => {
  let h: Harness;
  afterEach(() => h?.destroy());

  it('lowercase c cycles the system filter (ALL -> XIM) and leaves the filter buffer empty', () => {
    h = buildHarness('fixed');
    h.send('c');
    expect(h.getSystemFilter()).toBe('XIM');
    expect(h.cycleCount()).toBe(1);
    expect(h.getFilterText()).toBe('');
    expect(h.getFilterActive()).toBe(false);
    expect(h.filterBox.getValue()).toBe('');
  });

  it('uppercase C also cycles (Shift+c) and leaves the filter buffer empty', () => {
    h = buildHarness('fixed');
    h.send('C');
    expect(h.getSystemFilter()).toBe('XIM');
    expect(h.cycleCount()).toBe(1);
    expect(h.getFilterText()).toBe('');
    expect(h.filterBox.getValue()).toBe('');
  });

  it('repeated c presses cycle through every type then back to ALL, never touching the buffer', () => {
    h = buildHarness('fixed');
    h.send('c'); expect(h.getSystemFilter()).toBe('XIM');
    h.send('c'); expect(h.getSystemFilter()).toBe('FIM');
    h.send('c'); expect(h.getSystemFilter()).toBe('REXX');
    h.send('c'); expect(h.getSystemFilter()).toBe(ALL_TYPES);
    expect(h.getFilterText()).toBe('');
    expect(h.filterBox.getValue()).toBe('');
  });

  it('structural guarantee: no printable key mutates the buffer while filter mode is off', () => {
    h = buildHarness('fixed');
    for (const ch of ['z', '1', ' ', 'x', 'y']) {
      h.send(ch);
    }
    expect(h.getFilterActive()).toBe(false);
    expect(h.getFilterText()).toBe('');
    expect(h.filterBox.getValue()).toBe('');
  });

  it('c while filter mode IS active types the character instead of cycling', () => {
    h = buildHarness('fixed');
    h.send('f');            // activate (separate payload)
    h.send('c');            // separate payload — guard suppresses the hotkey
    expect(h.getFilterActive()).toBe(true);
    expect(h.cycleCount()).toBe(0);
    expect(h.getFilterText()).toBe('c');
    expect(h.filterBox.getValue()).toBe('c');
  });
});

describe('DOORMAN RepoView filter: activation leak — same-payload/chunked delivery', () => {
  let h: Harness;
  afterEach(() => h?.destroy());

  it('fixed: two keys in ONE payload ("fx") — activator is swallowed, second key types normally', () => {
    h = buildHarness('fixed');
    h.send('fx'); // ONE _handleData call — both bytes parsed/dispatched synchronously
    expect(h.getFilterActive()).toBe(true);
    expect(h.getFilterText()).toBe('x');       // not 'fx', not 'f'
    expect(h.filterBox.getValue()).toBe('x');
  });

  it('fixed: keys arriving in separate payloads (normal keystroke-by-keystroke) still work', () => {
    h = buildHarness('fixed');
    h.send('f');
    h.send('y');
    expect(h.getFilterActive()).toBe(true);
    expect(h.getFilterText()).toBe('y');
    expect(h.filterBox.getValue()).toBe('y');
  });

  it('RED evidence — buggy-sync (pre-round-1): same payload leaks the activator into the buffer', () => {
    h = buildHarness('buggy-sync');
    h.send('fx');
    // The original bug: 'f' re-delivered into the widget AND the manual
    // buffer during its own dispatch, then 'x' appends on top.
    expect(h.getFilterText()).not.toBe('x');
    expect(h.getFilterText()).toBe('fx');
  });

  it('RED evidence — buggy-nexttick (round 1): same payload still misroutes the second key', () => {
    h = buildHarness('buggy-nexttick');
    h.send('fx');
    // process.nextTick has not run yet — 'x' was dispatched while
    // filterActive was still false, so it never reached the buffer at all
    // (round 1 fixed the single-keystroke leak but not this).
    expect(h.getFilterText()).toBe('');
    expect(h.getFilterActive()).toBe(false);
  });

  it('GREEN — fixed variant does not reproduce either failure mode', () => {
    h = buildHarness('fixed');
    h.send('fx');
    expect(h.getFilterText()).toBe('x');
    expect(h.getFilterActive()).toBe(true);
  });
});

describe('DOORMAN RepoView filter: Tab activation (round 3)', () => {
  let h: Harness;
  afterEach(() => h?.destroy());

  it('fixed: tab activates the filter and keeps real screen focus on filterBox', () => {
    h = buildHarness('fixed');
    h.send('\t');
    expect(h.getFilterActive()).toBe(true);
    expect(h.isFilterFocused()).toBe(true); // not stolen back by Screen's own focusNext()
    expect(h.getFilterText()).toBe('');
    expect(h.filterBox.getValue()).toBe('');
  });

  it('fixed: a char in a LATER payload after tab activation lands in the field — nothing swallowed', () => {
    h = buildHarness('fixed');
    h.send('\t');
    h.send('z');
    expect(h.getFilterActive()).toBe(true);
    expect(h.getFilterText()).toBe('z');
    expect(h.filterBox.getValue()).toBe('z');
  });

  it('fixed: tab + char in the SAME payload also lands correctly', () => {
    h = buildHarness('fixed');
    h.send('\tz');
    expect(h.getFilterActive()).toBe(true);
    expect(h.getFilterText()).toBe('z');
    expect(h.filterBox.getValue()).toBe('z');
  });

  it('fixed: other activators (f, /) still work and mark handled (focus not stolen back)', () => {
    h = buildHarness('fixed');
    h.send('f');
    expect(h.isFilterFocused()).toBe(true);
    h.destroy();

    h = buildHarness('fixed');
    h.send('/');
    expect(h.isFilterFocused()).toBe(true);
  });

  it('RED evidence — fixed-round2: tab press lets Screen.focusNext() steal focus back', () => {
    h = buildHarness('fixed-round2');
    h.send('\t');
    expect(h.getFilterActive()).toBe(true); // our own flag still flipped
    expect(h.isFilterFocused()).toBe(false); // but real screen focus moved elsewhere
  });

  it('RED evidence — fixed-round2: a later-payload char after tab activation is silently swallowed', () => {
    h = buildHarness('fixed-round2');
    h.send('\t');
    h.send('z');
    // suppressNextFilterChar was armed but phase 3 never ran for the tab
    // keystroke (Screen's default fallback returned first), so it's still
    // true here and eats the very next keystroke instead of typing it.
    expect(h.getFilterText()).toBe('');
    expect(h.filterBox.getValue()).toBe('');
  });

  it('GREEN — fixed does not reproduce either fixed-round2 failure mode', () => {
    h = buildHarness('fixed');
    h.send('\t');
    expect(h.isFilterFocused()).toBe(true);
    h.send('z');
    expect(h.getFilterText()).toBe('z');
  });
});
