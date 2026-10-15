/**
 * Is the sysop around? One answer for the whole board.
 *
 * express.e keeps one boolean, `sysopAvail` (express.e:123, default TRUE),
 * flipped by F7 (7803) and read by S "Sysop Here" (25596), O's "not around"
 * refusal (25396), BB_CHATFLAG (3751) and AREXX. This port had FOUR stores and
 * the readers used the wrong ones: S and BB_CHATFLAG read `session.sysopAvail`,
 * which nothing ever wrote, so S always said NO; the two chatState copies were
 * never written by anything the sysop can reach; and the one the sysop DOES
 * set - his status on the Operator Chat page - was read only by the pager
 * (express.e parity survey, 2026-09-29).
 *
 * The Operator Chat page's status is the store: it is what the sysop sets, and
 * it goes OFFLINE when he disconnects. The board's sysop is around when any
 * sysop there is AVAILABLE. A board where no sysop has a status yet keeps
 * express.e's default, TRUE.
 */
import { SysopAvailability } from '../types/operator-chat.types';

export interface SysopStatusSource {
  getAllSysopAvailability(): SysopAvailability[];
  setConnectedSysopsAvailable(on: boolean): void;
}

function repository(): SysopStatusSource | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { db } = require('../database');
    return db.getOperatorChatRepository?.() ?? null;
  } catch {
    return null;
  }
}

export function isSysopAvailable(source: SysopStatusSource | null = repository()): boolean {
  if (!source) return true;
  try {
    const all = source.getAllSysopAvailability();
    return all.length === 0 || all.includes(SysopAvailability.AVAILABLE);
  } catch {
    return true;
  }
}

/** express.e's F7 / AREXX set. */
export function setSysopAvailable(on: boolean, source: SysopStatusSource | null = repository()): void {
  try {
    source?.setConnectedSysopsAvailable(on);
  } catch {
    /* a board without the table keeps its default */
  }
}
