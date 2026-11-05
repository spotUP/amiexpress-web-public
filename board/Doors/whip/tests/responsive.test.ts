/**
 * WHIP opens at the board's 80 columns; Alt+Enter widens.
 *
 * Same contract as livechat/grandmaster (sdk/utils/terminal-mode.ts):
 * fixed start (never wide unasked), toggle asks the terminal, dispose
 * puts 80 back. Pinned here so a "responsive by default" regression or
 * a dropped dispose shows up without booting the whole door.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { attachResponsiveMode } from '../ui/responsive';

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

export async function startsFixedAndTogglesOnAltEnter(): Promise<void> {
  const screen = open();
  try {
    const calls: string[] = [];
    const bbs: any = {
      enableWideMode: () => { calls.push('wide'); },
      disableWideMode: () => { calls.push('fixed'); },
    };
    let relaid = 0;
    const sw = attachResponsiveMode(bbs, screen, () => { relaid++; });

    assert.strictEqual(sw.mode(), 'fixed', 'WHIP starts at the board width');
    // The switch enforces the opening width on attach (fixed here) -
    // that enforcement IS the ask, not unprompted wanderlust.
    assert.deepStrictEqual(calls, ['fixed'], 'attach enforces the opening width');

    sw.toggle();
    assert.strictEqual(sw.mode(), 'wide', 'Alt+Enter path widens');
    assert.deepStrictEqual(calls, ['fixed', 'wide'], 'the terminal was asked');

    sw.toggle();
    assert.strictEqual(sw.mode(), 'fixed');
    assert.deepStrictEqual(calls, ['fixed', 'wide', 'fixed']);

    sw.dispose();
    screen.destroy();
    assert.ok(relaid >= 0, 'relayout hook held');
  } finally {
    try { screen.destroy(); } catch { /* already gone */ }
  }
}

export async function disposeRestoresEightyColumns(): Promise<void> {
  const screen = open();
  try {
    const calls: string[] = [];
    const bbs: any = {
      enableWideMode: () => { calls.push('wide'); },
      disableWideMode: () => { calls.push('fixed'); },
    };
    const sw = attachResponsiveMode(bbs, screen, () => {});
    sw.toggle();
    sw.dispose();
    assert.ok(calls.includes('fixed'), 'quitting puts 80 columns back');
  } finally {
    try { screen.destroy(); } catch { /* already gone */ }
  }
}
