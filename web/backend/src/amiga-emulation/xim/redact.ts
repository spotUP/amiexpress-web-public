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

export function loggableXimString(command: number, data: number, text: string | undefined): string {
  const s = text ?? '';
  if (command === XIMCommand.DT_PASSWORD && data === 0) return s ? '[password withheld]' : '';
  // SET 6 is refused (the password is PASSWORD's) but still carries plaintext.
  if (command === XIMCommand.AEW_USERFIELD && /^(PASSWORD|SET 6)\b/.test(s)) return 'PASSWORD [withheld]';
  return s;
}

/** The parser's hex dump runs before the message is understood: skip it for these two. */
export function mayDumpRawString(command: number): boolean {
  return command !== XIMCommand.DT_PASSWORD && command !== XIMCommand.AEW_USERFIELD;
}
