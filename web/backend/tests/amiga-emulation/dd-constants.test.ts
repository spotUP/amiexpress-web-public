import { DD_LVO, DP_OFFSET, USER_OFFSET, CONF_OFFSET, CFG_OFFSET, DP_SIZEOF } from "../../src/amiga-emulation/dd/dd-constants";

describe("DD constants", () => {
  it("matches the FunctionTable-recovered LVO offsets (research doc 2026-08-15)", () => {
    expect(DD_LVO.InitDoor).toBe(-30);
    expect(DD_LVO.CloseDoor).toBe(-36);
    expect(DD_LVO.SendString).toBe(-42);
    expect(DD_LVO.Prompt).toBe(-48);
    expect(DD_LVO.InquirePointers).toBe(-54);
    expect(DD_LVO.DisplayFile).toBe(-60);
    expect(DD_LVO.JoinConference).toBe(-66); // inferred, see research doc
    expect(DD_LVO.XprSend).toBe(-84);
    expect(DD_LVO.GetKey).toBe(-108);
    expect(DD_LVO.ScanFileDirs).toBe(-114);
    expect(DD_LVO.Disconnect).toBe(-126);
    expect(DD_LVO.DDCommand).toBe(-132);
  });
  it("has the confirmed Pointers-struct field offsets", () => {
    expect(DP_SIZEOF).toBe(0x54);
    expect(DP_OFFSET.dp_DayDream).toBe(0x0c);
    expect(DP_OFFSET.dp_CurrConf).toBe(0x1c);
    expect(DP_OFFSET.dp_CurrUser).toBe(0x28);
    expect(DP_OFFSET.dp_DoorParams).toBe(0x34);
    expect(DP_OFFSET.dp_BpsRate).toBe(0x38);
    expect(DP_OFFSET.dp_IODevice).toBe(0x3c); // inferred position
    expect(DP_OFFSET.dp_CurrentNode).toBe(0x40);
  });
  it("has the confirmed USER struct field offsets", () => {
    expect(USER_OFFSET.USER_HANDLE).toBe(0x1a);
    expect(USER_OFFSET.USER_PASSWORD).toBe(0x78);
    expect(USER_OFFSET.USER_ORGANIZATION).toBe(0x34);
    expect(USER_OFFSET.USER_VOICEPHONE).toBe(0x63);
    expect(USER_OFFSET.USER_SECURITYLEVEL).toBe(0xeb);
    expect(USER_OFFSET.USER_BYTERATIO).toBe(0xcf);
    expect(USER_OFFSET.USER_PUBMESSAGES).toBe(0xc8);
    expect(USER_OFFSET.USER_ULFILES).toBe(0xc4);
    expect(USER_OFFSET.USER_DLFILES).toBe(0xc6);
    expect(USER_OFFSET.USER_CONNECTIONS).toBe(0xcc);
    expect(USER_OFFSET.USER_LASTCALL).toBe(0xf2);
    expect(USER_OFFSET.USER_DAILYTIMELIMIT).toBe(0xfe);
    expect(USER_OFFSET.USER_TIMEREMAINING).toBe(0x102);
    expect(USER_OFFSET.USER_ULBYTES).toBe(0xbc);
    expect(USER_OFFSET.USER_DLBYTES).toBe(0xc0);
    expect(USER_OFFSET.USER_SCREENLENGTH).toBe(0x88);
  });
  it("has CONF/CFG offsets", () => {
    expect(CONF_OFFSET.CONF_NUMBER).toBe(0);
    expect(CONF_OFFSET.CONF_NAME).toBe(1);
    expect(CFG_OFFSET.CFG_SYSOPNAME).toBe(0x1a);
  });
});
