/**
 * Conftop v2.3 Y2K binary patch regression guard.
 *
 * Root cause (2026-08-14): the reset catch-up loop in Conftop000.x /
 * Conftop020.x validates the advancing resetdate against the constant
 * 0x386F0580 (946702720 = 2000-01-01 06:00, Unix epoch + hardcoded CST
 * offset). Any resetdate >= year 2000 during a multi-period catch-up
 * (i.e. the door was idle for more than 2x the DAYS tooltype period)
 * raises the fatal "CONFTOP (ERROR): Reset date is out of range." and
 * exits before rewriting Conftop.Data, bricking the door until the
 * data file is refreshed.
 *
 * Fix: the guard's blt.b (0x6D 0xB0) is patched to bra.b (0x60 0xB0)
 * so the catch-up loop always continues; it still terminates through
 * the "now < resetdate + period" exit directly above it.
 *
 * These tests fail if an unpatched binary is ever restored from an
 * archive or upstream copy.
 */
import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

// cmpi.l #0x386F0580,d0 followed by the patched bra.b (0x60B0).
const CMPI_Y2K = Buffer.from("0c80386f0580", "hex");
const PATCHED_BRA = Buffer.from("60b0", "hex");
const UNPATCHED_BLT = Buffer.from("6db0", "hex");

const BINARIES: Array<{ file: string; braOffset: number }> = [
  { file: "Doors/Conftop/Conftop000.x", braOffset: 0xe80 },
  { file: "Doors/Conftop/Conftop020.x", braOffset: 0xe7c },
];

describe.each(BINARIES)("Conftop Y2K patch: $file", ({ file, braOffset }) => {
  const data = fs.readFileSync(path.join(REPO_ROOT, file));

  it("keeps the cmpi.l #0x386F0580 guard site intact", () => {
    expect(data.subarray(braOffset - 6, braOffset)).toEqual(CMPI_Y2K);
  });

  it("branches unconditionally past the 'Reset date is out of range' error", () => {
    expect(data.subarray(braOffset, braOffset + 2)).toEqual(PATCHED_BRA);
  });

  it("does not contain the original blt.b at the guard", () => {
    expect(data.subarray(braOffset, braOffset + 2)).not.toEqual(UNPATCHED_BLT);
  });
});
