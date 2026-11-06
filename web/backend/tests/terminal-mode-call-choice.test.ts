/**
 * R1 reachability: Alt+Enter choice lives on the CALL (session), not the door.
 * Entry point is the door-facing BBSApi (createBBSApi), the object every door
 * gets from executeTypeScriptDoor. The screen:resize listener is the sentinel:
 * it proves setTerminalModeChoice ran and told the running door its new size.
 */
jest.mock('../src/database', () => ({ db: {} }));

import { createBBSApi } from '../src/doors/BBSApi';

function door(session: any): any {
  const socket: any = { id: 's', emit: jest.fn(), on: () => {} };
  return createBBSApi(socket, session);
}

describe('terminal mode choice is per call', () => {
  it('starts 80x25, toggles live, carries to the next door, resets on a new call', () => {
    const call: any = { user: { id: 1, username: 'spot' }, nodeId: 1, screenWidth: 132, screenHeight: 50 };

    const first = door(call);
    const resizes: any[] = [];
    first.on('screen:resize', (s: any) => resizes.push(s));

    expect(first.getTerminalSize()).toEqual({ width: 80, height: 25 });
    expect(first.getTerminalModeChoice()).toBe(false);

    first.setTerminalModeChoice(true);
    expect(resizes).toEqual([{ cols: 132, rows: 50 }]); // sentinel: new code ran
    expect(first.getTerminalSize()).toEqual({ width: 132, height: 50 });

    // next door, same call
    const second = door(call);
    expect(second.getTerminalModeChoice()).toBe(true);
    expect(second.getTerminalSize()).toEqual({ width: 132, height: 50 });

    second.setTerminalModeChoice(false);
    expect(second.getTerminalSize()).toEqual({ width: 80, height: 25 });

    // new call = new session: choice not saved anywhere
    const next = door({ user: { id: 1, username: 'spot' }, nodeId: 1, screenWidth: 132, screenHeight: 50 });
    expect(next.getTerminalModeChoice()).toBe(false);
    expect(next.getTerminalSize()).toEqual({ width: 80, height: 25 });
  });

  it('a door that forces wide announces the real size and sees it', () => {
    const call: any = { user: { id: 1, username: 'spot' }, nodeId: 1, screenWidth: 120, screenHeight: 40 };
    const api = door(call);
    const resizes: any[] = [];
    api.on('screen:resize', (s: any) => resizes.push(s));
    api.setTerminalMode('wide');
    expect(resizes).toEqual([{ cols: 120, rows: 40 }]);
    expect(api.getTerminalSize()).toEqual({ width: 120, height: 40 });
  });
});
