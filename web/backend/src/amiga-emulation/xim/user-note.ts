/**
 * AEW_USERNOTE (11200): a 68K door adds a sysop note about a user (LIVECHAT68's
 * "Add Note"). Request `NOTE TAB username TAB text`; answer `OK` (saved) or `NO`
 * (unknown user, empty field, save failed). A board without this command
 * answers nothing, which the SDK (ae_user_note) reports as "cannot take notes".
 *
 * The rule (lookup, author, append) is doorAddUserNote - the same function
 * BBSApi.addUserNote calls for TS doors. Text arrives already decoded from
 * latin1 by the XIM message parser, like every other String request.
 */
import type { BBSSession } from '../../index';
import { doorAddUserNote } from '../../doors/door-board';

/** No byte below 0x20, no DEL. */
const clean = (s: string): string => s.replace(/[\x00-\x1f\x7f]/g, '').trim();

export async function userNoteAnswer(request: string, session: BBSSession): Promise<string> {
  const parts = request.split('\t');
  if (parts[0] !== 'NOTE' || parts.length < 3) return 'NO';
  const username = clean(parts[1]);
  // The text is everything after the second TAB; a stray TAB inside it is stripped like any control.
  const text = clean(parts.slice(2).join(' '));
  if (!username || !text) return 'NO';
  return (await doorAddUserNote(session, username, text)) ? 'OK' : 'NO';
}
