/**
 * One hop between "the admin wrote ConfConfig.info" and "the board rebuilds
 * its conference list".
 *
 * The list every handler holds is built from disk at startup, in
 * initializeData, and nothing rebuilt it - so renaming a conference in the
 * admin reached the file and not the board, and the old name stayed on J
 * until the next deploy restarted the container.
 *
 * The obvious wiring - have the config service import the initialization
 * module and call its refresh - does not work and is worth recording. That
 * module pulls in the server's whole graph, which reaches index.ts, whose
 * startup IIFE then runs inside whatever imported it: three test suites went
 * from passing to `listen EADDRINUSE 0.0.0.0:3001`, having booted a second
 * copy of the BBS. A service must not reach into server wiring.
 *
 * So the dependency points the other way. This module knows nothing about
 * either side; the server subscribes at boot, and the config service says
 * that something changed.
 */

type ConferencesChangedListener = () => void | Promise<void>;

let listener: ConferencesChangedListener | null = null;

/** Registered by initializeData. The last registration wins - there is one board. */
export function onConferencesChanged(next: ConferencesChangedListener): void {
  listener = next;
}

/** Test seam: a suite that registered a listener can take it back off again. */
export function clearConferencesChangedListener(): void {
  listener = null;
}

/**
 * Tell the board a conference was created, renamed or removed.
 *
 * Best-effort by contract: disk is already correct when this is called, so a
 * listener that throws must not fail the write. The caller logs it and the
 * next restart picks the change up regardless.
 */
export async function notifyConferencesChanged(): Promise<void> {
  if (!listener) return;
  await listener();
}
