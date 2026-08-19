/**
 * 68K doors run at full speed unless their .info asks to be paced.
 *
 * Door output used to go through the user's modem throttle unconditionally
 * (io.ts directEmit, policy of 2026-04-29). Measured on DoorRepo's
 * full-screen browser, same binary both sides: ~7ms per 198-byte JH_SM with
 * no modem emulator in the path, ~200ms on a session throttled to 56000 bps,
 * because sendThrottled() slices the payload and sleeps in 5ms quanta. One
 * redraw is 11-80 such messages, so a cursor keypress cost 1-2 seconds of
 * pure pacing while 68K execution was 5ms of it.
 *
 * The behaviour that MUST hold, and which these pin:
 *   - by default a door is unthrottled,
 *   - THROTTLE=YES opts back in (Conftop-style doors whose visuals are
 *     paced for a modem - the reason the throttle exists at all),
 *   - and the user's speed is ALWAYS restored, because leaving the BBS
 *     unthrottled would change how the whole board renders afterwards.
 */

/** Minimal stand-in for the per-socket ModemEmulator. */
class FakeModem {
  private bps = 0;
  private on = false;
  enableCalls: number[] = [];
  disableCalls = 0;
  enable(bps: number) { this.bps = bps; this.on = bps > 0; this.enableCalls.push(bps); }
  disable() { this.on = false; this.disableCalls++; }
  isEnabled() { return this.on; }
  getBps() { return this.bps; }
}

/**
 * The two methods under test touch only `this.socket`, the tooltype flag and
 * the saved bps, so they are exercised against a hand-built `this`. That
 * keeps the test free of the emulator, the ROM and a live socket.
 */
function makeSession(modem: FakeModem | null, wantsThrottle: boolean) {
  jest.doMock('../../src/utils/modem-emulator.util', () => ({
    getModemEmulator: () => modem,
  }), { virtual: false });

  const { AmigaDoorSession } = require('../../src/amiga-emulation/AmigaDoorSession');
  const ctx: any = {
    socket: {},
    wantsModemThrottle: wantsThrottle,
    suspendedModemBps: null,
  };
  return {
    ctx,
    suspend: () => AmigaDoorSession.prototype['suspendModemThrottle'].call(ctx),
    restore: () => AmigaDoorSession.prototype['restoreModemThrottle'].call(ctx),
  };
}

describe('door modem pacing', () => {
  beforeEach(() => { jest.resetModules(); });

  test('a door runs unthrottled by default', () => {
    const modem = new FakeModem();
    modem.enable(56000);
    const s = makeSession(modem, false);

    s.suspend();

    expect(modem.isEnabled()).toBe(false);
    expect(s.ctx.suspendedModemBps).toBe(56000);
  });

  test('THROTTLE=YES leaves the modem pacing alone', () => {
    // Conftop's clear/redraw is the reason this escape hatch exists.
    const modem = new FakeModem();
    modem.enable(2400);
    const s = makeSession(modem, true);

    s.suspend();

    expect(modem.isEnabled()).toBe(true);
    expect(modem.disableCalls).toBe(0);
    expect(s.ctx.suspendedModemBps).toBeNull();
  });

  test('the user gets their speed back when the door exits', () => {
    const modem = new FakeModem();
    modem.enable(9600);
    const s = makeSession(modem, false);

    s.suspend();
    expect(modem.isEnabled()).toBe(false);

    s.restore();

    expect(modem.isEnabled()).toBe(true);
    expect(modem.getBps()).toBe(9600);
  });

  test('restore is idempotent, so repeated cleanup cannot double-enable', () => {
    const modem = new FakeModem();
    modem.enable(9600);
    const s = makeSession(modem, false);
    s.suspend();

    s.restore();
    s.restore();
    s.restore();

    expect(modem.enableCalls).toEqual([9600, 9600]);  // the original + one restore
  });

  test('a user who never had throttling is left exactly as they were', () => {
    // baud=0 is the common case; suspending must not invent a restore that
    // switches modem emulation ON when the door exits.
    const modem = new FakeModem();
    const s = makeSession(modem, false);

    s.suspend();
    s.restore();

    expect(modem.disableCalls).toBe(0);
    expect(modem.enableCalls).toEqual([]);
    expect(modem.isEnabled()).toBe(false);
  });

  test('a socket with no modem emulator does not break the door', () => {
    const s = makeSession(null, false);

    expect(() => { s.suspend(); s.restore(); }).not.toThrow();
    expect(s.ctx.suspendedModemBps).toBeNull();
  });
});
