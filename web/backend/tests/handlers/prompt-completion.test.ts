/**
 * Ghost-text completion at the main prompt.
 *
 * "Just a discreet auto fill/complete with dark grey that you can tab to
 * complete words in the prompt", covering every door and every internal
 * command, at the main prompt and nowhere else.
 *
 * The rules themselves live in the DOOR (Doors/prompt-complete) and are
 * tested there against the same cases as the C implementation. What is
 * pinned here is the BBS half: that the feature is OFF unless a door
 * supplies it, that the list offered is what would actually run, and that
 * the drawing puts the cursor back where it was.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  renderGhost,
  promptCommandNames,
  promptGhost,
  promptComplete,
  promptCompleteNth,
  resetPromptCompleter,
  __setCompleterForTests,
  COMPLETER_TOOLTYPE,
} from '../../src/handlers/command-handler/prompt-completion';
import { INTERNAL_COMMAND_NAMES } from '../../src/handlers/command-handler/internal-command-names';
import { commandCache } from '../../src/handlers/command-execution.handler';

describe('the prompt is unchanged when no completer door is installed', () => {
  beforeEach(() => {
    commandCache.bbscmd.clear();
    resetPromptCompleter();
  });

  it('offers nothing', async () => {
    // The whole point of shipping this as a door: delete it and the prompt
    // is exactly what it was.
    expect(await promptGhost('/nonexistent', 'jo')).toBe('');
  });

  it('leaves TAB alone', async () => {
    expect(await promptComplete('/nonexistent', 'jo')).toBe('jo');
  });

  it('does not re-scan on every keystroke', async () => {
    // "Looked and found nothing" is cached too, or a board without the door
    // pays for a scan per character typed.
    const spy = jest.spyOn(commandCache.bbscmd, 'values');
    await promptGhost('/nonexistent', 'j');
    await promptGhost('/nonexistent', 'jo');
    await promptGhost('/nonexistent', 'joi');
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });
});

describe('what the prompt can complete to', () => {
  beforeEach(() => {
    commandCache.bbscmd.clear();
    resetPromptCompleter();
  });

  it('offers the doors this board has registered', () => {
    commandCache.bbscmd.set('DOORREPO', { name: 'DOORREPO' } as any);
    commandCache.bbscmd.set('GMASTER', { name: 'GMASTER' } as any);

    const names = promptCommandNames();

    expect(names).toContain('DOORREPO');
    expect(names).toContain('GMASTER');
  });

  it('offers the internal commands too, which are in no directory', () => {
    // express.e:4732 - these are answered by the BBS itself, so listing a
    // command directory can never find them.
    const names = promptCommandNames();
    expect(names).toContain('J');
    expect(names).toContain('G');
  });

  it('offers each name once, in a stable order', () => {
    // A suggestion that reshuffles between keystrokes reads as a glitch.
    commandCache.bbscmd.set('J', { name: 'J' } as any);   // also an internal name

    const names = promptCommandNames();

    expect(names.filter(n => n === 'J')).toHaveLength(1);
    expect([...names]).toEqual([...names].sort());
  });
});

describe('drawing the suggestion', () => {
  it('leaves the cursor where the typing is', () => {
    // The grey tail is drawn AFTER the cursor, so the cursor has to come
    // back or the next character lands past it.
    const out = renderGhost('STALL');
    expect(out).toContain('STALL');
    expect(out.endsWith('\x1b[5D')).toBe(true);
  });

  it('uses dark grey, and stops using it', () => {
    const out = renderGhost('IN');
    expect(out).toContain('\x1b[90m');   // bright black
    expect(out).toContain('\x1b[0m');    // and back to normal
  });

  it('erases the previous suggestion', () => {
    // Typing a letter can make the tail shorter; without the erase the old
    // one's tail stays on screen.
    expect(renderGhost('X')).toContain('\x1b[K');
    expect(renderGhost('')).toBe('\x1b[K');
  });
});

describe('the wiring', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/handlers/command.handler.ts'), 'utf8'
  );

  it('completes on TAB', () => {
    expect(source).toContain("data === '\\t'");
    expect(source).toContain('promptComplete');
  });

  it('lives in READ_COMMAND and nowhere else', () => {
    // The main prompt only. Both targets read every line through one
    // function, so a suggestion added there would turn up in search terms,
    // filenames and password fields.
    // Both names appear more than once in this file, so anchor on the
    // branch itself and on the `else if` that closes it.
    const branchStart = source.indexOf(
      'if (session.subState === LoggedOnSubState.READ_COMMAND) {'
    );
    expect(branchStart).toBeGreaterThan(0);
    const branchEnd = source.indexOf(
      '} else if (session.subState === LoggedOnSubState.READ_SHORTCUTS) {',
      branchStart
    );
    expect(branchEnd).toBeGreaterThan(branchStart);

    // Every mention of the completion is inside that one branch.
    for (const marker of ['promptGhost', 'promptComplete', 'renderGhost']) {
      let at = source.indexOf(marker);
      while (at !== -1) {
        expect({ marker, insideReadCommand: at > branchStart && at < branchEnd })
          .toEqual({ marker, insideReadCommand: true });
        at = source.indexOf(marker, at + 1);
      }
    }
  });

  it('names the tooltype a door declares itself with', () => {
    expect(COMPLETER_TOOLTYPE).toBe('PROMPTCOMPLETE');
  });
});

describe('the internal command list cannot drift', () => {
  it('matches the switch it was copied from', () => {
    // A hand-maintained copy of a switch statement drifts the first time
    // somebody adds a case. This re-parses the switch and fails when the
    // two disagree - add a case, run this, add it to the list.
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/handlers/command.handler.ts'), 'utf8'
    );
    const start = source.indexOf('  switch (command) {');
    expect(start).toBeGreaterThan(0);

    const body = source.slice(start, start + 90000);
    const cases: string[] = [];
    for (const m of body.matchAll(/^\s*case '([A-Z?0-9]+)':/gm)) {
      if (!cases.includes(m[1])) cases.push(m[1]);
    }

    expect(cases.length).toBeGreaterThan(20);
    expect([...INTERNAL_COMMAND_NAMES].sort()).toEqual([...cases].sort());
  });
});

describe('pressing TAB again when the first guess was wrong', () => {
  // The door's own suite covers the completion RULES against the same cases
  // as the C implementation. What is covered here is the BBS half: that the
  // press index reaches the completer and that wrapping is honoured.
  const fake = {
    ghost: () => '',
    complete: (buffer: string, names: readonly string[]) =>
      names.find(n => n.toLowerCase().startsWith(buffer.toLowerCase())) ?? buffer,
    candidates: (buffer: string, names: readonly string[]) =>
      names.filter(n => n.toLowerCase().startsWith(buffer.toLowerCase())),
    completeNth: (buffer: string, names: readonly string[], index: number) => {
      const c = names.filter(n => n.toLowerCase().startsWith(buffer.toLowerCase()));
      if (c.length === 0) return buffer;
      return c[((index % c.length) + c.length) % c.length];
    },
  };

  beforeEach(() => {
    commandCache.bbscmd.clear();
    commandCache.bbscmd.set('DOORREPO', { name: 'DOORREPO' } as any);
    commandCache.bbscmd.set('DOORS', { name: 'DOORS' } as any);
    __setCompleterForTests(fake);
  });

  afterEach(() => resetPromptCompleter());

  it('advances through the candidates instead of repeating one', async () => {
    // "the autocomplete door doesnt autocomplete DOORS, it autocompletes to
    // DOOR". Both are real commands and "do" is genuinely ambiguous, so the
    // first answer cannot always be right - what matters is that there is a
    // way onwards that is not deleting and retyping.
    const seen: string[] = [];
    for (let press = 0; press < 3; press++) {
      seen.push((await promptCompleteNth('/unused', 'do', press)).line);
    }

    expect(new Set(seen).size).toBeGreaterThan(1);
    expect(seen).toContain('DOORS');
  });

  it('wraps rather than running out', async () => {
    const { line, count } = await promptCompleteNth('/unused', 'do', 0);
    expect(count).toBeGreaterThan(1);
    expect((await promptCompleteNth('/unused', 'do', count)).line).toBe(line);
  });

  it('does nothing when no completer door is installed', async () => {
    __setCompleterForTests(null);
    expect((await promptCompleteNth('/unused', 'do', 3)).line).toBe('do');
  });

  it('still works with a completer door that predates cycling', async () => {
    // completeNth and candidates are optional on the interface; an older
    // door just always answers the first candidate rather than failing.
    // Whatever that first candidate is, every press gives the same answer -
    // which is the point being pinned, not the name itself.
    __setCompleterForTests({ ghost: fake.ghost, complete: fake.complete } as any);
    const first = (await promptCompleteNth('/unused', 'do', 0)).line;
    const later = (await promptCompleteNth('/unused', 'do', 2)).line;
    expect(later).toBe(first);
    expect(first).not.toBe('do');
  });
});
