/**
 * Door event attribution regression tests.
 *
 * Per-door webhook routing matches the door name an event carries against
 * the webhook's door_filter. That name came from `session.commandText` -
 * the raw line the user typed - so it carried arguments and whatever alias
 * or menu entry was used to launch the door. A board that filtered its
 * GMaster webhook on "GMASTER" silently stopped matching as soon as the
 * door was launched any other way, and the score went nowhere.
 *
 * The name is now the door's REGISTERED command, set by executeDoor().
 */

jest.mock('../src/database', () => ({ db: {} }));
jest.mock('../src/services/bbs-event-emitter', () => ({
  emitCustomDoorEvent: jest.fn(),
  emitDoorEvent: jest.fn(),
}));

import { createBBSApi } from '../src/doors/BBSApi';
const { emitCustomDoorEvent } = require('../src/services/bbs-event-emitter');

function apiFor(session: Record<string, unknown>): any {
  const socket: any = { id: 'sock-1', emit: () => {}, on: () => {} };
  return createBBSApi(socket, {
    user: { id: 7, username: 'spot' },
    nodeId: 1,
    ...session,
  } as any);
}

describe('door event attribution', () => {
  beforeEach(() => {
    (emitCustomDoorEvent as jest.Mock).mockReset();
  });

  it('names the registered door command, not the line the user typed', () => {
    const api = apiFor({ currentDoorName: 'GMASTER', commandText: 'G -X' });

    api.emitCustomEvent('score', 'Master - Score: 26,070', { score: 26070 });

    expect((emitCustomDoorEvent as jest.Mock).mock.calls[0][0].doorName).toBe('GMASTER');
  });

  it('drops arguments when falling back to the command line', () => {
    // No registered name (older launch paths): the first word is the door,
    // the rest is arguments that would never match a door filter.
    const api = apiFor({ commandText: 'ARKANOID -WINDOW' });

    api.emitCustomEvent('score', 'Score: 6,080', { score: 6080 });

    expect((emitCustomDoorEvent as jest.Mock).mock.calls[0][0].doorName).toBe('ARKANOID');
  });

  it('still carries the scorer identity the PII policy needs', () => {
    const api = apiFor({ currentDoorName: 'GMASTER' });

    api.emitCustomEvent('score', 'Master - Score: 1', { score: 1 });

    const payload = (emitCustomDoorEvent as jest.Mock).mock.calls[0][0];
    expect(payload.username).toBe('spot');
    expect(payload.userId).toBe(7);
  });
});
