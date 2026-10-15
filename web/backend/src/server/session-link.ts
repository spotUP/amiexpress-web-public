import { EventEmitter } from 'events';
import type { Socket } from 'socket.io';

export const HELD_OUTPUT_LIMIT = 256 * 1024;
export type DropDecision = 'park' | 'end';
export interface SessionLinkHooks { onDrop(reason: string): DropDecision }
export interface HeldOutput { chunks: Array<[string, unknown[]]>; overflowed: boolean }
export interface SessionLinkControl {
  readonly raw: Socket; readonly parked: boolean; readonly ended: boolean;
  attach(next: Socket): void; end(reason: string): void; takeHeld(): HeldOutput; setHooks(h: SessionLinkHooks): void;
}
export type SessionLink = SessionLinkControl & Socket;

type Listener = (...args: any[]) => void;
const LINK = Symbol('sessionLink');
/** The session's own end - never forwarded from a transport. */
const SESSION_EVENTS = new Set(['disconnect', 'disconnecting']);

function sizeOf(args: unknown[]): number {
  let n = 0;
  for (const a of args) {
    if (typeof a === 'string') n += a.length;
    else if (a && typeof (a as { byteLength?: number }).byteLength === 'number') n += (a as { byteLength: number }).byteLength;
    else n += 64;
  }
  return n;
}

export function isSessionLink(x: unknown): x is SessionLink {
  return !!x && (x as Record<symbol, unknown>)[LINK] === true;
}

export function createSessionLink(first: Socket, initial?: SessionLinkHooks): SessionLink {
  let raw: Socket = first;
  let parked = false;
  let ended = false;
  let hooks: SessionLinkHooks = initial ?? { onDrop: () => 'end' };
  const own = new EventEmitter(); own.setMaxListeners(0);
  const tracked: Array<{ event: string; fn: Listener; orig: Listener }> = [];
  const anys: Listener[] = [];
  const rooms = new Set<string>();
  let held: Array<[string, unknown[]]> = []; let heldBytes = 0; let overflowed = false;

  const rawDisconnect = new WeakMap<Socket, Listener>();
  const bind = (s: Socket) => {
    for (const t of tracked) s.on(t.event, t.fn);
    for (const f of anys) s.onAny(f);
    for (const r of rooms) s.join(r);
    const onDrop: Listener = (reason: string) => {
      if (s !== raw || ended || parked) return;      // an old socket, or already parked
      if (hooks.onDrop(reason) === 'park') { parked = true; unbind(s); } else end(reason);
    };
    rawDisconnect.set(s, onDrop);
    s.on('disconnect', onDrop);
  };
  const unbind = (s: Socket) => {
    for (const t of tracked) s.off(t.event, t.fn);
    for (const f of anys) s.offAny(f);
    const d = rawDisconnect.get(s); if (d) s.off('disconnect', d);
  };
  const hold = (event: string, args: unknown[]) => {
    if (overflowed) return;
    const n = sizeOf(args);
    if (heldBytes + n > HELD_OUTPUT_LIMIT) { held = []; heldBytes = 0; overflowed = true; return; }
    held.push([event, args]); heldBytes += n;
  };
  function end(reason: string): void {
    if (ended) return;
    ended = true; parked = false;
    unbind(raw);
    own.emit('disconnecting', reason);
    own.emit('disconnect', reason);
  }

  const target: Record<string | symbol, unknown> = {
    [LINK]: true,
    emit: (event: string, ...args: unknown[]): boolean => {
      if (ended) return false;
      if (parked) { hold(event, args); return true; }
      return raw.emit(event, ...(args as []));
    },
    on: (event: string, fn: Listener) => {
      if (SESSION_EVENTS.has(event)) own.on(event, fn);
      else { tracked.push({ event, fn, orig: fn }); if (!parked && !ended) raw.on(event, fn); }
      return proxy;
    },
    once: (event: string, fn: Listener) => {
      if (SESSION_EVENTS.has(event)) { own.once(event, fn); return proxy; }
      const w: Listener = (...a) => { (target.off as Function)(event, fn); fn(...a); };
      tracked.push({ event, fn: w, orig: fn }); if (!parked && !ended) raw.on(event, w);
      return proxy;
    },
    off: (event: string, fn: Listener) => {
      if (SESSION_EVENTS.has(event)) { own.off(event, fn); return proxy; }
      for (let i = tracked.length - 1; i >= 0; i--) {
        const t = tracked[i];
        if (t.event === event && (t.orig === fn || t.fn === fn)) { raw.off(event, t.fn); tracked.splice(i, 1); }
      }
      return proxy;
    },
    removeAllListeners: (event?: string) => {
      for (const t of [...tracked]) if (event === undefined || t.event === event) (target.off as Function)(t.event, t.fn);
      if (event === undefined || SESSION_EVENTS.has(event)) own.removeAllListeners(event);
      return proxy;
    },
    listeners: (event: string) => SESSION_EVENTS.has(event) ? own.listeners(event) : tracked.filter((t) => t.event === event).map((t) => t.orig),
    listenerCount: (event: string) => (target.listeners as Function)(event).length,
    onAny: (f: Listener) => { anys.push(f); if (!parked && !ended) raw.onAny(f); return proxy; },
    offAny: (f?: Listener) => { for (const x of [...anys]) if (!f || x === f) { anys.splice(anys.indexOf(x), 1); raw.offAny(x); } return proxy; },
    join: (room: string) => { rooms.add(room); if (!parked && !ended) raw.join(room); },
    leave: (room: string) => { rooms.delete(room); if (!parked && !ended) raw.leave(room); },
    disconnect: (close?: boolean) => {
      if (ended) return proxy;
      if (parked) end('server namespace disconnect'); else raw.disconnect(close);
      return proxy;
    },
    attach: (next: Socket) => {
      if (ended) throw new Error('attach to an ended session link');
      if (next === raw && !parked) return;
      unbind(raw);
      if (raw.connected && raw !== next) raw.disconnect(true);  // takeover: unbound first, so we never hear it
      raw = next; parked = false;
      bind(next);
    },
    end,
    takeHeld: (): HeldOutput => { const out = { chunks: held, overflowed }; held = []; heldBytes = 0; overflowed = false; return out; },
    setHooks: (h: SessionLinkHooks) => { hooks = h; },
  };
  Object.defineProperties(target, {
    raw: { get: () => raw }, parked: { get: () => parked }, ended: { get: () => ended },
    id: { get: () => raw.id }, connected: { get: () => !parked && !ended && raw.connected },
  });

  const proxy = new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      const v = (raw as unknown as Record<string | symbol, unknown>)[p];
      return typeof v === 'function' ? (v as Function).bind(raw) : v;
    },
    set(t, p, v) { t[p] = v; return true; },          // emit wrappers, `session`, `_modemEmulator` live on the link
    has(t, p) { return p in t || p in (raw as object); },
  }) as unknown as SessionLink;
  bind(first);
  return proxy;
}
