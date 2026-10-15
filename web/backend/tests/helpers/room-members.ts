/**
 * Room members for a test: sessions in the board's session map, each with an
 * emitter that records what it was sent.
 *
 * Rooms are session state now (src/server/session-rooms.ts) - a member is a
 * live session whose currentRoomId or chatSessionId names the room, reached
 * through its own emitter - so a test puts sessions where the board keeps
 * them rather than faking socket.io's room adapter.
 */
import { sessions } from '../../src/server/session-manager';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';

export interface Member {
  session: any;
  /** Every [event, payload] this member's emitter was sent. */
  events: Array<[string, unknown]>;
  /** The payloads of one event. */
  of(event: string): unknown[];
}

const placed: string[] = [];

export function roomMember(nodeId: number, session: Record<string, unknown>, emitterId = `member-${nodeId}`): Member {
  const events: Array<[string, unknown]> = [];
  const full: any = { nodeId, ...session };
  registerConnectionEmitter(full, { id: emitterId, emit: (event: string, payload: unknown) => { events.push([event, payload]); return true; } } as never);
  sessions.set(String(nodeId), full);
  placed.push(String(nodeId));
  return { session: full, events, of: (event) => events.filter(([e]) => e === event).map(([, p]) => p) };
}

/** Take every member this helper placed back out of the session map. */
export function clearRoomMembers(): void {
  while (placed.length) sessions.delete(placed.pop() as string);
}
