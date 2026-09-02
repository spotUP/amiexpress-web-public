/**
 * Task OC-2 of `thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md`:
 * the ONE terminal model a PETSCII session has on the server.
 *
 * The model is keyed on the SESSION - not on the emitter, not on the socket -
 * because a connection can be handed a new session mid-flight and a web
 * session survives a socket replacement on reconnect. The two facts that make
 * a choke safe are pinned here: a payload the RENDER already fed while it was
 * encoding is fed exactly once more (never twice), and a payload a DOOR
 * produced - which no server model has ever seen - is observed for real.
 *
 * Fixtures are byte arrays built in code. Never write a `.seq`/PETSCII fixture
 * through Edit/Write: the UTF-8 round-trip destroys every high-bit byte.
 */
process.env.SKIP_DB_INIT = '1';

import {
  sessionWantsPetscii,
  petsciiTerminalModelFor,
  emitPetsciiBytes,
  observePetsciiBytesAtChoke,
  transducePetsciiAtChoke,
  flushPetsciiModel,
  resetPetsciiModel,
  disposePetsciiSessionModel,
} from '../../src/utils/petscii-session-model';

/** Two PETSCII cursor-downs ($11): the cursor moves by exactly two rows per application. */
const TWO_DOWNS = Buffer.from([0x11, 0x11]);

/** A socket whose `emit` IS the choke, so a producer's emit walks the real path. */
function chokeSocket(session: any) {
  const seen: string[] = [];
  const socket: any = {
    emit(event: string, payload: string) {
      seen.push(event);
      if (event === 'petscii-bytes') observePetsciiBytesAtChoke(session, payload);
      return true;
    },
  };
  return { socket, seen };
}

const rowOf = (session: any): number =>
  petsciiTerminalModelFor(session).machine.state.cursorY;

describe('OC-2: the ONE session terminal model', () => {
  it('an ANSI session never gets a model', () => {
    expect(sessionWantsPetscii({})).toBe(false);
    expect(sessionWantsPetscii({ terminalType: 'modern' })).toBe(false);
    expect(sessionWantsPetscii(undefined)).toBe(false);
    expect(sessionWantsPetscii({ petsciiMode: true })).toBe(true);
    expect(sessionWantsPetscii({ terminalType: 'c64' })).toBe(true);
  });

  it('the model is created once per session', () => {
    const session: any = { petsciiMode: true };
    const first = petsciiTerminalModelFor(session);
    expect(petsciiTerminalModelFor(session)).toBe(first);
    expect(session.petsciiTransducer).toBe(first);
  });

  it('a new session object gets a fresh model', () => {
    // Q4: a node reassignment / re-login hands the connection a NEW session
    // object. It must not inherit the old caller's screen.
    const s1: any = { petsciiMode: true };
    petsciiTerminalModelFor(s1).observe(Buffer.from([0x93, 0x11, 0x11]));
    expect(rowOf(s1)).toBe(2);

    const s2: any = { petsciiMode: true };
    expect(petsciiTerminalModelFor(s2)).not.toBe(s1.petsciiTransducer);
    expect(rowOf(s2)).toBe(0);
    expect(petsciiTerminalModelFor(s2).machine.state.cursorX).toBe(0);
  });

  it("rendered bytes are fed once, a door's raw bytes are fed once", () => {
    const session: any = { petsciiMode: true };
    const { socket } = chokeSocket(session);

    // The render consults the cursor WHILE it encodes, so by the time its
    // bytes reach the choke they are already in the model.
    petsciiTerminalModelFor(session).observe(TWO_DOWNS);
    expect(rowOf(session)).toBe(2);

    emitPetsciiBytes(socket, session, TWO_DOWNS);
    expect(rowOf(session)).toBe(2); // ONE application, not two

    // A door's payload was never fed by anyone: the choke is the only thing
    // that will ever see it.
    socket.emit('petscii-bytes', TWO_DOWNS.toString('base64'));
    expect(rowOf(session)).toBe(4);
  });

  it('a dropped emit does not poison the next payload', () => {
    const session: any = { petsciiMode: true };
    const swallowing: any = { emit: () => true };

    petsciiTerminalModelFor(session).observe(TWO_DOWNS);
    emitPetsciiBytes(swallowing, session, TWO_DOWNS);
    expect(rowOf(session)).toBe(2);

    // The SAME base64, unmarked, from a door. A stale mark would swallow it.
    const { socket } = chokeSocket(session);
    socket.emit('petscii-bytes', TWO_DOWNS.toString('base64'));
    expect(rowOf(session)).toBe(4);
  });

  it("a door's proxy socket cannot hide the mark", () => {
    // I7: a door runs against `Object.create(socket)`
    // (`handlers/door.handler.ts:157`). A mark written through the proxy
    // would become a shadowed OWN property of the proxy while the choke -
    // the prototype's `emit` - reads the prototype and sees nothing. RED
    // against a socket-keyed mark; the key is the session.
    const session: any = { petsciiMode: true };
    const { socket } = chokeSocket(session);
    const doorSocket = Object.create(socket);

    petsciiTerminalModelFor(session).observe(TWO_DOWNS);
    emitPetsciiBytes(doorSocket, session, TWO_DOWNS);

    expect(rowOf(session)).toBe(2); // moved ONCE
    expect(Object.prototype.hasOwnProperty.call(doorSocket, 'emit')).toBe(false);
  });
});

describe('OC-2: the choke helpers around the model', () => {
  it('ANSI at the choke moves the model and returns the PETSCII bytes', () => {
    const session: any = { terminalType: 'c64' };
    // 'A' in the text bank the transducer selects ($0E) is $C1, not $41 -
    // the choke returns real PETSCII, not the ANSI it was handed.
    const bytes = transducePetsciiAtChoke(session, 'AB');
    expect(Array.from(bytes)).toEqual([0x0e, 0xc1, 0xc2]);
    expect(petsciiTerminalModelFor(session).machine.state.cursorX).toBe(2);
  });

  it('the flush is empty for a session that has no model at all', () => {
    expect(Array.from(flushPetsciiModel(undefined))).toEqual([]);
    expect(Array.from(flushPetsciiModel({}))).toEqual([]);
  });

  it('a reset homes the model; a dispose drops it with the parked segments', () => {
    const session: any = { petsciiMode: true, screenSegments: { segments: ['x'] } };
    petsciiTerminalModelFor(session).observe(TWO_DOWNS);
    expect(rowOf(session)).toBe(2);

    resetPetsciiModel(session);
    expect(session.petsciiTransducer).toBeDefined();
    expect(rowOf(session)).toBe(0);

    const before = session.petsciiTransducer;
    disposePetsciiSessionModel(session);
    expect(session.petsciiTransducer).toBeUndefined();
    expect(session.screenSegments).toBeUndefined();
    expect(petsciiTerminalModelFor(session)).not.toBe(before);
  });
});
