/**
 * The address of the board's BBC Micro.
 *
 * Two doors send callers to the same emulator: BEEB, which lists the
 * software a sysop installed, and TELETEXT, which loads a program straight
 * off the Ceefax page that carried it. They must agree about the model, the
 * route and the parameter names, so the agreement lives here rather than in
 * either of them.
 *
 * The board serves jsbeeb at /beeb/ and maps its own `discs/` and `tapes/`
 * paths onto Beeb/software, so the emulator's loading works unmodified -
 * nothing in the GPL bundle is patched.
 */

/**
 * The machine, pinned.
 *
 * jsbeeb picks its ROM set from the model, so the model and the ROMs a
 * sysop is asked for are one decision: change this and the emulator asks
 * for a ROM nobody was told about, over a board that is correctly set up.
 */
export const MODEL = 'B-DFS1.2';

export interface EmulatorLaunch {
  /** A file in the board's Beeb/software folder. Omitted for a bare machine. */
  file?: string;
  kind?: 'disc' | 'tape';
  /**
   * Hold SHIFT and press BREAK once the machine has started, which runs the
   * disc's !BOOT. Defaults to true when a file is given AND nothing is
   * being typed.
   */
  autoboot?: boolean;
  /**
   * Type this at the machine's prompt instead of booting.
   *
   * A newline is Return, which is jsbeeb's own convention - its tape
   * chaining types `*TAPE\nCHAIN""\n`.
   */
  autotype?: string;
}

/**
 * Build the URL that starts the machine.
 *
 * AUTOBOOT AND AUTOTYPE ARE EXCLUSIVE, and not by choice here: jsbeeb reads
 * autoboot, autochain, autorun and autotype in that order and takes the
 * FIRST one present, so a URL carrying both boots the disc and silently
 * ignores what was to be typed. Asking to type therefore switches booting
 * off unless the caller insisted on it.
 */
export function emulatorUrl(launch: EmulatorLaunch = {}): string {
  const parts = [`model=${MODEL}`];

  if (launch.file) {
    const parameter = launch.kind === 'tape' ? 'tape' : 'disc1';
    parts.push(`${parameter}=${encodeURIComponent(launch.file)}`);
  }

  if (launch.autotype) {
    parts.push(`autotype=${encodeURIComponent(launch.autotype)}`);
  } else if (launch.file && launch.autoboot !== false) {
    parts.push('autoboot');
  }

  return `/beeb/?${parts.join('&')}`;
}
