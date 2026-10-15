/**
 * The board's web-terminal settings - internal W rows 17, 18, 21 and 22
 * (WEB_, no express.e counterpart) - once. The internal W menu and the
 * WEBTERM door (through BBSApi) both call these.
 */
import type { BBSSession } from '../../index';
import type { WebTerminalState } from '@amiexpress/bbs-door-sdk/core/types';
import { changeAccount } from '../account.service';
import { sessionWantsPetscii, PETSCII_FONT_IS_FIXED } from '../../utils/petscii-session-model';
import { DEFAULT_TERMINAL_FONT } from '../../constants/terminal-fonts';

export type { WebTerminalState };
export type SocketLike = { emit: (event: string, ...args: unknown[]) => unknown };

export const MODEM_OPTIONS: ReadonlyArray<{ bps: number; label: string }> = [
  { bps: 0, label: 'MAX (No Throttle)' },
  { bps: 1200, label: '1200 bps' },
  { bps: 2400, label: '2400 bps' },
  { bps: 4800, label: '4800 bps' },
  { bps: 7200, label: '7200 bps' },
  { bps: 9600, label: '9600 bps' },
  { bps: 12000, label: '12.0 kbps' },
  { bps: 14400, label: '14.4 kbps' },
  { bps: 14400, label: 'HST 14.4 kbps' },
  { bps: 16800, label: '16.8 kbps' },
  { bps: 16800, label: 'HST 16.8 kbps' },
  { bps: 19200, label: '19.2 kbps' },
  { bps: 21600, label: '21.6 kbps' },
  { bps: 21600, label: 'HST 21.6 kbps' },
  { bps: 24000, label: '24.0 kbps' },
  { bps: 28800, label: '28.8 kbps' },
  { bps: 33600, label: '33.6 kbps' },
  { bps: 56000, label: '56 kbps' },
];

export function webTerminalState(session: BBSSession): WebTerminalState {
  const bps = session.modemBps || session.user?.baud || 0;
  const modemSpeed = !bps || bps <= 0 ? 'MAX (No Throttle)' : (MODEM_OPTIONS.find(o => o.bps === bps)?.label ?? `${bps} bps`);
  const petscii = sessionWantsPetscii(session);
  return {
    modemSpeed,
    font: petscii ? 'C64 CHARACTER SET' : (session.user?.fontPreference || DEFAULT_TERMINAL_FONT),
    fontFixedNotice: petscii ? PETSCII_FONT_IS_FIXED : '',
    petsciiPalette: session.user?.petsciiPalette !== 'vic' ? 'C128 (VDC)' : 'C64 (VIC-II)',
    petsciiCharset: session.user?.petsciiCharset === 'swedish' ? 'SWEDISH' : 'STANDARD',
  };
}

/** W row 17: store the caller's modem speed, throttle their socket and tell the terminal. False when the choice is out of range. */
export async function applyModemSpeed(socket: SocketLike, session: BBSSession, choice: number): Promise<boolean> {
  const option = MODEM_OPTIONS[choice];
  if (!Number.isInteger(choice) || !option) return false;
  const bps = option.bps;
  session.modemBps = bps;
  session.modemEmulationEnabled = bps > 0;
  await changeAccount(session, { baud: bps });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getModemEmulator } = require('../../utils/modem-emulator.util');
  const modemEmulator = getModemEmulator(socket);
  // Ensure modem emulator is installed (might not be if user started with baud=0)
  modemEmulator.install();
  if (bps > 0) {
    modemEmulator.enable(bps);
    console.log(`[W Command] Modem emulation set to ${bps} bps`);
  } else {
    modemEmulator.disable();
    console.log(`[W Command] Modem emulation disabled (full speed)`);
  }

  // Tell the browser the speed: above 0 it stands aside for the server pacer.
  // Also tracked in session so doors can query it via bbs.getModemSpeed().
  (session as { modemSpeed?: number }).modemSpeed = bps;
  socket.emit('modem-speed', bps);

  // Disable AnsiBuffer batching when modem emulation is enabled
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getAnsiBuffer } = require('../../utils/ansi-buffer.util');
  getAnsiBuffer(socket).setFlushDelay(bps > 0 ? 0 : 16);
  return true;
}

/** W row 21: which sixteen colours the 80-column PETSCII screen uses. */
export async function togglePetsciiPalette(socket: SocketLike, session: BBSSession): Promise<'vdc' | 'vic'> {
  const next = session.user?.petsciiPalette === 'vic' ? 'vdc' : 'vic';
  if (session.user) {
    try {
      await changeAccount(session, { petsciiPalette: next });
    } catch (error) {
      console.error('[W] could not save the PETSCII palette:', error);
    }
  }
  // The canvas repaints from the machine it already has.
  socket.emit('petscii-palette', { palette: next });
  return next;
}

export function petsciiCharsetNotice(next: 'standard' | 'swedish'): string {
  return next === 'swedish'
    ? 'PETSCII character set: SWEDISH - \u00e5\u00e4\u00f6 where [ \u00a3 ] were'
    : 'PETSCII character set: STANDARD';
}

/** W row 22: which character ROM the PETSCII screen draws. */
export async function togglePetsciiCharset(socket: SocketLike, session: BBSSession): Promise<'standard' | 'swedish'> {
  const next = session.user?.petsciiCharset === 'swedish' ? 'standard' : 'swedish';
  if (session.user) {
    try {
      await changeAccount(session, { petsciiCharset: next });
    } catch (error) {
      console.error('[W] could not save the PETSCII character set:', error);
    }
  }
  (session as { petsciiSwedish?: boolean }).petsciiSwedish = next === 'swedish';
  // The atlas is rebuilt from the new set; the screen's machine is untouched.
  socket.emit('petscii-charset', { charset: next });
  return next;
}
