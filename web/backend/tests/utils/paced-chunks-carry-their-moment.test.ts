/**
 * A chunk the modem pacer meters carries the moment it was meant to arrive.
 *
 * The browser replays that spacing through a jitter buffer
 * (packages/terminal/src/utils/playout-buffer.ts), so a bunch the network
 * delivered at once still paints at the modem's pace (the sysop, 2026-09-28:
 * "ok fix it", after the single-pacer change left web pacing exposed to
 * network jitter). Unpaced output carries no stamp.
 */
import { ModemEmulator } from '../../src/utils/modem-emulator.util';

function recordingSocket() {
  const emits: Array<{ data: unknown; attrs: unknown }> = [];
  const socket: any = { emit: (_event: string, data: unknown, attrs?: unknown) => { emits.push({ data, attrs }); return true; } };
  return { socket, emits };
}

it('stamps every metered chunk with a rising pacedAt, and leaves unpaced output bare', async () => {
  const { socket, emits } = recordingSocket();
  const modem = new ModemEmulator(socket);

  modem.write('bare');
  expect(emits[0]).toEqual({ data: 'bare', attrs: undefined });

  modem.enable(9600); // 960 bytes a second
  modem.write('x'.repeat(200));
  await modem.drain();

  const paced = emits.slice(1);
  expect(paced.length).toBeGreaterThan(1);
  const stamps = paced.map((e) => (e.attrs as { pacedAt?: number } | undefined)?.pacedAt);
  expect(stamps.every((t) => typeof t === 'number')).toBe(true);
  const nums = stamps as number[];
  expect(nums.every((t, i) => i === 0 || t >= nums[i - 1])).toBe(true);
  // 200 bytes at 960 a second: the stamps span most of ~200 ms.
  expect(nums[nums.length - 1] - nums[0]).toBeGreaterThan(120);
});
