/**
 * The rest of the raw door-input log sites: a password typed into a door must not reach the console log, and a
 * mouse report must not flood it, from any of the handlers that print what the caller typed.
 *
 * tests/door-input-log-redaction.test.ts drives the ONE wiring (executeAmigaDoor -> doorInputHandler). This file
 * covers the sinks that live in their own classes (TIM / DoorMessageHandler / AREXX / Python / AmiExpressLibrary /
 * client-door-bridge). Each is driven at its own input entry point; per sink the first case proves the sink
 * carried a normal key (so the absence below is a redaction, not a sink that never printed), the second asserts
 * the secret text and the mouse bytes are absent while the door's secret flag is up.
 *
 * debug-log is mocked to console.log: the real one is gated by DEBUG_68K read at import time.
 */
import 'reflect-metadata';
import { EventEmitter } from 'events';

jest.mock('../src/utils/debug-log', () => ({
  debugLog: (...a: unknown[]) => console.log(...a),
  debugWarn: (...a: unknown[]) => console.warn(...a),
  isDebugEnabled: () => true,
}));

import { setSecretInput } from '../src/amiga-emulation/xim/secret-input';
import { TIMDoorMessageHandler } from '../src/amiga-emulation/session/TIMDoorMessageHandler';
import { DoorMessageHandler } from '../src/amiga-emulation/session/DoorMessageHandler';
import { AREXXDoorSession } from '../src/amiga-emulation/AREXXDoorSession';
import { PythonDoorSession } from '../src/amiga-emulation/PythonDoorSession';
import { AmiExpressLibrary } from '../src/amiga-emulation/api/AmiExpressLibrary';
import { TIMDoorCommand } from '../src/amiga-emulation/DoorTypes';
import { XIMCommand } from '../src/amiga-emulation/XIMProtocol';
import { getClientDoorBridge } from '../src/doors/client-door-bridge';

const SECRET = 'hunter2-Pa55';
const KEY = 'q';
const MOUSE = '\x1b[<35;47;19M';

function logged(run: () => void | Promise<void>): Promise<string> {
  const lines: string[] = [];
  const spies = (['log', 'warn', 'error'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); }));
  return Promise.resolve(run()).then(() => lines.join('\n')).finally(() => spies.forEach((s) => s.mockRestore()));
}

/** A sink: given a session, "types" `text` into it. */
type Sink = { name: string; type: (session: object, text: string) => Promise<void> | void };

const socketOf = () => Object.assign(new EventEmitter(), { id: 's', emit: jest.fn(() => true) }) as any;

const sinks: Sink[] = [
  ...(['hotkey', 'line', 'pause', 'queued'] as const).map((mode): Sink => ({
    name: `TIM handler (${mode})`,
    type: (session, text) => {
      const tim: any = new TIMDoorMessageHandler({} as any, socketOf(), { executablePath: 'x', bbsSession: session } as any);
      tim.setString = () => undefined; tim.setCarrier = () => undefined;
      if (mode === 'hotkey') tim.waitingForHotkey = true;
      if (mode === 'pause') tim.waitingForPause = true;
      if (mode === 'line') { tim.waitingForLineInput = true; tim.lineInputMaxLen = 40; }
      tim.queueInput(text);
      if (mode === 'line') tim.queueInput('\r');
    },
  })),
  {
    name: 'TIM handler (PG_HK immediate key)',
    type: async (session, text) => {
      const tim: any = new TIMDoorMessageHandler({} as any, socketOf(), { executablePath: 'x', bbsSession: session } as any);
      tim.setString = () => undefined; tim.setCarrier = () => undefined;
      tim.readDoorMsg = () => ({ command: TIMDoorCommand.PG_HK, data: 0, str: 'Key?' });
      tim.queueInput(text);
      await tim.handleMessage(0x1000);
    },
  },
  {
    name: 'DoorMessageHandler door:input (and the line written to the message)',
    type: (session, text) => {
      const socket = socketOf();
      const emulator: any = { writeMemory32: () => undefined, writeMemory16: () => undefined, writeMemory: () => undefined, readMemory: () => 0, readMemory32: () => 0, readString: () => '', pause: () => undefined, resume: () => undefined };
      const handler: any = new DoorMessageHandler(emulator, socket, { replyMessage: () => undefined, putMsg: () => undefined } as any, { executablePath: 'x', bbsSession: session } as any);
      handler.activeInput = { msgAddr: 0x1000, maxlen: 80, command: XIMCommand.JH_LI, replyPortAddr: 0, resumeCallback: () => undefined };
      handler.writeStringToMessage = () => undefined;
      socket.emit = jest.fn(() => true);
      socket.listeners('door:input').forEach((l: (d: string) => void) => l(text));
    },
  },
  {
    name: 'AREXX door session',
    type: (session, text) => {
      const socket = socketOf();
      const door: any = new AREXXDoorSession(socket, { executablePath: 'x', bbsSession: session } as any);
      door.isRunning = true; door.interpreter = { context: {} };
      socket.emit = EventEmitter.prototype.emit.bind(socket);
      socket.emit('door:input', text);
    },
  },
  {
    name: 'Python door session',
    type: (session, text) => {
      const socket = socketOf();
      const door: any = new PythonDoorSession(socket, { executablePath: 'x', bbsSession: session } as any);
      door.isRunning = true; door.process = { stdin: { write: () => true } };
      socket.emit = EventEmitter.prototype.emit.bind(socket);
      socket.emit('door:input', text);
    },
  },
  {
    name: 'AmiExpress library (queued, then aeGets)',
    type: (session, text) => {
      const emulator: any = { getRegister: () => 0x100, setRegister: () => undefined, writeMemory: () => undefined };
      const lib: any = new AmiExpressLibrary(emulator, session);
      lib.queueInput(text);
      lib.aeGets();
    },
  },
  {
    name: 'client-door bridge',
    type: (session, text) => {
      const socket = socketOf();
      getClientDoorBridge().startSession(socket, session as any, 'some-door');
      socket.listeners('command').forEach((l: (d: string) => void) => l(text));
    },
  },
];

afterEach(() => jest.restoreAllMocks());

describe.each(sinks)('$name', ({ type }) => {
  it('prints a normal key (the sink is real)', async () => {
    const session = { user: { username: 'CALLER' }, nodeId: 1 };
    const text = await logged(() => type(session, KEY));
    expect(text).toContain(KEY);
  });

  it('prints neither the secret nor the mouse bytes while the door has declared SECRET', async () => {
    const session = { user: { username: 'CALLER' }, nodeId: 1 };
    setSecretInput(session, true);
    const text = await logged(() => type(session, SECRET));
    expect(text).not.toContain(SECRET);
    expect(text).toMatch(/withheld/);
  });

  it('names a mouse report instead of printing it, even with no secret', async () => {
    const session = { user: { username: 'CALLER' }, nodeId: 1 };
    const text = await logged(() => type(session, MOUSE));
    expect(text).not.toContain('<35;47;19M');
  });
});
