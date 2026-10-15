/**
 * The screens a caller walks on the way in, as something a picker can edit.
 *
 * "can we build an editor for all bulls etc that shows during login so i can
 * pick what i want and dont want in the admin ui?" (sysop, 2026-09-14). The
 * board showed five MultiTop-II bulletins at login because
 * `Themes/607080/Node/BULL.TXT` says so - five `~SS_` includes with `~SP`
 * between them - and the only way to change that was to edit a file on a
 * volume the sysop cannot see.
 *
 * A screen file on this board is a PROGRAM, not a picture: 252 `~SS_`
 * includes, 173 `~CC_` invocations and 108 `~nSR_` recursions across its 891
 * screens (`mci-references.ts`). Most of that is not the sysop's to reorder,
 * and a picker that rewrote whole files would eat the parts it did not
 * understand. So the model here is LINES:
 *
 *   ITEM    a line carrying exactly one `~SS_`/`~CC_`/`~SR_` and nothing else
 *           of substance. The picker may tick it, drop it or move it.
 *   ANCHOR  every other line - `~f|`, art, a prompt, a line with two codes on
 *           it. It keeps its place and its bytes, always.
 *
 * The reader is `locateMciReferences`, which already owns this syntax; this
 * module adds no second parser, and `screens-routes.ts` adds no second writer
 * (it puts the result through the same `putScreenFile` as every other edit).
 * Two MCI parsers is how this board collected its two-sources-of-truth bugs.
 */
import { locateMciReferences } from './mci-references';

/** One stop on the walk, in the order the board makes it. */
export interface LoginStep {
  /** The screen name the board asks for - what `displayScreen` is given. */
  readonly screen: string;
  /** What to call it in the admin app. */
  readonly label: string;
  /** Where in the flow it happens, for a sysop reading the list. */
  readonly note: string;
  /** `quickFlag` spares the caller this one (express.e:29853). */
  readonly skippedByQuickFlag: boolean;
}

/**
 * THE WALK, read out of the code rather than out of a config table.
 *
 * `LOGON` is displayed by `login-post.service.ts:803` unless `quickFlag`;
 * everything after it is `command.handler.ts`'s display flow
 * (`displayFlowStates`, 283-292, and the branches at 858-900). Each step
 * pauses if its file drew anything, which is why an EMPTY screen file costs
 * the caller a keypress on a blank screen - `displayScreen` answers true for
 * any file that opens (express.e:6773).
 */
export const LOGIN_SEQUENCE: readonly LoginStep[] = [
  {
    screen: 'LOGON',
    label: 'Logon screen',
    note: 'Logon.txt, or logon<level>.txt for the caller\'s access level',
    skippedByQuickFlag: true,
  },
  {
    screen: 'BULL',
    label: 'Board bulletin',
    note: 'The board-wide bulletin, before the node\'s own',
    skippedByQuickFlag: false,
  },
  {
    screen: 'NODE_BULL',
    label: 'Node bulletins',
    note: 'This node\'s bulletins - where the MultiTop pages are listed',
    skippedByQuickFlag: false,
  },
  {
    screen: 'ACHIEVETOP',
    label: 'Achievements leaderboard',
    note: 'Written on its own timer; absent on a board with no achievements server',
    skippedByQuickFlag: false,
  },
  {
    screen: 'MAILSCAN',
    label: 'Mail scan',
    note: 'Shown during the conference scan',
    skippedByQuickFlag: false,
  },
  {
    screen: 'CONF_BULL',
    label: 'Conference bulletin',
    note: 'The joined conference\'s own bulletin, last before the menu',
    skippedByQuickFlag: false,
  },
] as const;

/** One thing the picker may tick, drop or move. */
export interface LoginItem {
  /** SS includes a screen, CC runs a command, SR recurses. */
  code: 'SS' | 'CC' | 'SR';
  /** The path or command it names. */
  target: string;
  /** Whether the line ends in `~SP`, which makes the caller press a key. */
  pause: boolean;
}

/** A line of the file, and the item it carries if it carries exactly one. */
interface ProgramLine {
  /** The line's own bytes, without its ending. */
  text: string;
  /** The line ending as it was written - `\r\n`, `\n`, or '' at EOF. */
  ending: string;
  /** Present when this line is an ITEM the picker owns. */
  item?: LoginItem;
}

export interface ScreenProgram {
  lines: ProgramLine[];
  /** The items, in the order the caller meets them. */
  items: LoginItem[];
}

/** `~SP` is the pause; `|` is a line-ending suppressor the loader eats. */
const PAUSE = /~SP\b/;

/**
 * Is this line ONE item and nothing else?
 *
 * Anything left over after the code, the pause and the punctuation means the
 * line is doing something more than including a screen - it carries art, a
 * second code, a prompt - and the picker must not own it.
 */
function itemOf(text: string): LoginItem | undefined {
  const found = locateMciReferences(text);
  if (found.length !== 1) return undefined;

  const only = found[0];
  if (only.ref.code === 'CL') return undefined;

  const rest = (text.slice(0, only.at) + text.slice(only.at + only.text.length))
    .replace(PAUSE, '')
    .replace(/[|\s]/g, '');
  if (rest.length > 0) return undefined;

  return {
    code: only.ref.code,
    target: only.ref.target,
    pause: PAUSE.test(text),
  };
}

/**
 * Render an item as the line the loader will read.
 *
 * Exported because the admin page shows the sysop this exact line while he
 * edits a row, and a second spelling of the format in the UI would drift
 * from what is actually written to the board.
 */
export function lineFor(item: LoginItem): string {
  const code = item.code === 'SS' ? '~SS_' : item.code === 'CC' ? '~CC_' : '~SR_';
  return `${code}${item.target}${item.pause ? ' ~SP' : ''}`;
}

/**
 * Split a screen into lines, keeping each line's own ending.
 *
 * Keeping the ending per line rather than normalising is what lets a CRLF
 * file go back as CRLF, and a file with no trailing newline go back without
 * one. The round-trip pin in the test is the whole point of this module.
 */
export function readScreenProgram(content: string): ScreenProgram {
  const lines: ProgramLine[] = [];
  const re = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    lines.push({ text: m[1], ending: m[2], item: itemOf(m[1]) });
    if (m[2] === '') break;               // the last line, with no ending
    if (re.lastIndex >= content.length) break;
  }
  return { lines, items: lines.map(l => l.item).filter((i): i is LoginItem => !!i) };
}

/** Put the lines back together exactly as they were read. */
export function writeScreenProgram(program: ScreenProgram): string {
  return program.lines.map(l => l.text + l.ending).join('');
}

/**
 * Rewrite a screen so its items are `wanted`, in that order.
 *
 * The anchors do not move. The item lines are refilled in place, in order; a
 * shorter list leaves its surplus lines behind entirely, a longer one appends
 * after the last item. An item that was already in the file keeps its OWN
 * line's bytes, so a sysop who only reorders never sees his formatting
 * rewritten.
 *
 * THE LAST ITEM OF A STEP NEVER PAUSES. A `~SP` on the final screen of the
 * walk makes the caller press a key to be shown the next thing anyway, which
 * on this board is the menu.
 *
 * `trailingPause` lifts that for a screen a step INCLUDES, where the premise
 * does not hold: the board's `BULL.TXT` is one `~SS_` and what follows it is
 * the next bulletin, drawn at once. The sysop watched a Super-AmiLog wiped
 * that way and asked for the pause the rule was refusing him (2026-09-16).
 */
export function applyLoginSelection(
  content: string,
  wanted: LoginItem[],
  opts: { trailingPause?: boolean } = {},
): string {
  const program = readScreenProgram(content);

  const original = new Map<string, ProgramLine>();
  for (const line of program.lines) {
    if (line.item) original.set(`${line.item.code}:${line.item.target}`, line);
  }

  const rendered: ProgramLine[] = wanted.map((item, index) => {
    const pause = index < wanted.length - 1 || opts.trailingPause ? item.pause : false;
    const previous = original.get(`${item.code}:${item.target}`);
    // Its own bytes, when nothing about it changed.
    if (previous && previous.item!.pause === pause) return { ...previous };
    return {
      text: lineFor({ ...item, pause }),
      ending: previous?.ending || '\n',
      item: { ...item, pause },
    };
  });

  const out: ProgramLine[] = [];
  let next = 0;
  for (const line of program.lines) {
    if (!line.item) { out.push(line); continue; }
    if (next < rendered.length) out.push(rendered[next++]);
    // else: an item line the sysop unticked, dropped with its own ending.
  }
  // Anything left had nowhere to go: it is new, and goes after the last item.
  while (next < rendered.length) {
    const item = rendered[next++];
    const lastItem = out.map((l, i) => (l.item ? i : -1)).filter(i => i >= 0).pop();
    if (lastItem === undefined) out.push(item);
    else out.splice(lastItem + 1, 0, item);
  }

  return fixEndings(out);
}

/**
 * A file must not end up with a line that has no ending in the middle of it.
 *
 * Dropping the last line of a file, or appending after it, moves which line is
 * final; the ending that belonged to the old last line has to travel.
 */
function fixEndings(lines: ProgramLine[]): string {
  const out = lines.map(l => ({ ...l }));
  for (let i = 0; i < out.length - 1; i += 1) {
    if (out[i].ending === '') out[i].ending = out[i + 1].ending || '\n';
  }
  return out.map(l => l.text + l.ending).join('');
}
