import { EventEmitter } from 'events';
import { createSessionLink, HELD_OUTPUT_LIMIT } from '../../src/server/session-link';

function fakeRaw(id: string) {
  const ee: any = new EventEmitter();
  ee.id = id; ee.connected = true; ee.sent = [] as Array<[string, unknown[]]>;
  ee.rooms = new Set<string>(); ee.anys = [] as any[]; ee.outs = [] as any[];
  ee.join = (r: string) => ee.rooms.add(r); ee.leave = (r: string) => ee.rooms.delete(r);
  ee.onAny = (f: any) => ee.anys.push(f); ee.offAny = (f: any) => { ee.anys = ee.anys.filter((x: any) => x !== f); };
  ee.disconnect = () => { ee.connected = false; ee.fire('disconnect', 'server namespace disconnect'); };
  ee.fire = (e: string, ...a: unknown[]) => EventEmitter.prototype.emit.call(ee, e, ...a);
  ee.onAnyOutgoing = (f: any) => ee.outs.push(f); ee.offAnyOutgoing = (f: any) => { ee.outs = ee.outs.filter((x: any) => x !== f); };
  ee.emit = (e: string, ...a: unknown[]) => { ee.sent.push([e, a]); ee.outs.forEach((f: any) => f(e, ...a)); return true; };
  return ee;
}

describe('a session link outlives the socket under it', () => {
  it('forwards output to the current socket and reads its id through', () => {
    const a = fakeRaw('A'); const link = createSessionLink(a);
    link.emit('ansi-output', 'hi');
    expect(a.sent).toEqual([['ansi-output', ['hi']]]);
    expect(link.id).toBe('A');
  });

  it('parks on a drop the hook parks: the session listeners hear nothing, output is held', () => {
    const a = fakeRaw('A');
    const link = createSessionLink(a, { onDrop: () => 'park' });
    const ended = jest.fn(); link.on('disconnect', ended);
    a.connected = false; a.fire('disconnect', 'transport close');
    expect(ended).not.toHaveBeenCalled();
    expect(link.parked).toBe(true);
    link.emit('ansi-output', 'while away');
    expect(a.sent).toEqual([]);
    expect(link.takeHeld()).toEqual({ chunks: [['ansi-output', ['while away']]], overflowed: false });
  });

  it('a key that arrives on the NEW socket reaches a listener registered before the drop', () => {
    const a = fakeRaw('A'); const b = fakeRaw('B');
    const link = createSessionLink(a, { onDrop: () => 'park' });
    const onCommand = jest.fn(); link.on('command', onCommand);
    link.join('user:7');
    a.fire('disconnect', 'transport close');
    link.attach(b);
    b.fire('command', 'x');
    expect(onCommand).toHaveBeenCalledWith('x');
    expect(link.id).toBe('B');
    expect(b.rooms.has('user:7')).toBe(true);
    link.emit('ansi-output', 'back');
    expect(b.sent).toEqual([['ansi-output', ['back']]]);
  });

  it('ignores the old socket once another is attached - a late disconnect ends nothing', () => {
    const a = fakeRaw('A'); const b = fakeRaw('B');
    const link = createSessionLink(a, { onDrop: () => 'end' });
    const ended = jest.fn(); link.on('disconnect', ended);
    link.attach(b);                      // takeover: a still looked alive
    expect(a.connected).toBe(false);     // attach hung the old one up
    a.fire('disconnect', 'ping timeout');
    expect(ended).not.toHaveBeenCalled();
  });

  it('says disconnect once, when the session ends, whatever the reason', () => {
    const a = fakeRaw('A'); const link = createSessionLink(a, { onDrop: () => 'park' });
    const ended = jest.fn(); link.on('disconnect', ended);
    a.fire('disconnect', 'transport close');
    link.disconnect(true);               // a kick or the idle hang-up of a parked link
    link.end('again');
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith('server namespace disconnect');
  });

  it('a drop the hook ends reaches the session listeners with the raw reason', () => {
    const a = fakeRaw('A'); const link = createSessionLink(a, { onDrop: () => 'end' });
    const ended = jest.fn(); link.on('disconnect', ended);
    a.fire('disconnect', 'transport close');
    expect(ended).toHaveBeenCalledWith('transport close');
  });

  it('holds at most the limit, then drops everything and says it overflowed', () => {
    const a = fakeRaw('A'); const link = createSessionLink(a, { onDrop: () => 'park' });
    a.fire('disconnect', 'transport close');
    link.emit('ansi-output', 'x'.repeat(HELD_OUTPUT_LIMIT));
    link.emit('ansi-output', 'y');
    expect(link.takeHeld()).toEqual({ chunks: [], overflowed: true });
  });

  it('keeps a wrapper installed on it across the attach', () => {
    const a = fakeRaw('A'); const b = fakeRaw('B');
    const link = createSessionLink(a, { onDrop: () => 'park' });
    const base = link.emit.bind(link);
    (link as any).emit = (e: string, ...x: unknown[]) => base(e, ...x.map((v) => `[${v}]`));
    a.fire('disconnect', 'transport close'); link.attach(b);
    link.emit('ansi-output', 'z');
    expect(b.sent).toEqual([['ansi-output', ['[z]']]]);
  });

  it('once-listeners and off work on the link like on a socket', () => {
    const a = fakeRaw('A'); const b = fakeRaw('B'); const link = createSessionLink(a, { onDrop: () => 'park' });
    const once = jest.fn(); const gone = jest.fn();
    link.once('k', once); link.on('k', gone); link.off('k', gone);
    a.fire('disconnect', 'transport close'); link.attach(b);
    b.fire('k'); b.fire('k');
    expect(once).toHaveBeenCalledTimes(1); expect(gone).not.toHaveBeenCalled();
    expect(link.listenerCount('k')).toBe(0);
  });

  it('a disconnect that unbinds mid-dispatch is ignored: the hook is not asked, nothing ends', () => {
    const a = fakeRaw('A'); const b = fakeRaw('B');
    a.on('disconnect', () => link.attach(b));          // registered first, runs before the link's own drop listener
    const onDrop = jest.fn(() => 'end' as const);
    const link = createSessionLink(a, { onDrop });
    const ended = jest.fn(); link.on('disconnect', ended);
    a.fire('disconnect', 'transport close');
    expect(onDrop).not.toHaveBeenCalled();
    expect(link.ended).toBe(false);
    expect(link.id).toBe('B');
    expect(ended).not.toHaveBeenCalled();
  });

  it('a nested drop that parks mid-dispatch: the outer dispatch does not ask the hook a second time', () => {
    const a = fakeRaw('A');
    let once = false;
    a.on('disconnect', () => { if (!once) { once = true; a.fire('disconnect', 'ping timeout'); } });
    const onDrop = jest.fn(() => 'park' as const);
    const link = createSessionLink(a, { onDrop });
    a.fire('disconnect', 'transport close');
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(link.parked).toBe(true);
  });
});

describe('the tracked members of the facade follow the link across attach', () => {
  function parkAndAttach(link: any, from: any, to: any) { from.fire('disconnect', 'transport close'); link.attach(to); }

  it('addListener, removeListener and prependListener are tracked like on and off', () => {
    const a = fakeRaw('A'); const b = fakeRaw('B'); const link = createSessionLink(a, { onDrop: () => 'park' });
    const order: string[] = [];
    link.addListener('k', () => order.push('first'));
    link.prependListener('k', () => order.push('prepended'));
    const gone = jest.fn(); link.addListener('k', gone); link.removeListener('k', gone);
    expect(link.listenerCount('k')).toBe(2);
    parkAndAttach(link, a, b);
    expect(b.listenerCount('k')).toBe(2);
    b.fire('k');
    expect(order).toEqual(['prepended', 'first']);
    expect(gone).not.toHaveBeenCalled();
  });

  it('onAnyOutgoing observers follow the link and leave the old raw', () => {
    const a = fakeRaw('A'); const b = fakeRaw('B'); const link = createSessionLink(a, { onDrop: () => 'park' });
    const tap = jest.fn(); link.onAnyOutgoing(tap);
    link.emit('x', 1);
    expect(tap).toHaveBeenCalledWith('x', 1);
    parkAndAttach(link, a, b);
    expect(a.outs).toHaveLength(0);
    expect(b.outs).toHaveLength(1);
    link.emit('y', 2);
    expect(tap).toHaveBeenLastCalledWith('y', 2);
    link.offAnyOutgoing(tap);
    expect(b.outs).toHaveLength(0);
  });

  it('a held emit is seen by outgoing observers when it is replayed on the new raw, not at park time', () => {
    const a = fakeRaw('A'); const b = fakeRaw('B'); const link = createSessionLink(a, { onDrop: () => 'park' });
    const tap = jest.fn(); link.onAnyOutgoing(tap);
    a.fire('disconnect', 'transport close');
    link.emit('ansi-output', 'held');
    expect(tap).not.toHaveBeenCalled();
    link.attach(b);
    for (const [e, args] of link.takeHeld().chunks) b.emit(e, ...args);
    expect(tap).toHaveBeenCalledWith('ansi-output', 'held');
  });

  it('send is emit("message") and is held while parked', () => {
    const a = fakeRaw('A'); const link = createSessionLink(a, { onDrop: () => 'park' });
    link.send('hello');
    expect(a.sent).toEqual([['message', ['hello']]]);
    a.fire('disconnect', 'transport close');
    link.send('later');
    expect(link.takeHeld().chunks).toEqual([['message', ['later']]]);
  });

  it('an ack callback is never held, the event still is', () => {
    const a = fakeRaw('A'); const link = createSessionLink(a, { onDrop: () => 'park' });
    a.fire('disconnect', 'transport close');
    const ack = jest.fn();
    link.emit('ansi-output', 'x', ack);
    expect(link.takeHeld()).toEqual({ chunks: [['ansi-output', ['x']]], overflowed: false });
    expect(ack).not.toHaveBeenCalled();
  });

  it('survives many attach cycles: one listener, one any, one drop listener on the current raw only', () => {
    const a = fakeRaw('A'); const b = fakeRaw('B');
    const onDrop = jest.fn(() => 'park' as const);
    const link = createSessionLink(a, { onDrop });
    const h = jest.fn(); const any = jest.fn(); const tap = jest.fn();
    link.on('k', h); link.onAny(any); link.onAnyOutgoing(tap);
    let cur = a; let other = b;
    for (let i = 0; i < 5; i++) {
      cur.fire('disconnect', 'transport close');
      link.attach(other);
      [cur, other] = [other, cur];
      expect(cur.listenerCount('k')).toBe(1);
      expect(other.listenerCount('k')).toBe(0);
      expect(cur.anys).toHaveLength(1); expect(other.anys).toHaveLength(0);
      expect(cur.outs).toHaveLength(1); expect(other.outs).toHaveLength(0);
      expect(cur.listenerCount('disconnect')).toBe(1); expect(other.listenerCount('disconnect')).toBe(0);
      cur.connected = true;
    }
    expect(onDrop).toHaveBeenCalledTimes(5);   // exactly once per detach
  });

  it('attach after end throws', () => {
    const a = fakeRaw('A'); const link = createSessionLink(a);
    link.end('over');
    expect(() => link.attach(fakeRaw('B'))).toThrow('attach to an ended session link');
  });

  it('overflows on one emit bigger than the limit', () => {
    const a = fakeRaw('A'); const link = createSessionLink(a, { onDrop: () => 'park' });
    a.fire('disconnect', 'transport close');
    link.emit('ansi-output', 'x'.repeat(HELD_OUTPUT_LIMIT + 1));
    expect(link.takeHeld()).toEqual({ chunks: [], overflowed: true });
  });

  it('replays held output in order, and takeHeld resets', () => {
    const a = fakeRaw('A'); const link = createSessionLink(a, { onDrop: () => 'park' });
    a.fire('disconnect', 'transport close');
    link.emit('ansi-output', '1'); link.emit('door-x', 2); link.emit('ansi-output', '3');
    expect(link.takeHeld().chunks.map((c) => c[0] + c[1][0])).toEqual(['ansi-output1', 'door-x2', 'ansi-output3']);
    expect(link.takeHeld()).toEqual({ chunks: [], overflowed: false });
    link.emit('ansi-output', 'after');
    expect(link.takeHeld().chunks).toHaveLength(1);
  });
});
