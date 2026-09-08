/**
 * STEP 02 ANSWERS ONLY WHEN THERE IS A BOARD BEHIND THE HANDLER.
 *
 * This is the fact that blocked TP-14 steps 02-16 and TP-16 R14, recorded in
 * the plan as a measurement rather than a guess: "with a stub handleCommand,
 * step 02 returns 0 bytes". Everything past the graphics prompt goes through
 * the real command handler, and the real command handler needs conferences,
 * screens, commands and a database behind it.
 *
 * The pair below is the whole point, and it is the same discipline R0 applies
 * to a sentinel: an assertion that only ever passes proves nothing.
 *
 *   booted board  -> step 02 paints                     (LIVE)
 *   stub handler  -> step 02 paints NOTHING             (DEAD)
 *
 * The DEAD arm is not a hypothetical. It is what every earlier attempt at the
 * walk actually did, and why the plan stopped at step 01 for weeks: the test
 * looked reasonable, the server was real, the socket was real, and the caller
 * was talking to nothing.
 */
import * as net from 'net';
import { bootBoard, type BootedBoard } from '../support/booted-board';

jest.setTimeout(180000);

const GRAPHICS_PROMPT = 'A/R/P/P8/N';

function stripTelnetNegotiation(raw: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== 255) { out.push(raw[i]); continue; }
    const verb = raw[i + 1];
    if (verb === 250) {
      i += 2;
      while (i < raw.length && !(raw[i] === 255 && raw[i + 1] === 240)) i += 1;
      i += 1;
    } else if (verb === 255) { out.push(255); i += 1; } else { i += 2; }
  }
  return Buffer.from(out);
}

/**
 * Connect, reach the graphics prompt, answer it, and report how many bytes
 * came back for that answer.
 */
async function bytesForStep02(handleCommand: unknown): Promise<number> {
  const { TelnetServer } = require('../../src/server/telnet-server');
  const { setupTelnetSSHHandler } = require('../../src/server/transport-session');
  const { createSession, setSession } = require('../../src/server/session-manager');

  const server = new TelnetServer(0);
  await server.start();
  server.on('connection', (connection: { nodeId?: number; sessionId: string; session: unknown }) => {
    const session = createSession(connection.nodeId ?? 1, { connectionType: 'telnet' });
    connection.session = session;
    setSession(connection.sessionId, session);
    setupTelnetSSHHandler(connection as never, 'telnet', {
      io: {} as never,
      sessions: new Map(),
      nodeManager: { releaseSession: async () => undefined },
      handleCommand,
    } as never);
  });

  const port = (server as unknown as { server: { address(): { port: number } } }).server.address().port;
  const client = net.connect(port);
  client.on('error', () => undefined);
  const chunks: Buffer[] = [];
  client.on('data', (c: Buffer) => chunks.push(c));

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`never reached the graphics prompt; got ${Buffer.concat(chunks).length} bytes`)),
        25000);
      const check = () => {
        if (stripTelnetNegotiation(Buffer.concat(chunks)).toString('latin1').includes(GRAPHICS_PROMPT)) {
          clearTimeout(timer); resolve();
        }
      };
      client.on('data', check);
      check();
    });

    const before = Buffer.concat(chunks).length;
    client.write('Y\r');                    // step 02: answer the prompt
    await new Promise((r) => setTimeout(r, 4000));
    return Buffer.concat(chunks).length - before;
  } finally {
    client.destroy();
    await (server as unknown as { stop?: () => Promise<void> }).stop?.();
  }
}

describe('the walk past step 01', () => {
  let board: BootedBoard;

  beforeAll(async () => { board = await bootBoard('walk-step02-'); });
  afterAll(() => board?.cleanup());

  it('LIVE: with a booted board behind it, answering the graphics prompt paints', async () => {
    const { handleCommand } = require('../../src/handlers/command.handler');
    const painted = await bytesForStep02(handleCommand);
    expect(painted).toBeGreaterThan(0);
  });

  it('DEAD: with a stub handler, the same answer paints nothing at all', async () => {
    // Exactly what the plan measured, and why steps 02-16 could not be
    // written. Kept as an assertion so the reason survives the fixture.
    const painted = await bytesForStep02(async () => undefined);
    expect(painted).toBe(0);
  });
});
