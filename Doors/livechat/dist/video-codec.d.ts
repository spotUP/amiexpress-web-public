/**
 * Putting a frame on the wire in as few bytes as it deserves.
 *
 * A frame is one byte per cell (see video-cells.ts), and most of those
 * bytes repeat: neighbouring cells share a colour, and between one frame
 * and the next most cells do not change at all. Two tokens express both
 * facts:
 *
 *   RUN  count, value   - this many cells, all the same
 *   SKIP count          - this many cells unchanged from the last frame
 *
 * A full frame is a stream with no SKIPs, so there is one format rather
 * than two, and a decoder that has lost sync can always be resynchronised
 * by sending one.
 *
 * For scale: the old markup format cost 24 bytes each time the colour
 * changed and sent the whole picture every time. A 146x46 tile came to
 * 21 KB a frame, which against the client's byte budget was two frames a
 * second.
 *
 * Pure: bytes in, bytes out.
 */
import type { CellFrame, RichFrame } from './video-cells';
export declare const CODEC_VERSION = 1;
/**
 * How often a full frame is sent, however little has changed.
 *
 * Deltas are computed against the SENDER's last frame and broadcast to
 * everyone, but each receiver keeps its own copy - and the two can drift.
 * A viewer who joined mid-stream never had the frame the delta is measured
 * against; a viewer who dropped a packet never applied it. From then on
 * every delta lands on the wrong base, and the cells a delta does not touch
 * keep showing whatever was there before. Reported as "old frames linger",
 * and it never repairs itself, because nothing ever describes those cells
 * again.
 *
 * A full frame every so often is what makes it self-healing: whatever state
 * a receiver is in, the next keyframe puts it right. Thirty frames is about
 * three seconds at ten frames a second, and costs one full frame - a couple
 * of kilobytes - to bound the damage of any loss to that window.
 */
export declare const KEYFRAME_INTERVAL = 30;
/**
 * Whether this frame must be a full one.
 *
 * True for the very first frame, and every KEYFRAME_INTERVAL after it.
 */
export declare function isKeyframeDue(framesSinceKeyframe: number, interval?: number): boolean;
export interface FramePacket {
    version: number;
    mode: number;
    /** A delta only makes sense against the frame the receiver already has. */
    isDelta: boolean;
    width: number;
    height: number;
    cells: CellFrame;
}
export declare function encodeFrame(cells: CellFrame, width: number, height: number, mode: number, previous?: CellFrame | null): ArrayBuffer;
/**
 * Decode a packet, applying it to the frame the receiver already holds.
 *
 * Returns null for anything it cannot make sense of - a version it does not
 * know, a truncated packet, or a delta against a frame of the wrong size.
 * Dropping one frame is recoverable; drawing a corrupted one is not.
 */
export declare function decodeFrame(buffer: ArrayBuffer | Uint8Array, previous?: CellFrame | null): FramePacket | null;
/** Marks a packet as carrying both planes rather than one. */
export declare const FLAG_RICH = 2;
export interface RichPacket {
    isDelta: boolean;
    width: number;
    height: number;
    frame: RichFrame;
}
/**
 * Encode both planes, so the viewer picks the render mode rather than the
 * sender.
 *
 * The planes are written one after the other, each as its own token stream
 * measured against the matching plane of the previous frame - they change
 * at different rates, and interleaving them would break every run.
 */
export declare function encodeRichFrame(frame: RichFrame, width: number, height: number, previous?: RichFrame | null): ArrayBuffer;
/** Decode a two-plane packet against the frame the receiver already holds. */
export declare function decodeRichFrame(buffer: ArrayBuffer | Uint8Array, previous?: RichFrame | null): RichPacket | null;
/** Whether a packet carries both planes. */
export declare function isRichPacket(buffer: ArrayBuffer | Uint8Array): boolean;
/** Whether a packet claims to be a delta, without decoding it. */
export declare function isDeltaPacket(buffer: ArrayBuffer | Uint8Array): boolean;
