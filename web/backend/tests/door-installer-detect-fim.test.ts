import { detectDoorType, AMIGA_68K_BINARY_EXT_RE } from "../src/doors/door-installer"; // export it if currently private
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

describe("AMIGA_68K_BINARY_EXT_RE (archive-executable gate)", () => {
  // Regression: a FAME archive whose only binary is named "*.FIM" (e.g.
  // TestDoor.FIM, FAMEWHO.FIM) must pass the executable-detection gate in
  // detectArchiveType's hasExecutable check, or install() fails with
  // "Cannot detect door type" before detectDoorType ever runs.
  it("matches a .FIM binary filename", () => {
    expect(AMIGA_68K_BINARY_EXT_RE.test("TestDoor.FIM")).toBe(true);
  });
  it("still matches a .exe binary filename", () => {
    expect(AMIGA_68K_BINARY_EXT_RE.test("door.exe")).toBe(true);
  });
  it("does not match a non-binary filename", () => {
    expect(AMIGA_68K_BINARY_EXT_RE.test("readme.txt")).toBe(false);
  });
});
