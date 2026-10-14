/**
 * WEBTERM - the web terminal settings of W (internal rows 17-22).
 *
 * One list, SDK widgets only (door-three-screens): modem speed, terminal font,
 * PETSCII 80 colours, PETSCII character set, view my data, delete my account.
 * Everything comes from, and goes to, the board through the nine BBSApi
 * methods; the door holds no rule of its own (the erasure checks, the five
 * refused passwords, what a font may be on a PETSCII screen are the board's).
 *
 * Repaint: a changed value sets only the list lines that differ; a view change
 * swaps the list once.
 */
import { createTerminalModeSwitch } from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import { createScreen, createBox, createList, borrowListKeys } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { themeStyles, themeById, attachDoorChrome, footerStyle, type Theme } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/door-input-manager';
import { getCompactProfile, Prompt } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { WebTerminalState } from '@amiexpress/bbs-door-sdk/core/types';
import { ROWS, rowLines, dataLines, clip, type RowId } from './layout';

interface DoorSession { bbs: any; bbsSession?: any }
export interface WebTerminal { rows(): string[]; note(): string; stop(): void; done: Promise<void> }

const HINTS = [{ key: 'Up/Down', does: 'Move' }, { key: 'Enter', does: 'Change' }, { key: 'Esc', does: 'Back' }];
const COMPACT_HINTS = [{ key: 'Enter', does: 'Change' }, { key: 'Esc', does: 'Back' }];

export async function startWebTerminal(session: DoorSession): Promise<WebTerminal> {
  const { bbs } = session;
  const theme: Theme = bbs?.getTheme ? bbs.getTheme() : themeById('classic');
  const s = themeStyles(theme);
  const screen = createScreen(bbs, { title: 'Web terminal' });
  const width = ((screen as any).width as number) || 80;
  const height = ((screen as any).height as number) || 24;
  const compact = getCompactProfile(width);
  const rowWidth = Math.max(20, width - 1);
  const terminalMode = createTerminalModeSwitch({ bbs, screen, start: 'fixed', onRelayout: () => { screen.render(); } });
  const input = new DoorInputManager(session as any, screen, { enableGameMode: false, enableGrabKeys: false, enableMouse: true });
  input.enable();

  const statusRows = compact.collapseChrome ? 1 : 2;
  const masthead = createBox({
    parent: screen, top: 0, left: 0, width: '100%', height: 1, border: undefined, focusable: false, content: '',
    style: { fg: theme.tokens.dim, bg: theme.tokens.ground },
  });
  const list = createList({
    parent: screen, top: 1, left: 0, width: '100%', height: Math.max(3, height - 2 - statusRows),
    keys: false, vi: false, mouse: true, tags: true, border: undefined,
    style: { selected: s.list.style.selected, item: { fg: theme.tokens.dim } }, items: [],
  });
  // This door binds its own keys (it moves by row, not by line).
  borrowListKeys(list);
  const statusBox = createBox({
    parent: screen, top: height - 1 - statusRows, left: 0, width: '100%', height: statusRows, border: undefined,
    focusable: false, tags: false, content: '', style: s.plain.style,
  });
  const footer = createBox({
    parent: screen, bottom: 0, left: 0, width: '100%', height: 1, border: undefined, focusable: false, clickable: false, mouse: false,
    style: footerStyle(theme), content: '',
  });
  const chrome = attachDoorChrome(theme, {
    width, title: 'WEB TERMINAL', masthead: masthead as any, footer: footer as any,
    hints: HINTS, compactHints: COMPACT_HINTS, footerPad: ' ', styles: s, render: () => screen.render(),
  } as never);

  let state: WebTerminalState = bbs.webTerminalSettings();
  let painted: string[] = [];
  /** Which row each list line belongs to (two lines a row at 40). */
  let owner: RowId[] = [];
  let view: 'rows' | 'data' = 'rows';
  let noteText = '';
  let stopped = false;
  let leaveNow: (end?: boolean) => void = () => { /* bound below */ };
  let endNow: () => void = () => { /* bound below */ };

  const note = (text: string): void => { noteText = text; statusBox.setContent(clip(` ${text}`, rowWidth)); screen.render(); };
  const linesNow = (): { lines: string[]; owner: RowId[] } => {
    const lines: string[] = []; const own: RowId[] = [];
    for (const r of ROWS) for (const l of rowLines(r.id, state, width)) { lines.push(l); own.push(r.id); }
    return { lines, owner: own };
  };
  const setBody = (items: string[], at = 0): void => { painted = items.slice(); (list as any).setItems(items); (list as any).select(at); screen.render(); };
  const showRows = (at = 0): void => { view = 'rows'; const v = linesNow(); owner = v.owner; setBody(v.lines, at); };
  /** A value changed: re-read the board's state and set only the lines that differ. */
  const refresh = (): void => {
    state = bbs.webTerminalSettings();
    const v = linesNow();
    v.lines.forEach((text, i) => { if (painted[i] !== text) { painted[i] = text; (list as any).setItem(i, text); } });
    screen.render();
  };
  const selected = (): number => Math.max(0, Number((list as any).selected ?? 0));
  const ask = (title: string, text: string, value = '', censor = false): Promise<string | null> =>
    new Promise((resolve) => {
      const p = new Prompt({
        parent: screen, top: 'center', left: 'center', width: Math.min(width - 2, 44),
        border: { type: 'line' }, label: ` ${title} `, text, value, tags: false, censor,
      } as any);
      (p as any).showInput(undefined, undefined, (err: Error | null, v?: string) => {
        try { (p as any).destroy?.(); } catch { /* already gone */ }
        if (!stopped) list.focus();
        resolve(err || v === undefined ? null : String(v));
      });
    });
  const pick = async (title: string, choices: string[]): Promise<number | null> => {
    const typed = await ask(title, choices.map((c, i) => `${i + 1}> ${c}`).join('\n') + '\nNumber:');
    const n = typed === null ? NaN : parseInt(typed, 10);
    return Number.isInteger(n) && n >= 1 && n <= choices.length ? n - 1 : null;
  };

  const act = async (id: RowId): Promise<void> => {
    switch (id) {
      case 'modem': {
        const i = await pick('Modem emulation speed', bbs.modemSpeedChoices());
        if (i !== null && await bbs.chooseModemSpeed(i)) refresh();
        return;
      }
      case 'font': {
        if (state.fontFixedNotice) { note(state.fontFixedNotice); return; }
        const fonts: Array<{ id: string; label: string }> = bbs.terminalFontChoices();
        const i = await pick('Terminal font', fonts.map(f => f.label));
        if (i !== null) { const r = await bbs.chooseTerminalFont(fonts[i].id); refresh(); if (r === 'petscii') note(state.fontFixedNotice); }
        return;
      }
      case 'palette': await bbs.togglePetsciiPalette(); refresh(); return;
      case 'charset': { const r = await bbs.togglePetsciiCharset(); refresh(); note(r.notice); return; }
      case 'data': view = 'data'; setBody(dataLines(bbs.myData(), width)); note('Esc returns to the list.'); return;
      case 'erase': {
        const confirm = await ask('Delete my account', 'This cannot be undone. Type YES ERASE to continue:');
        if (confirm === null) return;
        const password = await ask('Delete my account', 'Your password:', '', true);
        if (password === null) return;
        const username = await ask('Delete my account', 'Your username, to confirm:');
        if (username === null) return;
        const answers = { confirm, password, username };
        const checked = await bbs.eraseMyAccount(answers, { check: true });
        if (!checked.ok) { note(checked.reason); return; }
        // The board writes the erasure lines and drops the line; the door
        // clears its screen first, reads nothing of the user afterwards and
        // holds execute() open until the board has finished (the settings
        // resume runs when it resolves).
        leaveNow(false);
        try { await bbs.eraseMyAccount(answers); } finally { endNow(); }
        return;
      }
    }
  };

  const finished = new Promise<void>((resolve) => {
    const leave = (end = true): void => {
      if (stopped) return;
      stopped = true;
      try { chrome.stop(); } catch { /* leaving anyway */ }
      try { input.disable(); } catch { /* leaving anyway */ }
      terminalMode.dispose();
      try { screen.destroy(); } catch { /* leaving anyway */ }
      try { bbs.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h'); } catch { /* leaving anyway */ }
      if (end) resolve();
    };
    leaveNow = leave;
    endNow = resolve;
    const guard = (fn: () => Promise<void> | void) => async (): Promise<void> => {
      try { await fn(); } catch (err) { if (!stopped) note(`Something went wrong: ${(err as Error).message}`); }
    };
    const activate = guard(async () => { if (view === 'rows') await act(owner[selected()]); });
    (list as any).on('select', activate);
    screen.key(['enter', 'space'], activate);
    /** Move by ROW, not by line: at 40 a row is two lines and the value line is not a stop. */
    const move = (by: number) => guard(() => {
      if (view !== 'rows') return;
      const here = owner[selected()];
      const order = ROWS.map(r => r.id);
      const next = order[Math.min(Math.max(order.indexOf(here) + by, 0), order.length - 1)];
      const to = owner.indexOf(next);
      if (to !== selected()) (list as any).select(to);
      screen.render();
    });
    screen.key(['up'], move(-1));
    screen.key(['down'], move(1));
    screen.key(['escape', 'q', 'Q'], guard(() => { if (view === 'data') { showRows(owner.indexOf('data')); note(''); return; } leave(); }));
  });

  showRows();
  list.focus();
  screen.render();
  return { rows: () => painted.slice(), note: () => noteText, stop: () => { leaveNow(); }, done: finished };
}

export async function createApp(session: DoorSession): Promise<void> {
  const door = await startWebTerminal(session);
  await door.done;
}
export async function runDoor(bbs: any, session?: DoorSession): Promise<void> {
  await createApp({ ...(session || {}), bbs } as DoorSession);
}
export default runDoor;
