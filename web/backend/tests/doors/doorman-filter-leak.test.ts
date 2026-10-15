/**
 * Bug fix: RepoView's filter-activation keypress leaking into the
 * newly-focused filter input.
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
 *
 * Round 4 (the actual live repro, found by systematic debugging in the
 * main session after rounds 1-3 all still reproduced): every round above
 * fixed the MANUAL dispatch-timing path correctly, but missed that
 * `Textbox` (sdk/engines/ui/blessed/widgets/textbox.ts) is a SELF-EDITING
 * widget by default — :58-60 `if (options.keys !== false) this.on
 * ('keypress', this._onKeypress)`, and `_onKeypress` (:139-162) is gated
 * ONLY on `this.focused`, inserting every printable character
 * unconditionally. DOORMAN's `filterBox` was created with neither
 * `keys: false` nor `inputOnFocus: false`, so it ran its OWN ungated
 * editor in parallel with `filterKeypress` the entire time — invisible to
 * every fix above because ALL of them only ever gated the MANUAL path
 * (`filterActive`, the two suppress flags, the `KeyBinder` guard). Once
 * `filterBox` got focus through ANY channel those fixes didn't anticipate
 * — decisively, a mouse click, since `Textbox`'s own `on('click', ...)`
 * handler (:75-77) calls `this.focus()` directly and completely bypasses
 * `RepoView`'s `activateFilter()` — every subsequent printable keystroke
 * landed straight in the widget's own `value` via `insertChar()`, with
 * `filterActive` never set, both suppress flags never armed, and the
 * `KeyBinder` guard wide open. That's the exact user report: "c" appears
 * in the box "focused or not" (by the sysop's own account, no deliberate
 * activation), and why round 2/3's keyboard-only `Program`-driven tests
 * could never reproduce it — the leak's actual trigger is a mouse event,
 * a completely different Screen dispatch path from every phase these
 * tests exercised.
 *
 * Fix: `keys: false` + `inputOnFocus: false` on `filterBox`'s
 * construction (`DoormanLayout`, app.ts) — removes `Textbox`'s
 * self-editing capability structurally, for every focus channel at once,
 * instead of chasing each one individually. `filterKeypress` becomes the
 * ONLY thing that ever writes to the box (via `setValue()`). A mouse click
 * now activates filter mode through the same `activateFilter()` path as
 * 'f'/'tab'/'/' (matches user intuition — round 2/3's widget-level
 * `suppressNextFilterKeypress` guard is removed as dead weight, since
 * `keys:false` already makes it structurally impossible for anything to
 * reach the widget's own editor); click does NOT arm
 * `suppressNextFilterChar`, since a click delivers no keypress event for
 * that flag to ever consume (arming it would reproduce the round-3
 * stuck-flag bug for every click).
 */
import { Screen, List, Textbox } from '../../../../sdk/engines/ui/blessed';
import { KeyBinder } from '../../../../Doors/door-manager/ViewManager';
import { ALL_TYPES, distinctTypes, cycleSystemFilter } from '../../../../Doors/door-manager/systemFilter';

// 'fixed-round2' = round 2's committed state (sync guards, no `handled`
// signal). 'fixed-round3' = rounds 1-3 committed (sync guards + `handled`
// signal for Tab + the widget-level suppressNextFilterKeypress wrap) —
// this is the state that still reproduces the round-4 bug: filterBox has
// its default `keys:true`, so a click bypasses the manual path entirely.
// 'fixed' = current (round 4): filterBox is `keys:false` (display-only)
// and a click activates through the same path as the keyboard.
type Variant = 'buggy-sync' | 'buggy-nexttick' | 'fixed-round2' | 'fixed-round3' | 'fixed';

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
  /** Emits 'click' directly on filterBox — the same event Screen's mouse
   * routing delivers to the target element after resolving coordinates.
   * That coordinate-resolution layer is generic infrastructure outside
   * DOORMAN and not what round 4's bug is about; emitting the event
   * directly on the target element tests exactly the mechanism under
   * test (what filterBox and RepoView's own click handler do once a
   * click lands on the box) without re-testing Screen's mouse routing. */
  click: () => void;
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

  // 'fixed' (round 4) constructs filterBox with keys:false/inputOnFocus:
  // false — exactly DoormanLayout's constructor. Every other variant gets
  // Textbox's real defaults (keys:true), reproducing the self-editing
  // widget the bug actually lives in.
  const filterBoxSelfEditingDisabled = variant === 'fixed';
  const filterBox = new Textbox({
    parent: screen, top: 11, left: 0, width: 30, height: 1,
    ...(filterBoxSelfEditingDisabled ? { keys: false, inputOnFocus: false } : {}),
  });

  // 'fixed-round2'/'fixed-round3'/'fixed' all have the two MANUAL-path
  // synchronous suppress flags (suppressNextFilterChar + the `handled`
  // signal). Only 'fixed-round2'/'fixed-round3' additionally have round
  // 2's WIDGET-level wrap (suppressNextFilterKeypress on filterBox's own
  // keypress listener) — 'fixed' drops that entirely, since keys:false
  // already makes it structurally unreachable. Only 'fixed-round3' and
  // 'fixed' return `true` from the activation handler (round 3's fix).
  const hasSyncGuards = variant === 'fixed' || variant === 'fixed-round2' || variant === 'fixed-round3';
  const hasWidgetWrap = variant === 'fixed-round2' || variant === 'fixed-round3';
  const hasReturnTrueForTab = variant === 'fixed-round3' || variant === 'fixed';
  const hasClickActivation = variant === 'fixed';

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

  // Copied from DoormanLayout constructor (pre-round-4) + focusFilter() —
  // 'fixed-round2'/'fixed-round3' only. 'fixed' relies on keys:false
  // instead (see above); the buggy variants never had this guard either.
  let suppressNextFilterKeypress = false;
  if (hasWidgetWrap) {
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
    if (hasWidgetWrap) suppressNextFilterKeypress = true;
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

  // Copied from RepoView.enter()'s activateFilter() (app.ts) — the shared
  // core both the keyboard handler and (for 'fixed' only) the click
  // handler call.
  const activateFilter = (): void => {
    filterActive = true;
    focusFilter();
  };

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
    } else {
      suppressNextFilterChar = true; // there IS a keystroke here to swallow
      activateFilter();
      if (hasReturnTrueForTab) return true; // round 3: see app.ts for why
    }
  });
  keys.key(['c', 'C'], () => {
    const types = distinctTypes(sampleRows, r => r.door_type);
    systemFilter = cycleSystemFilter(systemFilter, types);
    cycles++;
  });

  // Round 4 only: a click activates through the SAME path as the
  // keyboard, but deliberately does NOT arm suppressNextFilterChar — a
  // click delivers no keypress event for that flag to ever consume.
  // Every other variant has no such wiring at all: Textbox's own built-in
  // 'click' handler (unconditional, all variants) still calls focus()
  // directly, bypassing filterActive entirely — exactly the bug.
  if (hasClickActivation) {
    (filterBox as any).on('click', () => {
      if (filterActive) return;
      activateFilter();
    });
  }

  focusList();

  return {
    screen, filterBox,
    getFilterText: () => filterText,
    getFilterActive: () => filterActive,
    getSystemFilter: () => systemFilter,
    cycleCount: () => cycles,
    send: (raw: string) => { (screen as any).program.emit('data', raw); },
    isFilterFocused: () => (screen as any)._focused === filterBox,
    click: () => { (filterBox as any).emit('click', { x: 0, y: 0 }); },
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

describe('DOORMAN RepoView filter: self-editing widget / click activation (round 4)', () => {
  let h: Harness;
  afterEach(() => h?.destroy());

  it('fixed: focusing filterBox by ANY means (not our activation path) still cannot self-edit — keys:false is structural', () => {
    h = buildHarness('fixed');
    // Focus the box directly — bypasses activateFilter()/filterActive
    // entirely, standing in for whatever channel focused it (click,
    // focusNext()/Tab-cycling, anything else). The guarantee under test is
    // that filterBox itself cannot insert a character no matter how it
    // became focused, not that every focus channel is individually gated.
    (h.filterBox as any).focus();
    expect(h.getFilterActive()).toBe(false); // our own state never touched
    h.send('z'); // real Program dispatch — real Screen._handleKey phase 2
    expect(h.filterBox.getValue()).toBe(''); // Textbox has no keypress listener at all (keys:false)
    expect(h.getFilterText()).toBe('');
  });

  it('fixed: a click activates the filter through the same path as the keyboard', () => {
    h = buildHarness('fixed');
    h.click();
    expect(h.getFilterActive()).toBe(true);
    expect(h.isFilterFocused()).toBe(true);
    expect(h.getFilterText()).toBe('');
    expect(h.filterBox.getValue()).toBe('');
  });

  it('fixed: chars after a click flow through filterKeypress into the manual buffer — no stuck suppress flag', () => {
    h = buildHarness('fixed');
    h.click();
    h.send('c'); // separate payload, like a real keystroke following a click
    expect(h.getFilterActive()).toBe(true);
    expect(h.cycleCount()).toBe(0); // guard suppressed the 'c' hotkey, same as keyboard activation
    expect(h.getFilterText()).toBe('c'); // typed, not swallowed — proves suppressNextFilterChar wasn't wrongly armed
    expect(h.filterBox.getValue()).toBe('c');
  });

  it('RED evidence — fixed-round3: a click silently focuses the box outside our activation path', () => {
    h = buildHarness('fixed-round3');
    h.click();
    // Textbox's own built-in click handler calls focus() directly — our
    // activateFilter() is never invoked because 'fixed-round3' never wired
    // a click listener at all (that wiring is new in round 4).
    expect(h.isFilterFocused()).toBe(true);
    expect(h.getFilterActive()).toBe(false); // our bookkeeping has no idea
  });

  it('RED evidence — fixed-round3: once click-focused, printable keys leak directly into the widget, bypassing filterActive entirely', () => {
    h = buildHarness('fixed-round3');
    h.click();
    h.send('c'); // the user's exact report: "c" appears in the box
    // The widget's own _onKeypress/insertChar ran — filterBox has it,
    // unguarded (suppressNextFilterKeypress was never armed; only
    // focusFilter(), which this click never called, arms it).
    expect(h.filterBox.getValue()).toBe('c');
    // And our own state is COMPLETELY unaware — this is the "focused or
    // not" mystery: by DOORMAN's own bookkeeping nothing is active.
    expect(h.getFilterActive()).toBe(false);
    expect(h.getFilterText()).toBe('');
    expect(h.cycleCount()).toBe(1); // 'c' ALSO fired the cycle hotkey (phase 1 doesn't care who's focused)
  });

  it('GREEN — fixed reproduces neither fixed-round3 failure mode', () => {
    h = buildHarness('fixed');
    h.click();
    h.send('c');
    expect(h.getFilterActive()).toBe(true); // activated through our path
    expect(h.cycleCount()).toBe(0); // guard correctly suppressed the hotkey
    expect(h.getFilterText()).toBe('c'); // typed through the manual buffer
    expect(h.filterBox.getValue()).toBe('c'); // set via setValue(), not insertChar()
  });
});
