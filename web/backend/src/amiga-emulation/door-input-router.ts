/**
 * Route a live keystroke to the running 68K door's protocol stack.
 *
 * SINGLE SOURCE OF TRUTH — every input path that reaches a running Amiga
 * door (session.doorInputHandler, invoked from the live 'command'-channel
 * socket handlers, AND AmigaDoorSession's own 'door:input' socket listener,
 * used only by the test/corpus harnesses) must call this SAME function.
 *
 * History: this file used to be two independent copies of the same
 * protocol-branch logic — one inlined in door.handler.ts's
 * routeAmigaDoorInput, one inlined in AmigaDoorSession.ts's
 * setupSocketHandlers(). Splitting it caused two incidents:
 *   - 2026-08-15: a FIM routing fix landed in only one copy; live FIM
 *     keystrokes silently died.
 *   - 2026-08-16 (DD final-review wave, Critical 1): the door.handler.ts
 *     copy (the one every LIVE keystroke actually reaches — the frontend
 *     never emits 'door:input') had no DreamDoor branch at all, so DD
 *     doors hung at their first Prompt/GetKey and were killed by the
 *     300s idle timeout. Only the AmigaDoorSession.ts copy — reachable
 *     solely from test harnesses that deliberately emit BOTH channels —
 *     had the DD branch, which is why corpus E2E stayed green on a
 *     production-dead code path.
 *
 * Collapsing both call sites onto this one function/module (instead of
 * duplicating the branch list a third time) is the root-cause fix: a
 * per-protocol branch can now only be missing from ONE place, not two.
 *
 * Precedence (first match wins, matches the pre-collapse AmigaDoorSession
 * ordering, which was the more complete of the two copies):
 *   1. FIM protocol (FAME BBS doors) — deferred-reply message protocol,
 *      owns ALL input while active; never also feed DOS stdin.
 *   2. DreamDoor.library (DD/DayDream BBS doors) — direct trap-vector
 *      calls, not a message port; DreamDoorLibrary tracks its own
 *      pending-input/type-ahead state. Routed on isActive() (initialized),
 *      NOT isWaitingForInput() — see the isActive() doc comment on why
 *      isWaitingForInput() alone makes DreamDoorLibrary's own type-ahead
 *      buffering unreachable in production.
 *   3. XIM protocol — queues to the line/hotkey input machinery, and for
 *      native 68K doors that poll GetMsg(AEDoorPort), also injects via
 *      PutMsg (they never send JH_HK XIM commands themselves).
 *   4. TIM/SIM/IIM/SUP DoorControl handler — queues only while it's
 *      actually waiting for input (mirrors the XIM waiting-gate).
 *   5. DOS stdin fallback — only when nothing above consumed the input,
 *      preventing double-delivery.
 */
export interface DoorInputRoutingTargets {
  fimProtocol?: { queueInput(data: string): void } | null;
  dreamDoorLibrary?: {
    isActive?(): boolean;
    isWaitingForInput?(): boolean;
    queueInput(data: string): void;
  } | null;
  ximProtocol?: {
    queueInput(data: string): void;
    isWaitingForLineInput?(): boolean;
    shouldInjectNativeInput?(): boolean;
    injectInputToNativeDoor(char: string): void;
  } | null;
  timHandler?: {
    isWaitingForInput?(): boolean;
    queueInput(data: string): void;
  } | null;
  dosLibrary?: { queueInput(data: string): void } | null;
}

export function routeAmigaDoorInput(
  shared: DoorInputRoutingTargets | null | undefined,
  data: string
): void {
  if (!shared) return;

  if (shared.fimProtocol) {
    shared.fimProtocol.queueInput(data);
    return;
  }

  // DreamDoor (DD) doors: route ALL input here whenever the DD door is
  // active — not gated on isWaitingForInput() (Important 2, DD
  // final-review wave). Mirrors the FIM branch: route unconditionally on
  // protocol presence and let the library's own state machine (queueInput
  // buffers type-ahead or completes a pending Prompt/GetKey) decide what
  // to do with the byte.
  if (shared.dreamDoorLibrary?.isActive?.()) {
    shared.dreamDoorLibrary.queueInput(data);
    return;
  }

  // Check if XIM is waiting for input BEFORE queueing — prevents
  // double-delivery when XIM completes a hotkey/line input.
  const ximWaitingForInput = shared.ximProtocol?.isWaitingForLineInput?.() ?? false;
  if (shared.ximProtocol) {
    shared.ximProtocol.queueInput(data);
    // Native 68K doors that poll GetMsg(AEDoorPort) need input injected
    // via PutMsg — they never send JH_HK XIM commands themselves.
    if (shared.ximProtocol.shouldInjectNativeInput?.()) {
      for (const char of data) {
        shared.ximProtocol.injectInputToNativeDoor(char);
      }
    }
  }

  const timWaitingForInput = shared.timHandler?.isWaitingForInput?.() ?? false;
  if (shared.timHandler && timWaitingForInput) {
    shared.timHandler.queueInput(data);
  }

  if (shared.dosLibrary && !ximWaitingForInput && !timWaitingForInput) {
    shared.dosLibrary.queueInput(data);
  }
}
