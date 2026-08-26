"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FLAG_RICH = exports.KEYFRAME_INTERVAL = exports.CODEC_VERSION = void 0;
exports.isKeyframeDue = isKeyframeDue;
exports.encodeFrame = encodeFrame;
exports.decodeFrame = decodeFrame;
exports.encodeRichFrame = encodeRichFrame;
exports.decodeRichFrame = decodeRichFrame;
exports.isRichPacket = isRichPacket;
exports.isDeltaPacket = isDeltaPacket;
exports.CODEC_VERSION = 1;
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
exports.KEYFRAME_INTERVAL = 30;
/**
 * Whether this frame must be a full one.
 *
 * True for the very first frame, and every KEYFRAME_INTERVAL after it.
 */
function isKeyframeDue(framesSinceKeyframe, interval = exports.KEYFRAME_INTERVAL) {
    return framesSinceKeyframe <= 0 || framesSinceKeyframe >= interval;
}
const OP_RUN = 0;
const OP_SKIP = 1;
/** The fixed part at the front of every packet. */
const HEADER_BYTES = 8;
/**
 * Encode a frame, as a delta against `previous` when one is given.
 *
 * Pass no previous frame - or one of a different size - to send a full
 * frame. A receiver can always decode a full frame, whatever state it is
 * in, which is what makes recovery possible.
 */
/**
 * Write one plane as RUN/SKIP tokens into `body`, returning the new offset.
 *
 * Shared by the single-plane and two-plane formats: the token stream is the
 * same idea either way, and only the number of planes differs.
 */
function encodePlane(body, start, cells, size, usable) {
    let at = start;
    let i = 0;
    while (i < size) {
        if (usable) {
            let same = 0;
            while (i + same < size && cells[i + same] === usable[i + same])
                same++;
            if (same > 2 || (same > 0 && i + same >= size)) {
                let remaining = same;
                while (remaining > 0) {
                    const chunk = Math.min(remaining, 0xffff);
                    body[at++] = OP_SKIP;
                    body[at++] = chunk & 0xff;
                    body[at++] = (chunk >> 8) & 0xff;
                    remaining -= chunk;
                }
                i += same;
                continue;
            }
        }
        const value = cells[i];
        let run = 1;
        while (i + run < size && cells[i + run] === value && run < 0xff) {
            if (usable && cells[i + run] === usable[i + run]) {
                let same = 0;
                while (i + run + same < size && cells[i + run + same] === usable[i + run + same])
                    same++;
                if (same > 3)
                    break;
            }
            run++;
        }
        body[at++] = OP_RUN;
        body[at++] = run;
        body[at++] = value;
        i += run;
    }
    return at;
}
/** Read one plane's tokens into `cells`, returning the new offset or -1. */
function decodePlane(bytes, start, cells, size) {
    let at = start;
    let i = 0;
    while (i < size) {
        if (at >= bytes.length)
            return -1;
        const op = bytes[at++];
        if (op === OP_SKIP) {
            if (at + 1 >= bytes.length)
                return -1;
            const count = bytes[at++] | (bytes[at++] << 8);
            i += count;
            continue;
        }
        if (op === OP_RUN) {
            if (at + 1 >= bytes.length)
                return -1;
            const count = bytes[at++];
            const value = bytes[at++];
            const end = Math.min(i + count, size);
            for (; i < end; i++)
                cells[i] = value;
            continue;
        }
        return -1;
    }
    return at;
}
function encodeFrame(cells, width, height, mode, previous) {
    const size = width * height;
    const usable = previous && previous.length === size ? previous : null;
    // Worst case: every cell its own RUN token (3 bytes each).
    const body = new Uint8Array(size * 3 + 8);
    let at = 0;
    let i = 0;
    while (i < size) {
        if (usable) {
            // How many cells from here are unchanged?
            let same = 0;
            while (i + same < size && cells[i + same] === usable[i + same])
                same++;
            if (same > 0) {
                // A skip is 3 bytes, so a run of one or two unchanged cells is
                // cheaper to resend than to describe.
                if (same > 2 || i + same >= size) {
                    let remaining = same;
                    while (remaining > 0) {
                        const chunk = Math.min(remaining, 0xffff);
                        body[at++] = OP_SKIP;
                        body[at++] = chunk & 0xff;
                        body[at++] = (chunk >> 8) & 0xff;
                        remaining -= chunk;
                    }
                    i += same;
                    continue;
                }
            }
        }
        // A run of identical cells, up to what one byte of count can hold.
        const value = cells[i];
        let run = 1;
        while (i + run < size && cells[i + run] === value && run < 0xff) {
            // Stop the run where an unchanged stretch worth skipping begins.
            if (usable && cells[i + run] === usable[i + run]) {
                let same = 0;
                while (i + run + same < size && cells[i + run + same] === usable[i + run + same])
                    same++;
                if (same > 3)
                    break;
            }
            run++;
        }
        body[at++] = OP_RUN;
        body[at++] = run;
        body[at++] = value;
        i += run;
    }
    const out = new Uint8Array(HEADER_BYTES + at);
    out[0] = exports.CODEC_VERSION;
    out[1] = mode;
    out[2] = usable ? 1 : 0;
    out[3] = 0; // reserved, keeps the header aligned
    out[4] = width & 0xff;
    out[5] = (width >> 8) & 0xff;
    out[6] = height & 0xff;
    out[7] = (height >> 8) & 0xff;
    out.set(body.subarray(0, at), HEADER_BYTES);
    return out.buffer.slice(0, HEADER_BYTES + at);
}
/**
 * Decode a packet, applying it to the frame the receiver already holds.
 *
 * Returns null for anything it cannot make sense of - a version it does not
 * know, a truncated packet, or a delta against a frame of the wrong size.
 * Dropping one frame is recoverable; drawing a corrupted one is not.
 */
function decodeFrame(buffer, previous) {
    // Binary arrives in different shapes depending on how far it has
    // travelled: an ArrayBuffer in the browser, a Node Buffer on the server.
    // A Node Buffer is a VIEW INTO A SHARED POOL with a byte offset, so
    // reading its `.buffer` gives the whole pool starting at somebody else's
    // data - which is how every packet came out with a bad version byte and
    // was thrown away (2026-08-26). Normalise here, once, rather than at
    // every call site.
    const bytes = buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer);
    if (bytes.byteLength < HEADER_BYTES)
        return null;
    const version = bytes[0];
    if (version !== exports.CODEC_VERSION)
        return null;
    const mode = bytes[1];
    const isDelta = bytes[2] === 1;
    const width = bytes[4] | (bytes[5] << 8);
    const height = bytes[6] | (bytes[7] << 8);
    const size = width * height;
    if (size <= 0)
        return null;
    // A delta needs the frame it was measured against.
    if (isDelta && (!previous || previous.length !== size))
        return null;
    const cells = new Uint8Array(size);
    if (isDelta && previous)
        cells.set(previous);
    let at = HEADER_BYTES;
    let i = 0;
    while (at < bytes.length && i < size) {
        const op = bytes[at++];
        if (op === OP_SKIP) {
            if (at + 1 >= bytes.length)
                return null;
            const count = bytes[at++] | (bytes[at++] << 8);
            i += count;
            continue;
        }
        if (op === OP_RUN) {
            if (at + 1 >= bytes.length)
                return null;
            const count = bytes[at++];
            const value = bytes[at++];
            const end = Math.min(i + count, size);
            for (; i < end; i++)
                cells[i] = value;
            continue;
        }
        // An opcode we do not know means the stream is not what we think it is.
        return null;
    }
    return { version, mode, isDelta, width, height, cells };
}
/** Marks a packet as carrying both planes rather than one. */
exports.FLAG_RICH = 0x02;
/**
 * Encode both planes, so the viewer picks the render mode rather than the
 * sender.
 *
 * The planes are written one after the other, each as its own token stream
 * measured against the matching plane of the previous frame - they change
 * at different rates, and interleaving them would break every run.
 */
function encodeRichFrame(frame, width, height, previous) {
    const size = width * height;
    const usable = previous
        && previous.dots.length === size
        && previous.colors.length === size
        ? previous
        : null;
    const body = new Uint8Array(size * 6 + 16);
    let at = encodePlane(body, 0, frame.dots, size, usable ? usable.dots : null);
    at = encodePlane(body, at, frame.colors, size, usable ? usable.colors : null);
    const out = new Uint8Array(HEADER_BYTES + at);
    out[0] = exports.CODEC_VERSION;
    out[1] = 0; // mode is the viewer's business now
    out[2] = (usable ? 1 : 0) | exports.FLAG_RICH;
    out[3] = 0;
    out[4] = width & 0xff;
    out[5] = (width >> 8) & 0xff;
    out[6] = height & 0xff;
    out[7] = (height >> 8) & 0xff;
    out.set(body.subarray(0, at), HEADER_BYTES);
    return out.buffer.slice(0, HEADER_BYTES + at);
}
/** Decode a two-plane packet against the frame the receiver already holds. */
function decodeRichFrame(buffer, previous) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.byteLength < HEADER_BYTES)
        return null;
    if (bytes[0] !== exports.CODEC_VERSION)
        return null;
    if ((bytes[2] & exports.FLAG_RICH) === 0)
        return null;
    const isDelta = (bytes[2] & 1) === 1;
    const width = bytes[4] | (bytes[5] << 8);
    const height = bytes[6] | (bytes[7] << 8);
    const size = width * height;
    if (size <= 0)
        return null;
    const usable = previous
        && previous.dots.length === size
        && previous.colors.length === size
        ? previous
        : null;
    if (isDelta && !usable)
        return null;
    const dots = new Uint8Array(size);
    const colors = new Uint8Array(size);
    if (usable) {
        dots.set(usable.dots);
        colors.set(usable.colors);
    }
    let at = decodePlane(bytes, HEADER_BYTES, dots, size);
    if (at < 0)
        return null;
    at = decodePlane(bytes, at, colors, size);
    if (at < 0)
        return null;
    return { isDelta, width, height, frame: { dots, colors } };
}
/** Whether a packet carries both planes. */
function isRichPacket(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return bytes.byteLength >= HEADER_BYTES && (bytes[2] & exports.FLAG_RICH) !== 0;
}
/** Whether a packet claims to be a delta, without decoding it. */
function isDeltaPacket(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return bytes.byteLength >= HEADER_BYTES && bytes[2] === 1;
}
