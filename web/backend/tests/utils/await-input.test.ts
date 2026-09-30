/**
 * express.e's lineInput / readChar / yesNo as awaitable calls, fed by
 * handleCommand one keystroke at a time (utils/await-input).
 */
process.env.SKIP_DB_INIT = '1';

import { lineInput, yesNo, readChar } from '../../src/utils/await-input';
import { handleCommand } from '../../src/handlers/command.handler';

function harness() {
  const out: string[] = [];
  const socket: any = { id: `await-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {} };
  const session: any = { state: 'loggedon', subState: 'read_command', user: { id: 1, username: 'spot', secLevel: 255 }, tempData: {} };
  const text = async () => { await new Promise((r) => setTimeout(r, 30)); return out.join(''); };
  const type = async (keys: string[]) => { for (const k of keys) await handleCommand(socket, session, k); };
  return { socket, session, out, text, type };
}

describe('lineInput through handleCommand', () => {
  it('echoes, honours backspace and the length, and ends with lineInput\'s own line break', async () => {
    const h = harness();
    const line = lineInput(h.socket, h.session, 3);
    await h.type(['a', 'b', '\x7f', 'c', 'd', 'e', '\r']);
    expect(await line).toBe('acd');
    // backspace at the end: BS, the (empty) tail, a space, one ESC[1D (2305-2320)
    expect(await h.text()).toBe('ab\b \x1b[1Dcd\r\n');
    expect(h.session.inputWaiter).toBeUndefined();
  });

  it('starts from and shows the default text', async () => {
    const h = harness();
    const line = lineInput(h.socket, h.session, 30, 'Re: hi');
    await h.type(['!', '\r']);
    expect(await line).toBe('Re: hi!');
  });

  it('moves the cursor with the arrows and inserts where it stands, redrawing the tail', async () => {
    const h = harness();
    const line = lineInput(h.socket, h.session, 10);
    await h.type(['a', 'c', '\x1b[D', 'b', '\r']);
    expect(await line).toBe('abc');
    expect(await h.text()).toBe('ac\x1b[1Dbc\x1b[1D\r\n');
  });

  it('keeps what was entered: up brings the last line back (addToHistory)', async () => {
    const h = harness();
    const first = lineInput(h.socket, h.session, 10);
    await h.type(['h', 'i', '\r']);
    await first;
    const second = lineInput(h.socket, h.session, 10);
    await h.type(['\x1b[A', '\r']);
    expect(await second).toBe('hi');
  });

  it('prints the default whole, not cut to the field (2202-2203)', async () => {
    const h = harness();
    const line = lineInput(h.socket, h.session, 3, 'longer');
    await h.type(['\r']);
    expect(await line).toBe('longer');
  });
});

describe('yesNo', () => {
  it('flag 2: prints (y/N)?, Enter is No, other keys are ignored', async () => {
    const h = harness();
    const answer = yesNo(h.socket, h.session, 2);
    await h.type(['q', '\n', '\r']);
    expect(await answer).toBe(false);
    expect(await h.text()).toBe('\x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)\x1b[32m?\x1b[0m No\r\n');
  });

  it('flag 0: Enter is not an answer', async () => {
    const h = harness();
    const answer = yesNo(h.socket, h.session, 0);
    await h.type(['\r', 'Y']);
    expect(await answer).toBe(true);
  });
});

describe('readChar', () => {
  it('gives one key', async () => {
    const h = harness();
    const key = readChar(h.socket, h.session);
    await h.type(['g']);
    expect(await key).toBe('g');
  });
});
