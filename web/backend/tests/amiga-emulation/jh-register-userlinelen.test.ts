/**
 * Regression: JH_REGISTER reply must carry userLineLen in msg.command at offset 0xe0.
 *
 * express.e (axcommon.e:543-557 + express.e:3379-3381):
 *   CASE JH_REGISTER
 *     msg.command := IF loggedOnUser<>NIL THEN userLineLen ELSE 29
 *     nodesPtr[] := nodesPtr[]+1
 *
 * The jhMessage struct stores `command` as LONG (32-bit) at offset 0xe0
 * (long layout). 68K doors like SRH/TList/TLP2 read this value and use it
 * as their pause-after-N-lines threshold. If we send 1, every JH_SM line
 * triggers TLP2's embedded "(Pause)..." prompt; if we send 23, the door
 * pages every 23 lines (matching spot's user.linesPerScreen=23 in DB).
 */
import { XIMSystemCommandsHandler } from '../../src/amiga-emulation/xim/system-commands';
import { XIMMessageParser } from '../../src/amiga-emulation/xim/messages';
import { XIMCommand, BBSSessionData, XIMState } from '../../src/amiga-emulation/xim/types';
import { DoorConstants } from '../../src/amiga-emulation/DoorTypes';

class StubEmulator {
  private mem: Uint8Array;

  constructor() {
    this.mem = new Uint8Array(0x10000);
  }

  readMemory(address: number): number {
    return this.mem[address & 0xffff] ?? 0;
  }
  writeMemory(address: number, byte: number): void {
    this.mem[address & 0xffff] = byte & 0xff;
  }
  readMemory16(address: number): number {
    return ((this.readMemory(address) << 8) | this.readMemory(address + 1)) & 0xffff;
  }
  writeMemory16(address: number, value: number): void {
    this.writeMemory(address, (value >> 8) & 0xff);
    this.writeMemory(address + 1, value & 0xff);
  }
  readMemory32(address: number): number {
    return (
      (((this.readMemory(address) << 24) >>> 0) +
        (this.readMemory(address + 1) << 16) +
        (this.readMemory(address + 2) << 8) +
        this.readMemory(address + 3)) >>>
      0
    );
  }
  writeMemory32(address: number, value: number): void {
    this.writeMemory(address, (value >> 24) & 0xff);
    this.writeMemory(address + 1, (value >> 16) & 0xff);
    this.writeMemory(address + 2, (value >> 8) & 0xff);
    this.writeMemory(address + 3, value & 0xff);
  }
  readString(address: number, maxLength: number): string {
    let out = '';
    for (let i = 0; i < maxLength; i++) {
      const b = this.readMemory(address + i);
      if (b === 0) break;
      out += String.fromCharCode(b);
    }
    return out;
  }
}

function buildHandler(user: any) {
  const emulator = new StubEmulator() as any;
  const messageParser = new XIMMessageParser(emulator);

  // Allocate a jhMessage at 0x1000 with mn_Length set to a "long" layout size.
  // Long-layout offsets (per axcommon.e + DoorConstants) require room up to 0x108+.
  // Use 0x150 to match MESSAGE_TOTAL_LENGTH.
  const msgAddr = 0x1000;
  emulator.writeMemory16(msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET, 0x150);

  const bbsSession: BBSSessionData = {
    user,
    nodeId: 1,
  };
  const state: XIMState = {
    registered: false,
    shuttingDown: false,
    nonStopText: false,
    transferring: false,
    lineCount: 0,
    pauseLines: 24,
    lineWrap: 80,
    autoPauseEnabled: false,
    carrierDropped: false,
    chainRequest: '',
    usedXimInput: false,
    isNativeDoor: false,
  } as any;

  const execLibrary = {
    replyMsg: jest.fn(),
  } as any;
  const socket = { emit: jest.fn() } as any;

  const handler = new XIMSystemCommandsHandler(
    emulator,
    execLibrary,
    socket,
    messageParser,
    bbsSession,
    state
  );
  return { handler, emulator, msgAddr };
}

describe('JH_REGISTER reply userLineLen at msg.command offset 0xe0', () => {
  test('writes user.linesPerScreen=23 (spot in DB) into msg.command AND msg.data', () => {
    const { handler, emulator, msgAddr } = buildHandler({
      username: 'spot',
      linesPerScreen: 23,
    });

    handler.handleRegister({
      msgAddr,
      command: XIMCommand.JH_REGISTER,
      data: 0,
      replyPort: 0xdead0000,
      messageLength: 0x150,
      stringAddr: msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
      string: '',
    } as any);

    // Long layout: command lives at offset 0xe0, written as 32-bit big-endian.
    // express.e-style doors read msg.command (e0) for userLineLen.
    expect(emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET)).toBe(23);
    // AEKIT-style doors (SRH/TList/TLP2) read msg.data (dc) via CheckMessage().
    // We mirror userLineLen into both so neither reader style pauses every line.
    expect(emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET)).toBe(23);
  });

  test('falls back to lineLength when linesPerScreen missing', () => {
    const { handler, emulator, msgAddr } = buildHandler({
      username: 'tester',
      lineLength: 30,
    });

    handler.handleRegister({
      msgAddr,
      command: XIMCommand.JH_REGISTER,
      data: 0,
      replyPort: 0,
      messageLength: 0x150,
      stringAddr: msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
      string: '',
    } as any);

    expect(emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET)).toBe(30);
    expect(emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET)).toBe(30);
  });

  test('uses default 29 when no user logged on (matches express.e:3380)', () => {
    const { handler, emulator, msgAddr } = buildHandler(null);

    handler.handleRegister({
      msgAddr,
      command: XIMCommand.JH_REGISTER,
      data: 0,
      replyPort: 0,
      messageLength: 0x150,
      stringAddr: msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
      string: '',
    } as any);

    expect(emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET)).toBe(29);
    expect(emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET)).toBe(29);
  });

  test('coerces 0 / non-positive linesPerScreen to default 29 (no pause-every-line)', () => {
    // If a user record has linesPerScreen=0 (or undefined coerced to 0) we must
    // NOT pass 0 to the door — that would cause the door's checkForPause to
    // treat its threshold as 0/1 and pause after every line (TLIST regression).
    const { handler, emulator, msgAddr } = buildHandler({
      username: 'broken',
      linesPerScreen: 0,
    });

    handler.handleRegister({
      msgAddr,
      command: XIMCommand.JH_REGISTER,
      data: 0,
      replyPort: 0,
      messageLength: 0x150,
      stringAddr: msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
      string: '',
    } as any);

    const writtenCmd = emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET);
    const writtenData = emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET);
    expect(writtenCmd).toBeGreaterThan(1);
    expect(writtenCmd).toBe(29);
    expect(writtenData).toBe(29);
  });
});
