/**
 * The door OPENS, on a C64's screen. Driven, not read.
 *
 * The fork base learned this the hard way: `backport.test.ts` asserted the
 * SOURCE mentioned `createTerminalModeSwitch` and passed the whole time while
 * every caller got a TypeError, because a source pin proves a call exists and
 * not that it runs. So this file starts the door against a forty-column
 * terminal - the one this door exists for - and looks at what it built.
 */

import assert from 'assert';
import { PetsciiStudioDoor } from '../index';

interface Recorded { mouseEnabled: number }

function fakeContext(size: { width: number; height: number }, recorded: Recorded, accessLevel = 100) {
  const bbs: any = {
    write: () => {},
    writeLine: () => {},
    on: () => {},
    getTerminalSize: () => size,
    enableWideMode: () => {},
    disableWideMode: () => {},
    enableMouseEvents: () => { recorded.mouseEnabled++; },
    disableMouseEvents: () => {},
    getTheme: () => 'classic',
    connectionType: 'web',
    unicodeCapable: true,
    isPetsciiMode: () => size.width <= 40,
  };
  return {
    bbs,
    storage: {
      keys: async () => [], load: async () => null,
      save: async () => {}, delete: async () => {},
    },
    user: { name: 'sysop', accessLevel },
    output: { writeLine: () => {} },
    close: () => {},
  } as any;
}

/** Start the door, give it a tick, hand back what it built. */
async function started(size: { width: number; height: number }, recorded: Recorded): Promise<any> {
  const door: any = new (PetsciiStudioDoor as any)();
  door.setContext(fakeContext(size, recorded));
  // start() resolves only when the door exits, so race it against a tick:
  // everything under test happens synchronously before the wait.
  await Promise.race([door.start(), new Promise((r) => setTimeout(r, 250))]);
  return door;
}

export async function theDoorOpensOnAC64(): Promise<void> {
  const recorded: Recorded = { mouseEnabled: 0 };
  const door = await started({ width: 40, height: 25 }, recorded);
  try {
    assert.ok(door.editor, 'the editor must exist after start()');
    assert.ok((door as any).terminalMode, 'and the size switch with it');
  } finally {
    door.destroy();
  }
}

export async function theCanvasIsTheWholeGlassAtForty(): Promise<void> {
  const recorded: Recorded = { mouseEnabled: 0 };
  const door = await started({ width: 40, height: 25 }, recorded);
  try {
    const position = door.editor.position;
    assert.strictEqual(position.width, 40, 'a PETSCII screen is forty columns');
    assert.strictEqual(position.height, 25, 'and twenty-five rows');
    assert.strictEqual((door as any).sidebar, null, 'no room for chrome beside it on a C64');
  } finally {
    door.destroy();
  }
}

export async function aWideTerminalGetsTheSidebar(): Promise<void> {
  const recorded: Recorded = { mouseEnabled: 0 };
  const door = await started({ width: 80, height: 25 }, recorded);
  try {
    assert.ok((door as any).sidebar, 'eighty columns have room for the tool and the pen');
    assert.strictEqual(door.editor.position.width, 40,
      'the art stays forty columns wide however wide the terminal is');
  } finally {
    door.destroy();
  }
}

export async function theMouseIsAskedFor(): Promise<void> {
  const recorded: Recorded = { mouseEnabled: 0 };
  const door = await started({ width: 40, height: 25 }, recorded);
  try {
    assert.ok(recorded.mouseEnabled > 0, 'a web caller draws with the pointer');
  } finally {
    door.destroy();
  }
}

export async function everythingPaintedFitsTheGlass(): Promise<void> {
  const recorded: Recorded = { mouseEnabled: 0 };
  const door = await started({ width: 40, height: 25 }, recorded);
  try {
    const walk = (element: any): void => {
      const coords = element._getCoords?.();
      if (coords) {
        assert.ok(coords.xl <= 40, `a row hangs off the glass: ${coords.xi}..${coords.xl}`);
        assert.ok(coords.yl <= 25, `a column hangs off the glass: ${coords.yi}..${coords.yl}`);
      }
      for (const child of element.children ?? []) walk(child);
    };
    walk((door as any).screen);
  } finally {
    door.destroy();
  }
}
