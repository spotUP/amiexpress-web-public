/**
 * Regression: BBSApi.enableGameMode()/disableGameMode() must update session
 * state and clear key state, not just emit the socket event.
 *
 * Before this fix BBSApi did `socket.emit('game-mode', true)` only — so
 * `session.gameModeEnabled` and `session.currentDoorType` stayed stale,
 * `keyRepeatManager` was never torn down, and `keyState` was not reset.
 * SDK doors like livechat / arcade games call `bbs.enableGameMode()` and
 * relied on the canonical helper's side effects to keep the BBS input layer
 * in sync.
 */
import { createBBSApi } from "../../src/doors/BBSApi";

class StubSocket {
  emits: Array<{ event: string; args: any[] }> = [];
  emit(event: string, ...args: any[]): boolean {
    this.emits.push({ event, args });
    return true;
  }
  on(): this {
    return this;
  }
  off(): this {
    return this;
  }
}

function makeSession(): any {
  return {
    keyState: { a: true },
    gameModeEnabled: false,
    currentDoorType: undefined,
    user: { id: "1", username: "tester" },
    nodeId: 1,
  };
}

describe("BBSApi game-mode delegates to canonical helper", () => {
  test("enableGameMode() flips session.gameModeEnabled and records doorType", () => {
    const socket = new StubSocket();
    const session = makeSession();
    const api = createBBSApi(socket as any, session);

    api.enableGameMode();

    expect(session.gameModeEnabled).toBe(true);
    expect(session.currentDoorType).toBe("TS");
    expect(socket.emits).toContainEqual({ event: "game-mode", args: [true] });
  });

  test("enableGameMode(doorType) overrides default", () => {
    const socket = new StubSocket();
    const session = makeSession();
    const api = createBBSApi(socket as any, session);

    api.enableGameMode("ARCADE");

    expect(session.currentDoorType).toBe("ARCADE");
  });

  test("disableGameMode() resets state and re-emits false", () => {
    const socket = new StubSocket();
    const session = makeSession();
    const api = createBBSApi(socket as any, session);

    api.enableGameMode();
    api.disableGameMode();

    expect(session.gameModeEnabled).toBe(false);
    expect(session.currentDoorType).toBeUndefined();
    expect(session.keyState).toEqual({});
    expect(socket.emits).toContainEqual({ event: "game-mode", args: [false] });
  });
});
