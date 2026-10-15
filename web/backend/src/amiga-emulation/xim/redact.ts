/**
 * What a log may say a message carried.
 *
 * Every XIM message's String is written to seven places by
 * XIMProtocol.handleMessage (console, the debug ring, the XIM debug log, the
 * JSON logger, debugLog, the Amiga-format log, the door log) and its first
 * sixteen bytes in hex by XIMMessageParser.parseMessage. A password is in
 * that String twice: a DT_PASSWORD write (express.e:3505) and the W door's
 * PASSWORD request. Neither may be written anywhere.
 */
import { XIMCommand } from './types';

/** The commands whose String is screen output: what the caller sees, which a menu door's prompt echo is part of. */
const SCREEN_WRITE_COMMANDS: ReadonlySet<number> = new Set([XIMCommand.JH_SM, XIMCommand.JH_SMPTR, XIMCommand.JH_WRITE, XIMCommand.JH_CO]);

/**
 * @param withholdScreenWrites true while the door is a menu door (secret-input.ts isMenuDoorSession): its prompt row
 *   echoes the caller's typed command line, so a screen write is logged as the fact of a write, never its text or length.
 */
export function loggableXimString(command: number, data: number, text: string | undefined, withholdScreenWrites = false): string {
  const s = text ?? '';
  if (withholdScreenWrites && SCREEN_WRITE_COMMANDS.has(command)) return s ? '[menu screen write withheld]' : '';
  if (command === XIMCommand.DT_PASSWORD && data === 0) return s ? '[password withheld]' : '';
  // SET 6 is refused (the password is PASSWORD's) but still carries plaintext.
  if (command === XIMCommand.AEW_USERFIELD && /^(PASSWORD|SET 6)\b/.test(s)) return 'PASSWORD [withheld]';
  // AEW_MENU RUN carries a typed command line, which can carry a password (a
  // conference or command password typed as a parameter) - never logged.
  if (command === XIMCommand.AEW_MENU && /^RUN\b/.test(s)) return 'RUN [withheld]';   // not even the length: a short line is a short password
  return s;
}

/** The parser's hex dump runs before the message is understood: skip it for these three. */
export function mayDumpRawString(command: number): boolean {
  // AEW_MENU: its String is a request, and a RUN request carries a typed line; the dump runs before
  // the verb is known, so the whole command is skipped.
  return command !== XIMCommand.DT_PASSWORD && command !== XIMCommand.AEW_USERFIELD && command !== XIMCommand.AEW_MENU;
}
