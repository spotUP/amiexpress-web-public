import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mintLaunchToken, verifyLaunchToken, revokeLaunchToken } from '../../src/doors/door-launch-token';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-token-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('writes a token the C door can read, and verifies it back', () => {
  const token = mintLaunchToken(root, { nodeId: 2, userId: 7, secLevel: 255 });

  const onDisk = fs.readFileSync(path.join(root, 'Doors', 'DoorRepo', 'DoorRepo.token'), 'latin1').trim();
  expect(onDisk).toBe(token);
  expect(verifyLaunchToken(token)).toMatchObject({ userId: 7, secLevel: 255 });
});

it('refuses a token that was never minted, or was revoked', () => {
  expect(verifyLaunchToken('nope')).toBeNull();
  expect(verifyLaunchToken(undefined)).toBeNull();

  const token = mintLaunchToken(root, { nodeId: 1, userId: 7, secLevel: 255 });
  revokeLaunchToken(token);
  expect(verifyLaunchToken(token)).toBeNull();
});

it('replaces the previous token for the same node', () => {
  const first = mintLaunchToken(root, { nodeId: 1, userId: 7, secLevel: 255 });
  const second = mintLaunchToken(root, { nodeId: 1, userId: 7, secLevel: 255 });

  expect(verifyLaunchToken(first)).toBeNull();
  expect(verifyLaunchToken(second)).not.toBeNull();
});
