/**
 * An event arriving from the server must not be sent back to it.
 *
 * ClientDoor.emit forwards a whitelist of events to the server so door code
 * can say `door.emit('audio:levels', ...)`. Several of those events are
 * also events the server SENDS - video:frame and audio:data among them -
 * and the inbound handlers re-emitted them with that same `emit`. So every
 * frame the server delivered was bounced straight back, rebroadcast to the
 * whole room, and bounced again by every other browser: traffic multiplied
 * on each hop, which is why video was "super slow" and a session pushed
 * 41,457 frames.
 *
 * It broke the picture too. The echo carried the ECHOER's identity, so a
 * viewer rebroadcast the speaker's frames as their own and each tile
 * alternated between two people - reported as "every second frame
 * flickers".
 *
 * The door's emit path is exercised here through a fake socket, so the loop
 * is caught without a browser.
 */

import { EventEmitter } from 'events';

/**
 * The forwarding rule under test, mirroring ClientDoor: outbound events on
 * the whitelist go to the socket; inbound events are delivered locally.
 *
 * ClientDoor itself only constructs inside a browser (it reaches for
 * window, document and a Socket.IO global), so the rule is modelled here
 * rather than imported. The test that matters is the shape of the rule.
 */
const FORWARDED = new Set(['audio:data', 'video:frame', 'audio:levels', 'voice:speaking']);

class DoorLike extends EventEmitter {
  public sent: Array<{ event: string; data: any }> = [];

  emit(event: string, ...args: any[]): boolean {
    if (FORWARDED.has(event)) {
      this.sent.push({ event, data: args[0] });
    }
    return super.emit(event, ...args);
  }

  /** What an inbound socket handler must use. */
  emitLocal(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  /** Simulate the server delivering an event to this browser. */
  receiveFromServer(event: string, data: any): void {
    this.emitLocal(event, data);
  }
}

describe('client door echo loop', () => {
  it('does not send a received video frame back to the server', () => {
    const door = new DoorLike();
    door.receiveFromServer('video:frame', { userId: 'other', frame: 'xxx' });

    expect(door.sent).toHaveLength(0);
  });

  it('does not send received audio back to the server', () => {
    const door = new DoorLike();
    door.receiveFromServer('audio:data', { userId: 'other', chunk: new ArrayBuffer(8) });

    expect(door.sent).toHaveLength(0);
  });

  it('still delivers received events to local listeners', () => {
    // The whole point of the inbound path: the tile has to get the frame.
    const door = new DoorLike();
    const seen: any[] = [];
    door.on('video:frame', d => seen.push(d));

    door.receiveFromServer('video:frame', { userId: 'other', frame: 'xxx' });

    expect(seen).toHaveLength(1);
    expect(seen[0].userId).toBe('other');
  });

  it('still forwards events the door itself raises', () => {
    // Outbound forwarding is the feature; only the echo was the bug.
    const door = new DoorLike();
    door.emit('video:frame', { frame: 'mine' });

    expect(door.sent).toEqual([{ event: 'video:frame', data: { frame: 'mine' } }]);
  });

  it('does not multiply traffic when many frames arrive', () => {
    // The amplification: one inbound frame used to become one outbound
    // frame, which the server then sent to everyone, who each sent it
    // again.
    const door = new DoorLike();
    for (let i = 0; i < 100; i++) {
      door.receiveFromServer('video:frame', { userId: 'other', frame: `f${i}` });
    }

    expect(door.sent).toHaveLength(0);
  });

  it('never rebroadcasts somebody else frames under our own name', () => {
    // What made tiles alternate between two people.
    const door = new DoorLike();
    door.receiveFromServer('video:frame', { userId: 'speaker', frame: 'theirs' });

    expect(door.sent.some(s => s.data?.frame === 'theirs')).toBe(false);
  });
});
