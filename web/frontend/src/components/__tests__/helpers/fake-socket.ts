/**
 * Minimal socket.io-client double shared by the BBSTerminal component tests.
 *
 * Records the handlers the component registers so a test can fire the
 * server's events at it, and records the events the component emits so a
 * test can assert the client asked for something. Extracted from
 * bbsterminal-session-font.test.tsx when a second BBSTerminal test needed
 * the same double.
 */
export class FakeSocket {
  handlers = new Map<string, Function[]>();
  emitted: Array<{ event: string; args: any[] }> = [];
  id = 'fake-socket-id';
  connected = true;
  io = {
    opts: { reconnection: true } as any,
    on() {},
    off() {},
    engine: { transport: { name: 'websocket' } },
  };
  on(event: string, fn: Function) {
    const list = this.handlers.get(event) ?? [];
    list.push(fn);
    this.handlers.set(event, list);
    return this;
  }
  off() { return this; }
  once(event: string, fn: Function) { return this.on(event, fn); }
  onAny() { return this; }
  offAny() { return this; }
  emit(event: string, ...args: any[]) { this.emitted.push({ event, args }); return this; }
  connect() { return this; }
  disconnect() { return this; }
  removeAllListeners() { this.handlers.clear(); return this; }
  /** Fire a server->client event at the component. */
  fire(event: string, ...args: any[]) {
    for (const fn of [...(this.handlers.get(event) ?? [])]) fn(...args);
  }
  /** Did the client emit this event? */
  didEmit(event: string) { return this.emitted.some((e) => e.event === event); }
}
