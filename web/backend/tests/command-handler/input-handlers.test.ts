import { LoggedOnSubState } from "../../src/constants/bbs-states";
jest.mock("../../src/handlers/command-handler/core", () => ({
  processCommand: jest.fn(),
  handleCommand: jest.fn(),
}));
const corePath = require.resolve("../../src/handlers/command-handler/core");
const coreModule = require("../../src/handlers/command-handler/core");
const menuPath = require.resolve("../../src/handlers/command-handler/menu");

// Import the functions under test
const inputHandlers = require("../../src/handlers/command-handler/input-handlers");
const { __testables } = inputHandlers;

describe("command-handler input flow parity", () => {
  let session: any;
  let socket: any;

  beforeEach(() => {
    session = {
      subState: LoggedOnSubState.READ_COMMAND,
      inputBuffer: "",
      shortcuts: new Map(),
      menuPause: true,
    };
    socket = { emit: jest.fn() };
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("translateShortcut maps special keys and shortcuts", () => {
    session.shortcuts.set("RET", "Q");
    const ret = __testables.translateShortcut(session, "\r");
    expect(ret).toBe("Q");
    const tab = __testables.translateShortcut(session, "\t");
    expect(tab).toBe("TAB");
    const back = __testables.translateShortcut(session, "\b");
    expect(back).toBe("BACK");
    const esc = __testables.translateShortcut(session, "\x1b");
    expect(esc).toBe("ESC");
    const space = __testables.translateShortcut(session, " ");
    expect(space).toBe("SPACE");
  });

  test("READ_COMMAND on Enter pushes to PROCESS_COMMAND even if empty", async () => {
    session.subState = LoggedOnSubState.READ_COMMAND;
    const handleCommandCore = jest.fn().mockResolvedValue(undefined);
    inputHandlers.__setHandleCommandCore(handleCommandCore);

    await inputHandlers.handleSpecializedInput(socket, session, "\r");

    expect(session.subState).toBe(LoggedOnSubState.PROCESS_COMMAND);
  });

  test("READ_SHORTCUTS transitions to READ_COMMAND then processes input", async () => {
    session.subState = LoggedOnSubState.READ_SHORTCUTS;
    session.shortcuts.set("RET", "Q");

    await inputHandlers.handleSpecializedInput(socket, session, "\r");

    // After refactoring, READ_SHORTCUTS transitions to READ_COMMAND, then
    // processes the Enter key which transitions to PROCESS_COMMAND
    expect(session.subState).toBe(LoggedOnSubState.PROCESS_COMMAND);
    expect(session.cmdShortcuts).toBe(false);
  });

  test("PROCESS_COMMAND calls processCommand and sets state (menu displayed later)", async () => {
    session.subState = LoggedOnSubState.PROCESS_COMMAND;
    (session as any).commandText = "q";
    const processCommand = require(corePath).processCommand as jest.Mock;
    processCommand.mockResolvedValue("OK");

    await __testables.handleProcessCommand(socket, session);

    // After refactoring, PROCESS_COMMAND calls processCommand and sets state
    // The menu is displayed later by the display flow logic, not inline here
    expect(processCommand).toHaveBeenCalledWith(socket, session, "Q", "");
    expect(session.menuPause).toBe(true);
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
