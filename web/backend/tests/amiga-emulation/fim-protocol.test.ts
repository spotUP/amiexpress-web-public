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
});
