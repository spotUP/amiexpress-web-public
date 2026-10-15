import { detectDoorType } from "../src/doors/door-installer";

describe("detectDoorType — DD", () => {
  const hunk = Buffer.from([0x00, 0x00, 0x03, 0xf3]);
  it("classifies dreamdoor.library binaries as DD", () => {
    const bin = Buffer.concat([hunk, Buffer.from("...dreamdoor.library...", "latin1")]);
    expect(detectDoorType(bin)).toBe("DD");
  });
  it("classifies raw DD_DoorPort binaries as DD", () => {
    const bin = Buffer.concat([hunk, Buffer.from("...DD_DoorPort1...", "latin1")]);
    expect(detectDoorType(bin)).toBe("DD");
  });
  it("still prefers FIM/XIM/SIM precedence over DD", () => {
    const bin = Buffer.concat([hunk, Buffer.from("...AEDoorPort...dreamdoor.library...", "latin1")]);
    expect(detectDoorType(bin)).toBe("XIM");
  });
});
