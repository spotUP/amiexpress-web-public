/**
 * ACHIEVE - your achievements, and this board's link to your global profile.
 *
 * One screen, THEME's shape: a masthead, a menu list, a content panel and
 * a footer. The menu is the door; each entry paints the panel. Everything
 * the door knows comes through bbs.achievements(), which the board answers
 * with its own key - the door never holds a credential and never names an
 * address other than the caller's own.
 *
 * The account path is ONE road: register (a code is mailed), enter the
 * code, and the link is made at once with the link code the verify
 * answer carries - the caller types one thing. A player already verified
 * elsewhere walks the same road: register mails a fresh code, and the
 * link code that comes back links THIS board.
 */
import { createTerminalModeSwitch } from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import { createScreen, createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import {
  themeStyles, themeById, attachDoorChrome, footerStyle, type Theme,
} from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/door-input-manager';
import { getCompactProfile, Prompt } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { CompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// ---------------------------------------------------------------------------
// The shapes the server answers with (a copy of the contract's, the few
// fields this door reads; the door has no build-time link to the backend).
// ---------------------------------------------------------------------------

export interface UnlockOut { id: string; name: string; tier: string; points: number; hidden: boolean; rarityPctTenths: number; at: string }
export interface ProgressOut { id: string; have: number; need: number }
export interface PlayerProfile {
  handle: string; verified: boolean; private: boolean; points: number; linkedBoards: string[];
  unlocks: UnlockOut[]; progress: ProgressOut[]; linkCode?: string; linkCodeExpiresAt?: string;
}
export interface CatalogAchievement { id: string; name: string; description: string; family: string; tier: string; points: number; hidden: boolean; rarityPctTenths: number; rarityBucket: string }
export interface CatalogResponse { revision: string; achievements: CatalogAchievement[] }
export interface LeaderboardRow { rank: number; handle: string; points: number; unlocks: number }
export interface LeaderboardResponse { scope: string; period: string; season: string | null; rows: LeaderboardRow[] }
export interface ApiResult<T> { status: number; body: T | null; error?: string; detail?: string }

interface DoorSession {
  bbs: any;
  user?: { username?: string; email?: string };
}

export type AccountState =
  | { kind: 'unknown' }
  | { kind: 'off' }
  | { kind: 'no-email' }
  | { kind: 'not-linked'; email: string }
  | { kind: 'linked'; email: string; profile: PlayerProfile };

// ---------------------------------------------------------------------------
// Pure builders - what the panel and the menu say, tested at 40 and 80.
// ---------------------------------------------------------------------------

const TIER_TAG: Record<string, string> = { bronze: 'BRZ', silver: 'SLV', gold: 'GLD', platinum: 'PLT' };

/** Clip to the panel, never fold: a folded row eats the row underneath it. */
export function clip(text: string, width: number): string {
  return text.length > width ? text.slice(0, Math.max(0, width - 1)) + '~' : text;
}

/** The menu, as the state allows. */
export function menuItems(state: AccountState, compact: CompactProfile): Array<{ id: string; label: string }> {
  const short = compact.singleColumn;
  const account =
    state.kind === 'linked' ? (short ? `Account: ${state.profile.handle}` : `Account: linked as ${state.profile.handle}`)
    : state.kind === 'off' ? 'Account: not available here'
    : (short ? 'Account: link this board' : 'Account: register and link this board');
  return [
    { id: 'profile', label: short ? 'Your achievements' : 'Your achievements and progress' },
    { id: 'catalog', label: short ? 'Catalog' : 'The catalog, by family' },
    { id: 'board', label: short ? 'Board scoreboard' : "This board's scoreboard" },
    { id: 'global', label: short ? 'Global scoreboard' : 'The global scoreboard' },
    { id: 'account', label: account },
    { id: 'quit', label: short ? 'Leave' : 'Leave the door' },
  ];
}

/** The caller's own page: points, every unlock, and what is close. */
export function profileLines(p: PlayerProfile, width: number): string[] {
  const out: string[] = [];
  out.push(clip(`${p.handle}  ${p.points} points  ${p.unlocks.length} unlocked${p.private ? '  (private)' : ''}`, width));
  out.push(clip(`Linked boards: ${p.linkedBoards.join(', ') || 'none'}`, width));
  out.push('');
  if (p.unlocks.length === 0) out.push('No achievements yet. Post, upload, call back tomorrow.');
  for (const u of p.unlocks) out.push(clip(`[${TIER_TAG[u.tier] ?? u.tier.slice(0, 3).toUpperCase()}] ${u.name}  ${u.points} pts`, width));
  if (p.progress.length > 0) {
    out.push('');
    out.push('Closest:');
    for (const pr of p.progress.slice(0, 10)) out.push(clip(`  ${pr.id}  ${pr.have}/${pr.need}`, width));
  }
  return out;
}

/** The families in the catalog, in first-seen order. */
export function familiesOf(catalog: CatalogResponse): string[] {
  const seen: string[] = [];
  for (const a of catalog.achievements) if (!seen.includes(a.family)) seen.push(a.family);
  return seen;
}

/** The whole catalog grouped by family; a withheld hidden one shows as the server sent it (???). */
export function catalogLines(catalog: CatalogResponse, width: number, unlocked: Set<string> = new Set()): string[] {
  const out: string[] = [];
  for (const family of familiesOf(catalog)) {
    out.push(`== ${family.toUpperCase()} ==`);
    for (const a of catalog.achievements.filter((x) => x.family === family)) {
      const mark = unlocked.has(a.id) ? '*' : ' ';
      const tag = TIER_TAG[a.tier] ?? a.tier.slice(0, 3).toUpperCase();
      const line = width <= 40
        ? `${mark}[${tag}] ${a.name}`
        : `${mark}[${tag}] ${a.name.padEnd(20).slice(0, 20)} ${a.description}`;
      out.push(clip(line, width));
    }
    out.push('');
  }
  return out;
}

export function leaderboardLines(lb: LeaderboardResponse, width: number): string[] {
  const out: string[] = [];
  const where = lb.scope === 'global' ? 'Global' : 'This board';
  out.push(clip(`${where}, ${lb.period === 'season' ? `season ${lb.season ?? ''}` : 'all time'}`, width));
  out.push('');
  if (lb.rows.length === 0) out.push('Nobody on the board yet.');
  for (const r of lb.rows) {
    const handle = width <= 40 ? r.handle.slice(0, 16).padEnd(16) : r.handle.padEnd(20).slice(0, 20);
    out.push(clip(`${String(r.rank).padStart(3)}. ${handle} ${String(r.points).padStart(5)} pts ${String(r.unlocks).padStart(3)}`, width));
  }
  return out;
}

/** A refusal or a fault, in the caller's words. */
export function explain(result: ApiResult<unknown>): string {
  switch (result.error) {
    case undefined: return '';
    case 'not_configured': return 'This board has no achievements server configured.';
    case 'not_linked': return 'This board is not linked to your account yet.';
    case 'unverified_player': return 'Verify your address first: enter the mailed code.';
    case 'bad_code': return 'That code is not the one this address is waiting for.';
    case 'code_expired': return 'That code has expired; a new one was requested.';
    case 'code_burned': return 'Too many wrong tries; a new code was requested.';
    case 'handle_taken': return 'That handle belongs to someone else on the server.';
    case 'bad_handle': return 'A handle is 3 to 16 characters, letters and digits.';
    case 'bad_email': return 'That is not an address the server can mail.';
    case 'rate_limited': return 'Too many requests; try again in a minute.';
    case 'unreachable': case 'timeout': return 'The achievements server did not answer.';
    case 'not_json': return 'The achievements server is not answering as itself.';
    case 'unauthenticated': case 'board_suspended': return 'This board is not accepted by the server (sysop: check the key).';
    default: return result.detail ? clip(result.detail, 70) : `The server said ${result.error}.`;
  }
}

export function footerHints(compact: CompactProfile, inView: boolean): Array<{ key: string; does: string }> {
  if (inView) {
    return compact.collapseChrome
      ? [{ key: 'Up/Dn', does: 'Scroll' }, { key: 'Q', does: 'Back' }]
      : [{ key: 'Up/Down', does: 'Scroll' }, { key: 'Q', does: 'Back to the menu' }];
  }
  return compact.collapseChrome
    ? [{ key: 'Up/Dn', does: 'Pick' }, { key: 'Ent', does: 'Open' }, { key: 'Q', does: 'Bye' }]
    : [{ key: 'Up/Down', does: 'Choose' }, { key: 'Enter', does: 'Open' }, { key: 'Q', does: 'Leave' }];
}

// ---------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------

export async function createApp(session: DoorSession): Promise<void> {
  const { bbs } = session;
  const theme: Theme = bbs?.getTheme ? bbs.getTheme() : themeById('classic');
  const s = themeStyles(theme);
  const api = bbs?.achievements ? bbs.achievements() : null;

  const screen = createScreen(bbs, { title: 'Achievements' });
  const screenWidth = ((screen as any).width as number) || 80;
  const screenHeight = ((screen as any).height as number) || 24;
  const compact = getCompactProfile(screenWidth);
  const panelWidth = Math.max(20, screenWidth - 1);

  const terminalMode = createTerminalModeSwitch({ bbs, screen, start: 'fixed', onRelayout: () => { screen.render(); } });
  const input = new DoorInputManager(session as any, screen, { enableGameMode: false, enableGrabKeys: false, enableMouse: true });
  input.enable();

  const mastheadRow = createBox({
    parent: screen, top: 0, left: 0, width: '100%', height: 1, border: undefined, focusable: false, content: '',
    style: { fg: theme.tokens.dim, bg: theme.tokens.ground },
  });

  let state: AccountState = api ? (api.enabled() ? { kind: 'unknown' } : { kind: 'off' }) : { kind: 'off' };
  let items = menuItems(state, compact);

  const menuRows = items.length;
  const list = createList({
    parent: screen, top: 2, left: 0, width: '100%', height: menuRows,
    keys: true, vi: true, mouse: true, tags: true, border: undefined,
    style: { selected: s.list.style.selected, item: { fg: theme.tokens.dim } },
    items: items.map((i) => ` ${s.ink(i.label)}`),
  });

  const panelTop = 2 + menuRows + 1;
  const panelHeight = Math.max(3, screenHeight - panelTop - 2);
  const panel = createBox({
    parent: screen, top: panelTop, left: 0, width: '100%', height: panelHeight,
    border: undefined, focusable: false, tags: false, content: '', style: s.plain.style,
  });
  const noteRow = createBox({
    parent: screen, top: screenHeight - 2, left: 0, width: '100%', height: 1, border: undefined, focusable: false,
    content: '', style: s.plain.style,
  });
  const footer = createBox({
    parent: screen, bottom: 0, left: 0, width: '100%', height: 1, border: undefined, focusable: false, clickable: false, mouse: false,
    style: footerStyle(theme), content: '',
  });

  let inView = false;
  let viewLines: string[] = [];
  let viewOffset = 0;
  const chromeOptions = {
    width: screenWidth, title: 'ACHIEVEMENTS', masthead: mastheadRow as any, footer: footer as any,
    hints: footerHints(compact, false), footerPad: ' ', glitch: panel, glitchOptions: { tickMs: 600 }, showcase: true, styles: s,
    render: () => screen.render(),
  };
  let chrome = attachDoorChrome(theme, chromeOptions as never);

  // The footer only. Re-attaching the whole chrome to change one line put
  // the rail back to frame zero on every Enter (sysop, 2026-09-07).
  const setHints = (): void => { chrome.setHints(footerHints(compact, inView)); };
  const note = (text: string): void => { noteRow.setContent(`  ${text}`); screen.render(); };
  const paint = (): void => {
    const rows = viewLines.slice(viewOffset, viewOffset + panelHeight).map((l) => clip(l, panelWidth));
    panel.setContent(rows.join('\n'));
    screen.render();
  };
  const show = (lines: string[]): void => { viewLines = lines; viewOffset = 0; inView = true; setHints(); paint(); };
  const refreshMenu = (): void => {
    items = menuItems(state, compact);
    (list as any).setItems(items.map((i) => ` ${s.ink(i.label)}`));
    screen.render();
  };

  /** A prompt, awaited. null when cancelled. */
  const ask = (title: string, text: string, value = ''): Promise<string | null> =>
    new Promise((resolve) => {
      // No height: the widget knows what its own children need, and asking
      // for less than that drew the buttons on top of the input field - the
      // `@` of an email address was the first thing they covered.
      const p = new Prompt({
        parent: screen, top: 'center', left: 'center', width: Math.min(screenWidth - 2, 44),
        border: { type: 'line' }, label: ` ${title} `, text, value, tags: false,
      } as any);
      (p as any).showInput(undefined, undefined, (err: Error | null, v?: string) => {
        // The dialog is finished with; leaving it parented keeps a hidden
        // element with live key handlers on the screen for the whole session.
        try { (p as any).destroy?.(); } catch { /* already gone */ }
        list.focus();
        resolve(err || v === undefined ? null : String(v).trim());
      });
    });

  const email = (): string => (session.user?.email ?? bbs?.getUser?.()?.email ?? '').trim();

  /** What the server says about the caller now; sets the state. */
  const refreshState = async (): Promise<void> => {
    if (!api || !api.enabled()) { state = { kind: 'off' }; return; }
    const addr = email();
    if (!addr) { state = { kind: 'no-email' }; return; }
    const res: ApiResult<PlayerProfile> = await api.profile(addr);
    state = res.status === 200 && res.body ? { kind: 'linked', email: addr, profile: res.body } : { kind: 'not-linked', email: addr };
  };

  /** The one road: address, register, code, verify, link. */
  const account = async (): Promise<void> => {
    if (!api || !api.enabled()) { show(['This board has no achievements server configured.', 'Ask the sysop.']); return; }
    let addr = email();
    if (!addr) {
      const typed = await ask('Your email', 'A code will be mailed there.\nAddress:');
      if (!typed) return;
      if (!(await bbs.setUserEmail?.(typed))) { note(s.alert ? s.alert('That is not an address.') : 'That is not an address.'); return; }
      addr = typed;
    }
    if (state.kind === 'linked') {
      const p = state.profile;
      show([
        `Linked as ${p.handle}.`, '',
        `Profile: ${p.private ? 'private (off the global lists)' : 'public'}`,
        `Boards: ${p.linkedBoards.join(', ')}`, '',
        'P = toggle private   L = link code for another board   U = unlink this board',
      ]);
      return;
    }
    let handle = (session.user?.username ?? 'caller').replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 16) || 'caller';
    for (;;) {
      const reg: ApiResult<unknown> = await api.register(addr, handle);
      if (reg.status === 202) break;
      if (reg.error === 'handle_taken' || reg.error === 'bad_handle') {
        const next = await ask('Handle', `${explain(reg)}\nPick another handle:`, handle);
        if (!next) return;
        handle = next;
        continue;
      }
      show([explain(reg)]);
      return;
    }
    const code = await ask('Mailed code', `A six-character code was mailed to\n${clip(addr, 40)}\nEnter it:`);
    if (!code) return;
    const ver: ApiResult<PlayerProfile> = await api.verify(addr, code);
    if (ver.status !== 200 || !ver.body) { show([explain(ver)]); return; }
    const linkCode = ver.body.linkCode;
    const linked: ApiResult<PlayerProfile> = linkCode ? await api.link(addr, linkCode) : { status: 0, body: null, error: 'bad_code' };
    if (linked.status !== 200) { show([explain(linked)]); return; }
    await refreshState();
    refreshMenu();
    show([`Verified and linked as ${ver.body.handle}.`, 'This board now reports what you do here.', '', 'Your first achievements arrive within a minute.']);
  };

  const open = async (id: string): Promise<void> => {
    if (!api) return;
    switch (id) {
      case 'profile': {
        if (state.kind === 'unknown') await refreshState();
        if (state.kind !== 'linked') { show(['Not linked yet.', '', 'Open Account to register and link this board.']); return; }
        const res: ApiResult<PlayerProfile> = await api.profile(state.email);
        if (res.status !== 200 || !res.body) { show([explain(res)]); return; }
        state = { kind: 'linked', email: state.email, profile: res.body };
        show(profileLines(res.body, panelWidth));
        return;
      }
      case 'catalog': {
        const res: ApiResult<CatalogResponse> = await api.catalog();
        if (res.status !== 200 || !res.body) { show([explain(res)]); return; }
        const mine = new Set(state.kind === 'linked' ? state.profile.unlocks.map((u) => u.id) : []);
        show(catalogLines(res.body, panelWidth, mine));
        return;
      }
      case 'board':
      case 'global': {
        const res: ApiResult<LeaderboardResponse> = await api.leaderboard(id === 'global' ? 'global' : 'board', 'all', 50);
        if (res.status !== 200 || !res.body) { show([explain(res)]); return; }
        show(leaderboardLines(res.body, panelWidth));
        return;
      }
      case 'account':
        await account();
        return;
      default:
        return;
    }
  };

  // The state on entry, so the menu says "linked as" from the first paint.
  try { await refreshState(); } catch { state = { kind: 'off' }; }
  refreshMenu();
  (list as any).select(0);
  list.focus();
  screen.render();

  await new Promise<void>((resolve) => {
    const done = (): void => {
      try { chrome.stop(); } catch { /* leaving anyway */ }
      try { input.disable(); } catch { /* leaving anyway */ }
      terminalMode.dispose();
      try { screen.destroy(); } catch { /* leaving anyway */ }
      try { bbs.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h'); } catch { /* leaving anyway */ }
      resolve();
    };

    (list as any).on('select', async (_item: any, index: number) => {
      const chosen = items[index];
      if (!chosen || chosen.id === 'quit') return done();
      try { await open(chosen.id); } catch (err) { show([`Something went wrong: ${(err as Error).message}`]); }
    });

    screen.key(['q', 'Q', 'escape'], () => {
      if (!inView) return done();
      inView = false;
      viewLines = [];
      panel.setContent('');
      setHints();
      screen.render();
    });
    screen.key(['up', 'k'], () => { if (inView && viewOffset > 0) { viewOffset -= 1; paint(); } });
    screen.key(['down', 'j'], () => { if (inView && viewOffset + panelHeight < viewLines.length) { viewOffset += 1; paint(); } });
    screen.key(['p', 'P'], async () => {
      if (!api || state.kind !== 'linked') return;
      const res: ApiResult<PlayerProfile> = await api.setPrivate(state.email, !state.profile.private);
      if (res.status === 200 && res.body) { state = { kind: 'linked', email: state.email, profile: res.body }; note(res.body.private ? 'Your profile is private now.' : 'Your profile is public now.'); }
      else note(explain(res));
    });
    screen.key(['l', 'L'], async () => {
      if (!api || state.kind !== 'linked') return;
      const code = await ask('Your link code', 'The code from your last link or mail:');
      if (!code) return;
      const res: ApiResult<{ linkCode: string; linkCodeExpiresAt: string }> = await api.rotate(state.email, code);
      if (res.status === 200 && res.body) show([`Your new link code: ${res.body.linkCode}`, `It expires at ${res.body.linkCodeExpiresAt}.`, '', 'Type it at the next board\'s ACHIEVE door.']);
      else show([explain(res)]);
    });
    screen.key(['u', 'U'], async () => {
      if (!api || state.kind !== 'linked') return;
      const res: ApiResult<unknown> = await api.unlink(state.email);
      if (res.status === 200) { await refreshState(); refreshMenu(); show(['This board is unlinked.', 'What you earned stays; nothing new is reported from here.']); }
      else show([explain(res)]);
    });
  });
}

export async function runDoor(bbs: any, session?: DoorSession): Promise<void> {
  await createApp({ ...(session || {}), bbs } as DoorSession);
}

export default runDoor;
