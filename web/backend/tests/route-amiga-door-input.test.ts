/**
 * Regression: live keystrokes never reached FIMProtocol — door.handler had
 * TWO duplicated doorInputHandler closures and a FIM routing fix landed in
 * only one. Routing is now a single exported function used by both.
 *
 * Critical 1 (DD final-review wave, 2026-08-16): the SAME split happened
 * again for DreamDoor (DD) doors, but worse — the LIVE keystroke router
 * (this function, invoked from session.doorInputHandler on the
 * 'command'-channel socket handlers) had NO DreamDoor branch at all. DD
 * doors hung at their first Prompt/GetKey and were killed by the 300s
 * timeout in production, while corpus/E2E stayed green because the test
 * harnesses ALSO emit a 'door:input' socket event, which reached a SEPARATE
 * copy of this logic inside AmigaDoorSession.ts that DID have the DD
 * branch. AmigaDoorSession's 'door:input' listener now delegates to this
 * SAME function (see AmigaDoorSession.ts's setupSocketHandlers) — there is
 * exactly one routing function again, and these tests drive it directly
 * (not AmigaDoorSession) per the finding's requirement that the regression
 * test prove the fix at the actual live-router level.
 */
import { routeAmigaDoorInput } from '../src/handlers/door.handler';

describe('routeAmigaDoorInput', () => {
  it('DreamDoor (DD) active: a keystroke reaches dreamDoorLibrary.queueInput, not dosLibrary (Critical 1)', () => {
    const dd: string[] = []; const dos: string[] = [];
    routeAmigaDoorInput({
      dreamDoorLibrary: {
        isActive: () => true,
        queueInput: (d: string) => { dd.push(d); },
      },
      dosLibrary: { queueInput: (d: string) => { dos.push(d); } },
    }, 'y');
    expect(dd).toEqual(['y']);
    expect(dos).toEqual([]);
  });

  it('DreamDoor takes priority over XIM/DOS when active (mirrors the FIM precedence)', () => {
    const dd: string[] = []; const xim: string[] = []; const dos: string[] = [];
    routeAmigaDoorInput({
      dreamDoorLibrary: { isActive: () => true, queueInput: (d: string) => { dd.push(d); } },
      ximProtocol: {
        queueInput: (d: string) => { xim.push(d); },
        isWaitingForLineInput: () => true,
      },
      dosLibrary: { queueInput: (d: string) => { dos.push(d); } },
    }, 'z');
    expect(dd).toEqual(['z']);
    expect(xim).toEqual([]);
    expect(dos).toEqual([]);
  });

  it('FIM still beats DreamDoor when (hypothetically) both are present — FIM is checked first', () => {
    const fim: string[] = []; const dd: string[] = [];
    routeAmigaDoorInput({
      fimProtocol: { queueInput: (d: string) => { fim.push(d); } },
      dreamDoorLibrary: { isActive: () => true, queueInput: (d: string) => { dd.push(d); } },
    }, 'q');
    expect(fim).toEqual(['q']);
    expect(dd).toEqual([]);
  });

  it('Important 2: routes on isActive(), NOT isWaitingForInput() — type-ahead reaches DreamDoor even when nothing is currently deferred', () => {
    const dd: string[] = []; const dos: string[] = [];
    routeAmigaDoorInput({
      dreamDoorLibrary: {
        isActive: () => true,
        isWaitingForInput: () => false, // nothing deferred right now
        queueInput: (d: string) => { dd.push(d); },
      },
      dosLibrary: { queueInput: (d: string) => { dos.push(d); } },
    }, 'a');
    expect(dd).toEqual(['a']);
    expect(dos).toEqual([]);
  });

  it('DreamDoor not active (door not yet initialized / already closed): falls through to DOS stdin', () => {
    const dd: string[] = []; const dos: string[] = [];
    routeAmigaDoorInput({
      dreamDoorLibrary: { isActive: () => false, queueInput: (d: string) => { dd.push(d); } },
      dosLibrary: { queueInput: (d: string) => { dos.push(d); } },
    }, 'b');
    expect(dd).toEqual([]);
    expect(dos).toEqual(['b']);
  });

  it('TIM handler waiting for input: queues there and skips the DOS fallback', () => {
    const tim: string[] = []; const dos: string[] = [];
    routeAmigaDoorInput({
      timHandler: {
        isWaitingForInput: () => true,
        queueInput: (d: string) => { tim.push(d); },
      },
      dosLibrary: { queueInput: (d: string) => { dos.push(d); } },
    }, 'c');
    expect(tim).toEqual(['c']);
    expect(dos).toEqual([]);
  });

  it('TIM handler present but NOT waiting: falls through to DOS stdin', () => {
    const tim: string[] = []; const dos: string[] = [];
    routeAmigaDoorInput({
      timHandler: {
        isWaitingForInput: () => false,
        queueInput: (d: string) => { tim.push(d); },
      },
      dosLibrary: { queueInput: (d: string) => { dos.push(d); } },
    }, 'd');
    expect(tim).toEqual([]);
    expect(dos).toEqual(['d']);
  });
  it('FIM protocol gets input exclusively (no DOS double delivery)', () => {
    const fim: string[] = []; const dos: string[] = [];
    routeAmigaDoorInput({
      fimProtocol: { queueInput: (d: string) => { fim.push(d); } },
      ximProtocol: null,
      dosLibrary: { queueInput: (d: string) => { dos.push(d); } },
    }, 'y');
    expect(fim).toEqual(['y']);
    expect(dos).toEqual([]);
  });

  it('XIM path unchanged: queues to XIM, injects for native doors, skips DOS while line input pending', () => {
    const xim: string[] = []; const injected: string[] = []; const dos: string[] = [];
    routeAmigaDoorInput({
      ximProtocol: {
        queueInput: (d: string) => { xim.push(d); },
        isWaitingForLineInput: () => true,
        shouldInjectNativeInput: () => true,
        injectInputToNativeDoor: (c: string) => { injected.push(c); },
      },
      dosLibrary: { queueInput: (d: string) => { dos.push(d); } },
    }, 'ab');
    expect(xim).toEqual(['ab']);
    expect(injected).toEqual(['a', 'b']);
    expect(dos).toEqual([]);
  });

  it('falls back to DOS stdin when no protocol consumed the input', () => {
    const dos: string[] = [];
    routeAmigaDoorInput({ dosLibrary: { queueInput: (d: string) => { dos.push(d); } } }, 'x');
    expect(dos).toEqual(['x']);
  });

  it('tolerates null shared state', () => {
    expect(() => routeAmigaDoorInput(null, 'x')).not.toThrow();
  });
});
