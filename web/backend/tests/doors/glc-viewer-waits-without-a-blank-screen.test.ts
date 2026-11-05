/**
 * A caller is never left looking at nothing.
 *
 * The sysop, 2026-09-16: "could we make global last callers draws skeleton
 * loaders while waiting for the network? the network root issues should be
 * fixed as well ofcourse" - after a login where the 68K viewer held the line
 * for 58 SECONDS with `TIMEOUT=5` in its own config and a black screen on the
 * wire the whole time.
 *
 * Two answers, and they are separate: the screen OPENS before the network is
 * asked, and the network gets ONE deadline rather than a socket timer that
 * restarts on every byte.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { bodyForThisCall, readCache, withDeadline, CACHE_FILE }
  from '../../../../board/Doors/glc-viewer/src/fetch-deadline';
import { rewind, skeletonRow, skeletonRows, overwrite }
  from '../../../../board/Doors/glc-viewer/src/skeleton';
import { ROW_TEMPLATE } from '../../../../board/Doors/glc-viewer/src/art.generated';

const laterThan = (ms: number, value: string) =>
  () => new Promise<string>((resolve) => setTimeout(() => resolve(value), ms));

describe('the placeholder rows', () => {
  it('are built from the row template, so the table cannot jump', () => {
    // Same separators in the same places as a real call: change the template
    // and these follow, because they ARE the template.
    const separators = (line: string) => line.split('\x1b[34m:').length;
    expect(separators(skeletonRow())).toBe(separators(ROW_TEMPLATE));
  });

  it('are one per caller the door is about to ask for', () => {
    expect(skeletonRows(20)).toHaveLength(20);
    expect(skeletonRows(0)).toHaveLength(0);
    expect(skeletonRows(-3)).toHaveLength(0);
  });

  it('say "not yet" rather than "none" - dots, not blanks', () => {
    expect(skeletonRow()).toContain('.');
    expect(skeletonRow().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()).not.toBe('');
  });

  it('are walked back over exactly, one row at a time', () => {
    // One `ESC[A` per row: a PETSCII caller's cursor-up takes no parameter,
    // so the repeated form is what both transports agree on.
    expect(rewind(3)).toBe('\x1b[A\x1b[A\x1b[A');
    expect(rewind(0)).toBe('');
  });

  it('are cleared before the real row lands on them', () => {
    // Without the clear, a short real row leaves the tail of a placeholder.
    expect(overwrite('abc')).toBe('\x1b[Kabc');
  });
});

describe('the deadline', () => {
  it('gives up on the wall clock, not on socket silence', async () => {
    const started = Date.now();
    const answer = await withDeadline(laterThan(5_000, 'too late'), 1);

    expect(answer).toBeNull();
    // Comfortably under the fetch's own five seconds: the point is that the
    // door stops waiting, not that the fetch stops running.
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it('takes an answer that arrives in time', async () => {
    await expect(withDeadline(laterThan(10, 'in time'), 5)).resolves.toBe('in time');
  });

  it('is not tripped by a fetch that simply fails', async () => {
    await expect(withDeadline(() => Promise.reject(new Error('refused')), 5)).resolves.toBeNull();
  });

  it('keeps a late answer for the next caller', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glc-late-'));
    const late: string[] = [];
    // SLOWER than the deadline, which is the case that matters: an answer
    // that beats it is simply returned.
    await withDeadline(laterThan(1_200, 'the slow answer'), 1, (body) => late.push(body));

    // The deadline passed, but the answer is not thrown away - a slow
    // scenewall pays for itself on the NEXT call.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(late).toEqual(['the slow answer']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('what a caller is given when the scenewall is slow', () => {
  const board = () => fs.mkdtempSync(path.join(os.tmpdir(), 'glc-cache-'));

  it('is the fresh answer when one arrives, and it is kept', async () => {
    const dir = board();
    const result = await bodyForThisCall(async () => '{"calls":[]}', 5, dir);

    expect(result).toEqual({ body: '{"calls":[]}', source: 'network' });
    expect(readCache(dir)).toBe('{"calls":[]}');
  });

  it('is the LAST answer when the deadline passes', async () => {
    const dir = board();
    fs.writeFileSync(path.join(dir, CACHE_FILE), '{"calls":["yesterday"]}');

    const result = await bodyForThisCall(laterThan(5_000, 'too late'), 1, dir);

    // Yesterday's list beats a red line, and it is what the door would have
    // shown him a minute earlier anyway.
    expect(result).toEqual({ body: '{"calls":["yesterday"]}', source: 'cache' });
  });

  it('says so plainly when there is nothing at all', async () => {
    const result = await bodyForThisCall(laterThan(5_000, 'too late'), 1, board());
    expect(result).toEqual({ body: null, source: 'nothing' });
  });

  it('does not leave a half-written cache behind a killed door', async () => {
    const dir = board();
    await bodyForThisCall(async () => '{"calls":[1]}', 5, dir);
    // Written through a temp file and renamed, so the next caller never
    // parses a truncated one.
    expect(fs.existsSync(path.join(dir, `${CACHE_FILE}.tmp`))).toBe(false);
    expect(readCache(dir)).toBe('{"calls":[1]}');
  });
});

describe('the footer waits with the table', () => {
  const { skeletonBody, skeletonFooter, skeletonRow, awaitsData } = require('../../../../board/Doors/glc-viewer/src/skeleton');
  const { renderGlcFooter, renderGlcRows } = require('../../../../board/Doors/glc-viewer/src/render');
  const { narrowSkeletonBody, narrowBody, NARROW_RULE } = require('../../../../board/Doors/glc-viewer/src/narrow');
  const art = require('../../../../board/Doors/glc-viewer/src/art.generated');

  const day = { statdate: '16-09-26', calls: '132', topcps: '99999', uploads: '1', downloads: '2' };
  const records = {
    allcalls: '1', recordcalls: '361', calls: '102', mostcalled: 'The Northern Palace',
    calls2: '3', secondmostcalled: 'x', calls3: '2', thirdmostcalled: 'y',
  };
  const screen = (style: number) => ({
    style, logo: [], columns: 80, showLocation: false, screenClear: false, calls: [],
    yesterday: day, previousDay: day, records,
  });

  it('has exactly the rows the real footer will have, in every style', () => {
    for (const style of [1, 2, 3, 4]) {
      expect(skeletonFooter(style)).toHaveLength(renderGlcFooter(screen(style)).length);
      expect(skeletonBody(6, style)).toHaveLength(6 + renderGlcFooter(screen(style)).length);
    }
  });

  it('keeps the rules and the legend as they are - only the totals are dots', () => {
    const footer = skeletonFooter(1);
    expect(footer[0]).toBe(art.RULER_BOTTOM);
    for (const line of art.LEGEND) expect(footer).toContain(line);
    expect(footer[footer.length - 1]).toBe(art.RULE_FINAL);
    expect(footer.some((row: string) => row.includes('........'))).toBe(true);
  });

  it('knows which rows are waiting for data and which are already themselves', () => {
    expect(awaitsData(skeletonRow())).toBe(true);
    expect(awaitsData(art.RULER_BOTTOM)).toBe(false);
    for (const line of art.LEGEND) expect(awaitsData(line)).toBe(false);
    const footer = skeletonFooter(3);
    expect(footer.filter(awaitsData)).toHaveLength(3);
  });

  it('holds the same rows on a C64 as the real body will settle onto', () => {
    const call = {
      Username: 'Spot', Location: 'Sweden', Bbsname: 'uPtOWN', Dateon: '16-09',
      Timeon: '08:38', Timeoff: '08:44', Actions: 'UD', Upload: '1', Download: '2',
    };
    const real = narrowBody({
      logo: [], showLocation: false, screenClear: false, calls: [call, call, call],
      yesterday: day, records,
    });
    expect(narrowSkeletonBody(3)).toHaveLength(real.length);
    expect(narrowSkeletonBody(3)[3]).toBe(NARROW_RULE);
  });
});
