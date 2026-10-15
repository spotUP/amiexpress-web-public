/**
 * AG - read a door's own documentation, on the board.
 *
 * `src/amigaguide/AmigaGuideParser.ts` and `AmigaGuideViewer.ts` are a
 * complete, working AmigaGuide reader - nodes, links, history, scrolling -
 * that no command opened. Fourteen `.guide` files ship under `Doors/` on this
 * board alone, and until now the only way to read one was to be the sysop with
 * a shell.
 *
 * IT IS NOT AN express.e COMMAND, and does not pretend to be: AmiExpress had
 * no guide reader. It is a web-era addition, named the way this port names its
 * additions (DOORS, LIVECHAT, WEBHOOK), and it is refused to a caller whose
 * screen is too narrow to hold the viewer rather than being folded into
 * something a C64 cannot read.
 *
 * THE SHAPE. `AG` lists what there is; `AG <n>` or `AG <name>` opens one. The
 * viewer then owns the keyboard until the caller quits, which is what the
 * AG_VIEW substate is for - the same pattern the voting booth and file
 * maintenance use, so nothing new is invented for it.
 */
import * as fs from 'fs';
import * as path from 'path';

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { emitText } from '../../utils/output.util';
import { config } from '../../config';
import { AmigaGuideParser } from '../../amigaguide/AmigaGuideParser';
import { AmigaGuideViewer } from '../../amigaguide/AmigaGuideViewer';

/** The viewer wants room for its header, its rule and twenty lines of text. */
export const AG_MIN_COLUMNS = 80;

/** How deep under `Doors/` a guide is looked for. */
const SEARCH_DEPTH = 3;

export interface GuideEntry {
  /** What the caller types, and what the list shows. */
  name: string;
  /** Absolute path on this host. */
  file: string;
  /** The door directory it belongs to, for the list. */
  door: string;
}

/**
 * Every `.guide` under the board's `Doors/`, sorted by name.
 *
 * Case-insensitive on the extension because the Amiga was: this board ships
 * `MultiTop.guide` and `Conftop.Guide` side by side.
 */
export function findGuides(bbsRoot: string): GuideEntry[] {
  const doorsRoot = path.join(bbsRoot, 'Doors');
  const found: GuideEntry[] = [];

  const walk = (dir: string, depth: number, door: string): void => {
    if (depth > SEARCH_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1, depth === 0 ? entry.name : door);
        continue;
      }
      if (/\.guide$/i.test(entry.name)) {
        found.push({ name: entry.name.replace(/\.guide$/i, ''), file: full, door });
      }
    }
  };

  walk(doorsRoot, 0, '');
  return found.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/** `AG 3`, `AG multitop`, or nothing at all. */
export function pickGuide(guides: readonly GuideEntry[], params: string): GuideEntry | null {
  const wanted = String(params ?? '').trim();
  if (wanted === '') return null;

  const asNumber = Number(wanted);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= guides.length) {
    return guides[asNumber - 1];
  }

  const lowered = wanted.toLowerCase();
  return (
    guides.find((guide) => guide.name.toLowerCase() === lowered) ??
    guides.find((guide) => guide.name.toLowerCase().startsWith(lowered)) ??
    null
  );
}

/** The caller's screen, as the viewer needs to know it. */
function columnsOf(session: BBSSession): number {
  const reported = Number((session as unknown as { wireWidth?: number }).wireWidth ?? 0);
  if (Number.isFinite(reported) && reported > 0) return reported;
  return Number(session.screenWidth ?? 80) || 80;
}

/**
 * AG - the command itself.
 */
export async function handleAmigaGuideCommand(
  socket: any,
  session: BBSSession,
  params: string = '',
): Promise<void> {
  const bbsRoot = config.get('dataDir');
  const guides = findGuides(bbsRoot);

  if (guides.length === 0) {
    emitText(socket, '\r\nNo guides are installed on this board.\r\n\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    (session as any).menuPause = true;
    return;
  }

  if (columnsOf(session) < AG_MIN_COLUMNS) {
    // The same answer a door too wide for the screen gets, and for the same
    // reason: a guide reflowed into forty columns is not a guide.
    emitText(socket, '\r\nTHIS COMMAND NEEDS AN 80 COLUMN SCREEN\r\n\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    (session as any).menuPause = true;
    return;
  }

  const chosen = pickGuide(guides, params);
  if (!chosen) {
    emitText(socket, '\r\nGuides on this board:\r\n\r\n');
    guides.forEach((guide, index) => {
      const ordinal = String(index + 1).padStart(3);
      emitText(socket, `${ordinal}  ${guide.name.padEnd(24)}${guide.door}\r\n`);
    });
    emitText(socket, `\r\nAG <number> or AG <name> to read one.\r\n\r\n`);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    (session as any).menuPause = true;
    return;
  }

  let text: string;
  try {
    // latin1: a guide written on an Amiga is not UTF-8, and decoding it as
    // one turns every high-bit character into a replacement glyph.
    text = fs.readFileSync(chosen.file, 'latin1');
  } catch (error) {
    console.error('[AG] could not read guide:', chosen.file, error);
    emitText(socket, `\r\nCould not open ${chosen.name}.\r\n\r\n`);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    (session as any).menuPause = true;
    return;
  }

  const parser = new AmigaGuideParser();
  parser.parse(text);
  const viewer = new AmigaGuideViewer(socket, parser);
  (session as any).amigaGuideViewer = viewer;
  session.subState = LoggedOnSubState.AG_VIEW;
  viewer.display();
}

/**
 * A keystroke while the viewer owns the screen.
 *
 * The viewer answers false when the caller has quit, and the session goes back
 * to the menu the way every other state does.
 */
export async function handleAmigaGuideInput(
  socket: any,
  session: BBSSession,
  data: string,
): Promise<void> {
  const viewer = (session as any).amigaGuideViewer as AmigaGuideViewer | undefined;
  if (!viewer) {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    (session as any).menuPause = true;
    return;
  }

  const stillReading = viewer.handleInput(data);
  if (stillReading) return;

  (session as any).amigaGuideViewer = undefined;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  (session as any).menuPause = true;
}
