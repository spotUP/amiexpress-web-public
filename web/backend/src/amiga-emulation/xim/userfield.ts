/**
 * AEW_USERFIELD (10600): the W door's conversation with the board.
 *
 * WHY A COMMAND OF ITS OWN. The door must learn, per field, whether the
 * caller may change it, what it reads as and what limit it has, and on a
 * write it must hear the board's refusal in express.e's words. A DT write
 * cannot answer (sdk/c/include/aedoor.h, "a field write has no answer"), and
 * the DT writes express.e answers are unvalidated for every other door
 * (express.e:3494-3522) - so they keep that meaning, and this carries W.
 *
 * Every rule is w-fields.ts / w-password.ts; this file is the wire. The wire
 * is documented in the plan (W4 table) and parsed by sdk/c ae_userfield.c.
 *
 * DEGRADATION: a board without 10600 leaves String empty, which the door
 * reads as "this board cannot host W" and leaves.
 */
import type { BBSSession } from '../../index';
import { ACSPermission } from '../../constants/acs-permissions';
import { EnvStat } from '../../constants/env-codes';
import { checkSecurity, setEnvStat } from '../../utils/acs.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { saveAccount } from '../../services/account.service';
import {
  applyWField, isWFieldNumber, wFieldChoices, wFieldState, wFieldValue, W_FIELDS,
  type WFieldKind, type WFieldOutcome,
} from '../../services/user-settings/w-fields';
import { changeWPassword } from '../../services/user-settings/w-password';
import { settingsDoorsFor } from '../../handlers/commands/w-settings-doors';
import { getDoors } from '../../handlers/command-handler/dependency-injection';
import { armSettingsResume, takeSettingsResumeRow } from '../../handlers/commands/settings-resume';

export const USERFIELD_WIRE_MAX = 198;

const KIND_LETTER: Record<WFieldKind, string> = { text: 'T', password: 'P', lines: 'L', choice: 'C', cycle: 'Y', translator: 'X' };

/** No byte below 0x20, no DEL: TAB is the wire's separator and nothing a caller types into a field is a control. */
export function sanitiseFieldValue(raw: string): string {
  return raw.replace(/[\x00-\x1f\x7f]/g, '');
}

const clip = (s: string): string => (s.length > USERFIELD_WIRE_MAX ? s.slice(0, USERFIELD_WIRE_MAX) : s);

async function answerOutcome(session: BBSSession, outcome: WFieldOutcome): Promise<string> {
  switch (outcome.kind) {
    case 'stored':
      // WEB_: express.e:25891-25895 saves the account only when the caller
      // leaves W, so a dropped carrier loses every edit. The W door saves
      // each field the moment it is confirmed (sysop, 2026-10-14, spec
      // decision 4); the internal W keeps express.e's order.
      await saveAccount(session.user);
      return clip(`OK\t${outcome.value}`);
    case 'unchanged': return 'SAME';
    case 'denied': return 'DENIED';
    case 'again': return 'AGAIN';
    case 'refused': return clip(`NO\t${outcome.retry ? 1 : 0}\t${outcome.refusal}`);
  }
}

function fieldRow(session: BBSSession, n: number): string {
  if (!isWFieldNumber(n)) return '';
  const state = wFieldState(session, n);
  if (state === 'hidden') return 'H';
  const spec = W_FIELDS[n];
  const value = state === 'disabled' ? '[DISABLED]' : wFieldValue(session, n);
  return clip([state === 'editable' ? 'E' : 'D', spec.label, sanitiseFieldValue(value), KIND_LETTER[spec.kind], String(spec.maxLen), spec.prompt].join('\t'));
}

function doorRow(session: BBSSession, i: number): string {
  const entry = settingsDoorsFor(getDoors(), session as never)[i];
  if (!entry) return '';
  const head = [entry.command, entry.section, entry.label].map(sanitiseFieldValue).join('\t');
  const room = USERFIELD_WIRE_MAX - head.length - 1;
  return room <= 0 ? clip(head) : `${head}\t${sanitiseFieldValue(entry.description).slice(0, room)}`;
}

export async function userFieldAnswer(request: string, session: BBSSession, socket: unknown): Promise<string> {
  const space = request.indexOf(' ');
  const verb = space < 0 ? request : request.slice(0, space);
  const rest = space < 0 ? '' : request.slice(space + 1);

  switch (verb) {
    case 'OPEN':
      if (!checkSecurity(session.user, ACSPermission.EDIT_USER_INFO)) {
        ErrorHandler.permissionDenied(socket as never, 'edit user information');
        return 'NO';
      }
      setEnvStat(session, EnvStat.STATS); // express.e:25720
      return 'OK';
    case 'GET':
      return fieldRow(session, parseInt(rest, 10));
    case 'SET': {
      const gap = rest.indexOf(' ');
      const n = parseInt(gap < 0 ? rest : rest.slice(0, gap), 10);
      if (!isWFieldNumber(n)) return '';
      const value = sanitiseFieldValue(gap < 0 ? '' : rest.slice(gap + 1));
      return answerOutcome(session, await applyWField(session, n, value));
    }
    case 'PASSWORD': {
      const tab = rest.indexOf('\t');
      if (tab < 0) return answerOutcome(session, { kind: 'unchanged' });
      return answerOutcome(session, await changeWPassword(session, rest.slice(0, tab), rest.slice(tab + 1)));
    }
    case 'CHOICES': {
      const [nText, iText] = rest.split(' ');
      const n = parseInt(nText, 10);
      if (!isWFieldNumber(n)) return '';
      return clip(sanitiseFieldValue((await wFieldChoices(n))[parseInt(iText, 10)] ?? ''));
    }
    case 'DOORS':
      return doorRow(session, parseInt(rest, 10));
    case 'RESUME': {
      const row = parseInt(rest, 10);
      if (!Number.isInteger(row) || row < 0) return '';
      armSettingsResume(session, String((session as { doorCommand?: string }).doorCommand || 'W'), row);
      return 'OK';
    }
    case 'RESUME?': {
      const row = takeSettingsResumeRow(session);
      return row === null ? '' : String(row);
    }
    default:
      return '';
  }
}
