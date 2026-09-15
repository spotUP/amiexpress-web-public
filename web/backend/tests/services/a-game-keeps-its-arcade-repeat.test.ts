/**
 * A door that declares nothing keeps the arcade key repeat.
 *
 * THE BUG THIS PINS, 2026-09-15: the first cut of the two repeat modes made
 * the MENU rate the default and flagged nine `Games/Arcade` icons, on the
 * theory that a door timing its own input would not feel it. GRANDMASTER,
 * which does exactly that, was slowed within the hour - "gmaster has a delay
 * now when i hold the button" - because its DAS/ARR is driven BY the browser's
 * synthetic repeats rather than around them. Every real-time door nobody
 * remembered to flag was detuned the same way, silently.
 *
 * So the default is the rate every door already had, and the two doors whose
 * screen is a LIST opt in to the slow one. These tests fail on the inverted
 * default: GMASTER, which carries no KEY_REPEAT tooltype, is the case.
 */
import { declaredKeyRepeatMode, enableGameMode, disableGameMode } from '../../src/services/game-mode.service';

describe('the repeat mode a door declares', () => {
  it('is the arcade rate for a door with no tooltype at all', () => {
    expect(declaredKeyRepeatMode({})).toBe('game');
    expect(declaredKeyRepeatMode(undefined)).toBe('game');
    expect(declaredKeyRepeatMode({ toolTypes: {} })).toBe('game');
  });

  it('is the arcade rate for GMASTER, whose icon declares only MIN_COLUMNS', () => {
    const grandmaster = { toolTypes: { MIN_COLUMNS: '40', CATEGORY: 'Games/Puzzle' } };
    expect(declaredKeyRepeatMode(grandmaster)).toBe('game');
  });

  it('is the menu rate only when the door asks for it by name', () => {
    expect(declaredKeyRepeatMode({ toolTypes: { KEY_REPEAT: 'application' } })).toBe('application');
    expect(declaredKeyRepeatMode({ toolTypes: { KEY_REPEAT: ' APPLICATION ' } })).toBe('application');
  });

  it('reads the installed record too, not just the Door object', () => {
    const installedOnly = { doorInfo: { toolTypes: { KEY_REPEAT: 'application' } } };
    expect(declaredKeyRepeatMode(installedOnly)).toBe('application');
  });

  it('treats a value it does not understand as the arcade rate', () => {
    expect(declaredKeyRepeatMode({ toolTypes: { KEY_REPEAT: 'slow' } })).toBe('game');
    expect(declaredKeyRepeatMode({ toolTypes: { KEY_REPEAT: '1' } })).toBe('game');
  });
});

describe('what the browser is told when game mode goes on', () => {
  const makeSocket = () => {
    const emitted: Array<[string, unknown]> = [];
    return { emitted, emit: (event: string, payload: unknown) => { emitted.push([event, payload]); } };
  };

  it('sends the arcade rate for a door that recorded nothing', () => {
    const socket = makeSocket();
    const session: any = {};
    enableGameMode(socket as any, session, 'TS');
    expect(socket.emitted).toContainEqual(['key-repeat-mode', 'game']);
  });

  it('sends the menu rate for a door that recorded it before it started', () => {
    const socket = makeSocket();
    const session: any = { doorKeyRepeatMode: 'application' };
    enableGameMode(socket as any, session, 'TS');
    expect(socket.emitted).toContainEqual(['key-repeat-mode', 'application']);
  });

  it('puts the arcade rate back when the door exits, and KEEPS the mode', () => {
    /*
     * The emitted rate goes back to arcade for whatever runs next - the
     * board's own prompts never saw anything else - but the SESSION keeps
     * what the door declared. 9d4df0f5a changed that deliberately and this
     * assertion was left behind asserting the old contract, so main has been
     * one test red since: a HYBRID door launches its client half and its
     * server half in one breath, something disables game mode in between, and
     * clearing the mode there left the second enable with nothing to say -
     * CARDLOBBY ran at the arcade rate with `KEY_REPEAT=application` in its
     * icon, doing nothing. Every launch route sets the field afresh, so a
     * stale value cannot survive into the next door.
     */
    const socket = makeSocket();
    const session: any = { doorKeyRepeatMode: 'application', keyState: {} };
    disableGameMode(socket as any, session);
    expect(socket.emitted).toContainEqual(['key-repeat-mode', 'game']);
    expect(session.doorKeyRepeatMode).toBe('application');
  });
});
