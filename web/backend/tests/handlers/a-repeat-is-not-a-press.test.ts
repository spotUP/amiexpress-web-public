/**
 * The browser says which key-downs are its own auto-repeat. Forward it.
 *
 * `BBSTerminal.tsx` has always sent `key-down { repeat: true }` while a key is
 * held; `socket-handlers.ts` used to destructure only key/code and drop it. A
 * door could therefore only infer a repeat by keeping a held-key set of its
 * own, which is wrong exactly when it matters: a key-up lost to a window blur
 * or a dropped frame empties the set under a key that is still down, and the
 * next repeat reads as a fresh press.
 *
 * This pins the payload the door actually receives, on the real socket
 * handler, because the flag existing in the browser proves nothing about
 * whether it survives the crossing.
 */
import { EventEmitter } from 'events';

type KeyStatePayload = {
  key: string;
  pressed: boolean;
  keyState: Record<string, boolean>;
  repeat?: boolean;
};

describe('a key-down that the browser marked as a repeat', () => {
  const armKeyDown = () => {
    const socket = new EventEmitter() as EventEmitter & { id: string };
    socket.id = 'test-socket';
    const seen: KeyStatePayload[] = [];
    const session: any = {
      inDoorManager: true,
      keyState: {},
      doorKeyStateHandler: (data: KeyStatePayload) => { seen.push(data); },
    };

    // The handler under test, wired exactly as socket-handlers wires it.
    socket.on('key-down', (data: { key: string; code: string; repeat?: boolean }) => {
      if (!session.keyState) session.keyState = {};
      session.keyState[data.key] = true;
      if (session.inDoorManager && session.doorKeyStateHandler) {
        session.doorKeyStateHandler({
          key: data.key,
          pressed: true,
          keyState: session.keyState,
          repeat: data.repeat === true,
        });
      }
    });

    return { socket, seen };
  };

  it('reaches the door still marked', () => {
    const { socket, seen } = armKeyDown();
    socket.emit('key-down', { key: 'ArrowLeft', code: 'ArrowLeft' });
    socket.emit('key-down', { key: 'ArrowLeft', code: 'ArrowLeft', repeat: true });

    expect(seen.map((s) => s.repeat)).toEqual([false, true]);
  });

  it('is false, never undefined, for a caller that sends no flag', () => {
    const { socket, seen } = armKeyDown();
    socket.emit('key-down', { key: 'z', code: 'KeyZ' });
    expect(seen[0].repeat).toBe(false);
  });
});

/**
 * The same property, read off the SHIPPING source rather than a copy of it -
 * a hand-wired emitter can agree with a handler that was never changed.
 */
describe('the socket handler itself', () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '../../src/server/socket-handlers.ts'),
    'utf8',
  ) as string;

  it('accepts repeat on the key-down payload', () => {
    const signature = source.slice(source.indexOf("socket.on('key-down'"));
    expect(signature.slice(0, 200)).toContain('repeat?: boolean');
  });

  it('passes it to the door key-state handler', () => {
    const body = source.slice(source.indexOf("socket.on('key-down'"), source.indexOf("socket.on('key-up'"));
    expect(body).toContain('repeat: data.repeat === true');
  });
});
