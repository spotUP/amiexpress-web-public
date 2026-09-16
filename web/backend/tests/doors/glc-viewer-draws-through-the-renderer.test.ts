/**
 * The door draws with the pinned renderer, not with art of its own.
 *
 * `glc-viewer-parity.test.ts` proves the RENDERER matches `GLCViewer.e`. This
 * proves the DOOR uses it - the half that was wrong before, since the port
 * carried 109 lines of hand-drawn approximation inside `displayData` and the
 * renderer could have been perfect and unreached.
 *
 * Driven through the door's own start handler with the network stubbed, so
 * what is asserted is what a caller's socket receives.
 */
import * as path from 'path';

const DOOR = path.join(__dirname, '../../../../Doors/glc-viewer/index.ts');

/** One page of the server's JSON, shaped as scenewall sends it. */
const RESPONSE = JSON.stringify({
  calls: [{
    Username: 'Spot', Location: 'Sweden', Bbsname: 'uPtOWN',
    Dateon: '16-09-2026', Timeon: '08:38', Timeoff: '08:44',
    Actions: 'UD', Upload: 1024, Download: 2048,
  }],
  yesterdayStats: { statdate: '15-09', calls: '12', topcps: '9600', uploads: '5', downloads: '9' },
  previousDayStats: { statdate: '14-09', calls: '8', topcps: '4800', uploads: '1', downloads: '2' },
  records: {
    allcalls: '900', recordcalls: '42', calls: '11', mostcalled: 'reference-board',
    calls2: '9', secondmostcalled: 'uPtOWN', calls3: '7', thirdmostcalled: 'Nowhere',
  },
});

/** The scenewall paths the door asked for during the last run. */
const asked: string[] = [];

/** Run the door with a stubbed scenewall and collect what it emitted. */
async function runTheDoor(
  bbsSession: { screenWidth?: number; screenHeight?: number } = {},
): Promise<string> {
  jest.resetModules();
  asked.length = 0;

  /*
   * The SDK is stubbed, not loaded: importing it drags in Tone, which ships
   * ESM this jest cannot parse. What the door needs from it is one class that
   * remembers the handlers it is given, and that is all this provides - so
   * the code under test stays the door's own.
   */
  jest.doMock('@amiexpress/bbs-door-sdk', () => {
    class ServerDoor {
      startHandlers: Array<(ctx: unknown) => Promise<void>> = [];
      inputHandlers: unknown[] = [];
      closeHandlers: unknown[] = [];
      constructor(public readonly config: unknown) {}
      onStart(handler: (ctx: unknown) => Promise<void>) { this.startHandlers.push(handler); return this; }
      onInput(handler: unknown) { this.inputHandlers.push(handler); return this; }
      onClose(handler: unknown) { this.closeHandlers.push(handler); return this; }
      onError(handler: unknown) { return this; }
    }
    return { ServerDoor };
  }, { virtual: true });

  jest.doMock('http', () => {
    const { EventEmitter } = require('events');
    return {
      request: (options: { path?: string }, callback: (res: unknown) => void) => {
        if (options.path) asked.push(options.path);
        const response = new EventEmitter() as any;
        response.statusCode = 200;
        response.setEncoding = () => {};
        setImmediate(() => {
          callback(response);
          response.emit('data', RESPONSE);
          response.emit('end');
        });
        return { on: () => {}, end: () => {}, destroy: () => {}, setTimeout: () => {} };
      },
    };
  });

  const emitted: string[] = [];
  const socket: any = {
    emit: (event: string, payload: string) => {
      if (event === 'ansi-output') emitted.push(payload);
      return true;
    },
    on: () => {}, off: () => {},
  };

  // The board's cfg names three styles and the door draws one at random
  // when it reads it (`STYLE=1,4,3`). The first draw is pinned to the FIRST
  // of them - style 1, which shares its logo with style 3 - so the
  // assertions below have one logo to look for; the animation's own dice
  // are restored as soon as the config is read.
  const dice = jest.spyOn(Math, 'random').mockReturnValue(0);
  let door: any;
  try {
    door = require(DOOR).default;
  } finally {
    dice.mockRestore();
  }
  // `startHandlers` is where onStart() puts them (sdk/core/Door.ts:45). The
  // door registers exactly one.
  const handlers = (door as any).startHandlers as Array<(ctx: unknown) => Promise<void>>;
  expect(handlers).toHaveLength(1);
  await handlers[0]({ socket, bbs: {}, user: { username: 'Spot' }, bbsSession });

  return emitted.join('');
}

describe('what a caller actually receives', () => {
  it('is the E source\'s logo, cursor jumps and all', async () => {
    const art = require('../../../../Doors/glc-viewer/src/art.generated');
    const drawn = await runTheDoor();

    // The line the abandoned port flattened into spaces. If the door ever
    // goes back to drawing its own art, this is what fails.
    expect(drawn).toContain(art.LOGO_STYLE_1_3[2]);
    expect(drawn).toContain('\x1b[5C');
    expect(drawn).toContain(art.RULER_TOP);
    expect(drawn).toContain(art.RULE_FINAL);
  });

  it('draws the caller it was given, in the original\'s column widths', async () => {
    const drawn = await runTheDoor();

    // `\l\s[18]` - the username left-justified in eighteen columns, then the
    // separator the row template puts after it.
    expect(drawn).toContain('\x1b[36mSpot              \x1b[34m:');
    // 1024 KB through transferField: four digits, unchanged.
    expect(drawn).toContain('1024');
  });

  it('terminates every line the way the original transmits it', async () => {
    const drawn = await runTheDoor();
    // `WriteStr(diface, textLine, LF)` - one line, one terminator, and no
    // line left unterminated at the end.
    expect(drawn.endsWith('\r\n')).toBe(true);
  });
});

describe('the screen opens before the network answers', () => {
  it('draws the logo and the placeholder rows without waiting', async () => {
    const art = require('../../../../Doors/glc-viewer/src/art.generated');
    const { skeletonRow } = require('../../../../Doors/glc-viewer/src/skeleton');
    const drawn = await runTheDoor();

    // The logo is on the wire, and so is the table's shape.
    expect(drawn).toContain(art.LOGO_STYLE_1_3[0].replace('\x1b[0;40;37m', '\x1b[0;40;37m'));
    expect(drawn).toContain(skeletonRow());

    // ...and the real rows were written OVER them: the cursor walked back.
    expect(drawn).toContain('\x1b[A');
    expect(drawn).toContain('\x1b[K');
  });

  it('puts every real row after the rewind, not before it', async () => {
    const drawn = await runTheDoor();
    const firstRewind = drawn.indexOf('\x1b[A');
    const theCaller = drawn.indexOf('\x1b[36mSpot');

    expect(firstRewind).toBeGreaterThan(-1);
    expect(theCaller).toBeGreaterThan(firstRewind);
  });
});

/**
 * The sysop's screenshot, 2026-09-16: every caller's ON column was blank.
 *
 * The server sends `Timeon`; the door asked for `TimeOn`, `timeOn` and
 * `timeon`, and `in` is case-SENSITIVE. The reader stopped caring about case;
 * this is that, read off the wire the door actually draws.
 */
describe('the fields the server really sends', () => {
  it('shows the time a caller came on, whatever the case of the key', async () => {
    const drawn = await runTheDoor();
    expect(drawn).toContain('08:38');
  });

  it('shows the one it went off on too', async () => {
    const drawn = await runTheDoor();
    expect(drawn).toContain('08:44');
  });
});

/**
 * The sysop's count, 2026-09-16: "i count it to only 18 rows high in total?"
 *
 * `LINES=AUTO` was summed for the wide screen - rows minus eighteen of chrome
 * - before the narrow screen got its say, so a C64 reporting twenty-two rows
 * asked the server for four callers and drew four, under a logo with room
 * for eleven. AUTO now resolves per width; this is that, read off the count
 * the door actually asks the scenewall for.
 */
describe('LINES=AUTO on a C64', () => {
  const askedCount = (): number => {
    expect(asked.length).toBeGreaterThan(0);
    const count = /[?&]count=(\d+)/.exec(asked[0]);
    expect(count).not.toBeNull();
    return Number(count![1]);
  };

  it('fills the rows under the logo, not the wide screen\'s leftovers', async () => {
    const { narrowListRows } = require('../../../../Doors/glc-viewer/src/narrow');
    const { autoLines } = require('../../../../Doors/glc-viewer/src/sizing');

    await runTheDoor({ screenWidth: 40, screenHeight: 22 });

    const count = askedCount();
    expect(count).toBe(narrowListRows(5));   // the shipped C64 logo is five rows
    expect(count).toBe(11);
    expect(count).not.toBe(autoLines(22));   // the four the sysop counted
  });

  it('still sums the wide screen on eighty columns', async () => {
    const { autoLines } = require('../../../../Doors/glc-viewer/src/sizing');
    await runTheDoor({ screenWidth: 80, screenHeight: 24 });
    expect(askedCount()).toBe(autoLines(24));
  });
});
