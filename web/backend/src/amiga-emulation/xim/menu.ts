/**
 * AEW_MENU (10900): a menu door's conversation with the board - plan M6.
 * The board builds the catalogue (services/menu-catalogue), writes it to a
 * node file the door reads in one go, draws the logos, and runs what the
 * caller picked after the door exits. The door decides nothing about access.
 *
 * DEGRADATION: a board without 10900 answers nothing; the door returns its
 * fallback (Menu.txt for MAIN via the board, BULLS for B - M18).
 */
import { menuSourceFor } from '../../services/menu-catalogue/registry';
import { buildCatalogue, catalogueStyle, coverflowSlides, effectiveStyle } from '../../services/menu-catalogue/build';
import { writeCatalogueFile } from '../../services/menu-catalogue/catalogue-file';
import { menuCallerFromSession, storeMenuStylePref } from '../../services/menu-catalogue/caller';
import { chooseLogos, renderLogoAt } from '../../services/menu-catalogue/logos';
import type { Catalogue } from '../../services/menu-catalogue/types';
import { readMenuConfig } from '../../services/menu-config.service';
import { MENU_KIND_COMMAND, isMenuStyle, readMenuStyle, nextMenuStyle, widthClassOf, type MenuKind, type MenuStyle, type MenuStylePref } from '../../screens/menu-config/menu-config';
import { ErrorHandler } from '../../utils/error-handling.util';
import { boardRoot } from '../../utils/board-root.util';
import { menuPromptTextAsync } from '../../handlers/command-handler/menu';
import { armMenuRun, armMenuShow, armMenuClassic, takeMenuNotice, rememberMenuRow, menuRowOf } from '../../handlers/commands/menu-door-exit';

export interface MenuContext { session: any; socket: any; emitDoorText(text: string): void }

/** The wire answers at most 198 bytes (writeMessageString, W ruling). */
const WIRE_MAX = 198;

// The top-level catalogue the door opened, and the child it is looking into (OPEN <kind> <parentKey>), if any.
// A child never replaces the top level: the door can return to it without a new OPEN, and a RUN there must
// still find the entries the board listed (a listed SysCmd runs as a SysCmd - Decision 34).
const last = new WeakMap<object, Catalogue>();
const child = new WeakMap<object, Catalogue>();
export function lastCatalogueOf(session: object, kind: string): Catalogue | undefined {
  const c = last.get(session);
  return c && c.kind === kind ? c : undefined;
}

const REFUSALS: Record<string, (socket: any) => void> = {
  denied: socket => ErrorHandler.permissionDenied(socket, 'read bulletins'),
  // express.e:8544-8545 ERR_NO_BULLS
  none: socket => socket.emit('ansi-output', '\r\nNo bulletins are available in this conference!\r\n\r\n'),
};

async function open(rest: string, ctx: MenuContext): Promise<string> {
  const [kindText, parent] = rest.trim().split(/\s+/);
  const source = menuSourceFor(kindText || '');
  if (!source) return '';
  const kind = source.kind;
  const caller = menuCallerFromSession(ctx.session);
  const root = boardRoot();
  const { config } = readMenuConfig(root, kind);
  const built = buildCatalogue(source, caller, config, parent);
  if ('refusal' in built) {
    const print = REFUSALS[built.refusal];
    if (print) { print(ctx.socket); return 'NO'; }
    return `NO\t${built.refusal}`.slice(0, WIRE_MAX);
  }
  if (kind === 'MAIN') built.prompt = await menuPromptTextAsync(ctx.session);
  if (parent === undefined) built.logos = chooseLogos(config, kind, caller, root);
  if (parent === undefined) { last.set(ctx.session, built); child.delete(ctx.session); built.notice = takeMenuNotice(ctx.session); }
  else child.set(ctx.session, built);
  return `OK\t${writeCatalogueFile(root, caller.node, built, menuRowOf(ctx.session, kind))}`;
}

/** The caller's effective menu style for the kind on screen (MAIN before any catalogue is open). */
function styleNow(cat: Catalogue | undefined, ctx: MenuContext): MenuStyle {
  return effectiveStyle(menuCallerFromSession(ctx.session), readMenuConfig(boardRoot(), cat?.kind ?? 'MAIN').config);
}

/** The third STYLE? field: a door with no catalogue (W) learns the sysop's slide setting here, as the F line tells the menu. */
function slideNow(cat: Catalogue | undefined, ctx: MenuContext): boolean {
  return coverflowSlides(menuCallerFromSession(ctx.session), readMenuConfig(boardRoot(), cat?.kind ?? 'MAIN').config);
}

/** OVERFLOW?/OVERFLOW are the pre-menu-style wire (plan P4): a door built before it knows only scroll, pages and default.
    Pages is retired, so such a door is told scroll. */
const legacyOverflow = (m: string): string => (m === 'scroll' ? m : 'default');

async function setStyle(want: string, cat: Catalogue | undefined, ctx: MenuContext): Promise<MenuStyle | null> {
  const style = want === 'default' ? '' : readMenuStyle(want);   // an old door's 'pages' (retired) stores scroll
  if (style === undefined || !ctx.session.user) return null;
  const stored: MenuStylePref = style;
  await storeMenuStylePref(ctx.session, stored);
  const effective = styleNow(cat, ctx);
  if (cat) cat.style = catalogueStyle(effective, widthClassOf(menuCallerFromSession(ctx.session).columns));
  return effective;
}

export async function menuAnswer(request: string, ctx: MenuContext): Promise<string> {
  const text = request.replace(/[\r\n]+$/, '');
  const space = text.indexOf(' ');
  const verb = space < 0 ? text : text.slice(0, space);
  const rest = space < 0 ? '' : text.slice(space + 1);
  const top = last.get(ctx.session);
  const cat = child.get(ctx.session) ?? top;      // what the door is showing now
  switch (verb) {
    case 'OPEN': return open(rest, ctx);
    case 'ROW': {
      const row = parseInt(rest, 10);
      if (!cat || !Number.isInteger(row) || row < 0) return '';
      rememberMenuRow(ctx.session, cat.kind, row);
      return 'OK';
    }
    case 'STYLE?':
    case 'OVERFLOW?': {
      // The settings door asks before any catalogue is open: answer for MAIN, as STYLE <m> does.
      if (!cat && !ctx.session.user) return '';
      const stored = readMenuStyle(ctx.session.user?.menuStyle) || 'default';   // a stored 'pages' (retired) reads as scroll
      const effective = styleNow(cat, ctx);
      return verb === 'STYLE?' ? `${stored}\t${effective}\t${slideNow(cat, ctx) ? 1 : 0}` : `${legacyOverflow(stored)}\t${legacyOverflow(effective)}`;
    }
    case 'STYLE': {
      const effective = await setStyle(rest.trim(), cat, ctx);
      return effective ? `OK\t${effective}` : '';
    }
    case 'STYLE+': {
      // Tab on the menu door's empty line: the style after the one the door SHOWS (a one-section cover flow
      // scrolls, a classic caller's door draws the fallback), in the one cycle order (nextMenuStyle).
      // Classic leaves the door: the exit tail draws the board's own menu screen and names the style.
      const shown = rest.trim();
      const next = nextMenuStyle(readMenuStyle(shown) ?? styleNow(cat, ctx));
      const effective = await setStyle(next, cat, ctx);
      if (effective === 'classic') armMenuClassic(ctx.session);
      return effective ? `OK\t${effective}` : '';
    }
    case 'OVERFLOW': {
      const want = rest.trim();
      if (want !== 'scroll' && want !== 'pages' && want !== 'default') return '';
      const effective = await setStyle(want, cat, ctx);
      return effective ? `OK\t${legacyOverflow(effective)}` : '';
    }
    case 'RUN': {
      const line = rest.replace(/[\x00-\x1f\x7f]/g, '').trim();
      if (!line || !cat) return '';
      // The exact key of a listed entry IS picking it: the board runs that entry's runText (J: `J 3.1`),
      // and a listed SysCmd runs as a SysCmd (Decision 34). Typing the exact key of a listed entry and
      // picking it are the same line, so both are the listed entry; anything else runs as typed.
      const listed = [cat, top].flatMap(c => c ? c.sections.flatMap(s => s.entries) : []).find(e => e.key.toUpperCase() === line.toUpperCase());
      armMenuRun(ctx.session, { text: listed ? listed.runText : line, runAs: listed?.runAs === 'syscmd' ? 'syscmd' : 'typed' });
      return 'OK';
    }
    case 'SHOW': {
      // `SHOW <key>` or `SHOW <key> NS` (the caller typed `B 12 NS`).
      const [key = '', ...flags] = rest.trim().split(/\s+/);
      const nonStop = flags.some(f => f.toUpperCase() === 'NS');
      if (!cat || cat.kind !== 'BULLETINS' || !cat.sections.some(s => s.entries.some(e => e.key === key))) return 'NO';
      armMenuShow(ctx.session, { kind: 'BULLETINS', key, command: MENU_KIND_COMMAND.BULLETINS, ...(nonStop ? { nonStop } : {}) });
      return 'OK';
    }
    case 'LOGO': {
      const [position, top, left, rows, cols] = rest.trim().split(/\s+/);
      const logo = cat?.logos.find(l => l.position === position);
      if (!cat || !logo) return 'NONE';
      const ansi = renderLogoAt(boardRoot(), cat.kind, logo, +top, +left, +rows, +cols);
      if (!ansi) return 'NONE';
      ctx.emitDoorText(ansi);
      return `OK\t${logo.rows}`;
    }
    default: return '';
  }
}
