import { FDOM, FIM_CMD, FIM_RC, FAMEDOORMSG_SIZE, fimPortName } from "../../src/amiga-emulation/fim/fim-constants";

describe("FIM constants", () => {
  it("matches FAMEPublicStructs.h byte offsets", () => {
    expect(FDOM.IOSTRING).toBe(20);
    expect(FDOM.IOSTRING_LEN).toBe(202);
    expect(FDOM.STRINGPTR).toBe(222);
    expect(FDOM.COMMAND).toBe(226);
    expect(FDOM.DATA1).toBe(230);
    expect(FDOM.DATA2).toBe(234);
    expect(FDOM.DATA3).toBe(238);
    expect(FDOM.RETURNCODE).toBe(242);
    expect(FDOM.NODE).toBe(246);
    expect(FAMEDOORMSG_SIZE).toBe(282);
  });
  it("names the port like SPrintf(FAMEDoorPort,\"FAMEDoorPort%ld\",NodeNr)", () => {
    expect(fimPortName(1)).toBe("FAMEDoorPort1");
    expect(fimPortName(12)).toBe("FAMEDoorPort12");
  });
  it("has the MC/NR/CF/SR/AR codes used by the reference kit", () => {
    expect(FIM_CMD.MC_DoorStart).toBe(1);
    expect(FIM_CMD.MC_ShutDown).toBe(2);
    expect(FIM_CMD.MC_ShutDownLastWords).toBe(3);
    expect(FIM_CMD.NR_SendStr).toBe(10);
    expect(FIM_CMD.NR_PromptChars).toBe(14);
    expect(FIM_CMD.NR_WaitChar).toBe(92);
    expect(FIM_CMD.AR_SendStr).toBe(851);
    expect(FIM_RC.NOTIMPLEMENTED).toBe(4);
  });
});
