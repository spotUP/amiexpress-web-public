/**
 * SessionLink: a socket-shaped facade that outlives the raw socket under it.
 *
 * Every holder of the session (BBSApi, door sessions, modem emulator, idle
 * timer ...) holds the LINK, never the raw socket, so a transport change
 * (park, then attach a new raw socket) needs no holder to be re-pointed.
 *
 * Members the link provides itself, TRACKED across attach: emit, send, on,
 * once, off, addListener, removeListener, prependListener, removeAllListeners,
 * listeners, listenerCount, onAny, offAny, onAnyOutgoing, offAnyOutgoing, join,
 * leave, disconnect, id, connected, plus the control surface (raw, parked,
 * ended, attach, end, takeHeld, setHooks).
 *
 * Members NOT provided fall through to the CURRENT raw socket, bound to it, and
 * are NOT re-bound at attach: emitWithAck, timeout, volatile, compress,
 * broadcast, to(), in(), handshake, request, nsp, data. In particular
 * `rooms` is the current raw's set (empty while parked: the link re-joins the
 * rooms it tracked on attach) and `handshake` is the current raw's (S5: read
 * the caller's address from the link at use time, never cache it across an
 * attach; the first raw's address is not the new one's).
 *
 * Output while parked is held below every emit wrapper. Observers installed
 * with onAnyOutgoing run when an emit reaches a raw socket, so a held emit is
 * seen by them at REPLAY time (when the board re-emits it on the new raw), not
 * at park time. An acknowledgement callback (a trailing function argument) is
 * never held: it would fire on a different transport, or never.
 */
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

type Listener = (...args: unknown[]) => void;

/** The raw-socket surface the link drives (socket.io's typed overloads do not take dynamic names). */
interface RawLike {
  readonly id: string;
  readonly connected: boolean;
  emit(event: string, ...args: unknown[]): boolean;
  on(event: string, fn: Listener): unknown;
  prependListener(event: string, fn: Listener): unknown;
  off(event: string, fn: Listener): unknown;
  onAny(fn: Listener): unknown;
  offAny(fn?: Listener): unknown;
  onAnyOutgoing(fn: Listener): unknown;
  offAnyOutgoing(fn?: Listener): unknown;
  join(room: string): unknown;
  leave(room: string): unknown;
  disconnect(close?: boolean): unknown;
}
const asRaw = (s: Socket): RawLike => s as unknown as RawLike;

/** The members the link provides itself; the Proxy target is typed so a missing one fails tsc. */
interface LinkMembers extends SessionLinkControl {
  readonly id: string;
  readonly connected: boolean;
  emit(event: string, ...args: unknown[]): boolean;
  send(...args: unknown[]): SessionLink;
  on(event: string, fn: Listener): SessionLink;
  addListener(event: string, fn: Listener): SessionLink;
  once(event: string, fn: Listener): SessionLink;
  prependListener(event: string, fn: Listener): SessionLink;
  off(event: string, fn: Listener): SessionLink;
  removeListener(event: string, fn: Listener): SessionLink;
  removeAllListeners(event?: string): SessionLink;
  listeners(event: string): Listener[];
  listenerCount(event: string): number;
  onAny(fn: Listener): SessionLink;
  offAny(fn?: Listener): SessionLink;
  onAnyOutgoing(fn: Listener): SessionLink;
  offAnyOutgoing(fn?: Listener): SessionLink;
  join(room: string): void;
  leave(room: string): void;
  disconnect(close?: boolean): SessionLink;
}

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

/**
 * Output held while nobody may see it (a parked link, a door held under the
 * command palette), replayed later in order. Past HELD_OUTPUT_LIMIT bytes the
 * whole hold is dropped and `overflowed` says so: the caller repaints instead.
 */
export function createHeldOutput(): { hold(event: string, args: unknown[]): void; take(): HeldOutput } {
  let held: Array<[string, unknown[]]> = []; let heldBytes = 0; let overflowed = false;
  return {
    hold(event, args) {
      if (overflowed) return;
      const n = sizeOf(args);
      if (heldBytes + n > HELD_OUTPUT_LIMIT) { held = []; heldBytes = 0; overflowed = true; return; }
      held.push([event, args]); heldBytes += n;
    },
    take() { const out = { chunks: held, overflowed }; held = []; heldBytes = 0; overflowed = false; return out; },
  };
}

export function isSessionLink(x: unknown): x is SessionLink {
  return !!x && (x as Record<symbol, unknown>)[LINK] === true;
}

interface Tracked { event: string; fn: Listener; orig: Listener; prepend: boolean }

export function createSessionLink(first: Socket, initial?: SessionLinkHooks): SessionLink {
  let raw: Socket = first;
  let parked = false;
  let ended = false;
  let hooks: SessionLinkHooks = initial ?? { onDrop: () => 'end' };
  const own = new EventEmitter(); own.setMaxListeners(0);
  const tracked: Tracked[] = [];
  const anys: Listener[] = [];
  const outgoing: Listener[] = [];
  const rooms = new Set<string>();
  const heldOutput = createHeldOutput();
  const live = () => !parked && !ended;

  const rawDisconnect = new WeakMap<Socket, Listener>();
  const bind = (s: Socket) => {
    const r = asRaw(s);
    // Registration order is replayed, so a prepended listener keeps its place.
    for (const t of tracked) { if (t.prepend) r.prependListener(t.event, t.fn); else r.on(t.event, t.fn); }
    for (const f of anys) r.onAny(f);
    for (const f of outgoing) r.onAnyOutgoing(f);
    for (const room of rooms) r.join(room);
    const onDrop: Listener = (reason) => {
      // An old socket, or already parked. Reachable: EventEmitter clones its
      // listener array per emit, so a listener unbound during a dispatch still runs.
      if (s !== raw || ended || parked) return;
      if (hooks.onDrop(String(reason)) === 'park') { parked = true; unbind(s); } else end(String(reason));
    };
    rawDisconnect.set(s, onDrop);
    r.on('disconnect', onDrop);
  };
  const unbind = (s: Socket) => {
    const r = asRaw(s);
    for (const t of tracked) r.off(t.event, t.fn);
    for (const f of anys) r.offAny(f);
    for (const f of outgoing) r.offAnyOutgoing(f);
    const d = rawDisconnect.get(s); if (d) r.off('disconnect', d);
  };
  const hold = heldOutput.hold;
  function end(reason: string): void {
    if (ended) return;
    ended = true; parked = false;
    unbind(raw);
    own.emit('disconnecting', reason);
    own.emit('disconnect', reason);
  }

  const add = (event: string, fn: Listener, prepend: boolean, wrapped?: Listener): SessionLink => {
    if (SESSION_EVENTS.has(event)) { if (prepend) own.prependListener(event, fn); else own.on(event, fn); return proxy; }
    const w = wrapped ?? fn;
    tracked.push({ event, fn: w, orig: fn, prepend });
    if (live()) { if (prepend) asRaw(raw).prependListener(event, w); else asRaw(raw).on(event, w); }
    return proxy;
  };
  const remove = (event: string, fn: Listener): SessionLink => {
    if (SESSION_EVENTS.has(event)) { own.off(event, fn); return proxy; }
    for (let i = tracked.length - 1; i >= 0; i--) {
      const t = tracked[i];
      if (t.event === event && (t.orig === fn || t.fn === fn)) { asRaw(raw).off(event, t.fn); tracked.splice(i, 1); }
    }
    return proxy;
  };
  const emit = (event: string, ...args: unknown[]): boolean => {
    if (ended) return false;
    if (parked) {
      const last = args[args.length - 1];
      hold(event, typeof last === 'function' ? args.slice(0, -1) : args);   // never replay an ack callback
      return true;
    }
    return asRaw(raw).emit(event, ...args);
  };
  const on = (event: string, fn: Listener) => add(event, fn, false);
  const off = remove;

  const members: LinkMembers = {
    emit,
    send: (...args) => { proxy.emit('message', ...args); return proxy; },
    on,
    addListener: on,
    once: (event, fn) => {
      if (SESSION_EVENTS.has(event)) { own.once(event, fn); return proxy; }
      const w: Listener = (...a) => { remove(event, fn); fn(...a); };
      return add(event, fn, false, w);
    },
    prependListener: (event, fn) => add(event, fn, true),
    off,
    removeListener: off,
    removeAllListeners: (event) => {
      for (const t of [...tracked]) if (event === undefined || t.event === event) remove(t.event, t.fn);
      if (event === undefined || SESSION_EVENTS.has(event)) own.removeAllListeners(event);
      return proxy;
    },
    listeners: (event) => SESSION_EVENTS.has(event) ? (own.listeners(event) as Listener[]) : tracked.filter((t) => t.event === event).map((t) => t.orig),
    listenerCount: (event) => members.listeners(event).length,
    onAny: (f) => { anys.push(f); if (live()) asRaw(raw).onAny(f); return proxy; },
    offAny: (f) => { for (const x of [...anys]) if (!f || x === f) { anys.splice(anys.indexOf(x), 1); asRaw(raw).offAny(x); } return proxy; },
    onAnyOutgoing: (f) => { outgoing.push(f); if (live()) asRaw(raw).onAnyOutgoing(f); return proxy; },
    offAnyOutgoing: (f) => { for (const x of [...outgoing]) if (!f || x === f) { outgoing.splice(outgoing.indexOf(x), 1); asRaw(raw).offAnyOutgoing(x); } return proxy; },
    join: (room) => { rooms.add(room); if (live()) asRaw(raw).join(room); },
    leave: (room) => { rooms.delete(room); if (live()) asRaw(raw).leave(room); },
    disconnect: (close) => {
      if (ended) return proxy;
      if (parked) end('server namespace disconnect'); else asRaw(raw).disconnect(close);
      return proxy;
    },
    attach: (next) => {
      if (ended) throw new Error('attach to an ended session link');
      if (next === raw && !parked) return;
      unbind(raw);
      if (raw.connected && raw !== next) asRaw(raw).disconnect(true);  // takeover: unbound first, so we never hear it
      raw = next; parked = false;
      bind(next);
    },
    end,
    takeHeld: heldOutput.take,
    setHooks: (h) => { hooks = h; },
    get raw() { return raw; },
    get parked() { return parked; },
    get ended() { return ended; },
    get id() { return raw.id; },
    get connected() { return live() && raw.connected; },
  };
  Object.defineProperty(members, LINK, { value: true, configurable: true });

  // Two layers, like a socket.io Socket: `members` is the prototype-level base
  // (never written to from outside), `shadow` holds what callers assign ONTO
  // the link (a wrapper installed on `emit`, `session`, `_modemEmulator` ...)
  // - the link's "own properties". hasOwnProperty / delete / Object.keys see
  // only the shadow, so `hadOwn ? restore : delete` code (door.handler.ts,
  // c64-door-adapter.ts) reverts to the base member. An object INHERITING from
  // the link (Object.create(link), the door socket wrapper) that assigns
  // `emit` or `id` gets an own property of its own and never touches the link.
  const shadow = new Map<string | symbol, PropertyDescriptor>();
  const baseMembers = members as unknown as Record<string | symbol, unknown>;
  const rawMembers = (): Record<string | symbol, unknown> => raw as unknown as Record<string | symbol, unknown>;
  const plain = (v: unknown): PropertyDescriptor => ({ value: v, writable: true, enumerable: true, configurable: true });

  const proxy: SessionLink = new Proxy({} as object, {
    get(_t, p, receiver) {
      const d = shadow.get(p);
      if (d) return 'value' in d ? d.value : d.get?.call(receiver);
      if (p in baseMembers) return baseMembers[p];
      if (p in Object.prototype) return Reflect.get(Object.prototype, p, receiver);   // not bound to the raw socket
      const v = rawMembers()[p];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(raw) : v;
    },
    set(_t, p, v, receiver) {
      if (receiver !== proxy) return Reflect.defineProperty(receiver as object, p, plain(v));   // an inheritor owns what it assigns
      const d = shadow.get(p);
      if (d && d.set) { d.set.call(receiver, v); return true; }
      shadow.set(p, plain(v));
      return true;
    },
    has: (_t, p) => shadow.has(p) || p in baseMembers || p in (raw as object),
    getOwnPropertyDescriptor: (_t, p) => { const d = shadow.get(p); return d ? { ...d, configurable: true } : undefined; },
    defineProperty: (_t, p, desc) => {
      if (desc.configurable === false) return false;
      shadow.set(p, { ...desc, configurable: true });
      return true;
    },
    deleteProperty: (_t, p) => { shadow.delete(p); return true; },
    ownKeys: () => [...shadow.keys()],
  }) as unknown as SessionLink;
  bind(first);
  return proxy;
}
