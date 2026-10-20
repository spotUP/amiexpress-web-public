/**
 * Worker side of `workerEncoder` (video-encoder.ts): one clip's frames in,
 * packets out, in order.
 */

import { parentPort, workerData } from 'worker_threads';
import { createFrameCoder, type EncoderOptions } from './video-encoder';

const code = createFrameCoder(workerData as EncoderOptions);

parentPort?.on('message', (px: Uint8Array) => {
  try {
    const pkt = code(px);
    parentPort?.postMessage(pkt, [pkt.buffer as ArrayBuffer]);
  } catch (e) {
    parentPort?.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
});
