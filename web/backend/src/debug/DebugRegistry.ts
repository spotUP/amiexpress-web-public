/**
 * DebugRegistry — per-node registry of live AmigaDoorSession instances.
 *
 * The BBS already keeps a socket/session registry in server/session-manager.ts,
 * but the running 68K emulator, DoorLoader, and XIM message history live
 * inside individual AmigaDoorSession instances that currently go out of scope
 * as soon as door.handler.ts's launcher function returns. This registry
 * captures those references by nodeId so an out-of-band debugger (HTTP/MCP)
 * can introspect what a running door is doing.
 *
 * Entries are added by AmigaDoorSession.constructor() and removed by
 * AmigaDoorSession.terminate().
 *
 * Only used when NODE_ENV !== 'production'. Safe to import anywhere; no-op
 * on production unless something explicitly calls register().
 */

import type { MoiraEmulator } from "../amiga-emulation/cpu/MoiraEmulator.js";
import type { DoorLoader } from "../amiga-emulation/DoorLoader.js";
import type { DoorLifecycleManager } from "../amiga-emulation/session/DoorLifecycleManager.js";
import type { Socket } from "socket.io";

/** One captured XIM message for the ring buffer */
export interface XIMRingEntry {
  timestampMs: number;
  direction: "rx" | "tx";
  cmd: number;
  cmdName: string;
  data: number;
  node: number;
  line: number;
  str: string;
}

export interface DoorDebugInfo {
  nodeId: number;
  doorId: string;
  executablePath: string;
  startedAtMs: number;
  emulator: MoiraEmulator;
  doorLoader: DoorLoader;
  lifecycleManager: DoorLifecycleManager;
  socket: Socket;
  /**
   * Ring buffer of recent XIM messages. AmigaDoorSession / XIMProtocol
   * should push into this; MCP tools read from it.
   */
  ximRing: XIMRingEntry[];
  /** Maximum entries retained in ximRing */
  ximRingCapacity: number;
}

class DebugRegistry {
  private sessions = new Map<number, DoorDebugInfo>();
  private listeners = new Set<(sessions: DoorDebugInfo[]) => void>();

  register(info: DoorDebugInfo): void {
    this.sessions.set(info.nodeId, info);
    this.notify();
  }

  unregister(nodeId: number): void {
    if (this.sessions.delete(nodeId)) {
      this.notify();
    }
  }

  get(nodeId: number): DoorDebugInfo | undefined {
    return this.sessions.get(nodeId);
  }

  list(): DoorDebugInfo[] {
    return Array.from(this.sessions.values());
  }

  /** Push a decoded XIM message onto a session's ring buffer. */
  pushXIM(nodeId: number, entry: XIMRingEntry): void {
    const info = this.sessions.get(nodeId);
    if (!info) return;
    info.ximRing.push(entry);
    while (info.ximRing.length > info.ximRingCapacity) {
      info.ximRing.shift();
    }
  }

  /** Subscribe to registry changes (used by HTTP SSE or test harnesses). */
  subscribe(fn: (sessions: DoorDebugInfo[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.list();
    for (const l of this.listeners) {
      try {
        l(snapshot);
      } catch {
        /* swallow — one bad listener shouldn't break the rest */
      }
    }
  }
}

export const debugRegistry = new DebugRegistry();
