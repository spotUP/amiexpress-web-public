/* aedoor.h - AmiExpress XIM door I/O layer for the DoorRepo C client.
 *
 * Two implementations share this interface:
 *   aedoor_amiga.c  - the real XIM message-port protocol against a running
 *                      AmiExpress node.
 *   aedoor_native.c - a stdio twin used for native TDD and dev-machine runs.
 * Neither file contains "#ifdef AMIGA" or any other platform conditional --
 * the split at the file level IS the platform mechanism. The Makefile
 * (Task 6) picks which .c file to compile.
 *
 * Style and structure are modelled on the AmiExpress-author-adjacent glue in
 * amiexpress_doors/Sources/_C/AE_DOORS/AEDoor.c (functions PortStart,
 * CheckMessage, TakeOffEh, ShutDown, GetString, PutString) by Gord
 * Dimitrieff, and on the shorter complete example
 * amiexpress_doors/Sources/_AREXX/DC-X107I/DC-SX107install/SX/Developer/
 * SASC/Example2.c (XIMFunction). Protocol facts (struct layout, command
 * codes, the 198-char usable payload, the Data==-1 carrier-loss signal) are
 * drawn from
 * thoughts/shared/research/2026-08-17_xim-door-protocol-for-c-clients.md,
 * which supersedes doordocs.txt on several points where the two disagree --
 * see the citations in aedoor_amiga.c.
 *
 * C89. ASCII only.
 */

#ifndef AEDOOR_H
#define AEDOOR_H

/* Usable JH_Message String payload is 198 characters plus NUL, not the full
 * 200-byte array -- both aedoor.library and our emulator cap there (research
 * doc: "Usable String payload is 198 chars + NUL, not 200"; DoorTypes.ts:
 * 93-95; aedoor.library.asm:293-296). ae_put() chunks output at this
 * boundary in BOTH implementations so the two backends behave identically
 * and the boundary condition is exercised by the native tests. */
#define AE_MAX_LINE 198

/* PortStart equivalent (AEDoor.c PortStart(), lines 187-229; Example2.c
 * main(), lines 35-55). Locates AEDoorPort<node> and registers this door
 * with the BBS (JH_REGISTER). node is the value AmiExpress passed as
 * argv[1] (research doc: "Node number arrives as argv[1] only";
 * express.e:4308). Returns 0 on success, non-zero on failure (reply port
 * could not be created, message memory could not be allocated, or the BBS
 * door port was not found -- i.e. not actually running under AmiExpress). */
int ae_start(int node);

/* PutString equivalent (AEDoor.c PutString(), lines 275-281). Sends text
 * with no embedded line terminator expected from the caller; newline != 0
 * asks the BBS to append its own line break after the LAST chunk (research
 * doc: "Send text with NO trailing newline and Data = 1; the BBS appends
 * the break. Never both."). Text longer than AE_MAX_LINE is split across
 * multiple sends -- never truncated.
 *
 * Protocol-avoidance, not cosmetics: text whose first non-whitespace chars
 * are "bbs:" (case-insensitive) is silently rerouted by the BBS to file
 * display instead of being printed (research doc divergence #4; io.ts:
 * 661-667 checks trimmed.toLowerCase().startsWith('bbs:')). A sysop can
 * legitimately configure a download directory as "bbs:doors/", making this
 * a live trap for ordinary status lines, not a hypothetical one. Both
 * implementations guard it automatically -- a leading '.' is inserted so
 * the check's prefix test fails and the line still prints -- so callers
 * never need to remember this for any message they add. The guard is
 * re-checked on EVERY chunk, not just the first: the BBS's reroute check
 * runs on each physical send independently, so a "bbs:" appearing at a
 * later chunk's own start (not the caller's logical string start) is just
 * as vulnerable and gets its own guard byte. */
void ae_put(const char *text, int newline);

/* GetString equivalent (AEDoor.c GetString(), lines 267-273). Reads a line
 * of input into buf. The prompt must already have been emitted via ae_put()
 * -- this call does not prompt (it uses JH_LI, a pre-filled-default read,
 * not JH_PM). Truncates safely at maxlen; buf is always NUL-terminated. */
void ae_get(char *buf, int maxlen);

/* Single keypress read (JH_HK). Returns the key value (0-255), or -1 on
 * carrier loss or console timeout. */
int ae_key(void);

/* CheckMessage equivalent (AEDoor.c CheckMessage(), lines 154-183), but
 * non-blocking and read-only: returns non-zero once a prior ae_get/ae_key/
 * ae_put round trip has observed Data == -1 -- carrier lost or console
 * timeout (research doc: "Data == -1 from any input call means carrier
 * loss or timeout -- the caller must stop and shut down"). Does not itself
 * perform any protocol exchange. */
int ae_check(void);

/* Ask the BBS to stop swallowing the cursor keys.
 *
 * On a real AmiExpress node an arrow key is marked "control" and consumed
 * by readChar()'s loop, so a door never receives one, until the door
 * toggles the BBS's rawArrow flag (express.e:3814-3815, 7514-7528). With it
 * on, arrows arrive as the single-byte codes 2/3/4/5 (LEFT/RIGHT/UP/DOWN,
 * axconsts.e:75-78) - NOT as escape sequences.
 *
 * Call ae_raw_arrows(1) once after ae_start() if the door reads cursor
 * keys. The backend restores the previous state on every shutdown path, so
 * a door does not have to remember to. Calling it twice with the same
 * argument is a no-op, which matters because the underlying BBS command is
 * a toggle with no way to read the current state.
 *
 * The native backend has no BBS to ask and does nothing. */
void ae_raw_arrows(int on);

/* ShutDown equivalent (AEDoor.c ShutDown(), lines 255-265): the normal,
 * successful end of the door. Notifies the BBS (JH_SHUTDOWN) then
 * terminates the process with exit(0). On the Amiga backend this never
 * returns to the caller; skipping it leaves the BBS waiting forever
 * (research doc: "JH_SHUTDOWN = 2 last and MANDATORY"; AEDoor.c:147-148).
 * The native backend is a no-op that DOES return, since there is no BBS to
 * notify and no reason to end the caller's process early. */
void ae_shutdown(void);

/* TakeOffEh equivalent (AEDoor.c TakeOffEh(), lines 231-239): fatal-error
 * shutdown. Still notifies the BBS (JH_SHUTDOWN) before terminating -- the
 * mandate applies on every exit path, not just the happy one -- then calls
 * exit(code). Does not return, on either backend. */
void ae_fatal(int code);

#endif /* AEDOOR_H */
