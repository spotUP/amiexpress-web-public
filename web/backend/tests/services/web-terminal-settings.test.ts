const changeAccount = jest.fn(async (s: any, u: any) => { Object.assign(s.user, u); });
jest.mock('../../src/services/account.service', () => ({ changeAccount: (...a: Parameters<typeof changeAccount>) => changeAccount(...a) }));
const emulator = { install: jest.fn(), enable: jest.fn(), disable: jest.fn() };
jest.mock('../../src/utils/modem-emulator.util', () => ({ getModemEmulator: () => emulator }));
const buffer = { setFlushDelay: jest.fn() };
jest.mock('../../src/utils/ansi-buffer.util', () => ({ getAnsiBuffer: () => buffer }));

import { applyModemSpeed, MODEM_OPTIONS, togglePetsciiCharset, togglePetsciiPalette, webTerminalState } from '../../src/services/user-settings/web-terminal-settings';

const socket = () => ({ emit: jest.fn() });
const caller = (over: Record<string, unknown> = {}): any => ({ modemBps: 0, user: { id: 7, baud: 0, petsciiPalette: 'vdc', petsciiCharset: 'standard', fontPreference: 'MicroKnight', ...over } });

test('a modem speed is stored, throttles the socket and tells the terminal, as W 17 did', async () => {
  const s = caller(); const sock = socket();
  const i = MODEM_OPTIONS.findIndex(o => o.bps === 2400);
  expect(await applyModemSpeed(sock, s, i)).toBe(true);
  expect(s.user.baud).toBe(2400);
  expect(s.modemBps).toBe(2400);
  expect(emulator.enable).toHaveBeenCalledWith(2400);
  expect(sock.emit).toHaveBeenCalledWith('modem-speed', 2400);
  expect(buffer.setFlushDelay).toHaveBeenCalledWith(0);
  expect(webTerminalState(s).modemSpeed).toBe('2400 bps');
});
test('a choice out of range changes nothing', async () => {
  const s = caller();
  expect(await applyModemSpeed(socket(), s, 99)).toBe(false);
  expect(await applyModemSpeed(socket(), s, NaN)).toBe(false);
  expect(await applyModemSpeed(socket(), s, -1)).toBe(false);
  expect(changeAccount).not.toHaveBeenCalledWith(s, { baud: expect.anything() });
});
test('the palette flips and the canvas is told (W 21)', async () => {
  const s = caller(); const sock = socket();
  expect(await togglePetsciiPalette(sock, s)).toBe('vic');
  expect(sock.emit).toHaveBeenCalledWith('petscii-palette', { palette: 'vic' });
  expect(webTerminalState(s).petsciiPalette).toBe('C64 (VIC-II)');
});
test('the character set flips and the atlas is told (W 22)', async () => {
  const s = caller(); const sock = socket();
  expect(await togglePetsciiCharset(sock, s)).toBe('swedish');
  expect(s.petsciiSwedish).toBe(true);
  expect(s.user.petsciiCharset).toBe('swedish');
  expect(webTerminalState(s).petsciiCharset).toBe('SWEDISH');
  expect(sock.emit).toHaveBeenCalledWith('petscii-charset', { charset: 'swedish' });
});
test('a PETSCII screen shows the C64 set as its font and says why it cannot change', () => {
  const s = { ...caller(), petsciiMode: true, terminalType: 'c64' };
  const st = webTerminalState(s);
  expect(st.font).toBe('C64 CHARACTER SET');
  expect(st.fontFixedNotice.length).toBeGreaterThan(0);
});
