/**
 * NOTIFY - choose how the board reaches you.
 *
 * Three views, one model, SDK widgets only (door-three-screens):
 *
 *   Events    a row per event the caller may receive; Email / Push / Board
 *             cells in full words, Left/Right pick the channel, Space cycles
 *             it, Enter opens the event.
 *   Detail    the three channels one per row; for a file event, the
 *             conferences the caller may follow.
 *   Delivery  email address and its verification, push, quiet hours, time
 *             zone, digest, pause, a test.
 *
 * Everything the door knows comes through bbs.notifications(), which acts on
 * the session's own user. The door holds no table, no address of anyone else
 * and no credential. Repaint: a cursor move or a cell change sets the content
 * of the rows that changed and nothing else (the blessed screen then writes
 * only changed cells); a view change swaps the list once.
 */
import { createTerminalModeSwitch } from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import { createScreen, createBox, createList, borrowListKeys } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { themeStyles, themeById, attachDoorChrome, footerStyle, type Theme } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/door-input-manager';
import { getCompactProfile, Prompt } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { nextMode } from '@amiexpress/bbs-door-sdk/formats/notify';
import type {
  DoorNotificationsApi, NotifyCatalogue, NotifyChannel, NotifyMode, NotifySettings, NotifyState,
} from '@amiexpress/bbs-door-sdk/formats/notify';
import {
  CHANNELS, COMPACT_HINTS, HELP_LINES, HINTS, buildEventRows, clip, columnPlan, deliveryRows, detailRows, digestWords,
  eventRowText, explainVerify, followRows, headerText, parseDigest, parseQuiet, prefsFromRows, quietWords, CHANNEL_WORD,
} from './layout';
import type { DeliveryId, EventRow } from './layout';

type View = 'events' | 'detail' | 'delivery' | 'help';

interface DoorSession {
  bbs: any;
  user?: { username?: string; email?: string };
  bbsSession?: any;
}

export interface Notify {
  /** The list as the caller sees it, tags and all. */
  rows(): string[];
  view(): View;
  note(): string;
  stop(): void;
  /** Resolves when the caller leaves. */
  done: Promise<void>;
}

export async function startNotify(session: DoorSession): Promise<Notify> {
  const { bbs } = session;
  const theme: Theme = bbs?.getTheme ? bbs.getTheme() : themeById('classic');
  const s = themeStyles(theme);
  const api: DoorNotificationsApi | null = bbs?.notifications ? bbs.notifications() : null;

  const screen = createScreen(bbs, { title: 'Notifications' });
  const width = ((screen as any).width as number) || 80;
  const height = ((screen as any).height as number) || 24;
  const compact = getCompactProfile(width);
  const plan = columnPlan(width);
  const rowWidth = Math.max(20, width - 1);

  const terminalMode = createTerminalModeSwitch({ bbs, screen, start: 'fixed', onRelayout: () => { screen.render(); } });
  const input = new DoorInputManager(session as any, screen, { enableGameMode: false, enableGrabKeys: false, enableMouse: true });
  input.enable();

  // Rows: masthead, [column heads], body, status (2 rows; 1 at 40), footer.
  const headRows = plan.compact ? 0 : 1;
  const statusRows = compact.collapseChrome ? 1 : 2;
  const bodyTop = 1 + headRows;
  const bodyHeight = Math.max(3, height - bodyTop - statusRows - 1);

  const mastheadRow = createBox({
    parent: screen, top: 0, left: 0, width: '100%', height: 1, border: undefined, focusable: false, content: '',
    style: { fg: theme.tokens.dim, bg: theme.tokens.ground },
  });
  const headRow = createBox({
    parent: screen, top: 1, left: 0, width: '100%', height: 1, border: undefined, focusable: false, tags: true, content: '',
    style: { fg: theme.tokens.dim, bg: theme.tokens.ground },
  });
  const list = createList({
    parent: screen, top: bodyTop, left: 0, width: '100%', height: bodyHeight,
    keys: false, vi: false, mouse: true, tags: true, border: undefined,
    style: { selected: s.list.style.selected, item: { fg: theme.tokens.dim } },
    items: [],
  });
  // createList turns the list's own keys on whatever is asked; this door binds
  // its own (the list jumps on letters and reads Space as Enter), so they are
  // taken off for good and never given back.
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
    width, title: 'NOTIFICATIONS', masthead: mastheadRow as any, footer: footer as any,
    hints: HINTS, compactHints: COMPACT_HINTS, footerPad: ' ', styles: s, render: () => screen.render(),
  } as never);

  // ------------------------------------------------------------ the model

  let cat: NotifyCatalogue = { events: [], deliverable: { email: false, push: false, board: true }, conferences: [], boardZone: 'UTC' };
  let state: NotifyState | null = null;
  let rows: EventRow[] = [];
  let view: View = 'events';
  let active: NotifyChannel = 'email';
  let openEvent = 0;
  let noteText = '';
  let painted: string[] = [];
  /** The Delivery view's row ids, in order. */
  let deliveryIds: DeliveryId[] = [];
  let stopped = false;
  let leaveNow: () => void = () => { /* set once the keys are bound */ };

  const selected = (): number => Math.max(0, Number((list as any).selected ?? 0));
  const web = (): boolean => (bbs?.connectionType ?? 'web') === 'web';

  const note = (text: string): void => {
    noteText = text;
    refreshStatus();
    screen.render();
  };

  const refreshStatus = (): void => {
    const lines: string[] = [];
    if (view === 'events' && rows[selected()] && !compact.collapseChrome) {
      const r = rows[selected()];
      lines.push(clip(` ${r.label}${r.blurb ? ': ' + r.blurb : ''}`, rowWidth));
    }
    lines.push(clip(` ${noteText}`, rowWidth));
    statusBox.setContent(lines.slice(-statusRows).join('\n'));
  };

  /** Replace what the list shows: a real view change, so one swap. */
  const setBody = (items: string[], at = 0): void => {
    painted = items.slice();
    (list as any).setItems(items);
    (list as any).select(Math.min(at, Math.max(0, items.length - 1)));
    refreshStatus();
    screen.render();
  };

  /** Change one row. Nothing else is touched. */
  const setRow = (i: number, text: string): void => {
    if (painted[i] === text) return;
    painted[i] = text;
    (list as any).setItem(i, text);
  };

  const eventText = (i: number): string => eventRowText(rows[i], plan, i === selected() && view === 'events' ? active : undefined);
  const repaintEvent = (i: number): void => { if (rows[i]) setRow(i, eventText(i)); };

  const detailItems = (): string[] => {
    const r = rows[openEvent];
    const items = detailRows(r, rowWidth, undefined);
    if (r.followsConference) items.push(clip(' Conferences you follow:', rowWidth), ...followRows(cat.conferences, state?.follows ?? [], rowWidth));
    return items;
  };

  const settingsRows = (): Array<{ id: DeliveryId; text: string }> => deliveryRows({
    address: state?.email.address ?? null, verified: state?.email.verified ?? false,
    emailDeliverable: cat.deliverable.email, pushDeliverable: cat.deliverable.push, web: web(),
    settings: state!.settings, boardZone: cat.boardZone,
  }, rowWidth);

  const show = (next: View): void => {
    view = next;
    if (next === 'events') {
      headRow.setContent(headerText(plan));
      setBody(rows.map((_, i) => eventRowText(rows[i], plan, undefined)), openEvent);
      repaintEvent(selected());
    } else if (next === 'detail') {
      headRow.setContent(headRows ? ` ${rows[openEvent].label}` : '');
      setBody(detailItems(), 0);
    } else if (next === 'delivery') {
      headRow.setContent(headRows ? ' Delivery' : '');
      const r = settingsRows();
      deliveryIds = r.map((x) => x.id);
      setBody(r.map((x) => x.text), 0);
    } else {
      headRow.setContent(headRows ? ' Help' : '');
      setBody(HELP_LINES.map((l) => clip(` ${l}`, rowWidth)), 0);
    }
    screen.render();
  };

  /** Re-read the caller's state; used on entry and after a refused save. */
  const load = async (): Promise<boolean> => {
    if (!api) return false;
    cat = await api.catalogue();
    state = await api.get();
    rows = buildEventRows(cat.events, state.prefs, cat.deliverable);
    return true;
  };

  /** Write the model back. A refusal is shown and the model reloaded, so the screen never lies. */
  const save = async (settings: NotifySettings = state!.settings): Promise<boolean> => {
    const res = await api!.set(prefsFromRows(rows), settings);
    if (res.ok) { state = res.state; return true; }
    note(res.error);
    await load();
    return false;
  };

  // ------------------------------------------------------------ actions

  /** A prompt, awaited. null when cancelled. */
  const ask = (title: string, text: string, value = ''): Promise<string | null> =>
    new Promise((resolve) => {
      const p = new Prompt({
        parent: screen, top: 'center', left: 'center', width: Math.min(width - 2, 44),
        border: { type: 'line' }, label: ` ${title} `, text, value, tags: false,
      } as any);
      (p as any).showInput(undefined, undefined, (err: Error | null, v?: string) => {
        try { (p as any).destroy?.(); } catch { /* already gone */ }
        list.focus();
        resolve(err || v === undefined ? null : String(v).trim());
      });
    });

  const cycleCell = async (i: number, channel: NotifyChannel): Promise<void> => {
    const r = rows[i];
    if (!r) return;
    const cell = r.cells[channel];
    if (cell === 'na') { note(r.why[channel] ?? 'That is not available.'); return; }
    const before = cell;
    r.cells[channel] = nextMode(cell as NotifyMode);
    if (view === 'events') repaintEvent(i); else setRow(CHANNELS.indexOf(channel), detailRows(r, rowWidth)[CHANNELS.indexOf(channel)]);
    screen.render();
    if (!(await save())) { r.cells[channel] = before; show(view); }
    else note(`${r.label}: ${CHANNEL_WORD[channel]} ${r.cells[channel] === 'off' ? 'is off' : 'is ' + String(r.cells[channel])}.`);
  };

  const toggleFollow = async (conferenceIndex: number): Promise<void> => {
    const c = cat.conferences[conferenceIndex];
    if (!c || !state) return;
    const next = state.follows.includes(c.id) ? state.follows.filter((x) => x !== c.id) : [...state.follows, c.id];
    const res = await api!.follow(next);
    if (!res.ok) { note(res.error); return; }
    state = { ...state, follows: res.follows };
    setRow(3 + 1 + conferenceIndex, followRows(cat.conferences, state.follows, rowWidth)[conferenceIndex]);
    screen.render();
  };

  const verifyAddress = async (): Promise<void> => {
    if (!cat.deliverable.email) { note('Email is not set up on this board.'); return; }
    let address = state!.email.address;
    const typed = await ask('Email address', 'A code will be mailed there.\nAddress:', address ?? '');
    if (!typed) return;
    if (typed.toLowerCase() !== (address ?? '').toLowerCase()) {
      if (!(await bbs.setUserEmail?.(typed))) { note('That is not an address.'); return; }
      address = typed;
    } else if (state!.email.verified) {
      note('That address is already verified.');
      return;
    }
    const sent = await api!.startEmailVerification();
    if (!sent.ok) { note(`${explainVerify(sent.reason)}${sent.error ? ' ' + sent.error : ''}`); await load(); show('delivery'); return; }
    for (;;) {
      const code = await ask('Mailed code', `A six digit code was mailed to\n${clip(sent.email, 40)}\nEnter it:`);
      if (!code) break;
      const done = await api!.confirmEmail(code);
      if (done.ok) { note('Address verified.'); break; }
      note(explainVerify(done.reason, done.attemptsLeft));
      if (done.reason !== 'wrong') break;
    }
    await load();
    show('delivery');
  };

  const editQuiet = async (): Promise<void> => {
    const typed = await ask('Quiet hours', `Now: ${quietWords(state!.settings)}\nFrom and to (22:00 to 07:00), or none:`);
    if (typed === null) return;
    const parsed = parseQuiet(typed);
    if (!parsed.ok) { note(parsed.error); return; }
    if (await save({ ...state!.settings, ...parsed.value })) show('delivery');
  };

  const editZone = async (): Promise<void> => {
    const typed = await ask('Time zone', `Now: ${state!.settings.timeZone ?? cat.boardZone + ' (board)'}\nZone (Europe/Stockholm), or blank:`);
    if (typed === null) return;
    if (await save({ ...state!.settings, timeZone: typed === '' ? null : typed })) show('delivery');
  };

  const editDigest = async (): Promise<void> => {
    const typed = await ask('Digest', `Now: ${digestWords(state!.settings)}\ndaily 8, or weekly monday 18:`);
    if (typed === null) return;
    const parsed = parseDigest(typed);
    if (!parsed.ok) { note(parsed.error); return; }
    if (await save({ ...state!.settings, ...parsed.value })) show('delivery');
  };

  const sendTest = async (): Promise<void> => {
    const fallback: NotifyChannel = state!.email.verified && cat.deliverable.email ? 'email' : 'board';
    const typed = await ask('Send a test', 'Which channel? email or board:', fallback);
    if (!typed) return;
    const channel = typed.toLowerCase();
    if (!(CHANNELS as readonly string[]).includes(channel)) { note('Type email, push or board.'); return; }
    const res = await api!.test(channel as NotifyChannel);
    note(res.ok ? res.detail : res.error);
  };

  const pickDelivery = async (id: DeliveryId): Promise<void> => {
    switch (id) {
      case 'email': await verifyAddress(); return;
      case 'push': note(web() ? 'Push is not available on this board yet.' : 'Push needs the web terminal.'); return;
      case 'quiet': await editQuiet(); return;
      case 'zone': await editZone(); return;
      case 'digest': await editDigest(); return;
      case 'pause':
        if (await save({ ...state!.settings, paused: !state!.settings.paused })) { show('delivery'); note(state!.settings.paused ? 'Everything is paused.' : 'Notifications resumed.'); }
        return;
      case 'test': await sendTest(); return;
    }
  };

  // ------------------------------------------------------------ keys

  const finished = new Promise<void>((resolve) => {
    const leave = (): void => {
      if (stopped) return;
      stopped = true;
      try { chrome.stop(); } catch { /* leaving anyway */ }
      try { input.disable(); } catch { /* leaving anyway */ }
      terminalMode.dispose();
      try { screen.destroy(); } catch { /* leaving anyway */ }
      try { bbs.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h'); } catch { /* leaving anyway */ }
      resolve();
    };
    leaveNow = leave;

    const guard = (fn: () => Promise<void> | void) => async (): Promise<void> => {
      try { await fn(); } catch (err) { note(`Something went wrong: ${(err as Error).message}`); }
    };

    const back = (): void => {
      if (view === 'events') { leave(); return; }
      show('events');
    };

    (list as any).on('select item', (_item: unknown, index: number) => {
      if (view !== 'events') { refreshStatus(); return; }
      // The old row loses its inverse cell, the new one gains it; no other row is touched.
      for (let i = 0; i < rows.length; i++) if (i !== index) repaintEvent(i);
      repaintEvent(index);
      refreshStatus();
      screen.render();
    });
    // The list's own keys are off: it jumps on letters and turns Space into
    // Enter, and this door gives both meanings of its own.
    const activate = guard(async () => {
      const i = selected();
      if (view === 'events') { openEvent = i; show('detail'); return; }
      if (view === 'delivery') { await pickDelivery(deliveryIds[i]); return; }
      if (view === 'detail') await actDetail(i);
    });
    (list as any).on('select', activate);
    screen.key(['enter'], activate);
    const move = (by: number) => guard(() => {
      const to = Math.min(Math.max(selected() + by, 0), Math.max(0, painted.length - 1));
      if (to !== selected()) (list as any).select(to);
      screen.render();
    });
    screen.key(['up'], move(-1));
    screen.key(['down'], move(1));
    screen.key(['pageup'], move(-10));
    screen.key(['pagedown'], move(10));

    const actDetail = async (i: number): Promise<void> => {
      if (i < 3) { await cycleCell(openEvent, CHANNELS[i]); return; }
      if (i >= 4) await toggleFollow(i - 4);
    };

    screen.key(['escape', 'x', 'X'], guard(back));
    screen.key(['left'], guard(() => {
      if (view !== 'events') return;
      active = CHANNELS[(CHANNELS.indexOf(active) + CHANNELS.length - 1) % CHANNELS.length];
      repaintEvent(selected()); screen.render();
    }));
    screen.key(['right'], guard(() => {
      if (view !== 'events') return;
      active = CHANNELS[(CHANNELS.indexOf(active) + 1) % CHANNELS.length];
      repaintEvent(selected()); screen.render();
    }));
    screen.key(['space'], guard(async () => {
      if (view === 'events') await cycleCell(selected(), active);
      else if (view === 'detail') await actDetail(selected());
      else if (view === 'delivery' && deliveryIds[selected()] === 'pause') await pickDelivery('pause');
    }));
    screen.key(['f1', '?', 'h', 'H'], guard(() => show('help')));
    screen.key(['f2', 'a', 'A'], guard(() => { show('delivery'); }));
    screen.key(['f3', 'q', 'Q'], guard(async () => { show('delivery'); await editQuiet(); }));
    screen.key(['f4', 't', 'T'], guard(sendTest));
  });

  // ------------------------------------------------------------ start

  if (!api) {
    noteText = 'This board has no notification service.';
    show('help');
  } else {
    await load();
    show('events');
    list.focus();
  }
  refreshStatus();
  screen.render();

  return {
    rows: () => painted.slice(),
    view: () => view,
    note: () => noteText,
    stop: () => { leaveNow(); },
    done: finished,
  };
}

export async function createApp(session: DoorSession): Promise<void> {
  const door = await startNotify(session);
  await door.done;
}

export async function runDoor(bbs: any, session?: DoorSession): Promise<void> {
  await createApp({ ...(session || {}), bbs } as DoorSession);
}

export default runDoor;
