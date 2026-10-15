import { EventEmitter } from 'events';
import { createSessionLink, HELD_OUTPUT_LIMIT } from '../../src/server/session-link';

function fakeRaw(id: string) {
  const ee: any = new EventEmitter();
  ee.id = id; ee.connected = true; ee.sent = [] as Array<[string, unknown[]]>;
  ee.rooms = new Set<string>(); ee.anys = [] as any[];
  ee.join = (r: string) => ee.rooms.add(r); ee.leave = (r: string) => ee.rooms.delete(r);
  ee.onAny = (f: any) => ee.anys.push(f); ee.offAny = (f: any) => { ee.anys = ee.anys.filter((x: any) => x !== f); };
  ee.disconnect = () => { ee.connected = false; ee.fire('disconnect', 'server namespace disconnect'); };
  ee.fire = (e: string, ...a: unknown[]) => EventEmitter.prototype.emit.call(ee, e, ...a);
  ee.emit = (e: string, ...a: unknown[]) => { ee.sent.push([e, a]); return true; };
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
});
