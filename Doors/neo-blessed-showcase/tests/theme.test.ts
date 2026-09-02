/**
 * The showcase's chrome follows the board's theme; its demos do not.
 *
 * Every widget in this door carried a literal colour - 126 of them - and the
 * five that make up the FRAME (header, category panel, its list, the demo
 * pane, the status bar) were cyan, green and blue in all seven themes. The
 * demos keep their literals on purpose: a widget showcase demonstrating
 * `fg: 'red'` should show red.
 *
 * Driven, not read: the door's real start handler runs against a stubbed
 * session under two themes, and the test compares what it PAINTED. A source
 * pin would prove `themeStyles` is called, not that anything reached the
 * screen.
 */

import assert from 'assert';

async function paint(themeId?: string): Promise<string> {
  const door: any = (await import('../index')).default;
  const { themeById } = await import('@amiexpress/bbs-door-sdk/engines/ui/theme');

  const writes: string[] = [];
  const bbs: any = {
    write: (s: unknown) => writes.push(String(s)),
    writeLine: (s: unknown) => writes.push(`${String(s)}\n`),
    on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    getTheme: themeId ? () => themeById(themeId) : undefined,
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = {
    id: 'test-socket', on: () => {}, once: () => {}, emit: () => {},
    off: () => {}, removeAllListeners: () => {},
  };
  const ctx: any = {
    bbs, socket, params: [],
    output: { write: () => {}, writeLine: () => {} },
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 25, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  };

  // run() waits on the screen being destroyed, so the handler is started and
  // left running - what matters is what it has painted by then.
  void Promise.all(door.startHandlers.map((h: (c: unknown) => Promise<void>) => h(ctx)));
  await new Promise((r) => setTimeout(r, 1500));

  return writes.join('');
}

function squeeze(output: string): string {
  return output
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\s+/g, '');
}

export async function theShowcaseOpensAndPaintsItsChrome(): Promise<void> {
  const painted = squeeze(await paint());

  assert.ok(painted.includes('Neo-BlessedShowcase'), 'the header bar reaches the screen');
  assert.ok(painted.includes('Categories'), 'and the category panel');
  assert.ok(painted.includes('DemoArea'), 'and the demo pane');
}

export async function twoThemesGiveTwoDifferentFrames(): Promise<void> {
  const classic = await paint('classic');
  const other = await paint('uprough-neon');

  assert.notStrictEqual(classic, other,
    'the chrome follows the board theme - it used to be cyan, green and blue whatever the user chose');

  // The words are the door's, the dress is the theme's. uprough-neon asks for
  // double rules, so even the border CHARACTERS change: `.-Categories-.` under
  // classic, `+=Categories=+` under neon.
  for (const [name, painted] of [['classic', squeeze(classic)], ['uprough-neon', squeeze(other)]] as const) {
    assert.ok(painted.includes('Neo-BlessedShowcase'), `the header survives ${name}`);
    assert.ok(painted.includes('User:sysop'), `and the status bar under ${name}`);
    assert.ok(painted.includes('Categories') && painted.includes('DemoArea'),
      `and both panels under ${name}`);
  }
}
