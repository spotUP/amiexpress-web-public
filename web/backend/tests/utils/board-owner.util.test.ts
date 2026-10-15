jest.mock('fs', () => ({ ...jest.requireActual('fs'), chownSync: jest.fn() }));
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { chownToBoard, mkdirOwned, BOARD_UID, BOARD_GID } from '../../src/utils/board-owner.util';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-owner-')); });
beforeEach(() => (fs.chownSync as unknown as jest.Mock).mockClear());
afterEach(() => { jest.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

test('root hands a file to the board (1001:1001); any other user leaves it alone', () => {
  const chown = fs.chownSync as unknown as jest.Mock;
  const uid = jest.spyOn(process, 'getuid');
  uid.mockReturnValue(0);
  chownToBoard('/x/file');
  expect(chown).toHaveBeenCalledWith('/x/file', BOARD_UID, BOARD_GID);
  chown.mockClear();
  uid.mockReturnValue(1001);
  chownToBoard('/x/file');
  expect(chown).not.toHaveBeenCalled();
});

test('mkdirOwned hands over every directory it created, and none that already existed', () => {
  fs.mkdirSync(path.join(dir, 'Screens'));
  const chown = fs.chownSync as unknown as jest.Mock;
  jest.spyOn(process, 'getuid').mockReturnValue(0);
  mkdirOwned(path.join(dir, 'Screens', 'menus', 'main', 'logos'));
  expect(chown.mock.calls.map(c => c[0])).toEqual([
    path.join(dir, 'Screens', 'menus'), path.join(dir, 'Screens', 'menus', 'main'), path.join(dir, 'Screens', 'menus', 'main', 'logos'),
  ]);
  chown.mockClear();
  mkdirOwned(path.join(dir, 'Screens', 'menus', 'main', 'logos'));
  expect(chown).not.toHaveBeenCalled();
});
