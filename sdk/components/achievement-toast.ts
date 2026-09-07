/**
 * The achievement toast - ONE widget, used by the BBS and by doors.
 *
 * Two ways in, one drawing:
 *
 *   renderAchievementToast(notice, width, opts)  the lines, as bytes a BBS
 *       writes straight to the caller: a three-row box of `+ - |` in the
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
import { calculateDialogWidth, effectsAllowed } from '../engines/ui/blessed/core/responsive-constants';

export interface AchievementNotice {
  /** 'unlock': an achievement was earned. 'link': the link explanation. */
  kind: 'unlock' | 'link';
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

/** The three text rows, before any box or colour - the same for every renderer. */
export function toastLines(notice: AchievementNotice, inner: number): [string, string, string] {
  const clip = (s: string): string => (s.length > inner ? s.slice(0, Math.max(0, inner - 1)) + '~' : s);
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

/**
 * The toast as bytes. Five physical lines: top rule, three rows, bottom
 * rule; each `|`-framed, padded to the box width. With `petscii` there is
 * no SGR at all.
 *
 * The width is the CALLER'S, at either flavour. This used to clamp a PETSCII
 * toast to forty columns, which was true while every PETSCII screen was a
 * C64's; the web terminal's wide screen is eighty, and a board that answers
 * the mode's own width (doorScreenWidth) is already telling the truth here.
 * Eighty is the widest PETSCII screen there is, so that is the ceiling.
 */
export function renderAchievementToast(notice: AchievementNotice, width: number, opts: ToastRenderOptions = {}): string {
  const cols = opts.petscii ? Math.min(width, PETSCII_MAX_COLUMNS) : width;
  const boxWidth = toastWidth(cols);
  const inner = boxWidth - 4; // "| " and " |"
  const rows = toastLines(notice, inner);
  const colour = !opts.petscii && effectsAllowed(cols);
  const on = colour ? (notice.kind === 'link' ? '\x1b[0;36m' : TIER_SGR[notice.tier ?? 'bronze']) : '';
  const off = colour ? '\x1b[0m' : '';
  const rule = `+${'-'.repeat(boxWidth - 2)}+`;
  const line = (s: string): string => `| ${s.padEnd(inner)} |`;
  const body = [rule, ...rows.map(line), rule].map((l) => `${on}${l}${off}`).join('\r\n');
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
    height: 5,
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
