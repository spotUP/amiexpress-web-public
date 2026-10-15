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
import { buildCatalogue } from '../../services/menu-catalogue/build';
import { writeCatalogueFile } from '../../services/menu-catalogue/catalogue-file';
import { menuCallerFromSession } from '../../services/menu-catalogue/caller';
import { chooseLogos, renderLogoAt } from '../../services/menu-catalogue/logos';
import type { Catalogue } from '../../services/menu-catalogue/types';
import { readMenuConfig } from '../../services/menu-config.service';
import { levelEntry, widthClassOf, MENU_KIND_COMMAND, type MenuKind } from '../../screens/menu-config/menu-config';
import { ErrorHandler } from '../../utils/error-handling.util';
import { boardRoot } from '../../utils/board-root.util';
import { menuPromptText } from '../../handlers/command-handler/menu';
import { armMenuRun, armMenuShow, rememberMenuRow, menuRowOf } from '../../handlers/commands/menu-door-exit';
import { db } from '../../database';

export interface MenuContext { session: any; socket: any; emitDoorText(text: string): void }

/** The wire answers at most 198 bytes (writeMessageString, W ruling). */
const WIRE_MAX = 198;

const last = new WeakMap<object, Catalogue>();
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
  if (kind === 'MAIN') built.prompt = menuPromptText(ctx.session);
  if (parent === undefined) built.logos = chooseLogos(config, kind, caller, root);
  last.set(ctx.session, built);
  return `OK\t${writeCatalogueFile(root, caller.node, built, menuRowOf(ctx.session, kind))}`;
}

async function overflow(want: string, cat: Catalogue | undefined, ctx: MenuContext): Promise<string> {
  if (!['scroll', 'pages', 'default'].includes(want) || !ctx.session.user) return '';
  const stored = want === 'default' ? '' : want;
  ctx.session.user.menuOverflow = stored;
  // A board-own preference like themePreference: the row, never user.data (express.e has no such field).
  await db.updateUser(ctx.session.user.id, { menuOverflow: stored as '' | 'scroll' | 'pages' });
  const kind: MenuKind = cat?.kind ?? 'MAIN';
  const cls = widthClassOf(menuCallerFromSession(ctx.session).columns);
  const level = ctx.session.user.secLevel ?? 0;
  const effective = stored || levelEntry(readMenuConfig(boardRoot(), kind).config.overflow[cls], level) || (cls === 'c64' ? 'pages' : 'scroll');
  if (cat) cat.overflow = effective as Catalogue['overflow'];
  return `OK\t${effective}`;
}

export async function menuAnswer(request: string, ctx: MenuContext): Promise<string> {
  const text = request.replace(/[\r\n]+$/, '');
  const space = text.indexOf(' ');
  const verb = space < 0 ? text : text.slice(0, space);
  const rest = space < 0 ? '' : text.slice(space + 1);
  const cat = last.get(ctx.session);
  switch (verb) {
    case 'OPEN': return open(rest, ctx);
    case 'ROW': {
      const row = parseInt(rest, 10);
      if (!cat || !Number.isInteger(row) || row < 0) return '';
      rememberMenuRow(ctx.session, cat.kind, row);
      return 'OK';
    }
    case 'OVERFLOW?': {
      if (!cat) return '';
      return `${ctx.session.user?.menuOverflow || 'default'}\t${cat.overflow}`;
    }
    case 'OVERFLOW': return overflow(rest.trim(), cat, ctx);
    case 'RUN': {
      const line = rest.replace(/[\x00-\x1f\x7f]/g, '').trim();
      if (!line || !cat) return '';
      // The exact key of a listed entry IS picking it: the board runs that entry's runText (J: `J 3.1`),
      // and a listed SysCmd runs as a SysCmd (Decision 34). Typing the exact key of a listed entry and
      // picking it are the same line, so both are the listed entry; anything else runs as typed.
      const listed = cat.sections.flatMap(s => s.entries).find(e => e.key.toUpperCase() === line.toUpperCase());
      armMenuRun(ctx.session, { text: listed ? listed.runText : line, runAs: listed?.runAs === 'syscmd' ? 'syscmd' : 'typed' });
      return 'OK';
    }
    case 'SHOW': {
      const key = rest.trim();
      if (!cat || cat.kind !== 'BULLETINS' || !cat.sections.some(s => s.entries.some(e => e.key === key))) return 'NO';
      armMenuShow(ctx.session, { kind: 'BULLETINS', key, command: MENU_KIND_COMMAND.BULLETINS });
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
