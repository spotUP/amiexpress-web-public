/**
 * edit.tf frames for native .tti: TTI <-> frame <-> edit.tf URL hash.
 *
 * The golden hash below is edit.tf's OWN output: the `save_to_hash`
 * function was cut verbatim from rawles/edit.tf@c76fbeb teletext-editor.js
 * and run in a node vm on goldenFrame() (cc[r][c] = ((r*40+c)*37+11) % 128,
 * cset 0, blackfg 0); it set window.location.hash to this string. With
 * cset 5 and blackfg 1 the same data came out behind the nybble 'd'.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  ttiToFrame,
  frameToTti,
  frameToHash,
  hashToFrame,
  FRAME_CELLS,
} from '../../teletext/edittf-frame';
import { renderNativeTti } from '../../teletext/render-native';

const REPO = path.resolve(__dirname, '../../..');

const GOLDEN_HASH =
  '0:FsKvo_E0jmdj6ij7CLa2ASyt5RzeBqJvIu8whldDqaf5BK6n4Ows4xjW9oIuoe0s_kcjaSb3AKaXwKur4RTO5mHuIOso9jcDKKX1PJ6HoGsq_xDG1kGtr-kk7ibi6CTzOJZ3gCqp_Qy-xiFtLucg5hbCr6PxNI5nY-oo-wi2tgEsreUc3gaibyLvMIZXQ6mn-QSup-DsLOMY1vaCLqHtLP5HI2km9wCml8Crq-EUzuZh7iDrKPY3Ayil9Tyeh6BrKv8QxtZBra_pJO4m4ugk8ziWd4Aqqf0MvsYhbS7nIOYWwq-j8TSOZ2PqKPsItrYBLK3lHN4Gom8i7zCGV0Opp_kErqfg7CzjGNb2gi6h7Sz-RyNpJvcAppfAq6vhFM7mYe4g6yj2NwMopfU8noegayr_EMbWQa2v6STuJuLoJPM4lneAKqn9DL7GIW0u5yDmFsKvo_E0jmdj6ij7CLa2ASyt5RzeBqJvIu8whldDqaf5BK6n4Ows4xjW9oIuoe0s_kcjaSb3AKaXwKur4RTO5mHuIOso9jcDKKX1PJ6HoGsq_xDG1kGtr-kk7ibi6CTzOJZ3gCqp_Qy-xiFtLucg5hbCr6PxNI5nY-oo-wi2tgEsreUc3gaibyLvMIZXQ6mn-QSup-DsLOMY1vaCLqHtLP5HI2km9wCml8Crq-EUzuZh7iDrKPY3Ayil9Tyeh6BrKv8QxtZBra_pJO4m4ugk8ziWd4Aqqf0MvsYhbS7nIOYWwq-j8TSOZ2PqKPsItrYBLK3lHN4Gom8i7zCGV0Opp_kErqfg7CzjGNb2gi6h7Sz-RyNpJvcAppfAq6vhFM7mYe4g6yj2NwMopfU8noegayr_EMbWQa2v6STuJuLoJPM4lneAKqn9DL7GIW0u5yDmFsKvo_E0jmdj6ij7CLa2ASyt5RzeBqJvIu8whldDqaf5BK6n4Ows4xjW9oIuoe0s_kcjaSb3AKaXwKur4RTO5mHuIOso9jcDKKX1PJ6HoGsq_xDG1kGtr-kk7ibi6CTzOJZ3gCqp_Qy-xiFtLucg5hbCr6PxNI5nY-oo-wi2tgEsreUc3gaibyLvMIZXQ6mn-QSup-DsLOMY1vaCLqHtLP5HI2km9wCml8Crq-EUzuZh7iDrKPY3Ayil9Tyeh6BrKv8QxtZBra_pJO4';

function goldenFrame(): Uint8Array {
  const cells = new Uint8Array(FRAME_CELLS);
  for (let i = 0; i < FRAME_CELLS; i++) cells[i] = (i * 37 + 11) % 128;
  return cells;
}

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

  it('matches edit.tf\'s own save_to_hash output (golden)', () => {
    expect(GOLDEN_HASH).toHaveLength(2 + 1167);
    expect(frameToHash(goldenFrame())).toBe(GOLDEN_HASH);
    expect(frameToHash(goldenFrame(), 5, true)).toBe('d' + GOLDEN_HASH.slice(1));
  });

  it('decodes the golden hash back to the frame', () => {
    const decoded = hashToFrame('#' + GOLDEN_HASH + ':PN=100');
    expect(Array.from(decoded.cells)).toEqual(Array.from(goldenFrame()));
    expect(decoded.charset).toBe(0);
    expect(decoded.blackForeground).toBe(false);
    expect(decoded.extras).toEqual(['PN=100']);
    expect(hashToFrame('d' + GOLDEN_HASH.slice(1))).toMatchObject({ charset: 5, blackForeground: true });
  });

  it.each(files)('%s round-trips frame -> hash -> frame', (file) => {
    const { cells } = ttiToFrame(fs.readFileSync(path.join(REPO, file), 'latin1'));
    expect(Array.from(hashToFrame(frameToHash(cells)).cells)).toEqual(Array.from(cells));
  });

  it('reads the legacy 24-row hash with row 24 as spaces', () => {
    const cells = goldenFrame();
    const data = GOLDEN_HASH.slice(2, 2 + 1120);
    const decoded = hashToFrame('0:' + data);
    expect(Array.from(decoded.cells.subarray(0, 960))).toEqual(Array.from(cells.subarray(0, 960)));
    expect(decoded.cells.subarray(960).every((b) => b === 0x20)).toBe(true);
  });

  it('rejects a hash of the wrong length', () => {
    expect(() => hashToFrame('0:ABC')).toThrow(/1167 or 1120/);
  });
});
