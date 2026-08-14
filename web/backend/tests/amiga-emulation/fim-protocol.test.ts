import { FIMProtocol } from "../../src/amiga-emulation/fim/fim-protocol";
import { FDOM, FIM_CMD, FIM_RC } from "../../src/amiga-emulation/fim/fim-constants";
// reuse MemStub from fame-library.test.ts (extract to tests/amiga-emulation/helpers/mem-stub.ts in this task)
import { MemStub } from "./helpers/mem-stub";

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
});
