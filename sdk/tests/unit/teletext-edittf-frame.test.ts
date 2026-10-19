/**
 * edit.tf frames for native .tti: TTI <-> 25x40 frame of 7-bit cells.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  ttiToFrame,
  frameToTti,
  FRAME_CELLS,
} from '../../teletext/edittf-frame';
import { renderNativeTti } from '../../teletext/render-native';

const REPO = path.resolve(__dirname, '../../..');

/** Every tracked .tti, read one byte per char (the encoding OL payloads use). */
function trackedTti(): string[] {
  return execSync("git ls-files '*.tti'", { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.trim() !== '');
}

describe('edit.tf frame conversion', () => {
  const files = trackedTti();

  it('finds the tracked .tti corpus', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // Text is not compared byte for byte with the source: the repo's files
  // spell control codes as \xNN escapes and some put FL after the OL rows,
  // while frameToTti writes encodeOLContent's raw 0x80-0x9F chars and the
  // records first. What must hold is the frame and what the caller sees,
  // and that the written text is a fixed point.
  it.each(files)('%s round-trips TTI -> frame -> TTI -> frame', (file) => {
    const original = fs.readFileSync(path.join(REPO, file), 'latin1');
    const first = ttiToFrame(original);
    const written = frameToTti(first.cells, first.meta);
    const second = ttiToFrame(written);

    expect(Array.from(second.cells)).toEqual(Array.from(first.cells));
    expect(second.meta).toEqual(first.meta);
    expect(frameToTti(second.cells, second.meta)).toBe(written);
    expect(first.cells).toHaveLength(FRAME_CELLS);
    expect(first.cells.every((b) => b < 0x80)).toBe(true);

    const before = renderNativeTti(original);
    expect(before).not.toBeNull();
    expect(renderNativeTti(written)).toEqual(before);
  });

  it('keeps a carousel\'s later subpages verbatim', () => {
    const text = fs.readFileSync(path.join(REPO, 'Teletext/uprough-demo/pages/P102-0000.tti'), 'latin1');
    const { cells, meta } = ttiToFrame(text);
    expect(meta.tail[0]).toBe('PN,10201');
    const written = frameToTti(cells, meta);
    const lines = text.split('\n');
    const tailStart = lines.indexOf('PN,10201');
    expect(written.endsWith(lines.slice(tailStart).join('\n'))).toBe(true);
  });

  it('places OL rows by number, fills gaps with spaces, keeps row 24', () => {
    const text = 'DE,t\nPN,10000\nSC,0000\nOL,2,\\x81AB\nOL,24,\\x82Z\n';
    const { cells, meta } = ttiToFrame(text);
    expect(meta.head).toEqual(['DE,t', 'PN,10000', 'SC,0000']);
    expect(Array.from(cells.subarray(80, 83))).toEqual([0x01, 0x41, 0x42]);
    expect(cells[83]).toBe(0x20);
    expect(Array.from(cells.subarray(960, 962))).toEqual([0x02, 0x5a]);
    expect(cells.filter((b, i) => b !== 0x20 && !(i >= 80 && i < 83) && !(i >= 960 && i < 962)).length).toBe(0);
    expect(frameToTti(cells, meta)).toBe('DE,t\nPN,10000\nSC,0000\nOL,2,\x81AB\nOL,24,\x82Z\n');
  });
  it('writes a default PN when the head has none, so a blank-drawn page renders', () => {
    const cells = new Uint8Array(FRAME_CELLS).fill(0x20);
    cells.set([0x48, 0x49], 40);
    const written = frameToTti(cells, { head: [], tail: [], eol: '\n' });
    expect(written).toBe('PN,10000\nOL,1,HI\n');
    expect(renderNativeTti(written)).not.toBeNull();
    // A head that already names its page keeps it, untouched.
    expect(frameToTti(cells, { head: ['PN,10500'], tail: [], eol: '\n' })).toBe('PN,10500\nOL,1,HI\n');
  });
});
