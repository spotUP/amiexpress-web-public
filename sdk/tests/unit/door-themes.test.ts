/**
 * Door themes, and the glitches some of them switch on.
 *
 * Two things are being protected here. One is that a sysop who wants the
 * board to look as it always has sees NOTHING change - `classic` is not a
 * redesign and must reproduce the exact colour strings the doors pass today.
 * The other is that the glitches stay charming rather than becoming a fault
 * report: rare, one row, never while somebody is typing, and never able to
 * leave the screen wrong.
 */
import {
  THEMES,
  CLASSIC,
  DEFAULT_THEME_ID,
  themeById,
  type Theme,
} from '../../engines/ui/theme/tokens';
import {
  planGlitch,
  damageRow,
  glitchIsWelcome,
  newGlitchState,
  isColourOnly,
  MIN_GAP_MS,
  MAX_PER_MINUTE,
  type Random,
} from '../../engines/ui/theme/glitch';

/** A random source that returns exactly what a test wants, in order. */
function scripted(...values: number[]): Random {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('the purists keep their board', () => {
  it('defaults to classic', () => {
    expect(DEFAULT_THEME_ID).toBe('classic');
    expect(themeById(undefined).id).toBe('classic');
    expect(themeById(null).id).toBe('classic');
    expect(themeById('').id).toBe('classic');
  });

  it('falls back to classic rather than failing', () => {
    // A stale setting or a typo in a config must produce the board's normal
    // appearance, not a door that will not start.
    expect(themeById('no-such-theme').id).toBe('classic');
  });

  it('uses the colour names the doors already pass', () => {
    // Not hex equivalents. Switching a door onto tokens must not be able to
    // shift a single shade for anyone still on classic.
    expect(CLASSIC.tokens.ground).toBe('black');
    expect(CLASSIC.tokens.ink).toBe('white');
    expect(CLASSIC.tokens.chrome).toBe('cyan');
    expect(CLASSIC.tokens.bar).toBe('blue');
    expect(CLASSIC.tokens.accent).toBe('yellow');
    expect(CLASSIC.tokens.dim).toBe('gray');
  });

  it('never glitches', () => {
    // Classic is the only theme that does not. Everything else opts in -
    // including the phosphor themes, which the pitch had opted out on the
    // argument that they were the calm direction, and which the sysop
    // overruled.
    expect(CLASSIC.glitches).toBe(false);
    expect(CLASSIC.rail).toBe('');

    const others = THEMES.filter((t: any) => t.id !== 'classic');
    expect(others.every((t: any) => t.glitches)).toBe(true);
  });

  it('leads the list, so it is what a picker offers first', () => {
    expect(THEMES[0].id).toBe('classic');
  });
});

describe('every theme is complete', () => {
  const tokenNames = Object.keys(CLASSIC.tokens) as Array<keyof Theme['tokens']>;

  it.each(THEMES.map(t => [t.id, t] as const))('%s sets every token', (_id, theme) => {
    // A missing token renders as the terminal's default, which is the one
    // colour no theme chose - and it always looks like a bug.
    for (const name of tokenNames) {
      expect({ token: name, set: Boolean(theme.tokens[name]) })
        .toEqual({ token: name, set: true });
    }
  });

  it.each(THEMES.map(t => [t.id, t] as const))('%s has a distinct id and a name', (_id, theme) => {
    expect(theme.id).toMatch(/^[a-z0-9-]+$/);
    expect(theme.name.length).toBeGreaterThan(0);
    expect(theme.blurb.length).toBeGreaterThan(0);
  });

  it('has no duplicate ids', () => {
    const ids = THEMES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps selection legible', () => {
    // A selected row whose text matches its own background is invisible -
    // which is exactly the bug that was reported on the SDK's confirm dialog.
    for (const theme of THEMES) {
      expect({ theme: theme.id, same: theme.tokens.selectionBg === theme.tokens.selectionInk })
        .toEqual({ theme: theme.id, same: false });
    }
  });

  it('keeps text off its own ground', () => {
    for (const theme of THEMES) {
      expect({ theme: theme.id, same: theme.tokens.ink === theme.tokens.ground })
        .toEqual({ theme: theme.id, same: false });
    }
  });

  it('draws its rail in ASCII only', () => {
    // The branding mark has to survive Topaz, a real Amiga and 2400 baud.
    for (const theme of THEMES) {
      expect({ theme: theme.id, ascii: /^[\x20-\x7e]*$/.test(theme.rail) })
        .toEqual({ theme: theme.id, ascii: true });
    }
  });
});

describe('when a glitch is allowed at all', () => {
  const ok = {
    themeAllows: true, userEnabled: true,
    isTyping: false, isSecret: false, isTransferring: false,
  };

  it('only when the theme and the user both want it', () => {
    expect(glitchIsWelcome(ok)).toBe(true);
    expect(glitchIsWelcome({ ...ok, themeAllows: false })).toBe(false);
    expect(glitchIsWelcome({ ...ok, userEnabled: false })).toBe(false);
  });

  it('never while somebody is typing', () => {
    // A scrambled row under the cursor reads as the BBS having eaten the
    // input, which is the opposite of charming.
    expect(glitchIsWelcome({ ...ok, isTyping: true })).toBe(false);
  });

  it('never in a password field', () => {
    expect(glitchIsWelcome({ ...ok, isSecret: true })).toBe(false);
  });

  it('never during a transfer', () => {
    expect(glitchIsWelcome({ ...ok, isTransferring: true })).toBe(false);
  });
});

describe('how often one fires', () => {
  it('is usually not now', () => {
    // The dice say no far more often than yes; a glitch every few seconds is
    // a fault, not atmosphere.
    const state = newGlitchState();
    expect(planGlitch(1_000_000, state, 20, scripted(0.99))).toBeNull();
  });

  it('does not fire twice in quick succession', () => {
    const state = newGlitchState();
    const first = planGlitch(1_000_000, state, 20, scripted(0.01, 0.5, 0.5, 0.5));
    expect(first).not.toBeNull();

    const tooSoon = planGlitch(1_000_000 + MIN_GAP_MS - 1, state, 20, scripted(0.01));
    expect(tooSoon).toBeNull();
  });

  it('holds a ceiling within any one minute, however the dice fall', () => {
    // The ceiling is the last defence, and the only one that does not
    // depend on the dice. `always` fires on every eligible tick AND draws
    // the shortest possible gap, so this is the worst case the scheduler
    // can be put in.
    const always = () => 0.01;
    const state = newGlitchState();
    const start = 1_000_000;
    let fired = 0;

    for (let at = start; at < start + 59_000; at += 250) {
      if (planGlitch(at, state, 20, always)) fired++;
    }

    expect(fired).toBe(MAX_PER_MINUTE);
  });

  it('allows a fresh minute its own allowance', () => {
    // Per minute, not a lifetime budget, or the effect would quietly stop
    // for the rest of the session.
    const always = () => 0.01;
    const state = newGlitchState();
    const start = 1_000_000;

    for (let at = start; at < start + 59_000; at += 250) {
      planGlitch(at, state, 20, always);
    }
    expect(planGlitch(start + 59_500, state, 20, always)).toBeNull();
    expect(planGlitch(start + 61_000, state, 20, always)).not.toBeNull();
  });

  it('stays inside the screen it was given', () => {
    const state = newGlitchState();
    const plan = planGlitch(1_000_000, state, 5, scripted(0.01, 0.99, 0.99, 0.5));
    expect(plan).not.toBeNull();
    expect(plan!.row).toBeGreaterThanOrEqual(0);
    expect(plan!.row).toBeLessThan(5);
  });

  it('does nothing on an empty screen', () => {
    expect(planGlitch(1_000_000, newGlitchState(), 0, scripted(0.01))).toBeNull();
  });

  it('is over quickly', () => {
    const plan = planGlitch(1_000_000, newGlitchState(), 20, scripted(0.01, 0.5, 0.5, 0.5));
    expect(plan!.durationMs).toBeGreaterThan(50);
    expect(plan!.durationMs).toBeLessThan(250);
  });
});

describe('what a glitch does to a row', () => {
  const ROW = '| DOORREPO      4096 archives      3:42 |';

  it.each(['scramble', 'shift', 'dropout', 'tear'] as const)(
    '%s keeps the row exactly as wide',
    (kind) => {
      // The rule that matters most. A glitch that changed a row's width would
      // push a border out of true, and the repaint afterwards would not put
      // it back.
      const out = damageRow(ROW, kind, scripted(0.3, 0.6, 0.1, 0.9, 0.4));
      expect(out).toHaveLength(ROW.length);
    }
  );

  it('never modifies the text it was handed', () => {
    const original = String(ROW);
    damageRow(ROW, 'scramble', scripted(0.3, 0.6, 0.1));
    expect(ROW).toBe(original);
  });

  it('actually damages something when it scrambles', () => {
    const out = damageRow(ROW, 'scramble', scripted(0.9, 0.05, 0.5, 0.2, 0.5));
    expect(out).not.toBe(ROW);
  });

  it('recolours rather than rewrites, for a tear', () => {
    // The damage is entirely in the colour, so the text must come back whole.
    expect(damageRow(ROW, 'tear', scripted(0.5))).toBe(ROW);
    expect(isColourOnly('tear')).toBe(true);
    expect(isColourOnly('scramble')).toBe(false);
  });

  it('survives an empty row', () => {
    for (const kind of ['scramble', 'shift', 'dropout', 'tear'] as const) {
      expect(damageRow('', kind, scripted(0.5))).toBe('');
    }
  });

  it('survives a one-character row', () => {
    for (const kind of ['scramble', 'shift', 'dropout', 'tear'] as const) {
      expect(damageRow('X', kind, scripted(0.5)) ).toHaveLength(1);
    }
  });
});

describe('doors name a role, not a colour', () => {
  const { themeStyles } = require('../../engines/ui/theme/styles');
  const { UPROUGH_NEON } = require('../../engines/ui/theme/tokens');

  it('gives classic exactly what the doors pass today', () => {
    // The migration has to be verifiable: a door moved onto tokens must
    // render identically until somebody picks another theme.
    const s = themeStyles(CLASSIC);
    expect(s.panel.style.fg).toBe('white');
    expect(s.panel.style.bg).toBe('black');
    expect(s.panel.style.border!.fg).toBe('cyan');
    expect(s.bar.style.bg).toBe('blue');
  });

  it('closes every tag it opens', () => {
    // An unclosed tag bleeds its colour into everything after it, which is
    // the bug class that turned a whole screen blue once already.
    const s = themeStyles(UPROUGH_NEON);
    for (const render of [s.ink, s.dim, s.accent, s.accentAlt, s.ok, s.warn, s.alert, s.key]) {
      const out = render('text');
      const opens = (out.match(/\{(?!\/)[^}]+\}/g) || []).length;
      const closes = (out.match(/\{\/[^}]+\}/g) || []).length;
      expect({ out, balanced: opens === closes }).toEqual({ out, balanced: true });
      expect(out).toContain('text');
    }
  });

  it('keeps a selected row readable in every theme', () => {
    for (const theme of THEMES) {
      const sel = themeStyles(theme).list.style.selected!;
      expect({ theme: theme.id, readable: sel.fg !== sel.bg })
        .toEqual({ theme: theme.id, readable: true });
    }
  });

  it('marks the focused panel with the accent', () => {
    // Which panel has the keyboard is information, and it is the one thing
    // the accent is reliably worth spending on.
    for (const theme of THEMES) {
      const s = themeStyles(theme);
      expect({ theme: theme.id, focus: s.panel.style.focus!.border!.fg })
        .toEqual({ theme: theme.id, focus: theme.tokens.accent });
    }
  });

  it('sinks the border into the ground when a theme wants none', () => {
    // Quiet Phosphor draws no visible frame, but removing the widget's
    // border would move every child by a column. Colouring it as the ground
    // keeps the layout and loses the line.
    const { QUIET_PHOSPHOR } = require('../../engines/ui/theme/tokens');
    const s = themeStyles(QUIET_PHOSPHOR);
    expect(s.panel.style.border!.fg).toBe(QUIET_PHOSPHOR.tokens.ground);
  });
});

describe('a migrated door renders identically on classic', () => {
  const { themeStyles } = require('../../engines/ui/theme/styles');

  it('emits the same tags the door used to hardcode', () => {
    // The promise that makes migrating safe: DOORS-MENU passed these exact
    // strings before it was moved onto tokens, so anyone still on classic
    // must get them back byte for byte.
    const s = themeStyles(CLASSIC);
    expect(s.accent('Filter:')).toBe('{yellow-fg}Filter:{/yellow-fg}');
    expect(s.accentAlt('Location:')).toBe('{cyan-fg}Location:{/cyan-fg}');
    expect(s.dim('[..]')).toBe('{gray-fg}[..]{/gray-fg}');
    expect(s.ink('View All Doors')).toBe('{white-fg}View All Doors{/white-fg}');
    expect(s.ok('DOORREPO')).toBe('{green-fg}DOORREPO{/green-fg}');
  });

  it('gives the same structural styles the door used to pass', () => {
    const s = themeStyles(CLASSIC);
    expect(s.bar.style).toEqual({ fg: 'white', bg: 'blue' });
    expect(s.list.style.selected!.bg).toBe('blue');
    expect(s.list.style.selected!.fg).toBe('white');
  });

  it('adds no branding to classic', () => {
    // The rail is part of the new looks. On classic the footer must be what
    // it always was.
    expect(themeStyles(CLASSIC).rail).toBe('');
  });
});

describe('backgrounds stay on the sixteen named colours', () => {
  const NAMED = new Set([
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'gray', 'grey', 'lightblack', 'lightred', 'lightgreen', 'lightyellow',
    'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
  ]);

  // Measured, not preference: blessed resolves a dark hex background to the
  // 256-colour greyscale ramp and emits a correct ESC[48;5;232m, but those
  // backgrounds render LIGHT on this board while 256-colour foregrounds
  // render exactly right. A near-black ground came out white on the first
  // themed screen anyone ran.
  it.each(THEMES.map(t => [t.id, t] as const))('%s uses a named background', (_id, theme) => {
    for (const token of ['ground', 'bar', 'selectionBg'] as const) {
      const value = theme.tokens[token];
      expect({ theme: theme.id, token, value, named: NAMED.has(value) })
        .toEqual({ theme: theme.id, token, value, named: true });
    }
  });

  it('still lets foregrounds carry the palette', () => {
    // The whole look lives in the foregrounds, so this must NOT be a blanket
    // ban on hex - only backgrounds are constrained.
    const { UPROUGH_NEON } = require('../../engines/ui/theme/tokens');
    expect(UPROUGH_NEON.tokens.accent).toMatch(/^#/);
    expect(UPROUGH_NEON.tokens.ink).toMatch(/^#/);
  });
});

describe('a theme draws the rules it asked for', () => {
  const { themeStyles } = require('../../engines/ui/theme/styles');
  const { UPROUGH_NEON, QUIET_PHOSPHOR } = require('../../engines/ui/theme/tokens');

  it('gives Uprough Neon its double rules', () => {
    // The defining feature of that direction, and it was being discarded:
    // themeStyles hardcoded 'line' whatever the theme said.
    expect(UPROUGH_NEON.border).toBe('double');
    expect(themeStyles(UPROUGH_NEON).panel.border.type).toBe('double');
    expect(themeStyles(UPROUGH_NEON).list.border.type).toBe('double');
  });

  it('leaves classic on single rules', () => {
    expect(themeStyles(CLASSIC).panel.border.type).toBe('line');
  });

  it('keeps a borderless theme inside its box model', () => {
    // Quiet Phosphor shows no rule, but removing the widget's border would
    // move every child by a column. It stays a border and takes the ground
    // colour instead.
    const s = themeStyles(QUIET_PHOSPHOR);
    expect(s.panel.border.type).toBe('line');
    expect(s.panel.style.border!.fg).toBe(QUIET_PHOSPHOR.tokens.ground);
  });
});

describe('a glitch is put on screen and taken off again', () => {
  const { attachGlitches, glitchLines } = require('../../engines/ui/theme/glitch-runner');
  const { UPROUGH_NEON } = require('../../engines/ui/theme/tokens');

  /** The little blessed a runner needs. */
  function target(content: string) {
    return {
      content,
      getContent() { return this.content; },
      setContent(t: string) { this.content = t; },
    };
  }

  it('does nothing whatsoever on a theme that did not ask', () => {
    // A board on classic must not even start a timer.
    const t = target('a\nb\nc');
    // No fake timers here on purpose: the point is that NOTHING was
    // scheduled, so there is nothing to advance. Calling the timer API
    // without faking it is an error in modern jest and was destabilising
    // whichever suite happened to run next.
    const stop = attachGlitches(t, CLASSIC, () => {}, { random: () => 0.01 });
    expect(t.content).toBe('a\nb\nc');
    stop();
  });

  it('leaves the row the same width', () => {
    // The rule that matters most: a longer row would push a border out of
    // true and the repair would not put it back.
    const lines = ['| DOORREPO      4096 |', '| second row here    |'];
    for (const kind of ['scramble', 'shift', 'dropout', 'tear'] as const) {
      const out = glitchLines(lines, { row: 0, kind }, UPROUGH_NEON, () => 0.4);
      const visible = out[0].replace(/\{[^}]*\}/g, '');
      expect({ kind, width: visible.length }).toEqual({ kind, width: lines[0].length });
    }
  });

  it('touches one row and no other', () => {
    const lines = ['first', 'second', 'third'];
    const out = glitchLines(lines, { row: 1, kind: 'dropout' }, UPROUGH_NEON, () => 0.2);
    expect(out[0]).toBe('first');
    expect(out[2]).toBe('third');
  });

  it('ignores a row that does not exist', () => {
    const lines = ['only'];
    expect(glitchLines(lines, { row: 5, kind: 'scramble' }, UPROUGH_NEON, () => 0.5))
      .toEqual(['only']);
  });

  it('restores the truth when it is stopped mid-glitch', () => {
    // A door that exits while a glitch is showing must not leave the
    // damaged row as the last thing anybody saw.
    jest.useFakeTimers();
    try {
      const t = target('alpha\nbeta\ngamma');
      const stop = attachGlitches(t, UPROUGH_NEON, () => {}, {
        tickMs: 10,
        random: () => 0.01,      // always fire
        now: () => 1_000_000,
      });

      jest.advanceTimersByTime(10);
      const during = t.content;
      stop();

      expect(t.content).toBe('alpha\nbeta\ngamma');
      expect(during).not.toBe('');
    } finally {
      jest.useRealTimers();
    }
  });

  it('repairs itself when the timer runs out', () => {
    jest.useFakeTimers();
    try {
      const t = target('alpha\nbeta\ngamma');
      const stop = attachGlitches(t, UPROUGH_NEON, () => {}, {
        tickMs: 10,
        random: () => 0.01,
        now: () => 1_000_000,
      });

      jest.advanceTimersByTime(10);      // fire
      jest.advanceTimersByTime(1_000);   // well past any duration
      expect(t.content).toBe('alpha\nbeta\ngamma');
      stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stays quiet while the door says it is busy', () => {
    jest.useFakeTimers();
    try {
      const t = target('alpha\nbeta');
      const stop = attachGlitches(t, UPROUGH_NEON, () => {}, {
        tickMs: 10,
        random: () => 0.01,
        now: () => 1_000_000,
        isBusy: () => true,
      });
      jest.advanceTimersByTime(500);
      expect(t.content).toBe('alpha\nbeta');
      stop();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('glitching a list rather than a box', () => {
  const { attachGlitches, glitchTargetFor } = require('../../engines/ui/theme/glitch-runner');
  const { UPROUGH_NEON } = require('../../engines/ui/theme/tokens');

  /** A blessed List as far as the runner is concerned. */
  function listLike(items: string[]) {
    return {
      items: [...items],
      setItems(next: string[]) { this.items = next; },
      // A real List has this too, and it is the trap: what is written to it
      // is discarded the moment the list repaints from `items`.
      getContent() { return this.items.join('\n'); },
      setContent(_t: string) { /* discarded on render, as blessed does */ },
    };
  }

  it('damages the items, because setContent is thrown away on a list', () => {
    // The first version wrote to setContent and nothing was ever visible -
    // reported as "uprough neon is active, i see no glitches".
    const list = listLike(['alpha', 'beta', 'gamma']);
    glitchTargetFor(list).setContent('one\ntwo\nthree');
    expect(list.items).toEqual(['one', 'two', 'three']);
  });

  it('reads the rows back out of the items', () => {
    expect(glitchTargetFor(listLike(['alpha', 'beta'])).getContent()).toBe('alpha\nbeta');
  });

  it('leaves a content-shaped element alone', () => {
    const box = { getContent: () => 'x', setContent: (_t: string) => {} };
    expect(glitchTargetFor(box)).toBe(box);
  });

  it('actually changes a list on screen, and puts it back', () => {
    jest.useFakeTimers();
    try {
      const list = listLike(['alpha', 'beta', 'gamma']);
      const stop = attachGlitches(list, UPROUGH_NEON, () => {}, {
        tickMs: 10, random: () => 0.01, now: () => 1_000_000,
      });

      jest.advanceTimersByTime(10);
      expect(list.items.join('\n')).not.toBe('alpha\nbeta\ngamma');

      jest.advanceTimersByTime(1_000);
      expect(list.items.join('\n')).toBe('alpha\nbeta\ngamma');
      stop();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the wider range of glitches', () => {
  const { damageRow, isColourOnly } = require('../../engines/ui/theme/glitch');
  const { glitchLines } = require('../../engines/ui/theme/glitch-runner');
  const { UPROUGH_NEON } = require('../../engines/ui/theme/tokens');

  const ALL = ['scramble', 'shift', 'dropout', 'tear', 'blocks', 'caseflip', 'invert', 'fade'] as const;
  const ROW = '| DOORREPO      4096 archives      3:42 |';

  it.each(ALL)('%s keeps the row exactly as wide', (kind) => {
    // Still the rule that matters most, now across eight kinds rather than
    // four. A wider row would push a border out of true and the repair
    // would not put it back.
    const out = damageRow(ROW, kind, seeded());
    expect(out).toHaveLength(ROW.length);
  });

  it.each(ALL)('%s survives an empty row', (kind) => {
    expect(damageRow('', kind, seeded())).toBe('');
  });

  it.each(ALL)('%s leaves the width alone once rendered', (kind) => {
    const out = glitchLines([ROW], { row: 0, kind }, UPROUGH_NEON, seeded());
    expect(out[0].replace(/\{[^}]*\}/g, '')).toHaveLength(ROW.length);
  });

  it('recolours rather than rewrites for the colour-only kinds', () => {
    for (const kind of ['tear', 'invert', 'fade'] as const) {
      expect({ kind, colourOnly: isColourOnly(kind) }).toEqual({ kind, colourOnly: true });
      expect({ kind, text: damageRow(ROW, kind, seeded()) }).toEqual({ kind, text: ROW });
    }
  });

  it('gives each colour-only kind a different look', () => {
    // Three kinds that all left the text alone would be one kind shown
    // three times.
    const rendered = (['tear', 'invert', 'fade'] as const).map(kind =>
      glitchLines([ROW], { row: 0, kind }, UPROUGH_NEON, seeded())[0]);
    expect(new Set(rendered).size).toBe(3);
  });

  /** A random source that walks a fixed sequence, so kinds are comparable. */
  function seeded() {
    const values = [0.13, 0.71, 0.42, 0.88, 0.05, 0.6, 0.33, 0.97];
    let i = 0;
    return () => values[i++ % values.length];
  }
});

describe('the chrome the mockups specified', () => {
  const {
    mastheadLine, railFrame, sweepFrames, leaderProgress, selectionMark, attachRail, LEADER_CHAR,
  } = require('../../engines/ui/theme/chrome');
  const { UPROUGH_NEON, QUIET_PHOSPHOR } = require('../../engines/ui/theme/tokens');

  describe('the masthead', () => {
    it('lays the rail, title, leader and value out across the width', () => {
      const line = mastheadLine(60, '/////', 'DOORREPO', '4096');
      expect(line).toHaveLength(60);
      expect(line.startsWith('///// DOORREPO')).toBe(true);
      expect(line.endsWith('4096')).toBe(true);
      expect(line).toContain(LEADER_CHAR);
    });

    it('is always exactly the width it was given', () => {
      // A masthead that overran would wrap and take the row below with it.
      for (const width of [10, 20, 40, 80, 132]) {
        expect({ width, len: mastheadLine(width, '///', 'A TITLE', '99').length })
          .toEqual({ width, len: width });
      }
    });

    it('trims the title rather than the value when space runs out', () => {
      // The value is a count or a clock; half a number is worse than none.
      const line = mastheadLine(18, '///', 'A VERY LONG TITLE INDEED', '4096');
      expect(line).toHaveLength(18);
      expect(line).toContain('4096');
      expect(line.startsWith('///')).toBe(true);
    });

    it('works for a theme with no rail at all', () => {
      const line = mastheadLine(40, '', 'CLASSIC', '7');
      expect(line).toHaveLength(40);
      expect(line.trimStart().startsWith('CLASSIC')).toBe(true);
    });

    it('survives a width of nothing', () => {
      expect(mastheadLine(0, '///', 'X', 'Y')).toBe('');
    });
  });

  describe('the rail cycle', () => {
    it('shifts the slashes along and comes back round', () => {
      const frames = [0, 1, 2, 3].map(t => railFrame('///', t));
      expect(frames[0]).toBe('///');
      expect(frames[1]).toBe(' //');
      expect(frames[2]).toBe('  /');
      expect(frames[3]).toBe('///');   // wrapped
    });

    it('keeps every frame the same width', () => {
      // The rail sits in a fixed slot; a shorter frame would let the line
      // behind it show through.
      for (let t = 0; t < 12; t++) {
        expect({ t, len: railFrame('/////', t).length }).toEqual({ t, len: 5 });
      }
    });

    it('does nothing for a theme with no rail', () => {
      expect(railFrame('', 3)).toBe('');
    });
  });

  describe('the entry sweep', () => {
    it('travels the rail across the width', () => {
      const frames = sweepFrames('///', 30);
      expect(frames.length).toBeGreaterThan(1);
      expect(frames[0].indexOf('/')).toBeLessThan(frames[frames.length - 1].indexOf('/'));
    });

    it('keeps every frame exactly the width', () => {
      for (const f of sweepFrames('/////', 40)) expect(f).toHaveLength(40);
    });

    it('is a handful of frames, not a loading bar', () => {
      expect(sweepFrames('///', 80).length).toBeLessThanOrEqual(8);
    });
  });

  describe('the leader as a progress bar', () => {
    it('fills from the left as the work advances', () => {
      expect(leaderProgress(10, 0, 10).trim()).toBe('');
      expect(leaderProgress(10, 10, 10)).toBe(LEADER_CHAR.repeat(10));
      expect(leaderProgress(10, 5, 10).indexOf(' ')).toBe(5);
    });

    it('is always the width it was given', () => {
      for (const done of [0, 3, 7, 10, 99]) {
        expect({ done, len: leaderProgress(12, done, 10).length }).toEqual({ done, len: 12 });
      }
    });

    it('reads a total of nothing as full rather than dividing by zero', () => {
      expect(leaderProgress(5, 0, 0)).toBe(LEADER_CHAR.repeat(5));
    });
  });

  describe('the selection marker', () => {
    it('is drawn only where there is no selection block to see', () => {
      // Quiet Phosphor has no borders and no highlight block - it needs a
      // mark to say where the cursor is. The others do not.
      expect(selectionMark(QUIET_PHOSPHOR)).toBe('▍');
      expect(selectionMark(UPROUGH_NEON)).toBe('');
      expect(selectionMark(CLASSIC)).toBe('');
    });
  });

  describe('running the rail', () => {
    it('starts no timer for a theme with no rail', () => {
      let drawn = 0;
      const stop = attachRail({ setContent: () => { drawn++; } }, CLASSIC, () => {}, {
        line: (r: string) => r,
      });
      expect(drawn).toBe(0);
      stop();
    });

    it('moves the rail and leaves it whole when stopped', () => {
      jest.useFakeTimers();
      try {
        let content = '';
        const stop = attachRail(
          { setContent: (t: string) => { content = t; } },
          UPROUGH_NEON,
          () => {},
          { tickMs: 100, line: (r: string) => `[${r}]` }
        );

        jest.advanceTimersByTime(100);
        expect(content).toBe(`[${railFrame(UPROUGH_NEON.rail, 1)}]`);

        stop();
        // Left as drawn, not mid-shift.
        expect(content).toBe(`[${UPROUGH_NEON.rail}]`);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

describe('the right-aligned masthead', () => {
  const { mastheadLine, railPattern } = require('../../engines/ui/theme/chrome');

  it('puts the headline at the end and slashes all the way to it', () => {
    // "right align the headline and pad with ////// it will look cooler" -
    // the mark stops being a prefix and becomes the bar the title rides on.
    const line = mastheadLine(40, '/////', 'DOORMAN', '', 'right');
    expect(line).toHaveLength(40);
    expect(line.trimEnd().endsWith('DOORMAN')).toBe(true);
    expect(line.startsWith('/////')).toBe(true);
    expect(line.indexOf(' ')).toBeGreaterThan(20);
  });

  it('fills the run with a continuous pattern, not marks with gaps', () => {
    expect(railPattern('///', 12)).toBe('////////////');
    expect(railPattern('/////', 7)).toBe('///////');
    expect(railPattern('', 5)).toBe('');
    expect(railPattern('///', 0)).toBe('');
  });

  it('keeps a right-hand value beside the headline', () => {
    const line = mastheadLine(50, '///', 'DOORREPO', '4096', 'right');
    expect(line).toHaveLength(50);
    expect(line.trimEnd().endsWith('4096')).toBe(true);
    expect(line).toContain('DOORREPO');
  });

  it('is still exactly the width when there is barely room', () => {
    for (const width of [8, 12, 20, 80]) {
      expect({ width, len: mastheadLine(width, '///', 'A LONG HEADLINE', '', 'right').length })
        .toEqual({ width, len: width });
    }
  });

  it('leaves the left-aligned form alone', () => {
    // The default must not move: doors already draw with it.
    const left = mastheadLine(40, '///', 'TITLE', '9');
    expect(left.startsWith('/// TITLE')).toBe(true);
  });
});

describe('the bar that scans and the bar that arrives', () => {
  const { scanSegment, barGrowFrames, railPattern } = require('../../engines/ui/theme/chrome');

  it('lights a short segment that travels along the bar', () => {
    // A run of identical slashes cannot show motion by shifting - `/////`
    // moved a column is still `/////`. The bar holds still and the
    // brightness moves.
    const a = scanSegment(40, 0);
    const b = scanSegment(40, 5);
    expect(a.start).toBe(0);
    expect(b.start).toBe(5);
    expect(b.end - b.start).toBe(a.end - a.start);
  });

  it('wraps round rather than running off the end', () => {
    const at = scanSegment(10, 12);
    expect(at.start).toBe(2);
    expect(at.end).toBeLessThanOrEqual(10);
  });

  it('never points outside the bar', () => {
    for (let t = 0; t < 50; t++) {
      const { start, end } = scanSegment(20, t, 4);
      expect({ t, ok: start >= 0 && end <= 20 && end > start }).toEqual({ t, ok: true });
    }
  });

  it('survives a bar of no width', () => {
    expect(scanSegment(0, 3)).toEqual({ start: 0, end: 0 });
  });

  it('draws the bar in, ending on the full run', () => {
    const frames = barGrowFrames('///', 30, 5);
    expect(frames).toHaveLength(5);
    expect(frames[0].trimEnd().length).toBeLessThan(frames[4].trimEnd().length);
    expect(frames[4]).toBe(railPattern('///', 30));
  });

  it('keeps every entry frame the same width', () => {
    for (const f of barGrowFrames('/////', 44)) expect(f).toHaveLength(44);
  });
});

describe('a spaced rail, which is what lets the bar move', () => {
  const { railPattern } = require('../../engines/ui/theme/chrome');

  it('puts a gap between the marks', () => {
    expect(railPattern('/', 9, 1)).toBe('/ / / / /');
    expect(railPattern('/', 8, 1)).toBe('/ / / / ');
  });

  it('travels when it is offset, which a solid run cannot', () => {
    // The whole reason for the gap: `/////` shifted a column is `/////`.
    const solidA = railPattern('/', 10, 0, 0);
    const solidB = railPattern('/', 10, 0, 1);
    expect(solidA).toBe(solidB);            // solid cannot show motion

    const spacedA = railPattern('/', 10, 1, 0);
    const spacedB = railPattern('/', 10, 1, 1);
    expect(spacedA).not.toBe(spacedB);      // spaced can
  });

  it('is always exactly the width asked for, at any offset', () => {
    for (let offset = 0; offset < 8; offset++) {
      expect({ offset, len: railPattern('//', 33, 2, offset).length })
        .toEqual({ offset, len: 33 });
    }
  });

  it('still draws a solid run when no gap is asked for', () => {
    expect(railPattern('///', 12)).toBe('////////////');
  });

  it('survives nonsense', () => {
    expect(railPattern('', 5, 1)).toBe('');
    expect(railPattern('/', 0, 1)).toBe('');
  });
});

describe('the irregular slash stream', () => {
  const { railStream } = require('../../engines/ui/theme/chrome');

  it('makes runs and gaps of varying length', () => {
    // `///////////// //// /////////// / ///////` rather than an even rule.
    const bar = railStream('/', 80, 0, 7);
    const runs = bar.split(' ').filter(Boolean).map((r: string) => r.length);
    expect(runs.length).toBeGreaterThan(2);
    expect(new Set(runs).size).toBeGreaterThan(1);   // not all the same
  });

  it('is the SAME pattern scrolled, not a new one each frame', () => {
    // The whole trick. Re-randomising per frame would flicker; scrolling a
    // fixed ring travels.
    const a = railStream('/', 40, 0, 3);
    const b = railStream('/', 40, 1, 3);
    expect(a).not.toBe(b);                            // it moved
    expect(b.slice(0, 39)).toBe(a.slice(1, 40));      // by exactly one cell
  });

  it('is stable for a given seed', () => {
    expect(railStream('/', 50, 5, 9)).toBe(railStream('/', 50, 5, 9));
  });

  it('gives different boards different bars', () => {
    expect(railStream('/', 50, 0, 1)).not.toBe(railStream('/', 50, 0, 2));
  });

  it('is always exactly the width, at any offset', () => {
    for (const offset of [0, 1, 17, 63, 200, 1000]) {
      expect({ offset, len: railStream('/', 37, offset, 4).length })
        .toEqual({ offset, len: 37 });
    }
  });

  it('never runs out or shows a seam of nothing', () => {
    // A window near the end of the ring must wrap into the start rather
    // than falling short and padding with space.
    for (let offset = 0; offset < 400; offset += 7) {
      const bar = railStream('/', 60, offset, 11);
      expect({ offset, hasMarks: bar.includes('/') }).toEqual({ offset, hasMarks: true });
    }
  });

  it('survives nonsense', () => {
    expect(railStream('', 10)).toBe('');
    expect(railStream('/', 0)).toBe('');
  });
});

describe('the muted themes spend colour in one place', () => {
  const { SLATE_MUTED, NEON_MUTED, SLATE_SLASH } = require('../../engines/ui/theme/tokens');

  /** Every distinct hue a theme can put on screen. */
  function hues(theme: any): Set<string> {
    const t = theme.tokens;
    return new Set([t.ink, t.dim, t.accent, t.accentAlt, t.ok, t.warn, t.alert]);
  }

  it.each([['slate-muted', SLATE_MUTED], ['neon-muted', NEON_MUTED]] as const)(
    '%s uses fewer hues than the loud version',
    (_id, muted) => {
      // "there are too many colors in the themes" - the loud themes spend
      // accent, accentAlt, ok, warn and alert on five different hues, and a
      // door that uses all five puts all five on screen.
      expect(hues(muted).size).toBeLessThan(hues(SLATE_SLASH).size);
    }
  );

  it.each([['slate-muted', SLATE_MUTED], ['neon-muted', NEON_MUTED]] as const)(
    '%s makes a secondary value dim rather than a second colour',
    (_id, muted) => {
      expect(muted.tokens.accentAlt).toBe(muted.tokens.dim);
    }
  );

  it.each([['slate-muted', SLATE_MUTED], ['neon-muted', NEON_MUTED]] as const)(
    '%s still lets an alert mean something',
    (_id, muted) => {
      // Restraint everywhere except the one place restraint would cost
      // information.
      expect(muted.tokens.alert).toBe(muted.tokens.accent);
      expect(muted.tokens.alert).not.toBe(muted.tokens.ink);
    }
  );

  it('leaves the loud themes exactly as they were', () => {
    // Added ALONGSIDE, not instead: "keep the current ones but make the
    // toned down versions as well".
    expect(SLATE_SLASH.tokens.accentAlt).toBe('#4DE0F0');
    expect(THEMES.map((t: any) => t.id)).toContain('slate-slash');
    expect(THEMES.map((t: any) => t.id)).toContain('uprough-neon');
  });

  it('offers both versions of each direction in the picker', () => {
    const ids = THEMES.map((t: any) => t.id);
    expect(ids).toEqual([
      'classic', 'slate-slash', 'slate-muted',
      'uprough-neon', 'neon-muted', 'quiet-phosphor', 'phosphor-muted',
    ]);
  });

  it('gives the phosphor theme a genuinely single-hue version', () => {
    // The original is not monochrome: accentAlt, warn and alert are gold,
    // so a value beside a label lands as a gold number on a green row.
    const { QUIET_PHOSPHOR, PHOSPHOR_MUTED } = require('../../engines/ui/theme/tokens');
    expect(QUIET_PHOSPHOR.tokens.accentAlt).toBe('#F5C451');       // gold
    expect(PHOSPHOR_MUTED.tokens.accentAlt).toBe(PHOSPHOR_MUTED.tokens.dim);

    // Every colour it can show is a green, so brightness carries everything.
    const t = PHOSPHOR_MUTED.tokens;
    for (const [name, value] of Object.entries({
      ink: t.ink, dim: t.dim, accent: t.accent, accentAlt: t.accentAlt,
      ok: t.ok, warn: t.warn, alert: t.alert,
    })) {
      const [, r, g, b] = /^#(\w\w)(\w\w)(\w\w)$/.exec(value as string)!;
      expect({ name, greenest: parseInt(g, 16) >= parseInt(r, 16) && parseInt(g, 16) >= parseInt(b, 16) })
        .toEqual({ name, greenest: true });
    }
  });

  it('shows the phosphor selection by brightness, not by a block', () => {
    // Direction C described the row brightening with a marker beside it; a
    // highlight block would be the one loud thing on a calm screen.
    const { PHOSPHOR_MUTED } = require('../../engines/ui/theme/tokens');
    expect(PHOSPHOR_MUTED.tokens.selectionBg).toBe(PHOSPHOR_MUTED.tokens.ground);
    expect(PHOSPHOR_MUTED.tokens.selectionInk).not.toBe(PHOSPHOR_MUTED.tokens.ink);
  });
});

describe('the gaps between glitches are irregular', () => {
  const { drawGap, BURST_GAP_MS, MIN_GAP_MS, GAP_SPREAD_MS } = require('../../engines/ui/theme/glitch');

  it('is not the same wait every time', () => {
    // "the glitches seem to fire at regular intervals" - a fixed floor plus
    // a high chance per tick fires almost the moment the floor expires, so
    // the effect was a metronome however the dice fell.
    const gaps = new Set<number>();
    let seed = 0.05;
    const wandering = () => { seed = (seed * 7.13 + 0.31) % 1; return seed; };
    for (let i = 0; i < 40; i++) gaps.add(drawGap(wandering));

    expect(gaps.size).toBeGreaterThan(8);
  });

  it('sometimes lets one tread on the heels of the last', () => {
    // Real faults arrive in clusters, and the clusters are most of what
    // makes this read as a machine in trouble rather than a timer.
    expect(drawGap(() => 0.01)).toBe(BURST_GAP_MS);
  });

  it('sometimes waits a long time', () => {
    // The other end: a squared draw means long gaps are rare but real.
    const long = drawGap(() => 0.99);
    expect(long).toBeGreaterThan(MIN_GAP_MS + GAP_SPREAD_MS * 0.9);
  });

  it('favours short gaps over long ones', () => {
    // Squaring biases the draw towards the short end; a uniform draw would
    // still read as evenly spaced, just at a different tempo.
    const mid = drawGap(() => 0.5);
    expect(mid).toBeLessThan(MIN_GAP_MS + GAP_SPREAD_MS / 2);
  });

  it('never returns a gap of nothing', () => {
    for (const r of [0, 0.29, 0.31, 0.5, 0.999]) {
      expect({ r, gap: drawGap(() => r) > 0 }).toEqual({ r, gap: true });
    }
  });
});

describe('a door hands the terminal back', () => {
  const { createScreen } = require('../../utils/blessed-helpers');

  it('resets the colours and erases what it painted', () => {
    // "bg colors still leak when i exit typescript doors". ESC[0m does not
    // unpaint cells that are ALREADY coloured - it only affects what is
    // drawn afterwards - so resetting at the BBS prompt could never clean
    // up a screen the door had already filled.
    const written: string[] = [];
    const bbs: any = {
      write: (t: string) => written.push(t),
      connectionType: 'web',
      getTerminalSize: () => ({ width: 80, height: 25 }),
    };

    const screen: any = createScreen(bbs, { title: 'test' });
    written.length = 0;
    screen.destroy();

    const out = written.join('');
    expect(out).toContain('\x1b[0m');
    expect(out).toContain('\x1b[2J');
  });

  it('resets BEFORE it erases, or the erase paints in the leaked colour', () => {
    // ESC[2J erases using the CURRENT background. Clearing first would
    // repaint the whole screen in the very colour being escaped from -
    // which is how a board went entirely blue once already.
    const written: string[] = [];
    const bbs: any = {
      write: (t: string) => written.push(t),
      connectionType: 'web',
      getTerminalSize: () => ({ width: 80, height: 25 }),
    };

    const screen: any = createScreen(bbs, { title: 'test' });
    written.length = 0;
    screen.destroy();

    // blessed emits its OWN clear on destroy first, in whatever colours the
    // door left set - so the check is not "the first reset precedes the
    // first clear" but that our pair is emitted together, reset first. That
    // pair is what lands last and therefore what the user is left looking
    // at.
    const out = written.join('');
    expect(out).toContain('\x1b[0m\x1b[2J');
    expect(out.trimEnd().endsWith('\x1b[H')).toBe(true);
  });
});

/**
 * A frame must be visible in every theme.
 *
 * The sysop, on the new themes: "they removed all panel borders? some apps
 * rely on those." They are not removed - a `border: 'none'` theme paints the
 * rule in the GROUND colour, so it is there but invisible. That is the
 * intended look for a box that groups rows, and wrong for anything drawn ON
 * TOP of other content: a dialog with no frame and the same background puts
 * its text amongst the text it is covering.
 *
 * `frame` is the role for those. This is its whole invariant.
 */
describe('the frame role stays visible', () => {
  const { themeStyles, THEMES } = require('../../engines/ui/theme');

  it('covers every theme the board ships', () => {
    // A loop over an empty list would pass every assertion below.
    expect(THEMES.length).toBeGreaterThanOrEqual(7);
  });

  for (const theme of require('../../engines/ui/theme').THEMES) {
    it(`draws a visible frame border under ${theme.id}`, () => {
      const s = themeStyles(theme);
      const border = s.frame.style.border?.fg;
      expect(border).toBeTruthy();
      expect(border).not.toBe(s.frame.style.bg);
      expect(border).not.toBe(theme.tokens.ground);
    });

    it(`keeps ${theme.id}'s panel free to be borderless`, () => {
      // panel is NOT frame: the phosphor themes are still allowed to sink a
      // decorative box into the ground. Losing that would delete the look
      // the themes were liked for.
      const s = themeStyles(theme);
      const expected = theme.border === 'none' ? theme.tokens.ground : theme.tokens.chrome;
      expect(s.panel.style.border?.fg).toBe(expected);
    });
  }
});

/**
 * A modal must not blend into the screen it covers.
 *
 * This is the case the frame role exists for. Under quiet-phosphor a plain
 * panel's border is painted in the ground colour on purpose; a dialog
 * inheriting that would put its text amongst the text underneath it, with
 * nothing to say where one ends and the other begins.
 */
describe('dialogs under a borderless theme', () => {
  const { themeStyles, themeById } = require('../../engines/ui/theme');
  const { ConfirmModal } = require('../../engines/ui/blessed/widgets/confirm-modal');

  for (const id of ['quiet-phosphor', 'phosphor-muted', 'classic']) {
    it(`gives a modal a border distinct from its own surface under ${id}`, () => {
      const s = themeStyles(themeById(id));
      const modal: any = new ConfirmModal({ themeStyles: s, message: 'Delete this file?' });

      // Not merely "different from the background" - cyan-on-black passes
      // that while ignoring the theme entirely. The colours must BE the
      // theme's frame.
      expect(modal.style.border.fg).toBe(s.frame.style.border.fg);
      expect(modal.style.bg).toBe(s.frame.style.bg);
      expect(modal.style.border.fg).not.toBe(modal.style.bg);
      expect(modal.style.border.fg).not.toBe(themeById(id).tokens.ground);
    });
  }

  it('leaves a modal that was given no theme exactly as it was', () => {
    // Existing callers pass no theme and must not change.
    const modal: any = new ConfirmModal({ message: 'Delete this file?' });
    expect(modal.style.border.fg).toBe('cyan');
    expect(modal.style.bg).toBe('black');
  });
});
