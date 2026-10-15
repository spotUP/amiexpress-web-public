/**
 * FIM (FAME Interface Module) doorType plumbing.
 *
 * FAME BBS door compat (Task 7): "FIM" must be a first-class doorType,
 * parsed the same way XIM/AIM/SIM/TIM/IIM are (2-3 char alias + access
 * digits in .CMD/.info TYPE fields), categorized as "Amiga 68K" for
 * doors-menu grouping, and routed to executeAmigaDoor (FAMEDoorPort +
 * FIMProtocol) instead of falling into the "Unknown door type" default.
 */
import "reflect-metadata";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  DoorType,
  parseCmdFile,
} from "../src/utils/amiga-command-parser.util";
import { doorLogTypeNumber, logDoorStart, logDoorExit } from "../src/utils/node-logs.util";

// door.handler imports BBSState from src/index — mock it so importing the
// handler doesn't boot the whole server (same pattern as
// post-door-menu-action.test.ts / commandHandlers.test.ts).
jest.mock("../src/index", () => ({
  BBSState: { LOGGEDON: "loggedon", AWAIT: "await" },
  LoggedOnSubState: {},
}));

import { isAmiga68kDoorType, AMIGA_68K_DOOR_TYPES } from "../src/handlers/door.handler";

describe("FIM doorType", () => {
  describe("DoorType enum membership", () => {
    it("amiga-command-parser DoorType includes FIM", () => {
      expect(DoorType.FIM).toBe("FIM");
    });

    it("DoorLog numbers FIM after axenums.e:15's eight types (8)", () => {
      expect(doorLogTypeNumber("FIM")).toBe(8);
    });
  });

  describe("DoorLog type numbers and name (axenums.e:15, express.e:4312, 9407)", () => {
    it("numbers the types in axenums.e:15 order: XIM 0, SIM 2, TIM 3 ... SUP 7", () => {
      expect(["XIM", "SIM", "TIM", "IIM", "MCI", "AEM", "SUP"].map(doorLogTypeNumber))
        .toEqual([0, 2, 3, 4, 5, 6, 7]);
    });

    it("folds AIM into XIM before logging (express.e:4312)", () => {
      expect(doorLogTypeNumber("AIM")).toBe(0);
    });

    it("writes a SIM door with no user as express.e:9407-9413 does", () => {
      const board = fs.mkdtempSync(path.join(os.tmpdir(), "doorlog-test-"));
      try {
        logDoorStart(board, 1, doorLogTypeNumber("SIM"), "", "DOORS:FILEID/FILEID");
        logDoorExit(board, 1, doorLogTypeNumber("SIM"), "");
        const lines = fs.readFileSync(path.join(board, "Node1", "DoorLog"), "latin1").split("\n");
        // '[\s[25]] \s - \d - \s' with an empty name: "] " + "" + " - 2 - "
        expect(lines[0]).toMatch(/^\[.{25}\]  - 2 - DOORS:FILEID\/FILEID$/);
        expect(lines[1]).toMatch(/^\[.{25}\]  - 2 - Exiting$/);
      } finally {
        fs.rmSync(board, { recursive: true, force: true });
      }
    });
  });

  describe("parseCmdFile alias parsing (FM|FI|FIM -> DoorType.FIM)", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fim-cmd-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeCmd(contents: string): string {
      const filePath = path.join(tmpDir, "TEST.info");
      fs.writeFileSync(filePath, contents, "utf8");
      return filePath;
    }

    it("parses the full 'FIM' alias with access level", () => {
      const filePath = writeCmd(
        "*FAMEDOOR   FIM050DOORS:FameGame/FameGame.FIM\n"
      );
      const result = parseCmdFile(filePath);
      expect(result).not.toBeNull();
      expect(result?.type).toBe(DoorType.FIM);
      expect(result?.access).toBe(50);
      expect(result?.name).toBe("FAMEDOOR");
    });

    it("parses the short 'FM' alias", () => {
      const filePath = writeCmd("*FAMEDOOR2  FM010DOORS:FameGame2/FameGame2\n");
      const result = parseCmdFile(filePath);
      expect(result?.type).toBe(DoorType.FIM);
      expect(result?.access).toBe(10);
    });

    it("parses the short 'FI' alias", () => {
      const filePath = writeCmd("*FAMEDOOR3  FI020DOORS:FameGame3/FameGame3\n");
      const result = parseCmdFile(filePath);
      expect(result?.type).toBe(DoorType.FIM);
      expect(result?.access).toBe(20);
    });

    it("still defaults unrelated types to XIM (no false-positive FIM match)", () => {
      const filePath = writeCmd("*OLDDOOR    XM050DOORS:Old/Old.XIM\n");
      const result = parseCmdFile(filePath);
      expect(result?.type).toBe(DoorType.XIM);
    });
  });

  describe("door.handler.ts Amiga-68K categorization + routing surface", () => {
    it("exports 'FIM' in the Amiga 68K door-type list alongside XIM/AIM/SIM/TIM/IIM", () => {
      expect(AMIGA_68K_DOOR_TYPES).toEqual(
        expect.arrayContaining(["XIM", "AIM", "SIM", "TIM", "IIM", "FIM"])
      );
    });

    it("isAmiga68kDoorType('FIM') is true (categorized as Amiga 68K, routed to executeAmigaDoor)", () => {
      expect(isAmiga68kDoorType("FIM")).toBe(true);
      // Case-insensitive, matching how .CMD TYPE fields are normalized
      expect(isAmiga68kDoorType("fim")).toBe(true);
    });

    it("isAmiga68kDoorType rejects non-Amiga-68K types (TS/PYTHON/etc.)", () => {
      expect(isAmiga68kDoorType("TS")).toBe(false);
      expect(isAmiga68kDoorType("PYTHON")).toBe(false);
      expect(isAmiga68kDoorType("")).toBe(false);
    });
  });
});
