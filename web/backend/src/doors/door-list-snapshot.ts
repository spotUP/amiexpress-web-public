/**
 * The installed-door list, handed to the DoorRepo door as a file.
 *
 * The door used to fetch this over HTTP from the BBS it is running inside,
 * and that cannot work. The 68K emulator runs IN the backend's Node process.
 * When the door blocks in WaitSelect waiting for the reply, the event loop
 * cannot run the Express handler that would produce it, so the response only
 * appears after the socket times out. Measured on the live board:
 *
 *     send data: GET /api/door-admin/installed
 *     WaitSelect(nfds=1, timeout=30000ms)
 *     WaitSelect returning 0        <- timed out
 *     Received 21470 bytes          <- the reply, 30s too late
 *
 * From the sysop's side that is a thirty-second freeze on the L key with no
 * feedback, then the fallback screen. Requests to the REMOTE catalog work
 * fine in the same log, because another machine produces those replies and
 * the loop only has to deliver bytes.
 *
 * So the list is written to a file at launch instead, beside the token the
 * door already reads the same way, in the same encoding, at the same moment.
 * No socket, no round trip, no starvation - and the door gets it instantly.
 *
 * The format is the DOORS| family the door already parses
 * (flow_doors_parse_row), byte-identical to what
 * GET /api/door-admin/installed returns, so both sides keep one parser and
 * the HTTP route stays useful for the admin browser.
 *
 * On a real AmiExpress board no BBS writes this file, the door finds
 * nothing, and it falls back to its own install index - which is the only
 * thing that could ever have worked there.
 */
import * as fs from 'fs';
import * as path from 'path';

import { buildDoorList } from './door-list';
import { FIELD_CAPS, renderRows, sanitizeField } from '../server/door-admin-text';

/** Where the door looks, beside DoorRepo.cfg and DoorRepo.token. */
export function doorListSnapshotPath(bbsRoot: string): string {
  return path.join(bbsRoot, 'Doors', 'DoorRepo', 'DoorRepo.doors');
}

/**
 * Render the board's doors in the DOORS| format.
 *
 * Shared with the HTTP route so the file and the endpoint cannot describe
 * the same board differently.
 */
export async function renderDoorListBody(bbsRoot: string): Promise<string> {
  const doors = await buildDoorList(bbsRoot);
  const rows = doors.map((d) => [
    sanitizeField(d.command, FIELD_CAPS.command),
    sanitizeField(d.type, FIELD_CAPS.type),
    String(d.size ?? 0),
    d.enabled ? '1' : '0',
    String(d.accessLevel ?? 0),
    sanitizeField(d.archiveName, FIELD_CAPS.archive),
    sanitizeField(d.name, FIELD_CAPS.name),
    sanitizeField(d.category, FIELD_CAPS.category),
    sanitizeField(d.description, FIELD_CAPS.description),
  ]);
  return renderRows('DOORS', rows);
}

/**
 * Write the snapshot for a launching door.
 *
 * Never throws: a board that cannot write this still runs its doors, the
 * door just falls back to its own index. Latin-1 to match the token and the
 * catalog, which is what the door's fgets reads.
 */
export async function writeDoorListSnapshot(bbsRoot: string): Promise<boolean> {
  try {
    const body = await renderDoorListBody(bbsRoot);
    const target = doorListSnapshotPath(bbsRoot);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    // Written to a temporary name and renamed, because the door may be
    // reading the previous snapshot at this moment and a half-written
    // listing parses as a short one rather than failing.
    const tmp = `${target}.new`;
    fs.writeFileSync(tmp, body, { encoding: 'latin1', mode: 0o644 });
    fs.renameSync(tmp, target);
    return true;
  } catch (err) {
    console.warn(`[door] door list snapshot not written: ${(err as Error).message}`);
    return false;
  }
}

/** Remove the snapshot when the door exits, so a stale list cannot be read. */
export function clearDoorListSnapshot(bbsRoot: string): void {
  try {
    fs.unlinkSync(doorListSnapshotPath(bbsRoot));
  } catch {
    /* already gone, or never written */
  }
}
