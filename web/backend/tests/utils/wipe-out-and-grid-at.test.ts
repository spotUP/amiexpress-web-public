import { getWipeFrames, getWipeOutFrames, parseAnsiToGrid, renderGridAt, gridSize } from '../../src/utils/screen-wipe.util';
import { playWipeFrames } from '../../src/utils/wipe-playback';

const art = '\x1b[2J\x1b[H' + '\x1b[1;33mMAIN MENU\r\n' + 'R  Read Mail\r\nF  File Listings\r\n';

test('a conceal starts from the screen and ends on a blank one', () => {
  const frames = getWipeOutFrames('hblinds', art, 80);
  expect(frames.length).toBeGreaterThan(2);
  expect(frames[0].content).toContain('MAIN MENU');
  const last = frames[frames.length - 1];
  expect(last.content).toContain('\x1b[2J');
  expect(last.content.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim()).toBe('');
  expect(last.delay).toBe(0);
});

test('conceal and reveal visit the same number of grids', () => {
  expect(getWipeOutFrames('blocks', art, 80).length).toBe(getWipeFrames('blocks', art, 80).length);
});

test('a grid drawn at a position addresses every row it draws and never passes its box', () => {
  const grid = parseAnsiToGrid(' /\\_/\\\r\n( o.o )\r\n > ^ <\r\n', 80);
  expect(gridSize(grid)).toEqual({ rows: 3, cols: 7 });
  const out = renderGridAt(grid, 5, 10, 2, 5);
  expect(out).toContain('\x1b[5;10H');
  expect(out).toContain('\x1b[6;10H');
  expect(out).not.toContain('\x1b[7;10H');
  expect(out.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split('').filter(ch => ch !== ' ').join('')).toBe('/\\_/(o.o');
});

test('playback emits one event per frame with the pre-paced marker and waits the frame delay', async () => {
  const sent: Array<[string, string, unknown]> = [];
  const socket = { _directEmit: (e: string, d: string, a: unknown) => sent.push([e, d, a]) };
  const frames = [{ content: 'a', delay: 20 }, { content: 'b', delay: 0 }];
  const t0 = Date.now();
  await playWipeFrames(socket, frames, { eventName: 'ansi-output' });
  expect(sent.map(s => s[1])).toEqual([expect.stringContaining('a'), expect.stringContaining('b')]);
  expect(sent[1][1]).toContain('\x1b[0m');
  expect(Date.now() - t0).toBeGreaterThanOrEqual(18);
});

test('opts.emit overrides the socket emitter', async () => {
  const viaSocket: string[] = [];
  const viaOpts: string[] = [];
  const socket = { _directEmit: (_e: string, d: string) => viaSocket.push(d) };
  await playWipeFrames(socket, [{ content: 'z', delay: 0 }], { eventName: 'ansi-output', emit: (_e, d) => viaOpts.push(d) });
  expect(viaOpts).toHaveLength(1);
  expect(viaSocket).toHaveLength(0);
});
