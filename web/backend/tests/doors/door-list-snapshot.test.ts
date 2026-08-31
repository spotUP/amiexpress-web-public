/**
 * The door list handed to DoorRepo as a file, because HTTP cannot work here.
 *
 * The door is 68K code running inside this very Node process. When it asks
 * the BBS for something synchronously it blocks in WaitSelect, starving the
 * event loop that would produce the reply, so the response only arrives after
 * the socket times out. Measured on the live board:
 *
 *     send data: GET /api/door-admin/installed
 *     WaitSelect(nfds=1, timeout=30000ms)
 *     WaitSelect returning 0        <- timed out
 *     Received 21470 bytes          <- the reply, 30s too late
 *
 * From the sysop's side: the L key froze for thirty seconds with no feedback,
 * then showed the fallback screen. Requests to the REMOTE catalog are fine in
 * the same log - another machine produces those replies.
 *
 * So the list is written beside the token at launch. These pin the two things
 * the door depends on: the bytes are the DOORS| format it already parses, and
 * the file is never half-written.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let doors: any[] = [];
jest.mock('../../src/doors/door-list', () => ({
  buildDoorList: jest.fn(async () => doors),
}));

import {
  writeDoorListSnapshot,
  clearDoorListSnapshot,
  doorListSnapshotPath,
  renderDoorListBody,
} from '../../src/doors/door-list-snapshot';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-'));
  doors = [];
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const readSnapshot = () => fs.readFileSync(doorListSnapshotPath(root), 'latin1');

it('writes it beside the token the door already reads', () => {
  // One config value has to locate both, because the C door joins them the
  // same way: <doors_dir>/DoorRepo/.
  expect(doorListSnapshotPath(root)).toBe(
    path.join(root, 'Doors', 'DoorRepo', 'DoorRepo.doors'),
  );
});

it('renders the DOORS| format the door parses, not JSON', async () => {
  doors = [
    {
      command: 'AEHELP', type: 'XIM', size: 4096, enabled: true, accessLevel: 10,
      archiveName: 'AEHELP.LHA', name: 'AE Help', category: 'Utility',
      description: 'Online help',
    },
  ];

  await writeDoorListSnapshot(root);
  const lines = readSnapshot().split('\r\n');

  expect(lines[0]).toBe('DOORS|1');
  expect(lines[1]).toBe('AEHELP|XIM|4096|1|10|AEHELP.LHA|AE Help|Utility|Online help');
});

it('is byte-identical to what the HTTP route would return', async () => {
  // Both go through the same renderer, so the file and the endpoint can
  // never describe the same board differently.
  doors = [
    { command: 'A', type: 'XIM', size: 1, enabled: true, accessLevel: 0, name: 'A' },
    { command: 'B', type: 'AIM', size: 2, enabled: false, accessLevel: 5, name: 'B' },
  ];

  const rendered = await renderDoorListBody(root);
  await writeDoorListSnapshot(root);

  expect(readSnapshot()).toBe(rendered);
});

it('sanitises a name containing a pipe, so a row keeps nine fields', async () => {
  doors = [{
    command: 'ART', type: 'XIM', size: 0, enabled: true, accessLevel: 0,
    name: 'DOOR|MANAGER', description: 'x\ny',
  }];

  await writeDoorListSnapshot(root);
  const row = readSnapshot().split('\r\n')[1];

  expect(row.split('|')).toHaveLength(9);
});

it('writes an empty board as a header and nothing else', async () => {
  await writeDoorListSnapshot(root);

  expect(readSnapshot()).toBe('DOORS|0\r\n');
});

it('leaves no half-written file behind for a door reading it', async () => {
  // Written to a temporary name and renamed. A door that reads mid-write
  // would otherwise parse a truncated listing as a short one.
  doors = Array.from({ length: 200 }, (_, i) => ({
    command: `D${i}`, type: 'XIM', size: i, enabled: true, accessLevel: 0, name: `Door ${i}`,
  }));

  await writeDoorListSnapshot(root);

  const dir = path.join(root, 'Doors', 'DoorRepo');
  expect(fs.readdirSync(dir)).toEqual(['DoorRepo.doors']);
  expect(readSnapshot().split('\r\n')[0]).toBe('DOORS|200');
});

it('clears the snapshot when the door exits', async () => {
  await writeDoorListSnapshot(root);
  expect(fs.existsSync(doorListSnapshotPath(root))).toBe(true);

  clearDoorListSnapshot(root);

  // A listing left behind would be read by the NEXT launch before it is
  // rewritten, and it describes a board that may have changed since.
  expect(fs.existsSync(doorListSnapshotPath(root))).toBe(false);
});

it('clearing a snapshot that was never written is not an error', () => {
  expect(() => clearDoorListSnapshot(root)).not.toThrow();
});

it('reports failure rather than throwing when the list cannot be built', async () => {
  // A board that cannot produce a list still has to run its doors; the door
  // falls back to its own install index.
  const { buildDoorList } = require('../../src/doors/door-list');
  (buildDoorList as jest.Mock).mockRejectedValueOnce(new Error('db gone'));

  await expect(writeDoorListSnapshot(root)).resolves.toBe(false);
  expect(fs.existsSync(doorListSnapshotPath(root))).toBe(false);
});
