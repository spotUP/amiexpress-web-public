/**
 * BOTH marks, read out of the REAL Commands/BBSCmd/<CMD>.info BYTES, and a C64
 * session really launching each door.
 *
 * This is deliberately not a source pin and not a fabricated tooltype map:
 * the .info file on disk is parsed by the same parser registration uses, the
 * resulting toolTypes go onto a Door, and the door goes through the REAL
 * executeDoor gate. createAllDropFiles is the "launch proceeded" sentinel,
 * exactly as in door-min-columns-gate.test.ts.
 *
 * TWO ENTRY POINTS, TWO FILES. A door is reached two ways in production, and
 * they take different objects:
 *  - by COMMAND NAME (`handleCommand` -> `executeDoor`), which is what Enter
 *    on the menu does - proven in tests/doors/door-min-columns-dispatch.test.ts
 *    against a Door built by `initializeDoors()`;
 *  - by the DOORS-menu entry handed straight to `executeDoor`, which is this
 *    file, against a Door carrying the .info's own toolTypes.
 * The C64_ADAPT half below is the second route. It is not a copy of the first:
 * the bug the two together rule out is a gate that agrees on one shape of Door
 * and refuses the other.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../../src/services/DoorDropFileManager');
jest.mock('../../../src/services/CallersLogManager');

/**
 * The 68K runtime, replaced by a door that records what was installed on the
 * socket WHILE it ran. Everything is uninstalled by the time executeDoor
 * returns, so capturing from inside the run is the only way to prove the
 * adapter was on the wire rather than merely constructed.
 */
const mockAdapterDuringRun: unknown[] = [];
jest.mock('../../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    private socket: any;
    constructor(socket: any) { this.socket = socket; }
    async start() {
      const { c64AdapterFor } = require('../../../src/server/c64-door-adapter');
      mockAdapterDuringRun.push(c64AdapterFor(this.socket));
    }
    getExitState() { return {}; }
    isDoorRunning() { return false; }
  },
}));

// executeAmigaDoor resolves the executable under amigaDoorManager.bbsRoot.
const mockRootRef = { value: '' };
jest.mock('../../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: mockRootRef.value,
    scanInstalledDoors: async () => [],
    getCachedDoors: () => [],
    isCachePopulated: () => true,
  }),
}));

import { executeDoor, setHelpers } from '../../../src/handlers/door.handler';
import { doorDropFileManager } from '../../../src/services/DoorDropFileManager';
import { parseInfoFile } from '../../../src/utils/info-file.util';
import { loadCommandFromInfo } from '../../../src/utils/amiga-command-parser.util';
import * as amigafs from '../../../src/utils/amigafs';
import { ADAPTED_DOOR_TYPES } from '../../../src/utils/door-min-columns.util';
import { config } from '../../../src/config';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import type { Door } from '../../../src/types';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

const BBSCMD = path.resolve(__dirname, '../../../../../Commands/BBSCmd');

/**
 * Commands whose doors Task 6 adapted to 40 columns, in plan order.
 *
 * GMASTER is the odd one out and the newest: every other entry is a menu or a
 * text screen, while GMASTER is a GAME that runs a 60Hz engine and repaints a
 * board. It is marked because its TETRIS ATTACK mode is a 12x13 board that fits
 * a C64 screen without folding anything, and at 40 columns the door offers only
 * that mode - its 80-column TGM and TETRINET screens are hidden rather than
 * squeezed. See tests/doors/compact-40/tetris-attack.test.ts.
 */
/*
 * THEMEC is the one 68K binary on this list, added 2026-09-06. It earns
 * MIN_COLUMNS rather than C64_ADAPT because it lays ITSELF out at 40: it asks
 * the board for the caller's width (BB_SCRWIDTH, express.e:3865) and folds
 * through the C SDK's own tier, `ui_profile_for()`, the twin of the
 * TypeScript `getCompactProfile()`. Its 40-column screen is proven on a real
 * PetsciiMachine in tests/doors/compact-40/themec-40.test.ts. Marking it
 * C64_ADAPT would put the frame adapter on a screen that is already forty
 * columns wide and crop it again.
 */
/*
 * SCREENTHEME is THEME's twin for the BOARD's art rather than the doors'
 * colours, and it earns the mark the same way: exported row builders that take
 * their width from the live screen, proven at 40 in
 * tests/doors/compact-40/screen-theme-picker.test.ts.
 */
/*
 * SUBS is the second 68K binary here, added 2026-09-08, and it earns the mark
 * the same way THEMEC does: it asks the board for the caller's width and lays
 * ITSELF out through `ui_profile_for()`, so at 40 the date column and the
 * sender's full name go and the SUBJECT survives - proven on a real
 * PetsciiMachine in tests/doors/compact-40/subs-40.test.ts.
 *
 * SUBSCAN is the SAME binary under a second registration, and it is
 * deliberately NOT on this list: it never opens a screen at all. It prints
 * three lines and exits, which is what a conference bulletin's ~XISUBSCAN
 * runs, so there is no 40-column layout to prove.
 */
/*
 * CTOP is the newest, added 2026-09-22, and it is here because it STOPPED
 * being a C64_ADAPT door: the conference upload table was a 68K binary served
 * through the frame adapter, and the corpus manifest's own note called its
 * header unfixable at forty columns - six labels over five fields, no rung
 * able to put a label above the column it names. It is a TypeScript port now
 * (`Doors/ctop-viewer`) with a forty-column layout of its own, so it earns
 * MIN_COLUMNS the way THEMEC does rather than the adapter's mark.
 */
/*
 * WHIP is the newest, 2026-09-22, and it is here because the sysop named it:
 * "some of our typescript doors dont have a 40 column mode, whip for
 * example". Its panes stack, its kanban shows one full-width column that
 * slides, and its two editor modals - `width: 68` and `width: 70` - are
 * sized to the screen instead. Proven on a real 40x25 screen in
 * `whip-menu-screen.test.ts` and by geometry in `whip-layout.test.ts`.
 *
 * DASHBOARD came with it, same day and the same shape: it knew how to stack
 * its three panels and BUILT them at `width: '50%'`, so the handler that
 * stacks them only ever ran on a resize a C64 caller never performs. Pinned
 * in `dashboard-layout.test.ts`.
 *
 * PROMPTCOMPLETE earns the mark by having no layout at all: it prints nine
 * lines about itself through `bbs.write()`, which is the choke, and draws
 * nothing else ever. See `promptcomplete-is-prose.test.ts`.
 *
 * LIVECHAT and IRC are the same door (`Doors/livechat`) under two names,
 * 2026-09-22. Its geometry was already one pure function - `ui/layout-solver`
 * - which yields the sidebar on a narrow window and could not yield it far
 * enough: at forty the sidebar clamped to sixteen columns and the chat log
 * inside the remaining twenty-four was twenty-one, a column of broken words.
 * Now the two stop sharing the row - whichever the caller asked for owns the
 * screen, F2 swaps them, and he lands in the chat. Its overlays are sized
 * through `ui/fit-width` rather than the eighty-column numbers they were
 * written with. Pinned by geometry in `livechat-layout.test.ts` and on a
 * DRIVEN 40x25 screen in the door's own `tests/forty-columns.test.ts`.
 *
 * LINKWALL and BBSLINK are NOT here and will not be: one prints a wall
 * fetched from bbslink.net, the other is a telnet proxy to a remote DOS
 * game, and neither lays out what it shows. They were marked for one
 * afternoon on the argument that a door a caller cannot open is worse than
 * a game he has to squint at; the sysop's answer was "bbslink and linkwall
 * can be skipped" (2026-09-22), so they stay refused at forty. The chrome
 * fixes they got are kept - see `bbslink-doors-tell-the-truth.test.ts` -
 * because they were wrong at EVERY width.
 */
const ADAPTED = ['THEME', 'SCREENTHEME', 'DOORS', 'BUGS', 'DOORMAN', 'STRIP', 'PHREAKWARS', 'GMASTER', 'THEMEC', 'ACHIEVE', 'SUBS', 'TIP', 'CTOP', 'WHIP', 'DASHBOARD', 'PROMPTCOMPLETE', 'LIVECHAT', 'IRC'];

const UNROUTED = 'unrouted-gate-test-type' as unknown as Door['type'];

/**
 * The icon for a command, by the name the board would use.
 *
 * Through amigafs, because this tree came off a case-insensitive filesystem
 * and holds `chat.info`, `ulist.info` and `wall.info` for CHAT, ULIST and
 * WALL. path.join finds those on a Mac and finds nothing on the Linux
 * runner, so three correctly-marked doors read as unmarked in CI only.
 */
function infoPathFor(command: string): string {
  return amigafs.resolvePath(path.join(BBSCMD, `${command}.info`))
    ?? path.join(BBSCMD, `${command}.info`);
}

function toolTypesFromDisk(command: string): Record<string, string> {
  const info = parseInfoFile(infoPathFor(command));
  const map: Record<string, string> = {};
  for (const tt of info.tooltypes) map[tt.key] = tt.value ?? '';
  return map;
}

function c64Session(): any {
  return {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND,
    user: { id: 'u1', username: 'C64USER', secLevel: 255 },
    nodeId: 1, terminalType: 'c64', petsciiMode: true,
    screenWidth: 40, screenHeight: 25, tempData: {}, menuPause: true,
  };
}

function makeSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    id: 'marked-doors-socket',
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

describe('Task 6 adapted doors are 40-ok on disk and launch on a C64', () => {
  beforeEach(() => (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear());

  it.each(ADAPTED)('%s.info exists and carries MIN_COLUMNS=40', (command) => {
    expect(fs.existsSync(infoPathFor(command))).toBe(true);
    expect(toolTypesFromDisk(command).MIN_COLUMNS).toBe('40');
  });

  it.each(ADAPTED)('a C64 session launches %s through the real gate', async (command) => {
    const socket = makeSocket();
    const door = {
      id: command.toLowerCase(), name: command, description: '', command,
      path: `Doors/${command}`, accessLevel: 0, enabled: true, type: UNROUTED,
      toolTypes: toolTypesFromDisk(command),
    } as unknown as Door;
    await executeDoor(socket as any, c64Session(), door);
    const out = socket.emitted.filter(e => e.event === 'ansi-output').map(e => e.data).join('');
    expect(out).not.toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
  });
});

/**
 * The OTHER mark: `C64_ADAPT=40` on an installed 68K door, which opens it to a
 * PETSCII caller through the frame adapter rather than by having been laid out
 * at 40.
 *
 * WHO/RTW/S/WHAT landed with Phase 3; B, J and DOORREPO were added on
 * 2026-09-03 after their real 40-column captures were measured (the captures
 * are corpus fixtures `b`, `j` and `doorrepo`, and the verdicts are in
 * `.superpowers/sdd/2026-09-03-c64-door-marks/progress.md`). F, FR and N
 * (AquaScan) are deliberately absent - `narrow` eats their filenames and sizes,
 * and they wait on the C64 file-view design - and so is E (5D-EnterMsg), a
 * full-screen 78-column ANSI editor that wants its own layout.
 */
/**
 * DERIVED from the adapter corpus manifest, never hand-maintained - the same
 * source `tests/doors/door-min-columns-dispatch.test.ts` reads, and the same
 * file each batch of marks updates. A door may claim C64_ADAPT only if it also
 * ships a capture; the drift guard below then makes the board and the manifest
 * agree in both directions, so a mark with no proof behind it, and a proof with
 * no mark in front of it, are both red.
 */
const MANIFEST: Record<string, { installed?: string | string[] }> = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../../../../sdk/tests/petscii/frame/fixtures/manifest.json'),
    'utf8',
  ),
);
const C64_MARKED = Object.values(MANIFEST).flatMap((e) =>
  e.installed === undefined ? [] : Array.isArray(e.installed) ? e.installed : [e.installed],
);

describe('C64_ADAPT doors are marked on disk and open through the DOORS-menu route', () => {
  let root: string;
  const realConfigGet = config.get.bind(config);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'c64-marked-'));
    mockRootRef.value = root;
    jest.spyOn(config, 'get').mockImplementation((key: any) =>
      key === 'dataDir' ? root : realConfigGet(key)
    );
    mockAdapterDuringRun.length = 0;
    (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** The door's registration as the real parser reads it, straight off disk. */
  function definitionFromDisk(command: string) {
    // Through amigafs, because the board's own loader does: this tree came
    // off a case-insensitive filesystem and carries `chat.info`, `ulist.info`
    // and `wall.info` for the commands CHAT, ULIST and WALL. A plain join
    // finds them on a Mac and finds nothing on the Linux runner, which is
    // why CI failed here on three doors that are correctly marked.
    const def = loadCommandFromInfo(infoPathFor(command));
    if (!def) throw new Error(`Commands/BBSCmd/${command}.info did not parse`);
    return def;
  }

  /**
   * The Door the DOORS menu hands to executeDoor, built from the .info's own
   * type and toolTypes - and the executable in place under the temp root,
   * because executeAmigaDoor reaches the adapter install only after it has
   * read the binary. Amiga hunk magic, so the native-GCC branch is not taken.
   */
  function doorFromDisk(command: string): Door {
    const def = definitionFromDisk(command);
    const full = path.join(root, ...def.location.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.from([0x00, 0x00, 0x03, 0xf3]));
    return {
      id: command.toLowerCase(), name: command, description: '', command,
      path: def.location, accessLevel: 0, enabled: true, type: def.type,
      toolTypes: def.toolTypes,
    } as unknown as Door;
  }

  it.each(C64_MARKED)('%s.info carries C64_ADAPT=40 and an adapter-eligible type', (command) => {
    expect(fs.existsSync(infoPathFor(command))).toBe(true);
    expect(toolTypesFromDisk(command).C64_ADAPT).toBe('40');
    // A TS door paints its own blessed screen and never crosses the adapter's
    // seam, so the claim is only meaningful on a 68K type.
    expect(ADAPTED_DOOR_TYPES.has(definitionFromDisk(command).type)).toBe(true);
  });

  /**
   * The list above and the board agree, in BOTH directions. Without this a
   * door marked on disk and forgotten here would be silently untested, which
   * is exactly how RTW spent Phase 3 marked in the docs and unmarked on disk.
   */
  /*
   * ONE DIRECTION, BY THE SYSOP'S RULING (2026-09-20).
   *
   * This used to assert set EQUALITY: every mark on the board had to have a
   * capture behind it and every capture a mark in front of it. The board has
   * drifted the other way - 37 registrations gained `C64_ADAPT=40` as
   * collateral in `19143adc0`, a commit about deploy art that never mentions
   * C64 - and asked whether to strip them or widen this, the sysop kept the
   * marks.
   *
   * So the half that still bites is PROOF -> MARK: a door with a capture
   * that stopped claiming the tooltype is a door whose C64 support was
   * withdrawn without anyone saying so, and that is still red. MARK ->
   * PROOF is now only reported, because a mark the corpus cannot vouch for
   * is the board's business and no longer this suite's.
   */
  it('marks every door the corpus can vouch for, and says which marks it cannot', () => {
    const onDisk = fs
      .readdirSync(BBSCMD)
      .filter((f) => f.endsWith('.info'))
      .map((f) => f.slice(0, -'.info'.length))
      .filter((command) => {
        try { return definitionFromDisk(command).toolTypes?.['C64_ADAPT'] !== undefined; }
        catch { return false; }
      });
    // Uppercased on both sides: `ulist.info` answers to the command ULIST.
    const marked = new Set(onDisk.map((c) => c.toUpperCase()));
    const proven = C64_MARKED.map((c) => c.toUpperCase());

    const withdrawn = proven.filter((command) => !marked.has(command));
    expect({ withdrawn }).toEqual({ withdrawn: [] });

    // Reported, not asserted: the board may mark what it likes, and a reader
    // of this suite should still be able to see how far ahead of the corpus
    // it has gone.
    const unproven = [...marked].filter((command) => !proven.includes(command)).sort();
    if (unproven.length > 0) {
      console.log(
        `[compact-40] ${unproven.length} registration(s) claim C64_ADAPT with no capture `
        + `behind them: ${unproven.join(', ')}`,
      );
    }
  });

  it.each(C64_MARKED)('a C64 session opens %s and the adapter is on the wire inside the run', async (command) => {
    const socket = makeSocket();
    await executeDoor(socket as any, c64Session(), doorFromDisk(command));
    const out = socket.emitted.filter((e) => e.event === 'ansi-output').map((e) => e.data).join('');
    expect(out).not.toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    // Captured from INSIDE the door's run: merely constructing the adapter
    // would not put it on socket.emit.
    expect(mockAdapterDuringRun.length).toBe(1);
    expect(mockAdapterDuringRun[0]).not.toBeNull();
  });

  it.each(C64_MARKED)('an ANSI session opens %s with NO adapter - the 80-column non-negotiable', async (command) => {
    const socket = makeSocket();
    const ansi = {
      ...c64Session(), terminalType: 'modern', petsciiMode: false,
      screenWidth: 80, screenHeight: 24,
    };
    await executeDoor(socket as any, ansi as any, doorFromDisk(command));
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(mockAdapterDuringRun.length).toBe(1);
    expect(mockAdapterDuringRun[0]).toBeNull();
  });
});
