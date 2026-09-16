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

/** Run the door with a stubbed scenewall and collect what it emitted. */
async function runTheDoor(): Promise<string> {
  jest.resetModules();

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
      request: (_options: unknown, callback: (res: unknown) => void) => {
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

  const door = require(DOOR).default;
  // `startHandlers` is where onStart() puts them (sdk/core/Door.ts:45). The
  // door registers exactly one.
  const handlers = (door as any).startHandlers as Array<(ctx: unknown) => Promise<void>>;
  expect(handlers).toHaveLength(1);
  await handlers[0]({ socket, bbs: {}, user: { username: 'Spot' } });

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
