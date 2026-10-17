import { getWipeFrames, getWipeOutFrames } from '../../src/utils/screen-wipe.util';
import { WIPE_CODES } from '../../src/screens/wipe-codes';

// Board art is Amiga ANSI (Topaz, ISO-8859-1). A wipe glyph above 0xFF has no
// Topaz cell and is not a single wire byte, so every wipe must stay in latin1.
const art =
  '\x1b[2J\x1b[H\x1b[1;33mMAIN MENU\x1b[0m\r\n' +
  Array.from({ length: 12 }, (_, i) => `\x1b[3${(i % 7) + 1}mRow ${i} text · ° body\x1b[0m`).join('\r\n') +
  '\r\n';

const wipes = Array.from(new Set(Object.values(WIPE_CODES)));

describe.each(wipes)('wipe %s', (wipe) => {
  test.each([
    ['getWipeFrames', getWipeFrames],
    ['getWipeOutFrames', getWipeOutFrames],
  ] as const)('%s draws only characters up to 0xFF', (_n, fn) => {
    const frames = fn(wipe, art, 80);
    expect(frames.length).toBeGreaterThan(0);
    const bad = new Set<string>();
    for (const f of frames) for (const ch of f.content) if (ch.codePointAt(0)! > 0xff) bad.add(ch);
    expect([...bad]).toEqual([]);
  });
});
