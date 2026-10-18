/**
 * A session that resumes into a fresh terminal, or moves from another window,
 * must repaint the screen it was on (a 68K door's frame). attachParkedTo used
 * to replay only the output held while parked; a move from a still-attached
 * window holds nothing, so the terminal showed "[Session Restored]" and a
 * blank screen. The board's screen model (services/screen-model) is re-keyed
 * to the new socket and rendered whole after a clear.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => ({}));
jest.mock('../../src/services/node-manager.service', () => ({ nodeManager: { rekeySession: jest.fn() } }));
const mockDisplayMainMenu = jest.fn(async () => undefined);
jest.mock('../../src/handlers/command-handler/menu', () => ({ displayMainMenu: (...a: unknown[]) => mockDisplayMainMenu(...(a as [])) }));

import { installParking, attachParkedTo, moveParkedTo } from '../../src/server/session-parking';
import { feedScreenModel, dropScreenModel } from '../../src/services/screen-model/screen-model';
import { sessions } from '../../src/server/session-manager';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

const NODE = 9;
const USER = { id: 42, username: 'spot', baud: 0 } as any;

function fakeLink(id: string, held: Array<[string, unknown[]]> = []) {
  let hooks: any;
  return {
    id, raw: { id, connected: true, emit: jest.fn() }, ended: false,
    on: jest.fn(),
    setHooks: (h: any) => { hooks = h; },
    attach: jest.fn(),
    takeHeld: () => ({ overflowed: false, chunks: held }),
    drop: (reason: string) => hooks.onDrop(reason),
  };
}

function setup(oldId: string, held: Array<[string, unknown[]]> = []) {
  const session: any = { state: BBSState.LOGGEDON, connectionType: 'web', nodeId: NODE, user: { id: 42, username: 'spot' } };
  const link = fakeLink(oldId, held);
  session.webLink = link;
  installParking(link as any, session);
  feedScreenModel(oldId, session, '\x1b[2J\x1b[HDOOR FRAME');
  return { session, link };
}

const sent = (raw: any) => raw.emit.mock.calls.filter((c: any[]) => c[0] === 'ansi-output').map((c: any[]) => String(c[1]));

describe('a resumed or moved session repaints its screen', () => {
  afterEach(() => {
    sessions.delete(String(NODE));
    for (const id of ['old-a', 'new-a', 'old-b', 'new-b']) dropScreenModel(id);
  });

  it('a move from a still-attached window sends a clear, then the door frame', async () => {
    const { session } = setup('old-a');
    sessions.set(String(NODE), session);
    const raw: any = { id: 'new-a', emit: jest.fn() };
    expect(await moveParkedTo(raw, session, USER, async () => undefined)).toBe('moved');
    const out = sent(raw);
    expect(out[0]).toBe('\x1b[2J\x1b[H');
    expect(out.slice(1).join('')).toContain('DOOR FRAME');
  });

  it('park then resume repaints the frame once, without replaying the held output on top', () => {
    const { session, link } = setup('old-b', [['ansi-output', ['HELD CHUNK']]]);
    expect(link.drop('transport close')).toBe('park');
    const raw: any = { id: 'new-b', emit: jest.fn() };
    attachParkedTo(raw, session, USER);
    const out = sent(raw);
    expect(out[0]).toBe('\x1b[2J\x1b[H');
    expect(out.join('')).toContain('DOOR FRAME');
    expect(out.join('')).not.toContain('HELD CHUNK');
  });

  it('with no screen drawn, the held output is replayed as before', () => {
    const { session, link } = setup('old-a', [['ansi-output', ['HELD CHUNK']]]);
    dropScreenModel('old-a');
    expect(link.drop('transport close')).toBe('park');
    const raw: any = { id: 'new-a', emit: jest.fn() };
    attachParkedTo(raw, session, USER);
    expect(sent(raw)).toEqual(['HELD CHUNK']);
  });

  it('a C64 caller resumed at the board prompt gets the menu and prompt back, not a blank screen', () => {
    const { session, link } = setup('old-a');
    session.petsciiMode = true;
    session.subState = LoggedOnSubState.READ_COMMAND;
    expect(link.drop('transport close')).toBe('park');
    mockDisplayMainMenu.mockClear();
    attachParkedTo({ id: 'new-a', emit: jest.fn() } as any, session, USER);
    expect(mockDisplayMainMenu).toHaveBeenCalledTimes(1);
    expect(mockDisplayMainMenu).toHaveBeenCalledWith(link, session, true, true);
  });

  it('a C64 caller resumed inside a door leaves the repaint to the door', () => {
    const { session, link } = setup('old-a');
    session.petsciiMode = true;
    session.subState = LoggedOnSubState.DOOR_RUNNING;
    expect(link.drop('transport close')).toBe('park');
    mockDisplayMainMenu.mockClear();
    attachParkedTo({ id: 'new-a', emit: jest.fn() } as any, session, USER);
    expect(mockDisplayMainMenu).not.toHaveBeenCalled();
  });
});
