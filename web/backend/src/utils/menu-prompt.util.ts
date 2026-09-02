/**
 * The main command prompt, at the caller's screen width.
 *
 * express.e:28417-28420 builds one string:
 *
 *   [0m[35m{bbsName} [0m[[36m{conf}[34m:[36m{name}[0m] Menu ([33m{mins}[0m mins. left):
 *
 * With this board's 18-character name and a 22-character conference name
 * that is 69 printable columns. It fits 80 and folds twice on a C64, which
 * is what the sysop reported on 2026-09-02 (plan Task 4b).
 *
 * WIDTH ARITHMETIC at 40 columns, worst realistic case (22-char conference
 * name, 3-digit minutes):
 *
 *   [2:Amiga Demo Scene Chat!] (120 mins):    -> 39 columns
 *   |<-3->|<------- 22 ------>|<--- 14 --->|
 *
 * Dropping the board name alone leaves 50; dropping the word "Menu" as
 * well leaves 45; only shortening "mins. left" to "mins" as well gets
 * inside 40. That is the smallest set of removals that fits, so that is
 * what the narrow form does - and the conference name is clamped to the
 * room actually left, so the guarantee holds for a name of any length
 * (the multi-message-base form "Conf - Base" is much the longer one).
 *
 * BINDING RULE: `sessionColumns` (-> doorScreenWidth) is the only width
 * source, and it can only answer < 80 when `petsciiMode === true`. A
 * narrow ANSI terminal - a phone in portrait reporting 40 columns over
 * NAWS - is NOT a C64 and keeps the express.e bytes.
 */
import { sessionColumns } from './door-min-columns.util';

export interface MenuPromptFields {
  /** cmds.bbsName - express.e:28417 */
  bbsName: string;
  /** relConfNum - express.e:28417 */
  relConfNum: number | string;
  /** currentConfName, or "conf - message base" when the conference has several */
  confDisplayName: string;
  /** Div(timeTotal - timeUsed, 60) - express.e:28417 */
  timeLeft: number | string;
}

export interface MenuPromptSession {
  screenWidth?: number;
  petsciiMode?: boolean;
}

/** Shortest conference name the narrow prompt will ever show. */
const MIN_CONF_NAME_COLUMNS = 4;

export function buildMenuPrompt(
  fields: MenuPromptFields,
  session: MenuPromptSession | null | undefined
): string {
  const { bbsName, relConfNum, confDisplayName, timeLeft } = fields;
  const width = sessionColumns(session ?? {});

  if (width >= 80) {
    // express.e:28417-28420, byte-for-byte.
    return `\x1b[0m\x1b[35m${bbsName} \x1b[0m[\x1b[36m${relConfNum}\x1b[34m:\x1b[36m${confDisplayName}\x1b[0m] Menu (\x1b[33m${timeLeft}\x1b[0m mins. left): `;
  }

  // Narrow form: no board name, no "Menu", "mins" for "mins. left", and a
  // conference name clamped to whatever columns those leave.
  const headColumns = `[${relConfNum}:`.length;
  const tailColumns = `] (${timeLeft} mins): `.length;
  const room = Math.max(MIN_CONF_NAME_COLUMNS, width - headColumns - tailColumns);
  const name =
    confDisplayName.length > room ? confDisplayName.substring(0, room) : confDisplayName;

  return `\x1b[0m[\x1b[36m${relConfNum}\x1b[34m:\x1b[36m${name}\x1b[0m] (\x1b[33m${timeLeft}\x1b[0m mins): `;
}
