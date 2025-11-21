import { LoggedOnSubState } from "../../src/constants/bbs-states";

// Import the functions under test
const inputHandlers = require("../../src/handlers/command-handler/input-handlers");

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
    const ret = inputHandlers.__get__("translateShortcut")(session, "\r");
    expect(ret).toBe("Q");
    const tab = inputHandlers.__get__("translateShortcut")(session, "\t");
    expect(tab).toBe("TAB");
    const back = inputHandlers.__get__("translateShortcut")(session, "\b");
    expect(back).toBe("BACK");
    const esc = inputHandlers.__get__("translateShortcut")(session, "\x1b");
    expect(esc).toBe("ESC");
    const space = inputHandlers.__get__("translateShortcut")(session, " ");
    expect(space).toBe("SPACE");
  });

  test("READ_COMMAND on Enter pushes to PROCESS_COMMAND even if empty", async () => {
    session.subState = LoggedOnSubState.READ_COMMAND;
    const handleCommand = jest.spyOn(inputHandlers, "handleCommand").mockResolvedValue(undefined);

    await inputHandlers.handleSpecializedInput(socket, session, "\r");

    expect(session.subState).toBe(LoggedOnSubState.PROCESS_COMMAND);
    expect(handleCommand).toHaveBeenCalled();
  });

  test("READ_SHORTCUTS translates and processes command, then sets DISPLAY_MENU with menuPause false", async () => {
    session.subState = LoggedOnSubState.READ_SHORTCUTS;
    session.shortcuts.set("RET", "Q");
    const processCommand = jest.spyOn(require("../../../src/handlers/command-handler/core"), "processCommand").mockResolvedValue("OK");

    await inputHandlers.handleSpecializedInput(socket, session, "\r");

    expect(processCommand).toHaveBeenCalledWith(socket, session, "Q", "");
    expect(session.menuPause).toBe(false);
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test("PROCESS_COMMAND uppercases and sets menuPause true/display_menu", async () => {
    session.subState = LoggedOnSubState.PROCESS_COMMAND;
    (session as any).commandText = "q";
    const processCommand = jest.spyOn(require("../../../src/handlers/command-handler/core"), "processCommand").mockResolvedValue("OK");
    const displayMenu = jest.spyOn(require("../../../src/handlers/command-handler/menu"), "displayMainMenu").mockResolvedValue(undefined);

    await inputHandlers.__get__("handleProcessCommand")(socket, session);

    expect(processCommand).toHaveBeenCalledWith(socket, session, "Q", "");
    expect(session.menuPause).toBe(true);
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(displayMenu).toHaveBeenCalled();
  });
});
