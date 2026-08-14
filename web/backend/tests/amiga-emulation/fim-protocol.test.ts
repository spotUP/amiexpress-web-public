jest.mock("../../src/utils/debug-log", () => ({
  debugLog: jest.fn(),
  debugWarn: jest.fn(),
  isDebugEnabled: () => false,
}));

import { FIMProtocol } from "../../src/amiga-emulation/fim/fim-protocol";
import { FDOM, FIM_CMD, FIM_RC } from "../../src/amiga-emulation/fim/fim-constants";
// reuse MemStub from fame-library.test.ts (extract to tests/amiga-emulation/helpers/mem-stub.ts in this task)
import { MemStub } from "./helpers/mem-stub";
import * as debugLogModule from "../../src/utils/debug-log";

function buildMsg(emu: MemStub, addr: number, cmd: number) {
  emu.writeMemory32(addr + FDOM.MN_REPLYPORT, 0x9000);
  emu.writeMemory32(addr + FDOM.COMMAND, cmd);
  return addr;
}

describe("FIMProtocol", () => {
  function make(emu: MemStub) {
    const putMsgCalls: Array<{ port: number; msg: number }> = [];
    const shutdowns: number[] = [];
    const proto = new FIMProtocol({
      emulator: emu as never,
      execLibrary: { putMsg: (port, msg) => { putMsgCalls.push({ port, msg }); } },
      socket: { emit: () => true },
      bbsSession: {},
      nodeId: 1,
      onShutdown: (rc) => { shutdowns.push(rc); },
    });
    return { proto, putMsgCalls, shutdowns };
  }

  it("MC_DoorStart replies OK to mn_ReplyPort as NT_REPLYMSG", () => {
    const emu = new MemStub();
    const { proto, putMsgCalls } = make(emu);
    const msg = buildMsg(emu, 0x8000, FIM_CMD.MC_DoorStart);
    proto.handleMessage(msg);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
    expect(emu.readMemory(msg + 8)).toBe(6); // NT_REPLYMSG
    expect(putMsgCalls).toEqual([{ port: 0x9000, msg }]);
  });

  it("unknown command replies NOTIMPLEMENTED, never hangs", () => {
    const emu = new MemStub();
    const { proto, putMsgCalls } = make(emu);
    const msg = buildMsg(emu, 0x8000, 9999);
    proto.handleMessage(msg);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.NOTIMPLEMENTED);
    expect(putMsgCalls.length).toBe(1);
  });

  it("MC_ShutDown replies then fires onShutdown", () => {
    const emu = new MemStub();
    const { proto, putMsgCalls, shutdowns } = make(emu);
    proto.handleMessage(buildMsg(emu, 0x8000, FIM_CMD.MC_ShutDown));
    expect(putMsgCalls.length).toBe(1);
    expect(shutdowns).toEqual([0]);
  });

  it("AR_SendStr derefs fdom_StringPtr and emits, Data1=1 adds CRLF", () => {
    const emu = new MemStub();
    const out: string[] = [];
    const proto = new FIMProtocol({
      emulator: emu as never,
      execLibrary: { putMsg: () => undefined },
      socket: { emit: (_ev, data) => { out.push(String(data)); return true; } },
      bbsSession: {}, nodeId: 1, onShutdown: () => undefined,
    });
    const msg = 0x8000, str = 0x4000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.AR_SendStr);
    emu.writeMemory32(msg + FDOM.STRINGPTR, str);
    emu.writeMemory32(msg + FDOM.DATA1, 1);
    "HI".split("").forEach((c, i) => emu.writeMemory(str + i, c.charCodeAt(0)));
    emu.writeMemory(str + 2, 0);
    proto.handleMessage(msg);
    expect(out).toEqual(["HI\r\n"]);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
  });

  it("AR_SendStr with Data1=-1 (0xFFFFFFFF, sign-extended) still adds CRLF — 'if not 0', not '== 1'", () => {
    const emu = new MemStub();
    const out: string[] = [];
    const proto = new FIMProtocol({
      emulator: emu as never,
      execLibrary: { putMsg: () => undefined },
      socket: { emit: (_ev, data) => { out.push(String(data)); return true; } },
      bbsSession: {}, nodeId: 1, onShutdown: () => undefined,
    });
    const msg = 0x8000, str = 0x4000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.AR_SendStr);
    emu.writeMemory32(msg + FDOM.STRINGPTR, str);
    emu.writeMemory32(msg + FDOM.DATA1, -1);
    "HI".split("").forEach((c, i) => emu.writeMemory(str + i, c.charCodeAt(0)));
    emu.writeMemory(str + 2, 0);
    proto.handleMessage(msg);
    expect(out).toEqual(["HI\r\n"]);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
  });

  it("AR_SendStr without CRLF (Data1=0) emits verbatim", () => {
    const emu = new MemStub();
    const out: string[] = [];
    const proto = new FIMProtocol({
      emulator: emu as never,
      execLibrary: { putMsg: () => undefined },
      socket: { emit: (_ev, data) => { out.push(String(data)); return true; } },
      bbsSession: {}, nodeId: 1, onShutdown: () => undefined,
    });
    const msg = 0x8000, str = 0x4000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.AR_SendStr);
    emu.writeMemory32(msg + FDOM.STRINGPTR, str);
    "YO".split("").forEach((c, i) => emu.writeMemory(str + i, c.charCodeAt(0)));
    emu.writeMemory(str + 2, 0);
    proto.handleMessage(msg);
    expect(out).toEqual(["YO"]);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
  });

  it("AR_SendStr with NULL StringPtr replies FAIL, does not emit, does not crash", () => {
    const emu = new MemStub();
    const out: string[] = [];
    const proto = new FIMProtocol({
      emulator: emu as never,
      execLibrary: { putMsg: () => undefined },
      socket: { emit: (_ev, data) => { out.push(String(data)); return true; } },
      bbsSession: {}, nodeId: 1, onShutdown: () => undefined,
    });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.AR_SendStr);
    emu.writeMemory32(msg + FDOM.STRINGPTR, 0);
    proto.handleMessage(msg);
    expect(out).toEqual([]);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.FAIL);
  });

  it("NR_SendStr emits fdom_IOString verbatim", () => {
    const emu = new MemStub();
    const out: string[] = [];
    const proto = new FIMProtocol({ emulator: emu as never, execLibrary: { putMsg: () => undefined },
      socket: { emit: (_e, d) => { out.push(String(d)); return true; } }, bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_SendStr);
    "OK>".split("").forEach((c, i) => emu.writeMemory(msg + FDOM.IOSTRING + i, c.charCodeAt(0)));
    proto.handleMessage(msg);
    expect(out).toEqual(["OK>"]);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
  });

  it("NR_SendStrCRLF emits fdom_IOString with trailing CRLF", () => {
    const emu = new MemStub();
    const out: string[] = [];
    const proto = new FIMProtocol({ emulator: emu as never, execLibrary: { putMsg: () => undefined },
      socket: { emit: (_e, d) => { out.push(String(d)); return true; } }, bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_SendStrCRLF);
    "Bye".split("").forEach((c, i) => emu.writeMemory(msg + FDOM.IOSTRING + i, c.charCodeAt(0)));
    proto.handleMessage(msg);
    expect(out).toEqual(["Bye\r\n"]);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
  });

  it("CF_ShowText replies NOTIMPLEMENTED, logs the opcode-specific message, and never fakes success (no emit)", () => {
    const emu = new MemStub();
    const out: string[] = [];
    const logMock = debugLogModule.debugLog as jest.Mock;
    logMock.mockClear();
    const proto = new FIMProtocol({ emulator: emu as never, execLibrary: { putMsg: () => undefined },
      socket: { emit: (_e, d) => { out.push(String(d)); return true; } }, bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.CF_ShowText);
    "MENU".split("").forEach((c, i) => emu.writeMemory(msg + FDOM.IOSTRING + i, c.charCodeAt(0)));
    proto.handleMessage(msg);
    expect(out).toEqual([]);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.NOTIMPLEMENTED);
    // Distinguishes the dedicated CF_ShowText arm from the generic `default:`
    // fallback, which logs "[FIM] not implemented: 400" instead — same rc,
    // same no-emit behavior, different log content.
    expect(logMock).toHaveBeenCalledWith("[FIM] CF_ShowText MENU");
  });

  it("NR_PromptChars defers reply until queueInput, echoes prompt first", () => {
    const emu = new MemStub();
    const out: string[] = []; const putMsgCalls: number[] = [];
    let paused = false, resumed = false;
    (emu as unknown as { pause(): void; resume(): void }).pause = () => { paused = true; };
    (emu as unknown as { pause(): void; resume(): void }).resume = () => { resumed = true; };
    const proto = new FIMProtocol({ emulator: emu as never,
      execLibrary: { putMsg: (_p, m) => { putMsgCalls.push(m); } },
      socket: { emit: (_e, d) => { out.push(String(d)); return true; } },
      bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_PromptChars);
    emu.writeMemory32(msg + FDOM.DATA1, 50);
    "Name>".split("").forEach((c, i) => emu.writeMemory(msg + FDOM.IOSTRING + i, c.charCodeAt(0)));
    proto.handleMessage(msg);
    expect(out[0]).toBe("Name>");
    expect(putMsgCalls.length).toBe(0);       // no reply yet
    expect(paused).toBe(true);
    proto.queueInput("spot\r");
    expect(putMsgCalls.length).toBe(1);
    expect(resumed).toBe(true);
    let s = ""; for (let i = 0; i < 4; i++) s += String.fromCharCode(emu.readMemory(msg + FDOM.IOSTRING + i));
    expect(s).toBe("spot");
    expect(emu.readMemory(msg + FDOM.IOSTRING + 4)).toBe(0);
  });

  it("AR_GetKey returns presence flag in Data2 (not the char) and does not consume it", () => {
    const emu = new MemStub();
    let paused = false;
    (emu as unknown as { pause(): void; resume(): void }).pause = () => { paused = true; };
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const putMsgCalls: number[] = [];
    const proto = new FIMProtocol({ emulator: emu as never,
      execLibrary: { putMsg: (_p, m) => { putMsgCalls.push(m); } },
      socket: { emit: () => true }, bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    proto.queueInput("y");
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.AR_GetKey);
    proto.handleMessage(msg);
    // Replies immediately (synchronously) — never pauses, never defers.
    expect(putMsgCalls.length).toBe(1);
    expect(paused).toBe(false);
    expect(emu.readMemory32(msg + FDOM.DATA2)).toBe(1); // presence flag, not 'y' (121)
    expect(emu.readMemory32(msg + FDOM.DATA3)).toBe(0); // 0 = console char

    // The char was NOT consumed: a following NR_HotKey still gets it.
    const msg2 = 0x8100;
    emu.writeMemory32(msg2 + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg2 + FDOM.COMMAND, FIM_CMD.NR_HotKey);
    proto.handleMessage(msg2);
    expect(emu.readMemory32(msg2 + FDOM.DATA2)).toBe(121); // 'y'
  });

  it("AR_GetKey with an empty buffer returns Data2=0 immediately, never pauses", () => {
    const emu = new MemStub();
    let paused = false;
    (emu as unknown as { pause(): void }).pause = () => { paused = true; };
    const putMsgCalls: number[] = [];
    const proto = new FIMProtocol({ emulator: emu as never,
      execLibrary: { putMsg: (_p, m) => { putMsgCalls.push(m); } },
      socket: { emit: () => true }, bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.AR_GetKey);
    proto.handleMessage(msg);
    expect(putMsgCalls.length).toBe(1);
    expect(paused).toBe(false);
    expect(emu.readMemory32(msg + FDOM.DATA2)).toBe(0);
  });

  it("NR_HotKey / AR_HotKey with an empty buffer return Data2=0 immediately, never pause", () => {
    const emu = new MemStub();
    let paused = false;
    (emu as unknown as { pause(): void }).pause = () => { paused = true; };
    const putMsgCalls: number[] = [];
    const proto = new FIMProtocol({ emulator: emu as never,
      execLibrary: { putMsg: (_p, m) => { putMsgCalls.push(m); } },
      socket: { emit: () => true }, bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    for (const cmd of [FIM_CMD.NR_HotKey, FIM_CMD.AR_HotKey]) {
      const msg = 0x8000 + cmd;
      emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
      emu.writeMemory32(msg + FDOM.COMMAND, cmd);
      proto.handleMessage(msg);
      expect(emu.readMemory32(msg + FDOM.DATA2)).toBe(0);
      expect(emu.readMemory32(msg + FDOM.DATA3)).toBe(0);
    }
    expect(putMsgCalls.length).toBe(2);
    expect(paused).toBe(false);
  });

  it("NR_WaitChar with an empty buffer defers (pauses), then completes with the char in Data2 on queueInput", () => {
    const emu = new MemStub();
    let paused = false, resumed = false;
    (emu as unknown as { pause(): void; resume(): void }).pause = () => { paused = true; };
    (emu as unknown as { pause(): void; resume(): void }).resume = () => { resumed = true; };
    const putMsgCalls: number[] = [];
    const proto = new FIMProtocol({ emulator: emu as never,
      execLibrary: { putMsg: (_p, m) => { putMsgCalls.push(m); } },
      socket: { emit: () => true }, bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_WaitChar);
    proto.handleMessage(msg);
    expect(putMsgCalls.length).toBe(0); // no reply yet
    expect(paused).toBe(true);
    proto.queueInput("z");
    expect(putMsgCalls.length).toBe(1);
    expect(resumed).toBe(true);
    expect(emu.readMemory32(msg + FDOM.DATA2)).toBe(122); // 'z'
    expect(emu.readMemory32(msg + FDOM.DATA3)).toBe(0);
  });

  it("NR_WaitChar answers synchronously (no pause) when a char is already type-ahead buffered", () => {
    const emu = new MemStub();
    let paused = false;
    (emu as unknown as { pause(): void }).pause = () => { paused = true; };
    const putMsgCalls: number[] = [];
    const proto = new FIMProtocol({ emulator: emu as never,
      execLibrary: { putMsg: (_p, m) => { putMsgCalls.push(m); } },
      socket: { emit: () => true }, bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    proto.queueInput("q");
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_WaitChar);
    proto.handleMessage(msg);
    expect(putMsgCalls.length).toBe(1);
    expect(paused).toBe(false);
    expect(emu.readMemory32(msg + FDOM.DATA2)).toBe(113); // 'q'
  });

  it("NR_WaitChar emits its IOString prompt before deferring, then completes the key via queueInput", () => {
    const emu = new MemStub();
    let paused = false, resumed = false;
    (emu as unknown as { pause(): void; resume(): void }).pause = () => { paused = true; };
    (emu as unknown as { pause(): void; resume(): void }).resume = () => { resumed = true; };
    const out: string[] = [];
    const putMsgCalls: number[] = [];
    const proto = new FIMProtocol({ emulator: emu as never,
      execLibrary: { putMsg: (_p, m) => { putMsgCalls.push(m); } },
      socket: { emit: (_e, d) => { out.push(String(d)); return true; } },
      bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_WaitChar);
    "Press any key>".split("").forEach((c, i) => emu.writeMemory(msg + FDOM.IOSTRING + i, c.charCodeAt(0)));
    proto.handleMessage(msg);
    // Prompt emitted immediately, before the deferred wait.
    expect(out).toEqual(["Press any key>"]);
    expect(putMsgCalls.length).toBe(0);
    expect(paused).toBe(true);
    proto.queueInput("k");
    expect(putMsgCalls.length).toBe(1);
    expect(resumed).toBe(true);
    expect(emu.readMemory32(msg + FDOM.DATA2)).toBe(107); // 'k'
    // No further emit beyond the prompt itself.
    expect(out).toEqual(["Press any key>"]);
  });

  it("NR_PromptChars mode 4 echoes '*' per typed char, not the literal chars", () => {
    const emu = new MemStub();
    (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const out: string[] = [];
    const proto = new FIMProtocol({ emulator: emu as never,
      execLibrary: { putMsg: () => undefined },
      socket: { emit: (_e, d) => { out.push(String(d)); return true; } },
      bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_PromptChars);
    emu.writeMemory32(msg + FDOM.DATA1, 50);
    emu.writeMemory32(msg + FDOM.DATA2, 4); // password echo mode
    "Pass:".split("").forEach((c, i) => emu.writeMemory(msg + FDOM.IOSTRING + i, c.charCodeAt(0)));
    proto.handleMessage(msg);
    proto.queueInput("hi\r");
    // out[0] is the prompt; the two typed chars each echo '*', not 'h'/'i'.
    expect(out).toEqual(["Pass:", "*", "*"]);
    let s = ""; for (let i = 0; i < 2; i++) s += String.fromCharCode(emu.readMemory(msg + FDOM.IOSTRING + i));
    expect(s).toBe("hi");
  });

  it("NR_PromptChars mode 7 echoes nothing at all (no stars, no chars, no backspace feedback)", () => {
    const emu = new MemStub();
    (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const out: string[] = [];
    const proto = new FIMProtocol({ emulator: emu as never,
      execLibrary: { putMsg: () => undefined },
      socket: { emit: (_e, d) => { out.push(String(d)); return true; } },
      bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_PromptChars);
    emu.writeMemory32(msg + FDOM.DATA1, 50);
    emu.writeMemory32(msg + FDOM.DATA2, 7); // no-echo password mode
    "Pass:".split("").forEach((c, i) => emu.writeMemory(msg + FDOM.IOSTRING + i, c.charCodeAt(0)));
    proto.handleMessage(msg);
    proto.queueInput("hi\x08x\r"); // 'h','i',backspace,'x',CR
    // Only the prompt is emitted — no per-char echo, no stars, no
    // backspace erase sequence — but the line still accumulates correctly.
    expect(out).toEqual(["Pass:"]);
    let s = ""; for (let i = 0; i < 2; i++) s += String.fromCharCode(emu.readMemory(msg + FDOM.IOSTRING + i));
    expect(s).toBe("hx");
    expect(emu.readMemory(msg + FDOM.IOSTRING + 2)).toBe(0);
  });

  it("NR_PromptChars mode 8 accepts digits, silently rejects letters", () => {
    const emu = new MemStub();
    (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const out: string[] = [];
    const proto = new FIMProtocol({ emulator: emu as never,
      execLibrary: { putMsg: () => undefined },
      socket: { emit: (_e, d) => { out.push(String(d)); return true; } },
      bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_PromptChars);
    emu.writeMemory32(msg + FDOM.DATA1, 50);
    emu.writeMemory32(msg + FDOM.DATA2, 8); // numeric-only mode
    proto.handleMessage(msg);
    proto.queueInput("1a2b3\r");
    let s = ""; for (let i = 0; i < 3; i++) s += String.fromCharCode(emu.readMemory(msg + FDOM.IOSTRING + i));
    expect(s).toBe("123");
    expect(out).toEqual(["1", "2", "3"]); // letters never echoed — rejected before echo
  });

  function makeWith(emu: MemStub, bbsSession: Record<string, unknown>, nodeId = 3) {
    const putMsgCalls: Array<{ port: number; msg: number }> = [];
    const proto = new FIMProtocol({
      emulator: emu as never,
      execLibrary: { putMsg: (port, msg) => { putMsgCalls.push({ port, msg }); } },
      socket: { emit: () => true },
      bbsSession,
      nodeId,
      onShutdown: () => undefined,
    });
    return { proto, putMsgCalls };
  }

  function readIOStr(emu: MemStub, msg: number, max = FDOM.IOSTRING_LEN): string {
    let s = "";
    for (let i = 0; i < max; i++) {
      const b = emu.readMemory(msg + FDOM.IOSTRING + i);
      if (b === 0) break;
      s += String.fromCharCode(b);
    }
    return s;
  }

  it("NR_BBSName returns bbsSession.bbsName in IOString", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, { bbsName: "AmiExpress Web" });
    const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_BBSName);
    proto.handleMessage(msg);
    expect(readIOStr(emu, msg)).toBe("AmiExpress Web");
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
  });

  it("NR_SysOp returns bbsSession.sysopName in IOString", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, { sysopName: "Spot" });
    const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_SysOp);
    proto.handleMessage(msg);
    expect(readIOStr(emu, msg)).toBe("Spot");
  });

  it("NR_MainLine returns doorParams when present", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, { doorParams: "DOOR1 ARG1", doorCommand: "DOOR1" });
    const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_MainLine);
    proto.handleMessage(msg);
    expect(readIOStr(emu, msg)).toBe("DOOR1 ARG1");
  });

  it("NR_MainLine falls back to doorCommand, then empty string", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, { doorCommand: "DOOR1" });
    const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_MainLine);
    proto.handleMessage(msg);
    expect(readIOStr(emu, msg)).toBe("DOOR1");

    const emu2 = new MemStub();
    const { proto: proto2 } = makeWith(emu2, {});
    const msg2 = buildMsg(emu2, 0x8000, FIM_CMD.NR_MainLine);
    proto2.handleMessage(msg2);
    expect(readIOStr(emu2, msg2)).toBe("");
  });

  it("NR_Name returns username in IOString", () => {
    const emu = new MemStub();
    const proto = new FIMProtocol({ emulator: emu as never, execLibrary: { putMsg: () => undefined },
      socket: { emit: () => true },
      bbsSession: { user: { username: "SPOT", secLevel: 255 }, bbsName: "AmiExpress Web", timeRemaining: 59 },
      nodeId: 3, onShutdown: () => undefined });
    const msg = 0x8000;
    emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_Name);
    proto.handleMessage(msg);
    let s = ""; for (let i = 0; i < 4; i++) s += String.fromCharCode(emu.readMemory(msg + FDOM.IOSTRING + i));
    expect(s).toBe("SPOT");
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
  });

  it("NR_Password is DENIED and blank", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, { user: { password: "hunter2" } });
    const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_Password);
    proto.handleMessage(msg);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.DENIED);
    expect(emu.readMemory(msg + FDOM.IOSTRING)).toBe(0);
  });

  it("NR_Location returns user.location in IOString", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, { user: { location: "Earth" } });
    const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_Location);
    proto.handleMessage(msg);
    expect(readIOStr(emu, msg)).toBe("Earth");
  });

  it("NR_AccessLevel returns user.secLevel in Data2", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, { user: { secLevel: 255 } });
    const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_AccessLevel);
    proto.handleMessage(msg);
    expect(emu.readMemory32(msg + FDOM.DATA2)).toBe(255);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
  });

  it("NR_TimeRemain returns bbsSession.timeRemaining in Data2 (minutes, header states no unit)", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, { timeRemaining: 59 });
    const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_TimeRemain);
    proto.handleMessage(msg);
    expect(emu.readMemory32(msg + FDOM.DATA2)).toBe(59);
  });

  it("NR_Uploads / NR_Downloads default to 0 when absent, otherwise return user counts in Data3", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, {});
    const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_Uploads);
    proto.handleMessage(msg);
    expect(emu.readMemory32(msg + FDOM.DATA3)).toBe(0);

    const emu2 = new MemStub();
    const { proto: proto2 } = makeWith(emu2, { user: { uploads: 7, downloads: 12 } });
    const msgUp = buildMsg(emu2, 0x8000, FIM_CMD.NR_Uploads);
    proto2.handleMessage(msgUp);
    expect(emu2.readMemory32(msgUp + FDOM.DATA3)).toBe(7);
    const msgDown = buildMsg(emu2, 0x8100, FIM_CMD.NR_Downloads);
    proto2.handleMessage(msgDown);
    expect(emu2.readMemory32(msgDown + FDOM.DATA3)).toBe(12);
  });

  it("NR_BytesUpload / NR_BytesDownload return byte counts in Data3", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, { user: { bytesUpload: 123456, bytesDownload: 654321 } });
    const msgUp = buildMsg(emu, 0x8000, FIM_CMD.NR_BytesUpload);
    proto.handleMessage(msgUp);
    expect(emu.readMemory32(msgUp + FDOM.DATA3)).toBe(123456);
    const msgDown = buildMsg(emu, 0x8100, FIM_CMD.NR_BytesDownload);
    proto.handleMessage(msgDown);
    expect(emu.readMemory32(msgDown + FDOM.DATA3)).toBe(654321);
  });

  it("SR_ConfName returns bbsSession.conferenceName in IOString", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, { conferenceName: "General" });
    const msg = buildMsg(emu, 0x8000, FIM_CMD.SR_ConfName);
    proto.handleMessage(msg);
    expect(readIOStr(emu, msg)).toBe("General");
  });

  it("SR_ConfNum returns bbsSession.conferenceId in Data2 (actual) and Data3 (relative)", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, { conferenceId: 2 });
    const msg = buildMsg(emu, 0x8000, FIM_CMD.SR_ConfNum);
    proto.handleMessage(msg);
    expect(emu.readMemory32(msg + FDOM.DATA2)).toBe(2);
    expect(emu.readMemory32(msg + FDOM.DATA3)).toBe(2);
  });

  it("SR_NodeNumber returns nodeId in Data2", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, {}, 3);
    const msg = buildMsg(emu, 0x8000, FIM_CMD.SR_NodeNumber);
    proto.handleMessage(msg);
    expect(emu.readMemory32(msg + FDOM.DATA2)).toBe(3);
  });

  it("SR_FAMEVersion returns version string in IOString, version 6 in Data2, revision 0 in Data3", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, {});
    const msg = buildMsg(emu, 0x8000, FIM_CMD.SR_FAMEVersion);
    proto.handleMessage(msg);
    expect(readIOStr(emu, msg)).toBe("FAME 6.0 (amiexpress-web compat)");
    expect(emu.readMemory32(msg + FDOM.DATA2)).toBe(6);
    expect(emu.readMemory32(msg + FDOM.DATA3)).toBe(0);
  });

  it("info commands never crash on absent user/bbsSession fields", () => {
    const emu = new MemStub();
    const { proto } = makeWith(emu, {});
    for (const cmd of [
      FIM_CMD.NR_BBSName, FIM_CMD.NR_SysOp, FIM_CMD.NR_MainLine, FIM_CMD.NR_Name,
      FIM_CMD.NR_Location, FIM_CMD.NR_AccessLevel, FIM_CMD.NR_TimeRemain,
      FIM_CMD.NR_Uploads, FIM_CMD.NR_Downloads, FIM_CMD.NR_BytesUpload,
      FIM_CMD.NR_BytesDownload, FIM_CMD.SR_ConfName, FIM_CMD.SR_ConfNum,
    ]) {
      const msg = buildMsg(emu, 0x8000, cmd);
      expect(() => proto.handleMessage(msg)).not.toThrow();
      expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
    }
  });

  it("NR_HotKey consumes first char only and requeues the remainder for the next input command", () => {
    const emu = new MemStub();
    (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
    (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
    const putMsgCalls: number[] = [];
    const proto = new FIMProtocol({ emulator: emu as never,
      execLibrary: { putMsg: (_p, m) => { putMsgCalls.push(m); } },
      socket: { emit: () => true }, bbsSession: {}, nodeId: 1, onShutdown: () => undefined });

    proto.queueInput("yes\r");

    const msg1 = 0x8000;
    emu.writeMemory32(msg1 + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg1 + FDOM.COMMAND, FIM_CMD.NR_HotKey);
    proto.handleMessage(msg1);
    expect(putMsgCalls.length).toBe(1);
    expect(emu.readMemory32(msg1 + FDOM.DATA2)).toBe(121); // 'y' — 'es\r' stays buffered

    const msg2 = 0x9100;
    emu.writeMemory32(msg2 + FDOM.MN_REPLYPORT, 0x9000);
    emu.writeMemory32(msg2 + FDOM.COMMAND, FIM_CMD.NR_HotKey);
    proto.handleMessage(msg2);
    expect(putMsgCalls.length).toBe(2);
    expect(emu.readMemory32(msg2 + FDOM.DATA2)).toBe(101); // 'e'
  });

  describe("MC_ShutDownLastWords", () => {
    it("emits IOString to the socket before shutdown, then fires onShutdown with the same text", () => {
      const emu = new MemStub();
      const out: string[] = [];
      const shutdowns: Array<{ rc: number; lastWords?: string }> = [];
      const proto = new FIMProtocol({
        emulator: emu as never,
        execLibrary: { putMsg: () => undefined },
        socket: { emit: (_e, d) => { out.push(String(d)); return true; } },
        bbsSession: {}, nodeId: 1,
        onShutdown: (rc, lastWords) => { shutdowns.push({ rc, lastWords }); },
      });
      const msg = 0x8000;
      emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
      emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.MC_ShutDownLastWords);
      "Command 88 not implemented until now in this Version of FAME !"
        .split("").forEach((c, i) => emu.writeMemory(msg + FDOM.IOSTRING + i, c.charCodeAt(0)));
      proto.handleMessage(msg);
      expect(out).toEqual(["Command 88 not implemented until now in this Version of FAME !"]);
      expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
      expect(shutdowns).toEqual([{ rc: 0, lastWords: "Command 88 not implemented until now in this Version of FAME !" }]);
    });

    it("empty IOString: does not emit, still fires onShutdown", () => {
      const emu = new MemStub();
      const out: string[] = [];
      const shutdowns: number[] = [];
      const proto = new FIMProtocol({
        emulator: emu as never,
        execLibrary: { putMsg: () => undefined },
        socket: { emit: (_e, d) => { out.push(String(d)); return true; } },
        bbsSession: {}, nodeId: 1,
        onShutdown: (rc) => { shutdowns.push(rc); },
      });
      const msg = buildMsg(emu, 0x8000, FIM_CMD.MC_ShutDownLastWords);
      proto.handleMessage(msg);
      expect(out).toEqual([]);
      expect(shutdowns).toEqual([0]);
    });
  });

  describe("NR_GetFullArg / NR_GetArgument1-4 (87-91)", () => {
    // FAMEDoorCommands.h: doorParams holds the FULL command line
    // "COMMAND arg1 arg2..." (same field NR_MainLine reads unstripped);
    // these commands must strip the leading command-name token — "you get
    // ONLY the arguments, not the commandname".
    function argSession(doorParams: string, doorCommand: string) {
      return { doorParams, doorCommand };
    }

    it("NR_GetArgument1-4 return each argument, stripping the leading commandname", () => {
      const emu = new MemStub();
      const { proto } = makeWith(emu, argSession("FAMEWHO force node online", "FAMEWHO"));
      const m1 = buildMsg(emu, 0x8000, FIM_CMD.NR_GetArgument1);
      proto.handleMessage(m1);
      expect(readIOStr(emu, m1)).toBe("force");

      const m2 = buildMsg(emu, 0x8100, FIM_CMD.NR_GetArgument2);
      proto.handleMessage(m2);
      expect(readIOStr(emu, m2)).toBe("node");

      const m3 = buildMsg(emu, 0x8200, FIM_CMD.NR_GetArgument3);
      proto.handleMessage(m3);
      expect(readIOStr(emu, m3)).toBe("online");
      expect(emu.readMemory32(m3 + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
    });

    it("NR_GetArgument4 returns the 4th token AND everything after it, verbatim spacing", () => {
      const emu = new MemStub();
      const { proto } = makeWith(emu, argSession("FAMEWHO a  b c d   e f", "FAMEWHO"));
      const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_GetArgument4);
      proto.handleMessage(msg);
      expect(readIOStr(emu, msg)).toBe("d   e f");
    });

    it("NR_GetArgument4 with exactly 4 (or fewer) tokens returns just the 4th token", () => {
      const emu = new MemStub();
      const { proto } = makeWith(emu, argSession("FAMEWHO a b c d", "FAMEWHO"));
      const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_GetArgument4);
      proto.handleMessage(msg);
      expect(readIOStr(emu, msg)).toBe("d");
    });

    it("NR_GetFullArg normalizes spacing across the first 4 args, keeps the rest verbatim", () => {
      const emu = new MemStub();
      const { proto } = makeWith(emu, argSession("FAMEWHO a  b c d   e f", "FAMEWHO"));
      const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_GetFullArg);
      proto.handleMessage(msg);
      expect(readIOStr(emu, msg)).toBe("a b c d e f");
    });

    it("NR_GetFullArg with 4 or fewer args just normalizes spacing, no trailing tail", () => {
      const emu = new MemStub();
      const { proto } = makeWith(emu, argSession("FAMEWHO  force   node ", "FAMEWHO"));
      const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_GetFullArg);
      proto.handleMessage(msg);
      expect(readIOStr(emu, msg)).toBe("force node");
    });

    it("missing argument index returns empty string with rc=OK (header documents no fail/denied for absent args)", () => {
      const emu = new MemStub();
      const { proto } = makeWith(emu, argSession("FAMEWHO force", "FAMEWHO"));
      const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_GetArgument3);
      proto.handleMessage(msg);
      expect(readIOStr(emu, msg)).toBe("");
      expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
    });

    it("no doorParams at all: every arm returns empty string, rc=OK, never throws", () => {
      const emu = new MemStub();
      const { proto } = makeWith(emu, {});
      for (const cmd of [
        FIM_CMD.NR_GetFullArg, FIM_CMD.NR_GetArgument1, FIM_CMD.NR_GetArgument2,
        FIM_CMD.NR_GetArgument3, FIM_CMD.NR_GetArgument4,
      ]) {
        const msg = buildMsg(emu, 0x8000, cmd);
        expect(() => proto.handleMessage(msg)).not.toThrow();
        expect(readIOStr(emu, msg)).toBe("");
        expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
      }
    });

    it("strips the commandname case-insensitively", () => {
      const emu = new MemStub();
      const { proto } = makeWith(emu, argSession("famewho force", "FAMEWHO"));
      const msg = buildMsg(emu, 0x8000, FIM_CMD.NR_GetArgument1);
      proto.handleMessage(msg);
      expect(readIOStr(emu, msg)).toBe("force");
    });
  });
});
