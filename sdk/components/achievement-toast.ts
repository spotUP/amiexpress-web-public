/**
 * The achievement toast - ONE widget, used by the BBS and by doors.
 *
 * Two ways in, one drawing:
 *
 *   renderAchievementToast(notice, width, opts)  the lines, as bytes a BBS
 *       writes straight to the caller: a framed box in the SDK's Amiga border alphabet in the
 *       eight ANSI colours, cursor saved and restored around it. At forty
 *       columns and under nothing exceeds forty cells and no glyph is
 *       outside ASCII, so the PETSCII transducer has nothing to guess at.
 *   showAchievementToast(screen, notice, ms)      a blessed Box built from
 *       the SAME lines, not focusable, not an input, removed by a timer.
 *       A door's DoorInputManager is never touched and no key is consumed;
 *       the door's input handling is unchanged by its presence.
 *
 * Geometry comes from the responsive constants, never a literal: the box is
 * calculateDialogWidth(width) wide, capped so it fits, and effects
 * (colour) are dropped where effectsAllowed(width) says so.
 */
import { Box } from '../engines/ui/blessed/widgets/box';
import type { Screen } from '../engines/ui/blessed/core/screen';
import { borderCharsFor } from '../engines/ui/blessed/core/border-chars';
import { wrapText } from '../src/utils/screen-utils';
import { calculateDialogWidth, effectsAllowed, BREAKPOINT_XXS, BREAKPOINT_SM } from '../engines/ui/blessed/core/responsive-constants';

export interface AchievementNotice {
  /**
   * 'unlock': an achievement was earned. 'link': the link explanation.
   * 'notice': a board notification (the Board channel of the NOTIFY door),
   * drawn in the same box with `title` and `text`.
   */
  kind: 'unlock' | 'link' | 'notice';
  /** 'notice' only: the first row. */
  title?: string;
  /** 'notice' only: the second and third rows (wrapped by the caller's width). */
  text?: string;
  name?: string;
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum';
  points?: number;
  /** The command the caller types to link their account. */
  doorCommand?: string;
}

export interface ToastRenderOptions {
  /** Plain bytes for a PETSCII caller: ASCII only, no SGR. */
  petscii?: boolean;
  /** Skip the save/restore cursor pair (a blessed screen positions its own). */
  bare?: boolean;
}

/** The eight ANSI colours the tiers wear. Bronze 33 yellow, silver 37 white, gold 33+bold, platinum 36 cyan. */
const TIER_SGR: Record<NonNullable<AchievementNotice['tier']>, string> = {
  bronze: '\x1b[0;33m',
  silver: '\x1b[0;37m',
  gold: '\x1b[1;33m',
  platinum: '\x1b[1;36m',
};

export const TOAST_MIN_WIDTH = 24;

/** A notice body never takes more than this many rows; the last is marked `~` if cut. */
const NOTICE_MAX_BODY_ROWS = 4;

/**
 * The text rows, before any box or colour - the same for every renderer.
 * An unlock and a link are always three rows; a board notice is its title and
 * its body wrapped on word boundaries to the box (SDK wrapText).
 */
export function toastLines(notice: AchievementNotice, inner: number): string[] {
  const clip = (s: string): string => (s.length > inner ? s.slice(0, Math.max(0, inner - 1)) + '~' : s);
  if (notice.kind === 'notice') {
    const wrapped = wrapText(notice.text ?? '', inner);
    const body = wrapped.slice(0, NOTICE_MAX_BODY_ROWS);
    if (wrapped.length > NOTICE_MAX_BODY_ROWS) body[body.length - 1] = clip(body[body.length - 1] + '~');
    return [clip(notice.title ?? 'NOTIFICATION'), ...body.map(clip)];
  }
  if (notice.kind === 'link') {
    const cmd = (notice.doorCommand ?? 'ACHIEVE').toUpperCase();
    return [clip('ACHIEVEMENTS: account not linked'), clip(`Type ${cmd} at the prompt to link`), clip('this board to your global profile.')];
  }
  const tier = notice.tier ? notice.tier.toUpperCase() : '';
  const pts = notice.points !== undefined ? `${notice.points} pts` : '';
  const tail = [tier, pts].filter((s) => s !== '').join(', ');
  return [clip('ACHIEVEMENT UNLOCKED'), clip(notice.name ?? ''), clip(tail)];
}

/** The widest PETSCII screen this board serves: the wide web terminal's. */
const PETSCII_MAX_COLUMNS = 80;

/** The box width for a terminal `width` columns wide. */
export function toastWidth(width: number): number {
  const dialog = calculateDialogWidth(width);
  return Math.max(TOAST_MIN_WIDTH, Math.min(dialog, width));
}

/** Centre `s` in `w` cells, clipping if it is wider. */
function centre(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w);
  const pad = w - s.length;
  const left = Math.floor(pad / 2);
  return ' '.repeat(left) + s + ' '.repeat(pad - left);
}

/** Wrap each physical line in the colour pair (empty strings when no colour). */
function paint(lines: string[], on: string, off: string): string {
  return lines.map((l) => `${on}${l}${off}`).join('\r\n');
}

/**
 * The original box: top rule, three `|`-framed rows, bottom rule. The safe
 * shape at every terminal - what a PETSCII caller and a 40-column ANSI caller
 * get.
 */
function plainBox(rows: string[], boxWidth: number, inner: number, on: string, off: string): string {
  const rule = `+${'-'.repeat(boxWidth - 2)}+`;
  const line = (s: string): string => `| ${s.padEnd(inner)} |`;
  return paint([rule, ...rows.map(line), rule], on, off);
}

/**
 * The wide themed frame: the title set into the top rule, the body on framed
 * rows. The glyphs are the SDK's border alphabet for an Amiga caller
 * (borderCharsFor) - the same one every blessed door's frame is drawn with -
 * so the web terminal (Topaz, no PC box-drawing) and telnet get one look.
 */
function frame(title: string, body: string[], boxWidth: number, borderType: string, on: string, off: string): string {
  const { tl, tr, bl, br, h, v } = borderCharsFor(borderType, false);
  const inner = boxWidth - 4;
  // `tl h SP title SP h*k tr` == boxWidth. Keep at least one rule glyph.
  const t = title.slice(0, Math.max(0, boxWidth - 6));
  const k = Math.max(1, boxWidth - (5 + t.length));
  const top = `${tl}${h} ${t} ${h.repeat(k)}${tr}`.slice(0, boxWidth);
  const bottom = `${bl}${h.repeat(boxWidth - 2)}${br}`;
  const line = (s: string): string => `${v} ${s.padEnd(inner)} ${v}`;
  return paint([top, ...body.map(line), bottom], on, off);
}

/**
 * The narrow trophy badge: a double rule, everything centred, `[*]` flanking
 * the title. ASCII at every terminal - the fallback where the frame is too
 * tight to read.
 */
function badge(rows: string[], boxWidth: number, on: string, off: string): string {
  const inner = boxWidth - 2;
  const rule = `+${'='.repeat(inner)}+`;
  const line = (s: string): string => `|${centre(s, inner)}|`;
  return paint([rule, line(`[*] ${rows[0]} [*]`), ...rows.slice(1).map(line), rule], on, off);
}

/**
 * The toast as bytes, in one of three dressings chosen by width:
 *   - PETSCII, or a sub-40 ANSI caller: the plain ASCII box (safe everywhere).
 *   - 80 columns and up: the themed frame, SDK border alphabet (Amiga ASCII).
 *   - in between: the centred trophy badge, ASCII.
 *
 * The width is the CALLER'S. This used to clamp a PETSCII toast to forty
 * columns, true while every PETSCII screen was a C64's; the web terminal's
 * wide screen is eighty, and doorScreenWidth already answers with the mode's
 * own width. Eighty is the widest PETSCII screen there is, so that is the
 * ceiling.
 */
export function renderAchievementToast(notice: AchievementNotice, width: number, opts: ToastRenderOptions = {}): string {
  const cols = opts.petscii ? Math.min(width, PETSCII_MAX_COLUMNS) : width;
  const boxWidth = toastWidth(cols);
  const inner = boxWidth - 4; // "| " and " |"
  const rows = toastLines(notice, inner);
  const colour = !opts.petscii && effectsAllowed(cols);
  const on = colour ? (notice.kind !== 'unlock' ? '\x1b[0;36m' : TIER_SGR[notice.tier ?? 'bronze']) : '';
  const off = colour ? '\x1b[0m' : '';

  let body: string;
  if (opts.petscii || cols < BREAKPOINT_XXS) {
    body = plainBox(rows, boxWidth, inner, on, off);
  } else if (cols >= BREAKPOINT_SM) {
    body = frame(rows[0], rows.slice(1), boxWidth, 'line', on, off);
  } else {
    body = badge(rows, boxWidth, on, off);
  }
  const bytes = `${body}\r\n`;
  return opts.bare ? bytes : `\x1b7${bytes}\x1b8`;
}

export const TOAST_DEFAULT_MS = 4000;

/**
 * Inside a blessed door: a Box at the top right, built from the same lines,
 * that takes no focus and no input and removes itself after `ms`.
 */
export function showAchievementToast(screen: Screen, notice: AchievementNotice, ms: number = TOAST_DEFAULT_MS): Box {
  const width = screen.width;
  const boxWidth = toastWidth(width);
  const rows = toastLines(notice, boxWidth - 4);
  const box = new Box({
    top: 0,
    left: Math.max(0, width - boxWidth),
    width: boxWidth,
    height: rows.length + 2,
    border: 'line',
    content: rows.join('\n'),
    focusable: false,
    input: false,
    keyable: false,
    clickable: false,
    tags: false,
  });
  screen.append(box);
  screen.render();
  const timer = setTimeout(() => {
    try {
      screen.remove(box);
      screen.render();
    } catch {
      /* the screen may already be gone - a door that exited */
    }
  }, ms);
  timer.unref?.();
  return box;
}
