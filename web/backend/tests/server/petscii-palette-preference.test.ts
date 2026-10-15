/**
 * The caller's PETSCII palette, remembered.
 *
 * Only the 80-column screen has a choice: a C64 is a VIC-II by construction,
 * and a C128's 80-column screen has the VDC's own sixteen. The sysop asked for
 * it to be selectable (2026-09-07), so the board stores it per caller, hands
 * it to his terminal at login, and lets him change it with COLOURS.
 */
import { registerPreferenceHandlers } from '../../src/server/preference-socket-handlers';

jest.mock('../../src/database', () => ({
  db: { updateUser: jest.fn(async () => undefined) },
}));

jest.mock('../../src/server/session-manager', () => ({
  getSessionBySocketId: jest.fn(),
}));

const { db } = require('../../src/database');
const { getSessionBySocketId } = require('../../src/server/session-manager');

/** A socket that records what it is told and lets a test fire an event at it. */
function fakeSocket() {
  const handlers = new Map<string, (data?: unknown) => unknown>();
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    id: 'palette-socket',
    on(event: string, handler: (data?: unknown) => unknown) { handlers.set(event, handler); return this; },
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    async fire(event: string, data?: unknown) { await handlers.get(event)?.(data); },
    has(event: string) { return handlers.has(event); },
    emitted,
  };
}

const paletteSent = (socket: ReturnType<typeof fakeSocket>): unknown =>
  socket.emitted.filter((e) => e.event === 'petscii-palette').map((e) => (e.data as { palette: string }).palette);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the stored palette', () => {
  it('answers the C128 colours for a caller who has never chosen', async () => {
    (getSessionBySocketId as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
    const socket = fakeSocket();
    registerPreferenceHandlers(socket as never);

    await socket.fire('get-petscii-palette');

    expect(paletteSent(socket)).toEqual(['vdc']);
  });

  it('answers the C64 colours for a caller who chose them', async () => {
    (getSessionBySocketId as jest.Mock).mockReturnValue({ user: { id: 'u1', petsciiPalette: 'vic' } });
    const socket = fakeSocket();
    registerPreferenceHandlers(socket as never);

    await socket.fire('get-petscii-palette');

    expect(paletteSent(socket)).toEqual(['vic']);
  });

  it('remembers a change, and tells the terminal at once', async () => {
    const session = { user: { id: 'u1', petsciiPalette: 'vdc' } };
    (getSessionBySocketId as jest.Mock).mockReturnValue(session);
    const socket = fakeSocket();
    registerPreferenceHandlers(socket as never);

    await socket.fire('set-petscii-palette', { palette: 'vic' });

    expect(db.updateUser).toHaveBeenCalledWith('u1', { petsciiPalette: 'vic' });
    expect(session.user.petsciiPalette).toBe('vic');
    expect(paletteSent(socket)).toEqual(['vic']);
  });

  it('refuses a palette nobody ships, rather than storing it', async () => {
    (getSessionBySocketId as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
    const socket = fakeSocket();
    registerPreferenceHandlers(socket as never);

    await socket.fire('set-petscii-palette', { palette: 'chartreuse' });

    expect(db.updateUser).toHaveBeenCalledWith('u1', { petsciiPalette: 'vdc' });
  });

  it('still changes the screen for a caller with no account to remember it on', async () => {
    (getSessionBySocketId as jest.Mock).mockReturnValue({ user: null });
    const socket = fakeSocket();
    registerPreferenceHandlers(socket as never);

    await socket.fire('set-petscii-palette', { palette: 'vic' });

    expect(db.updateUser).not.toHaveBeenCalled();
    expect(paletteSent(socket)).toEqual(['vic']);
  });
});
