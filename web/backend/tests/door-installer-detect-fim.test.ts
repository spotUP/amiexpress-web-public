import { detectDoorType } from "../src/doors/door-installer"; // export it if currently private
describe("detectDoorType", () => {
  const hunk = Buffer.from([0x00, 0x00, 0x03, 0xf3]);
  it("classifies FAMEDoorPort binaries as FIM", () => {
    const bin = Buffer.concat([hunk, Buffer.from("...FAMEDoorPort...", "latin1")]);
    expect(detectDoorType(bin)).toBe("FIM");
  });
  it("still classifies AEDoorPort as XIM", () => {
    const bin = Buffer.concat([hunk, Buffer.from("...AEDoorPort...", "latin1")]);
    expect(detectDoorType(bin)).toBe("XIM");
  });
});
