import * as fs from "fs";
import * as path from "path";

describe("dreamdoor.library wiring", () => {
  it("installDreamDoorVectors() syncs trap addresses to MOIRA (mirrors installFameVectors)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/amiga-emulation/api/LibraryTraps.ts"),
      "utf8"
    );
    const start = src.indexOf("installDreamDoorVectors(): void {");
    const end = src.indexOf("installFameVectors(): void {");
    const body = src.slice(start, end);
    expect(body).toContain("syncTrapAddressesToMoira();");
  });

  it("LibraryManager installs dreamdoor.library vectors on OpenLibrary", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/amiga-emulation/LibraryManager.ts"),
      "utf8"
    );
    expect(src).toMatch(/name\.toLowerCase\(\) === "dreamdoor\.library"[\s\S]{0,200}installDreamDoorVectors/);
  });

  it("ExecLibrary reserves enough stub jump-table slots for the full -6..-144 LVO range", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/amiga-emulation/api/ExecLibrary.ts"),
      "utf8"
    );
    const match = src.match(/case "dreamdoor\.library":[\s\S]{0,200}stubJumpTableEntries:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(24);
  });
});
