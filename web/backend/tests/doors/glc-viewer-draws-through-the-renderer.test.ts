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

const DOOR = path.join(__dirname, '../../../../board/Doors/glc-viewer/index.ts');

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

/** Every `ansi-output` of the last run, with the millisecond it went out. */
const sent: Array<{ payload: string; at: number }> = [];

/** Run the door with a stubbed scenewall and collect what it emitted. */
async function runTheDoor(
  bbsSession: { screenWidth?: number; screenHeight?: number; user?: { linesPerScreen?: number } } = {},
  /** Hold the scenewall's answer back this long, so the wait can be watched. */
  holdMs = 0,
): Promise<string> {
  jest.resetModules();
  asked.length = 0;
  sent.length = 0;

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
        const answer = () => {
          callback(response);
          response.emit('data', RESPONSE);
          response.emit('end');
        };
        if (holdMs > 0) setTimeout(answer, holdMs); else setImmediate(answer);
        return { on: () => {}, end: () => {}, destroy: () => {}, setTimeout: () => {} };
      },
    };
  });

  const emitted: string[] = [];
  const socket: any = {
    emit: (event: string, payload: string) => {
      if (event === 'ansi-output') { emitted.push(payload); sent.push({ payload, at: Date.now() }); }
      return true;
    },
    on: () => {}, off: () => {},
  };

  // The board's cfg names three styles and the door draws one at random
  // when it reads it (`STYLE=1,4,3`) - and it reads it in onStart, not at
  // load. The dice are pinned for the whole run, so the draw is the FIRST
  // style - 1, which shares its logo with style 3 - and the assertions
  // below have one logo to look for. The settling uses the same dice and
  // still ends on the real rows; it only always picks the first candidate.
  const dice = jest.spyOn(Math, 'random').mockReturnValue(0);
  const door = require(DOOR).default;
  // `startHandlers` is where onStart() puts them (sdk/core/Door.ts:45). The
  // door registers exactly one.
  const handlers = (door as any).startHandlers as Array<(ctx: unknown) => Promise<void>>;
  expect(handlers).toHaveLength(1);
  try {
    await handlers[0]({ socket, bbs: {}, user: { username: 'Spot' }, bbsSession });
  } finally {
    dice.mockRestore();
  }

  return emitted.join('');
}

describe('what a caller actually receives', () => {
  it('is the E source\'s logo, cursor jumps and all', async () => {
    const art = require('../../../../board/Doors/glc-viewer/src/art.generated');
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
    const art = require('../../../../board/Doors/glc-viewer/src/art.generated');
    const { skeletonRow } = require('../../../../board/Doors/glc-viewer/src/skeleton');
    const drawn = await runTheDoor();

    // The logo is on the wire, and so is the table's shape.
    expect(drawn).toContain(art.LOGO_STYLE_1_3[0].replace('\x1b[0;40;37m', '\x1b[0;49;37m'));
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
    const { narrowListRows } = require('../../../../board/Doors/glc-viewer/src/narrow');
    const { autoLines } = require('../../../../board/Doors/glc-viewer/src/sizing');

    await runTheDoor({ screenWidth: 40, screenHeight: 22 });

    const count = askedCount();
    expect(count).toBe(narrowListRows(5));   // the shipped C64 logo is five rows
    expect(count).toBe(11);
    expect(count).not.toBe(autoLines(22));   // the four the sysop counted
  });

  it('still sums the wide screen on eighty columns', async () => {
    const { autoLines } = require('../../../../board/Doors/glc-viewer/src/sizing');
    await runTheDoor({ screenWidth: 80, screenHeight: 24 });
    expect(askedCount()).toBe(autoLines(22));
  });
});

/**
 * The sysop's screenshot, 2026-09-16: "something makes glc much bigger when
 * it draws its final frame" - a twenty-five row terminal with the logo
 * scrolled off the top. The footer, nine rows of it, was written only after
 * the answer landed; his reading was the right one: "this doesnt draw until
 * the scramble anim finishes". The page holds its whole shape from the
 * first paint now, and the final paint covers exactly what it walks back.
 */
describe('the page has its final shape before the network answers', () => {
  const firstRewind = (drawn: string): number => drawn.indexOf('\x1b[A');

  /**
   * The screen's height, walked from the stream: a row per CRLF, a row back
   * per cursor-up, and the deepest row reached is how tall the page got.
   */
  const heightOf = (drawn: string): number => {
    let row = 0; let deepest = 0;
    for (let i = 0; i < drawn.length; i++) {
      if (drawn.startsWith('\r\n', i)) { row++; deepest = Math.max(deepest, row); i++; }
      else if (drawn.startsWith('\x1b[A', i)) { row = Math.max(0, row - 1); i += 2; }
    }
    return deepest;
  };

  /** The rows on screen before the first paint over them. */
  const rowsBeforeFirstRewind = (drawn: string): number =>
    (drawn.slice(0, firstRewind(drawn)).match(/\r\n/g) ?? []).length;

  it('draws the legend and the day totals under the placeholders, on eighty columns', async () => {
    const art = require('../../../../board/Doors/glc-viewer/src/art.generated');
    const drawn = await runTheDoor({ screenWidth: 80, screenHeight: 25 });
    expect(drawn).toContain(art.LEGEND[0]);
    expect(drawn.indexOf(art.LEGEND[0])).toBeLessThan(firstRewind(drawn));
    expect(drawn.indexOf('ALLTIME RECORDS')).toBeLessThan(firstRewind(drawn));
  });

  it('draws the totals under the placeholders on a C64 too', async () => {
    const drawn = await runTheDoor({ screenWidth: 40, screenHeight: 25 });
    expect(drawn.indexOf('YESTERDAY')).toBeLessThan(firstRewind(drawn));
    expect(drawn.indexOf('MOST CALLED')).toBeLessThan(firstRewind(drawn));
  });

  it('leaves the board room for its pause on a 24-row screen', async () => {
    // The page plus the board's blank line and `(Pause)...Space To Resume:`
    // must fit, or the logo scrolls off the top before the caller reads it
    // (the sysop's screenshot, 2026-09-25).
    const { BOARD_PAUSE_ROWS } = require('../../../../board/Doors/glc-viewer/src/narrow');
    const drawn = await runTheDoor({ screenWidth: 80, screenHeight: 24 });
    expect(heightOf(drawn) + BOARD_PAUSE_ROWS).toBeLessThanOrEqual(24);
  });

  it('is exactly as tall after the answer as it was before it - the page cannot grow', async () => {
    for (const screenWidth of [80, 40]) {
      const drawn = await runTheDoor({ screenWidth, screenHeight: 25 });
      const before = rowsBeforeFirstRewind(drawn);
      expect(before).toBeGreaterThan(10);
      expect(heightOf(drawn)).toBe(before);
    }
  });

  it('keeps the legend still while the numbers settle - it is not noise', async () => {
    const art = require('../../../../board/Doors/glc-viewer/src/art.generated');
    const drawn = await runTheDoor({ screenWidth: 80, screenHeight: 25 });
    // Every paint of the legend's first row is the row itself.
    const legend: string = art.LEGEND[0];
    const paints = drawn.split('\r\n').filter((row) => row.includes('OWNLOAD FAIL'));
    expect(paints.length).toBeGreaterThan(1);
    for (const row of paints) expect(row.endsWith(legend)).toBe(true);
  });
});

/**
 * The sysop's page length is 0 - never pause - and the door read that as
 * the height of his screen, fell back to twenty-two rows and gave him four
 * callers on a twenty-five row terminal. The screen the board reports is
 * the screen; the pause length is only a second opinion.
 */
describe('how tall the screen is', () => {
  const askedCount = (): number => Number(/[?&]count=(\d+)/.exec(asked[0])![1]);

  it('is what the terminal reported, not the user\'s pause length', async () => {
    // Less the board's pause: 25 rows, 18 of chrome, 2 for the blank line and
    // the prompt the board draws under the page (2026-09-25).
    const { autoLines } = require('../../../../board/Doors/glc-viewer/src/sizing');
    await runTheDoor({ screenWidth: 80, screenHeight: 25, user: { linesPerScreen: 0 } });
    expect(askedCount()).toBe(autoLines(23));
    expect(askedCount()).toBe(5);
  });

  it('falls back to the pause length when nothing reported a screen', async () => {
    const { autoLines } = require('../../../../board/Doors/glc-viewer/src/sizing');
    await runTheDoor({ screenWidth: 80, user: { linesPerScreen: 40 } });
    expect(askedCount()).toBe(autoLines(40));
  });
});

/**
 * The sysop, 2026-11-06: the animation must go away as soon as the data
 * arrives. The waiting noise covers the wait; the list is then written at
 * once. This watches the REAL clock through the door.
 */
describe('the answer arriving ends the animation', () => {
  it('writes the whole list within a few ms of the answer, no reveal frames', async () => {
    const HOLD = 500;
    await runTheDoor({ screenWidth: 80, screenHeight: 25 }, HOLD);

    const start = sent[0].at;
    const answered = start + HOLD;
    const last = sent[sent.length - 1].at;

    // Well below one frame (125 ms): a reveal frame would land at +125 or later.
    expect(last - answered).toBeLessThan(100);
    // Exactly one rewind after the answer: the final paint.
    expect(sent.filter((w) => w.at >= answered && w.payload.startsWith('\x1b[A'))).toHaveLength(1);
  });

  it('keeps the waiting noise on the shared cadence and stops it on demand', () => {
    const { SCRAMBLE_FRAME_MS, waitingScramble } =
      require('../../../../board/Doors/glc-viewer/src/settle-paint');
    expect(typeof SCRAMBLE_FRAME_MS).toBe('number');
    jest.useFakeTimers();
    try {
      const frames: string[] = [];
      const stop = waitingScramble(
        { emit: (_e: string, p: string) => { frames.push(p); } },
        ['\x1b[36m......'],
        [false],
      );
      jest.advanceTimersByTime(SCRAMBLE_FRAME_MS * 3 - 1);
      const afterThree = frames.length;
      expect(afterThree).toBeGreaterThanOrEqual(4); // two rows per frame, two frames
      stop();
      jest.advanceTimersByTime(SCRAMBLE_FRAME_MS * 5);
      expect(frames).toHaveLength(afterThree);
    } finally {
      jest.useRealTimers();
    }
  });
});
