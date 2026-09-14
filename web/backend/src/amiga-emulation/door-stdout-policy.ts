/**
 * Does a door's DOS stdout reach the caller's screen?
 *
 * TWO REASONS IT DOES NOT, and they are different reasons.
 *
 * A XIM-protocol door (XIM/AIM/TIM/IIM/MCI/AEM - anything but SIM/SUP) talks
 * to the caller through AEDoor.library messages, and AmiExpress launches it
 * with stdout pointed at `NIL:`, so a stray `Write(Output(), ...)` goes
 * nowhere. Without that filter Conftop's printf banner leaks ahead of the
 * real one and the caller watches the screen draw twice.
 *
 * A SILENT door writes nothing to the caller at all, whatever its type.
 * That is express.e's `doorSilent` (`checkToolTypeExists(tooltype, cmd,
 * 'SILENT')`, express.e:4774), which gates `serPuts` (1777), `conPuts`
 * (1863) and the input side with it. It is how a board runs MAINTENANCE
 * through the door path: `LOGOFF<n>` runs `BBS:Batch<n>`, whose output is
 * MultiTop regenerating bulletins, and on this board it painted over the
 * logoff screen because nothing read the tooltype (sysop, 2026-09-14).
 *
 * Transfer-raw passthrough is decided before this and is not affected:
 * binary file transfers route through stdout and must reach the wire.
 */
export function stdoutReachesCaller(opts: {
  /** The door's TYPE tooltype, any case. */
  doorType?: string;
  /** The door's SILENT tooltype. */
  silent?: boolean;
}): boolean {
  if (opts.silent) return false;
  const type = (opts.doorType || 'SIM').toUpperCase();
  return type === 'SIM' || type === 'SUP';
}
