/**
 * NOTHING OVERTAKES WHAT THE MODEM IS STILL SENDING.
 *
 * "with modem speed emulation on, not set to max the bbs is very broken", and
 * asked what it looked like: output arrives out of order (the sysop,
 * 2026-09-24, at 56k).
 *
 * Two paths write to a caller's terminal. Most output goes through
 * `ModemEmulator`, which queues it and pays it out at the caller's baud. Art
 * screens and wipes do their OWN pacing - they have frames to time - and
 * write with `_directEmit`, under the queue, so they are not throttled twice.
 *
 * Under, but they were also AHEAD: with emulation on, the prompt or the
 * screen before can still be draining when the animation starts, and a direct
 * write lands in front of it. At full speed the queue is always empty and
 * nothing shows, which is why this only ever broke for the caller who asked
 * for a modem.
 *
 * The rule is one line: drain first, then write direct.
 */
import { ModemEmulator } from '../../src/utils/modem-emulator.util';

/** A socket that records the order things reach the wire. */
function wireSocket(): { socket: any; wire: string[] } {
  const wire: string[] = [];
  const socket: any = {
    id: 'sock-modem',
    emit: (event: string, data: string) => { if (event === 'ansi-output') wire.push(data); return true; },
    on: () => {}, once: () => {}, removeListener: () => {},
  };
  return { socket, wire };
}

describe('a direct write while the modem is still sending', () => {
  it('waits its turn instead of landing first', async () => {
    const { socket, wire } = wireSocket();
    const modem = new ModemEmulator(socket);
    modem.install();
    modem.enable(2400);                       // 240 bytes a second: slow on purpose

    socket.emit('ansi-output', 'THE SCREEN BEFORE'.repeat(20));

    // What the art path does, with the fix: drain, then write under the queue.
    if (modem.hasPendingData()) await modem.drain();
    (socket as any)._directEmit('ansi-output', 'THE ANIMATION');

    expect(wire[wire.length - 1]).toBe('THE ANIMATION');
    expect(wire.join('')).toContain('THE SCREEN BEFORE');
  });

  it('lands first without the wait - the defect, kept as the reason', async () => {
    const { socket, wire } = wireSocket();
    const modem = new ModemEmulator(socket);
    modem.install();
    modem.enable(2400);

    socket.emit('ansi-output', 'THE SCREEN BEFORE'.repeat(20));
    (socket as any)._directEmit('ansi-output', 'THE ANIMATION');

    // Out of order: the animation is on the wire before the screen finishes.
    expect(wire[0]).toBe('THE ANIMATION');
    await modem.drain();
  });

  it('says when it has something in hand', () => {
    const { socket } = wireSocket();
    const modem = new ModemEmulator(socket);
    modem.install();
    modem.enable(2400);

    expect(modem.hasPendingData()).toBe(false);
    socket.emit('ansi-output', 'x'.repeat(4000));
    expect(modem.hasPendingData()).toBe(true);
  });

  it('has nothing to wait for at full speed, which is why this never showed', () => {
    const { socket } = wireSocket();
    const modem = new ModemEmulator(socket);
    modem.install();
    // No enable(): emulation off, everything goes straight out.

    socket.emit('ansi-output', 'x'.repeat(4000));

    expect(modem.hasPendingData()).toBe(false);
  });
});
