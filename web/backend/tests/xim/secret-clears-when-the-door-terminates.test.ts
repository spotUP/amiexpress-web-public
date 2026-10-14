/**
 * AmigaDoorSession.terminate() withdraws the W door's SECRET flag (and its OPEN) FIRST, so a later
 * cleanup step that throws cannot leave the next door's keystroke traces withholding, or the next
 * door able to edit the account without an OPEN. Codified from the W10 deferred-minor list.
 */
jest.mock('../../src/utils/acs-access-loader');
import { AmigaDoorSession } from '../../src/amiga-emulation/AmigaDoorSession';
import { isSecretInput, setSecretInput } from '../../src/amiga-emulation/xim/secret-input';
import { userFieldAnswer } from '../../src/amiga-emulation/xim/userfield';

function sessionWith(bbsSession: object, laterStep: () => void): AmigaDoorSession {
  const door: any = Object.create(AmigaDoorSession.prototype);
  door.isRunning = true;
  door.config = { bbsSession };
  door.logger = { info: () => undefined };
  door.removeSocketHandlers = laterStep;          // the first step after the flag is withdrawn
  return door;
}

test('terminate() clears SECRET and the OPEN even when a later cleanup step throws', async () => {
  const bbs: any = { nodeId: 1, user: { id: 7, secLevel: 10, securityFlags: 'T'.repeat(128), userFlags: 0 } };
  const socket = { emit: jest.fn() };
  expect(await userFieldAnswer('OPEN', bbs, socket)).toBe('OK');
  setSecretInput(bbs, true);
  expect(isSecretInput(bbs)).toBe(true);

  const door = sessionWith(bbs, () => { throw new Error('a later step failed'); });
  expect(() => door.terminate()).toThrow('a later step failed');

  expect(isSecretInput(bbs)).toBe(false);
  expect(await userFieldAnswer('SET 4 Nowhere', bbs, socket)).toBe('DENIED');   // closed with the door
});

test('terminate() on a session that is already torn down leaves a SECRET set by the next door alone', () => {
  const bbs: any = {};
  const door = sessionWith(bbs, () => undefined);
  (door as any).isRunning = false;
  setSecretInput(bbs, true);
  door.terminate();
  expect(isSecretInput(bbs)).toBe(true);     // the re-entry guard returns before touching anything
  setSecretInput(bbs, false);
});
