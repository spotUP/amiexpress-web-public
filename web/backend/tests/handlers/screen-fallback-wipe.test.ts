/**
 * displayScreen's fallbackWipe (plan M7, Decision 39): a screen with no ~W of
 * its own plays the menu's wipe; a screen with its own keeps it.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/utils/screen-wipe.util', () => {
  const actual = jest.requireActual('../../src/utils/screen-wipe.util');
  return { ...actual, getWipeFrames: jest.fn(actual.getWipeFrames) };
});

import { displayScreen } from '../../src/handlers/screen.handler';
import { getWipeFrames } from '../../src/utils/screen-wipe.util';

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fallback-wipe-'));
  fs.writeFileSync(path.join(dir, 'PLAIN.TXT'), 'Hello bulletin\r\nsecond line\r\n');
  fs.writeFileSync(path.join(dir, 'OWN.TXT'), '~WR\r\nHello bulletin\r\nsecond line\r\n');
});
afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* scratch */ } });
beforeEach(() => (getWipeFrames as jest.Mock).mockClear());

let seq = 0;
async function show(file: string, fallbackWipe?: string): Promise<void> {
  const socket = { id: `fb-${seq++}`, emit: () => true, on: () => undefined };
  const session: any = { screenWidth: 80, screenHeight: 25, nodeId: 0 };
  expect(await displayScreen(socket as any, session, path.join(dir, file), true, false, fallbackWipe ? { fallbackWipe } : undefined)).toBe(true);
}

test('a screen with no wipe of its own plays the fallback wipe', async () => {
  await show('PLAIN.TXT', 'R');
  expect(getWipeFrames).toHaveBeenCalledTimes(1);
  expect((getWipeFrames as jest.Mock).mock.calls[0][0]).toBe('radial');
});

test('a screen with its own wipe keeps it; the fallback is not played on top', async () => {
  await show('OWN.TXT', 'H');
  expect(getWipeFrames).toHaveBeenCalledTimes(1);
  expect((getWipeFrames as jest.Mock).mock.calls[0][0]).toBe('radial');
});

test('no fallback, an empty one, or an unknown letter plays no wipe', async () => {
  await show('PLAIN.TXT');
  await show('PLAIN.TXT', '');
  await show('PLAIN.TXT', 'Q');
  expect(getWipeFrames).not.toHaveBeenCalled();
});
