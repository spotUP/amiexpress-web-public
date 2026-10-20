/**
 * Clip frame encoding, off the board's event loop.
 *
 * One ffmpeg frame becomes one rich frame packet: the SDK converter picks a
 * glyph, foreground and background per cell, then the packet is delta-coded
 * against the previous frame. That costs about 50 ms per 80x24 frame, and
 * ffmpeg delivers frames faster than real time, so run on the main thread it
 * held the loop in bursts of seconds: the player's ticks (and every other
 * caller on the board) stalled, frames were skipped, and the clip played at a
 * few frames a second (2026-10-20, 147 s portrait clip: 58 of 603 ticks over
 * 150 ms, the longest gap 4 s).
 *
 * So each clip run gets its own worker thread holding the converter's state.
 * The backend runs from TypeScript source under tsx, and a worker does not
 * inherit tsx's CommonJS hooks, so the worker is started from a two-line
 * bootstrap that registers `tsx/cjs` first and then loads the worker module
 * (the same reason the event-loop watchdog starts its worker from source).
 */

import * as path from 'path';
import { Worker } from 'worker_threads';
import {
  createTemporalState,
  encodeRichFrame,
  frameToAnsiCells,
  isKeyframeDue,
  type AnsiCellGrid,
  type RichFrame,
} from '@amiexpress/bbs-door-sdk/media/ascii';
import type { ClipRequest } from '@amiexpress/bbs-door-sdk/formats/magazine-video';

export interface EncoderOptions {
  /** Source picture size in pixels (what ffmpeg scales to). */
  width: number;
  height: number;
  cols: number;
  rows: number;
  palette: ClipRequest['palette'];
  /** Frames between keyframes; Infinity = only the first frame. */
  keyframeInterval: number;
}

/** Turns RGB frames into packets, in order. */
export interface FrameEncoder {
  encode(px: Uint8Array): Promise<Uint8Array>;
  close(): void;
}

function cellsToFrame(grid: AnsiCellGrid, cols: number, rows: number): RichFrame {
  const dots = new Uint8Array(cols * rows);
  const colors = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = grid[y][x];
      dots[y * cols + x] = c.char.charCodeAt(0) & 0xff;
      colors[y * cols + x] = (c.fg & 15) | ((c.bg & 15) << 4);
    }
  }
  return { dots, colors };
}

/** The per-clip conversion state machine; synchronous, run inside the worker. */
export function createFrameCoder(opts: EncoderOptions): (px: Uint8Array) => Uint8Array {
  const state = createTemporalState();
  let prev: RichFrame | null = null;
  let sinceKey = 0;
  return (px) => {
    const grid = frameToAnsiCells({ data: px, width: opts.width, height: opts.height }, opts.cols, opts.rows, {
      palette: opts.palette, state,
    });
    const frame = cellsToFrame(grid, opts.cols, opts.rows);
    const key = isKeyframeDue(sinceKey, opts.keyframeInterval);
    const pkt = encodeRichFrame(frame, opts.cols, opts.rows, key ? null : prev);
    sinceKey = key ? 1 : sinceKey + 1;
    prev = frame;
    return new Uint8Array(pkt);
  };
}

const WORKER_FILE = path.join(__dirname, 'video-encoder.worker.ts');

/**
 * The production encoder: a worker thread per clip. Replies come back in the
 * order the frames went in (one worker, one message queue), so the pending
 * promises settle first in, first out.
 */
export function workerEncoder(opts: EncoderOptions): FrameEncoder {
  const boot = `require(${JSON.stringify(require.resolve('tsx/cjs'))}); require(${JSON.stringify(WORKER_FILE)});`;
  const worker = new Worker(boot, { eval: true, workerData: opts });
  const waiting: Array<{ resolve: (pkt: Uint8Array) => void; reject: (e: Error) => void }> = [];
  const failAll = (e: Error): void => { for (const w of waiting.splice(0)) w.reject(e); };
  worker.on('message', (msg: Uint8Array | { error: string }) => {
    const w = waiting.shift();
    if (!w) return;
    if (ArrayBuffer.isView(msg)) w.resolve(msg);
    else w.reject(new Error(msg.error));
  });
  worker.on('error', failAll);
  worker.on('exit', () => failAll(new Error('encoder worker exited')));
  return {
    encode(px) {
      return new Promise((resolve, reject) => {
        waiting.push({ resolve, reject });
        worker.postMessage(px, [px.buffer as ArrayBuffer]);
      });
    },
    close() { void worker.terminate(); },
  };
}
