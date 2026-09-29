/**
 * Every xterm mouse-reporting mode a door can switch on, switched off.
 *
 * Blessed doors enable ?1000/?1003/?1006 and only a clean destroy undoes it;
 * left on, a telnet caller's own terminal keeps sending mouse reports after
 * the board hangs up (GNOME Terminal printed "35;6;8M35;6;8M" at the shell,
 * sysop, 2026-09-29). Sent at every door exit and at logoff.
 */
export const MOUSE_REPORTING_OFF = '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l';
