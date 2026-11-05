/**
 * Starting a door from DOORMAN's list.
 *
 * The mechanics are not obvious and are the reason this is its own module.
 *
 * `bbs.executeCommand()` does NOT launch the door inline. While
 * `inDoorManager` is set on the session it queues the command and the BBS
 * runs it once THIS door exits (BBSApi.executeCommand). Two 68K doors cannot
 * share a node, so queue-then-exit is the only order that works - and it is
 * why the caller tears its view down immediately after a successful queue
 * rather than waiting for the user to quit.
 *
 * The consequence for errors: anything the BBS says about the command lands
 * AFTER doorman has closed, where it reads as doorman having crashed. So the
 * cases we can detect are refused here, while there is still a status line to
 * show them on.
 */
/** Only what the decision needs; the view passes its own richer object. */
export interface RunnableDoor {
    command?: string;
    enabled?: boolean;
}
export type RunDecision = {
    ok: true;
    command: string;
} | {
    ok: false;
    reason: string;
};
/**
 * Whether this entry can be started, and under what command.
 *
 * Pure: no session, no blessed, no filesystem. The view turns an `ok` into a
 * queue-and-teardown and a refusal into a status line.
 */
export declare function decideRun(door: RunnableDoor | null): RunDecision;
/** What the action needs from the view, so this module stays free of blessed. */
export interface RunContext {
    door: RunnableDoor | null;
    executeCommand: (command: string) => unknown;
    setStatus: (message: string, colour: 'green' | 'red' | 'yellow') => void;
    /** Called only after the command is queued: it runs when this door exits. */
    teardown: () => void;
}
/**
 * Queue the selected door and stand down, or explain why not.
 *
 * Returns true when the command was queued and the view was torn down.
 */
export declare function runSelectedDoor(ctx: RunContext): boolean;
//# sourceMappingURL=run-door.d.ts.map