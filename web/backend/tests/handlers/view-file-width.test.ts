/**
 * C64/40-col plan, Task 4: the file viewer wraps at the SESSION width.
 *
 * express.e:20492-20516 wraps a viewed text file at 79 columns on an
 * 80-column screen. That literal 79 was hard-coded here, so a PETSCII
 * caller (40 columns) got every long line folded by the terminal at 40
 * with a ragged second half.
 *
 * The 80-column contract is byte-identical: wrapWidth = width - 1 = 79,
 * and the pass-through test `line.length <= 79` is exactly the old
 * `line.length < 80`.
 */

import { ViewFileHandler, displayLineWithWrappingForTest } from '../../src/handlers/content/view-file.handler';

jest.mock('../../src/utils/amigafs');
jest.mock('../../src/utils/file-restriction.util', () => ({ restricted: jest.fn(async () => false) }));

import { flushOutput } from '../../src/utils/output.util';

/** What the caller received, as the lines the screen shows. */
function makeSocket() {
  const wire: string[] = [];
  const socket: any = {
    id: `view-file-width-${Math.random().toString(36).slice(2)}`,
    emit(event: string, data: string) {
      if (event === 'ansi-output') wire.push(data);
      return true;
    },
    on() {
      return socket;
    },
  };
  const lines = () => { flushOutput(socket); return wire.join('').split('\r\n'); };
  return { socket, lines };
}

describe('view file wrapping width (express.e:20492-20516)', () => {
  test('80-column session: a 100-char line still breaks at 79, byte-identical', async () => {
    const { socket, lines } = makeSocket();
    const line = 'A'.repeat(100);

    await displayLineWithWrappingForTest(socket, line, 79);

    expect(lines()).toEqual([line.slice(0, 79), line.slice(79), '']);
  });

  test('80-column session: a 79-char line passes through untouched (old `length < 80`)', async () => {
    const { socket, lines } = makeSocket();
    const line = 'B'.repeat(79);

    await displayLineWithWrappingForTest(socket, line, 79);

    expect(lines()).toEqual([line, '']);
  });

  test('40-column session: no emitted chunk exceeds 39 columns', async () => {
    const { socket, lines } = makeSocket();
    const line = 'C'.repeat(100);

    await displayLineWithWrappingForTest(socket, line, 39);

    const chunks = lines().filter(Boolean);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(39);
    expect(chunks.join('')).toBe(line);
  });

  test('40-column session: a 39-char line passes through untouched', async () => {
    const { socket, lines } = makeSocket();
    const line = 'D'.repeat(39);

    await displayLineWithWrappingForTest(socket, line, 39);

    expect(lines()).toEqual([line, '']);
  });
});

describe('displayFile derives the wrap width from the live session', () => {
  const longLine = 'E'.repeat(100);
  let restore: Array<() => void> = [];

  beforeEach(() => {
    restore = [];
    const handler = ViewFileHandler as any;
    const original = handler.findOnDownloadPaths;
    restore.push(() => { handler.findOnDownloadPaths = original; });
    handler.findOnDownloadPaths = () => ({ shown: 'BBS:Conf1/Files/view-file-width.txt', hostPath: '/fake/view-file-width.txt' });

    const amigafs = require('../../src/utils/amigafs');
    (amigafs.readFileSync as jest.Mock).mockReset();
    (amigafs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(longLine + '\n', 'latin1'));
  });

  afterEach(() => {
    for (const undo of restore.reverse()) undo();
  });

  async function runDisplayFile(session: any): Promise<string[]> {
    const { socket, lines } = makeSocket();
    await (ViewFileHandler as any).displayFile(socket, session, 'view-file-width.txt', true);
    return lines();
  }

  test('a PETSCII session never receives a chunk wider than 39 columns', async () => {
    const emitted = await runDisplayFile({
      currentConf: 1,
      petsciiMode: true,
      screenWidth: 40,
      user: { username: 'tester' },
    });

    const body = emitted.filter((line) => line.includes('E'));
    expect(body.length).toBeGreaterThan(1);
    for (const line of body) expect(line.length).toBeLessThanOrEqual(39);
  });

  test('an ordinary ANSI session still breaks at 79 (byte-identical)', async () => {
    const emitted = await runDisplayFile({
      currentConf: 1,
      user: { username: 'tester' },
    });

    const body = emitted.filter((line) => line.includes('E'));
    expect(body).toEqual([longLine.slice(0, 79), longLine.slice(79)]);
  });
});
