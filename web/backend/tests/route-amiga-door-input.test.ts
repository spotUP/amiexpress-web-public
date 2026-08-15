/**
 * Regression: live keystrokes never reached FIMProtocol — door.handler had
 * TWO duplicated doorInputHandler closures and a FIM routing fix landed in
 * only one. Routing is now a single exported function used by both.
 */
import { routeAmigaDoorInput } from '../src/handlers/door.handler';

describe('routeAmigaDoorInput', () => {
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
