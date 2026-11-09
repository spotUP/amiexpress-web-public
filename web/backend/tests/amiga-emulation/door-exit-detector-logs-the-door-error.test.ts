import { DoorExitDetector } from "../../src/amiga-emulation/session/lifecycle/DoorExitDetector";

function build(initialized: boolean) {
  const emulator = {
    isInitialized: () => initialized,
    getRegister: jest.fn(() => {
      if (!initialized) throw new Error("Emulator not initialized");
      return 0;
    }),
    readMemory32: jest.fn(() => 0),
  };
  const socket = { emit: jest.fn() };
  const terminate = jest.fn();
  const detector = new DoorExitDetector({
    emulator,
    socket,
    config: { executablePath: "/doors/FOO", bbsSession: {} },
    executionState: { iterationCount: 1 },
    getPcHistory: () => [],
    terminate,
  } as never);
  return { detector, socket, terminate };
}

describe("DoorExitDetector.handleExecutionError", () => {
  it("logs the door error, not Emulator not initialized", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { detector, socket, terminate } = build(false);
    const real = new Error("door blew up");
    await expect(detector.handleExecutionError(real)).resolves.toBeUndefined();
    expect(spy.mock.calls.some((c) => c.includes(real))).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith("door:error", { message: "door blew up" });
    expect(terminate).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
