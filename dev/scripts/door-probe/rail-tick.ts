/**
 * What a masthead rail tick looks like on the wire, in ONE place: the door-capture test harness and the
 * repaint-cost probe both have to tell the idle animation from a key's answer, and two strictnesses
 * (one looked at the opening save only, one also at the cursor addresses) are how an answer got counted as a tick.
 *
 * A tick is "save cursor, the rail on row 1, restore cursor" (ui_masthead_rail_tick). Chunks arrive one XIM message at
 * a time (at most 198 bytes), so a frame's first message can end while still on row 1: only the opening save marks a
 * tick, never "row 1" alone, and EVERY cursor address in it must be on row 1. The lone restore is a tick too (what a
 * binary built before the chunker kept ESC 8 whole sends as its own message).
 */
export function isRailTick(chunk: string): boolean {
  if (chunk === '\x1b8') return true;
  if (!chunk.startsWith('\x1b7')) return false;
  const rows = [...chunk.matchAll(/\x1b\[(\d+);\d+H/g)].map(m => Number(m[1]));
  return rows.every(r => r === 1);
}
