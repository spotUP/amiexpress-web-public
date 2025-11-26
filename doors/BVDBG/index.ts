// TS BullView Debug door wrapper located under BBS Doors: assign.
// Delegates to the main implementation in web/backend/src/doors/bullview-debug.

import { runDoor as runBullViewDebugDoor } from '../../web/backend/src/doors/bullview-debug/index.ts';

export async function runDoor(ctx: { socket: any; bbsSession: any }) {
  return runBullViewDebugDoor(ctx);
}

export default { runDoor };
