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

function makeSocket() {
  const emitted: string[] = [];
  const socket: any = {
    id: 'view-file-width-test',
    emit(event: string, data: string) {
      if (event === 'ansi-output') emitted.push(data);
      return true;
    },
    on() {
      return socket;
    },
  };
  return { socket, emitted };
}

describe('view file wrapping width (express.e:20492-20516)', () => {
  test('80-column session: a 100-char line still breaks at 79, byte-identical', async () => {
    const { socket, emitted } = makeSocket();
    const line = 'A'.repeat(100);

    await displayLineWithWrappingForTest(socket, line, 79);

    expect(emitted).toEqual([line.slice(0, 79), '\r\n', line.slice(79), '\r\n']);
  });

  test('80-column session: a 79-char line passes through untouched (old `length < 80`)', async () => {
    const { socket, emitted } = makeSocket();
    const line = 'B'.repeat(79);

    await displayLineWithWrappingForTest(socket, line, 79);

    expect(emitted).toEqual([line + '\r\n']);
  });

  test('40-column session: no emitted chunk exceeds 39 columns', async () => {
    const { socket, emitted } = makeSocket();
    const line = 'C'.repeat(100);

    await displayLineWithWrappingForTest(socket, line, 39);

    const chunks = emitted.filter((chunk) => chunk !== '\r\n');
    for (const chunk of chunks) {
      expect(chunk.replace(/\r\n$/, '').length).toBeLessThanOrEqual(39);
    }
    expect(chunks.join('')).toBe(line);
  });

  test('40-column session: a 39-char line passes through untouched', async () => {
    const { socket, emitted } = makeSocket();
    const line = 'D'.repeat(39);

    await displayLineWithWrappingForTest(socket, line, 39);

    expect(emitted).toEqual([line + '\r\n']);
  });
});

describe('displayFile derives the wrap width from the live session', () => {
  const longLine = 'E'.repeat(100);
  let restore: Array<() => void> = [];

  beforeEach(() => {
    restore = [];
    const handler = ViewFileHandler as any;

    for (const name of ['findFileInConference', 'isRestrictedFile', 'isBinaryFile']) {
      const original = handler[name];
      restore.push(() => {
        handler[name] = original;
      });
    }

    handler.findFileInConference = async () => ({ fullPath: '/fake/view-file-width.txt' });
    handler.isRestrictedFile = () => false;
    handler.isBinaryFile = async () => false;

    const amigafs = require('../../src/utils/amigafs');
    (amigafs.readFileSync as jest.Mock).mockReset();
    (amigafs.readFileSync as jest.Mock).mockReturnValue(longLine + '\n');
  });

  afterEach(() => {
    for (const undo of restore.reverse()) undo();
  });

  async function runDisplayFile(session: any): Promise<string[]> {
    const { socket, emitted } = makeSocket();
    await (ViewFileHandler as any).displayFile(socket, session, 'view-file-width.txt', true);
    return emitted;
  }

  test('a PETSCII session never receives a chunk wider than 39 columns', async () => {
    const emitted = await runDisplayFile({
      currentConf: 1,
      petsciiMode: true,
      screenWidth: 40,
      user: { username: 'tester' },
    });

    const body = emitted.filter((chunk) => chunk.includes('E'));
    expect(body.length).toBeGreaterThan(1);
    for (const chunk of body) {
      expect(chunk.replace(/\r\n/g, '').length).toBeLessThanOrEqual(39);
    }
  });

  test('an ordinary ANSI session still breaks at 79 (byte-identical)', async () => {
    const emitted = await runDisplayFile({
      currentConf: 1,
      user: { username: 'tester' },
    });

    const body = emitted.filter((chunk) => chunk.includes('E'));
    expect(body).toEqual([longLine.slice(0, 79), longLine.slice(79)]);
  });
});
