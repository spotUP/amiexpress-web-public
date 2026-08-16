/**
 * DD (DayDream Interface Module) doorType plumbing.
 *
 * DayDream BBS door compat (Task 6): "DD" must be a first-class doorType,
 * categorized as "Amiga 68K" for doors-menu grouping, and routed to
 * executeAmigaDoor (dreamdoor.library via DreamDoorLibrary/dreamdoor-vectors)
 * instead of falling into the "Unknown door type" default.
 *
 * NOTE: amiga-command-parser.util.ts has no single exported "parse a TYPE="
 * string" entry point (the alias-matching block lives inside
 * parseCmdFile()'s larger parse). DayDream doors don't have an established
 * 2-3-char TYPE= convention the way FAME's FM/FI/FIM do, so "DD" is the
 * primary/only alias accepted (matching what analyze-all-doors.sh and
 * door-installer.ts already emit for DayDream doors).
 */
import "reflect-metadata";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  DoorType,
  parseCmdFile,
} from "../src/utils/amiga-command-parser.util";
import { DoorType as LogDoorType } from "../src/utils/node-logs.util";

// door.handler imports BBSState from src/index — mock it so importing the
// handler doesn't boot the whole server (same pattern as
// post-door-menu-action.test.ts / fim-doortype-routing.test.ts).
jest.mock("../src/index", () => ({
  BBSState: { LOGGEDON: "loggedon", AWAIT: "await" },
  LoggedOnSubState: {},
}));

import { isAmiga68kDoorType, AMIGA_68K_DOOR_TYPES } from "../src/handlers/door.handler";

describe("DD doorType", () => {
  it("is a recognized enum member distinct from FIM/XIM", () => {
    expect(DoorType.DD).toBe("DD");
    expect(DoorType.DD).not.toBe(DoorType.FIM);
  });

  it("is categorized as an Amiga 68K door type", () => {
    expect(AMIGA_68K_DOOR_TYPES).toContain("DD");
    expect(isAmiga68kDoorType("DD")).toBe(true);
    expect(isAmiga68kDoorType("dd")).toBe(true);
  });

  it("node-logs DoorType assigns DD the next free numeric code (9)", () => {
    expect(LogDoorType.DD).toBe(9);
    // Must not collide with any existing code
    const codes = Object.values(LogDoorType).filter(
      (v) => typeof v === "number"
    );
    expect(new Set(codes).size).toBe(codes.length);
  });

  describe("parseCmdFile alias parsing (DD -> DoorType.DD)", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cmd-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeCmd(contents: string): string {
      const filePath = path.join(tmpDir, "TEST.info");
      fs.writeFileSync(filePath, contents, "utf8");
      return filePath;
    }

    it("parses the 'DD' alias with access level", () => {
      const filePath = writeCmd(
        "*DREAMDOOR   DD050DOORS:DreamGame/DreamGame\n"
      );
      const result = parseCmdFile(filePath);
      expect(result).not.toBeNull();
      expect(result?.type).toBe(DoorType.DD);
      expect(result?.access).toBe(50);
      expect(result?.name).toBe("DREAMDOOR");
    });

    it("still defaults unrelated types to XIM (no false-positive DD match)", () => {
      const filePath = writeCmd("*OLDDOOR    XM050DOORS:Old/Old.XIM\n");
      const result = parseCmdFile(filePath);
      expect(result?.type).toBe(DoorType.XIM);
    });
  });
});
