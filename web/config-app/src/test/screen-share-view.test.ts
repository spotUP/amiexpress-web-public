import { describe, expect, test } from 'vitest';
import { summariseShare } from '../pages/screen-share-view';

describe('the share summary', () => {
  test('splits nodes into those that can share and those that cannot, with the reason', () => {
    const summary = summariseShare({
      1: { ok: true, reasons: [], losing: [], gaining: [], nodeHasNoScreens: false },
      2: { ok: false, reasons: ['LOGON.TXT differs'], losing: [], gaining: [], nodeHasNoScreens: false },
    });

    expect(summary.canShare).toEqual([1]);
    expect(summary.blocked).toEqual([{ id: 2, reasons: ['LOGON.TXT differs'] }]);
  });

  test('a node losing a file is blocked, and the file is named in the reason', () => {
    const summary = summariseShare({
      3: { ok: false, reasons: [], losing: ['JOIN.TXT'], gaining: [], nodeHasNoScreens: false },
    });

    expect(summary.blocked[0].reasons.join(' ')).toMatch(/would lose JOIN\.TXT/);
  });

  test('a node gaining a file it does not have is named too', () => {
    const summary = summariseShare({
      4: { ok: false, reasons: [], losing: [], gaining: ['JOINED.TXT'], nodeHasNoScreens: false },
    });

    expect(summary.blocked[0].reasons.join(' ')).toMatch(/would gain JOINED\.TXT/);
  });

  test('a blocked node never shows an empty explanation', () => {
    const summary = summariseShare({
      5: { ok: false, reasons: [], losing: [], gaining: [], nodeHasNoScreens: false },
    });

    expect(summary.blocked[0].reasons.length).toBeGreaterThan(0);
  });
});
