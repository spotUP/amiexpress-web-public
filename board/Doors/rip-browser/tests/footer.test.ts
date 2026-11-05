/**
 * The RIP browser's key hints survive somebody using the browser.
 *
 * Selecting a file called `footer.setContent()` straight over the hint row,
 * so `Arrows: Navigate  Enter: View  F5: Force View  Q: Quit  /////` was
 * gone the instant anyone pressed Down - the door had a footer only until it
 * was used, which is the same as not having one. The filename is a SUFFIX
 * after the hints now.
 *
 * Driven, not read: the door is started for real and the list's own
 * `select item` event is what moves the cursor.
 */
import assert from 'assert';
import { join } from 'path';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';

/** blessed tags are markup; the ROW is what is left when they are gone. */
function plain(text: unknown): string {
  return String(text ?? '').replace(/\{[^}]*\}/g, '');
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Start the door and hand back the footer row and the list.
 *
 * The footer comes back from the SDK call the door makes, which is the only
 * place that knows which element the hints are drawn into. chrome.js is
 * required by path rather than through the theme barrel: the barrel
 * re-exports through getters, so assigning to it changes nothing the door
 * will read.
 */
async function open(themeId = 'uprough-neon'): Promise<{
  screen: any; footer: any; list: any;
}> {
  const chrome = require(
    join(__dirname, '../../../sdk/dist/engines/ui/theme/chrome.js')
  );
  const real = chrome.attachDoorChrome;
  let footer: any = null;
  chrome.attachDoorChrome = (...args: any[]) => {
    footer = args[1]?.footer ?? footer;
    return real(...args);
  };

  const theme = themeById(themeId);
  const bbs: any = {
    write: () => undefined, writeLine: () => undefined, on: () => undefined,
    getTerminalSize: () => ({ width: 80, height: 24 }),
    getTheme: () => theme, connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = {
    on: () => undefined, once: () => undefined, off: () => undefined,
    emit: () => undefined, removeAllListeners: () => undefined, id: 'rip-test',
  };

  try {
    // dist, not src: dist/app.js is what the board runs, and it is CommonJS,
    // so its call goes through the very module object patched above.
    const { execute } = require('../dist/app.js');
    void execute({
      socket, bbs, user: { username: 'CALLER', id: 'caller-1' },
      bbsSession: { nodeId: 1 }, params: [], close: () => undefined,
    });
    await sleep(200);
  } finally {
    chrome.attachDoorChrome = real;
  }

  assert.ok(footer, 'the door never asked the SDK for its chrome');
  const screen = footer.screen;
  assert.ok(screen, 'the footer is not attached to a screen');

  // The list is the one child of the main box that has items.
  const findList = (node: any): any => {
    for (const child of node?.children ?? []) {
      if (typeof child.setItems === 'function' && Array.isArray(child.items)) return child;
      const found = findList(child);
      if (found) return found;
    }
    return null;
  };
  const list = findList(screen);
  assert.ok(list, 'no list was found on the screen');
  return { screen, footer, list };
}

/** Every key cap the hint row promises. */
const CAPS = ['Arrows:', 'Enter:', 'F5:', 'Q:'];

export async function theHintRowIsDrawnWhenTheDoorOpens(): Promise<void> {
  const { screen, footer } = await open();
  try {
    const row = plain(footer.getContent());
    for (const cap of CAPS) {
      assert.ok(row.includes(cap), `hint row is missing ${cap}: ${JSON.stringify(row)}`);
    }
    assert.ok(row.includes('/'), `hint row has no branding tail: ${JSON.stringify(row)}`);
  } finally {
    try { screen.destroy(); } catch { /* leaving anyway */ }
  }
}

export async function movingTheCursorKeepsTheHintsAndAddsTheFilename(): Promise<void> {
  const { screen, footer, list } = await open();
  try {
    // What the browser does the moment anyone presses Down.
    list.emit('select item', 'PARTY.RIP');
    await sleep(20);

    const row = plain(footer.getContent());
    assert.ok(
      row.includes('PARTY.RIP'),
      `the selection never reached the footer: ${JSON.stringify(row)}`
    );
    for (const cap of CAPS) {
      assert.ok(
        row.includes(cap),
        `moving the cursor ate the ${cap} hint: ${JSON.stringify(row)}`
      );
    }
  } finally {
    try { screen.destroy(); } catch { /* leaving anyway */ }
  }
}

export async function aSecondSelectionReplacesOnlyTheFilename(): Promise<void> {
  const { screen, footer, list } = await open();
  try {
    list.emit('select item', 'FIRST.RIP');
    await sleep(20);
    list.emit('select item', 'SECOND.RIP');
    await sleep(20);

    const row = plain(footer.getContent());
    assert.ok(row.includes('SECOND.RIP'), `second selection missing: ${JSON.stringify(row)}`);
    assert.ok(
      !row.includes('FIRST.RIP'),
      `the suffix accumulated instead of replacing: ${JSON.stringify(row)}`
    );
    for (const cap of CAPS) {
      assert.ok(row.includes(cap), `the ${cap} hint went missing: ${JSON.stringify(row)}`);
    }
  } finally {
    try { screen.destroy(); } catch { /* leaving anyway */ }
  }
}
