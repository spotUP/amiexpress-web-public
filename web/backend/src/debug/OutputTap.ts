/**
 * OutputTap — per-node ring buffer capturing everything the backend sends to
 * a user's terminal via `socket.emit('ansi-output', ...)`.
 *
 * Hooked into the socket at `registerSocketHandlers` time via a thin emit
 * interceptor. Enabled only when NODE_ENV !== 'production'. No behavioural
 * change to the actual socket traffic — we just tee a copy into the ring.
 *
 * Lets the debug MCP tell an operator "here's exactly what the user just
 * saw on their terminal", without needing to paste screen dumps.
 */

export interface OutputEntry {
  timestampMs: number;
  /** Raw ANSI/UTF-8 text exactly as sent to the client. */
  text: string;
}

class OutputTap {
  private buffers = new Map<number, OutputEntry[]>();
  private capacity = 400;
  /**
   * Per-node total bytes captured since the ring started (may exceed what's
   * still buffered). Useful for "how chatty is this node".
   */
  private totals = new Map<number, number>();

  push(nodeId: number, text: string): void {
    if (!nodeId || nodeId <= 0 || !text) return;
    let ring = this.buffers.get(nodeId);
    if (!ring) {
      ring = [];
      this.buffers.set(nodeId, ring);
    }
    ring.push({ timestampMs: Date.now(), text });
    while (ring.length > this.capacity) ring.shift();
    this.totals.set(nodeId, (this.totals.get(nodeId) ?? 0) + text.length);
  }

  /** Last N entries for a node (newest-last). Empty if nothing captured. */
  get(nodeId: number, n: number): OutputEntry[] {
    const ring = this.buffers.get(nodeId) ?? [];
    const count = Math.min(Math.max(n, 1), ring.length);
    return ring.slice(-count);
  }

  totalBytes(nodeId: number): number {
    return this.totals.get(nodeId) ?? 0;
  }

  bufferedCount(nodeId: number): number {
    return this.buffers.get(nodeId)?.length ?? 0;
  }

  getCapacity(): number {
    return this.capacity;
  }

  /** Drop a node's buffer (e.g. on disconnect). */
  clear(nodeId: number): void {
    this.buffers.delete(nodeId);
    this.totals.delete(nodeId);
  }
}

export const outputTap = new OutputTap();
