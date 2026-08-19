/* shell.h - the one place this door asks the host to run another program.
 *
 * Only the archiver needs this, and only at install time. It lives behind
 * its own platform pair (shell_amiga.c / shell_native.c) for the same
 * reason aedoor.h has one: the two targets do not merely spell the command
 * differently, they REACH the command by different means.
 *
 *   native  - system(), i.e. /bin/sh, and Unix lha's "xw=<dir>" form.
 *   AmigaOS - dos.library/Execute(), and AmigaDOS LhA's third-argument
 *             destination form.
 *
 * Why Execute() rather than C system() on the Amiga side: under this
 * project's 68K emulator, the vbcc runtime's system() reaches nothing at
 * all - it returns 0 (success) without a single dos.library call, so the
 * door believed every archive had been unpacked while the destination
 * directory was never created. Execute() is a real dos.library entry the
 * emulator can implement (and does, for LhA), and it is also what an
 * AmigaOS program is supposed to call. Verified from a live session log:
 * "Extracting 5D!DP002.LHA into Doors:5DD/ ..." was followed by no DOS
 * call whatsoever, and then by Open("Doors:5DD/HiScore") failing 205.
 *
 * The command STRING itself is built by flow_build_extract_command() so
 * both spellings are unit-testable without running anything.
 *
 * C89.
 */

#ifndef DOORREPO_SHELL_H
#define DOORREPO_SHELL_H

/* Runs `lha_command` over `archive_path`, extracting into `dest_dir`.
 * Returns 1 when the archiver reported success, 0 otherwise (including a
 * command that would not fit its buffer, and a host with no way to run
 * one).
 *
 * A 1 means "the archiver said it worked", nothing more. It is NOT
 * evidence that any file exists - the caller must check that itself, which
 * is what flow_install_verdict() is for. */
int shell_extract(const char *lha_command, const char *archive_path,
                  const char *dest_dir);

#endif /* DOORREPO_SHELL_H */
