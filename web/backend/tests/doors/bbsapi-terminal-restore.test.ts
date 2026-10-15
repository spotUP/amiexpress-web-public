/**
 * No door leaves the terminal wide.
 *
 * Doors resize through BBSApi.setTerminalMode, but a door that crashes, is
 * kicked, or never learned disableWideMode stranded every later screen at
 * the door's width - menus drawn for 80 columns onto 167 of them (live
 * 2026-09-11). The wish is recorded on the session and the backend puts
 * fixed back at every TypeScript exit, silently unless a door went wide.
 */
import { createBBSApi } from "../../src/doors/BBSApi";
import { restoreFixedTerminal } from "../../src/handlers/door.handler";

class StubSocket {
  emits: Array<{ event: string; args: any[] }> = [];
  emit(event: string, ...args: any[]): boolean {
    this.emits.push({ event, args });
    return true;
  }
}

describe('terminal mode is session state, not just an event', () => {
  test('enableWideMode records the wish and emits it', () => {
    const socket = new StubSocket();
    const session: any = {};
    const api = createBBSApi(socket as any, session);

    api.enableWideMode();

    expect(session.doorTerminalWide).toBe(true);
    expect(socket.emits).toContainEqual({ event: 'terminal-mode', args: ['wide'] });
  });

  test('disableWideMode clears the wish and emits fixed', () => {
    const socket = new StubSocket();
    const session: any = { doorTerminalWide: true };
    const api = createBBSApi(socket as any, session);

    api.disableWideMode();

    expect(session.doorTerminalWide).toBe(false);
    expect(socket.emits).toContainEqual({ event: 'terminal-mode', args: ['fixed'] });
  });
});

describe('restoreFixedTerminal', () => {
  test('a door that went wide is put back, once', () => {
    const socket = new StubSocket();
    const session: any = { doorTerminalWide: true };

    restoreFixedTerminal(socket as any, session);

    expect(session.doorTerminalWide).toBe(false);
    expect(socket.emits).toEqual([{ event: 'terminal-mode', args: ['fixed'] }]);

    restoreFixedTerminal(socket as any, session);
    expect(socket.emits).toHaveLength(1);
  });

  test('a door that never went wide costs nothing', () => {
    const socket = new StubSocket();
    restoreFixedTerminal(socket as any, {} as any);
    restoreFixedTerminal(socket as any, { doorTerminalWide: false } as any);

    expect(socket.emits).toEqual([]);
  });

  test('a dead socket still clears the flag instead of throwing', () => {
    const socket = { emit: () => { throw new Error('gone'); } };
    const session: any = { doorTerminalWide: true };

    expect(() => restoreFixedTerminal(socket as any, session)).not.toThrow();
    expect(session.doorTerminalWide).toBe(false);
  });
});
