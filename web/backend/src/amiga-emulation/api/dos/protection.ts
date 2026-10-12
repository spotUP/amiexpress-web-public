/**
 * AmigaDOS protection bits <-> host file mode.
 *
 * The low four bits of fib_Protection / SetProtection are DENY bits
 * (dos/dos.h): a SET bit forbids the operation, a clear one allows it.
 *   FIBF_DELETE 0x01, FIBF_EXECUTE 0x02, FIBF_WRITE 0x04, FIBF_READ 0x08
 * An ordinary readable, writable file is 0 ("----rwed" less what the host
 * withholds).
 */
export const FIBF_DELETE = 0x01;
export const FIBF_EXECUTE = 0x02;
export const FIBF_WRITE = 0x04;
export const FIBF_READ = 0x08;

/** The host mode SetProtection gives a file with Amiga protection `protect`. */
export function hostModeOf(protect: number): number {
  let mode = 0;
  if (!(protect & FIBF_READ)) mode |= 0o444; // read for all
  if (!(protect & FIBF_WRITE)) mode |= 0o200; // write for the owner
  if (!(protect & FIBF_EXECUTE)) mode |= 0o111; // execute for all
  return mode; // FIBF_DELETE has no host equivalent
}

/**
 * The fib_Protection Examine reports for a host object: what the owner may
 * do, read back the way SetProtection writes it. Delete follows write (a
 * host file is deleted by whoever may change it).
 */
export function amigaProtectionOf(hostMode: number): number {
  let protect = 0;
  if (!(hostMode & 0o400)) protect |= FIBF_READ;
  if (!(hostMode & 0o200)) protect |= FIBF_WRITE | FIBF_DELETE;
  if (!(hostMode & 0o100)) protect |= FIBF_EXECUTE;
  return protect;
}
