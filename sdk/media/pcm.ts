/**
 * Voice audio as plain samples.
 *
 * Voice was carried as WebM/Opus produced by MediaRecorder with a chunk
 * interval - which is ONE continuous stream cut into fragments, where only
 * the first carries the container headers. The receiver tried to decode
 * each fragment on its own, so every fragment after the first failed:
 * decodeAudioData decodes complete files, and an <audio> element fed the
 * same headerless bytes fails identically. Peer audio was never once
 * audible, and the per-fragment fallback element burned a WebMediaPlayer
 * each time until Chrome refused to make more and the tab froze.
 *
 * Samples have no container and no headers, so there is nothing to lose in
 * the middle of a stream: any packet stands alone and plays. That also
 * means no media elements at all, which is what makes the crash
 * structurally impossible rather than merely fixed.
 *
 * The cost is bandwidth - 16 kHz mono Int16 is about 32 KB/s per speaker,
 * against roughly 8 KB/s for Opus. Voice does not need more than 16 kHz
 * (telephony gets by on 8), and it buys audio that works on Safari and iOS,
 * where WebM does not exist.
 *
 * Everything here is pure: samples in, samples out. No DOM, no Web Audio.
 */

/** Sample rate we transmit at. Voice needs no more; halving it is an option. */
export const VOICE_SAMPLE_RATE = 16000;

/**
 * Reduce a Float32 buffer to `targetRate`, averaging the samples that fall
 * into each output slot.
 *
 * Averaging rather than picking every Nth sample: dropping samples aliases
 * high frequencies down into the voice band, which sounds like a metallic
 * ring on sibilants. This is a cheap low-pass and costs one add per sample.
 */
export function downsample(
  input: Float32Array,
  inputRate: number,
  targetRate: number = VOICE_SAMPLE_RATE
): Float32Array {
  if (targetRate >= inputRate || input.length === 0) return input;

  const ratio = inputRate / targetRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }

  return out;
}

/**
 * A downsampler that survives across capture blocks.
 *
 * `downsample()` above treats its input as a whole signal, and capture does
 * not have one: a ScriptProcessorNode hands over 2048 frames at a time. 2048
 * does not divide by the 48k -> 16k ratio of 3, so downsampling each block on
 * its own emitted floor(2048/3) = 682 samples, consumed 2046 frames, and
 * discarded the last 2. Measured: 58.6 ms of audio never sent per minute, and
 * a step in the waveform at every block join - 23 of them a second, which is
 * a buzz sitting under the speech rather than a gap in it.
 *
 * This keeps the leftover input and the running output position between
 * calls, so the window boundaries continue across blocks exactly as they
 * would in one continuous pass, and nothing is thrown away.
 *
 * Averaging, sample counts and the pass-through when no reduction is needed
 * all match `downsample()` - the two must agree, and a test holds them to it.
 */
export interface BlockDownsampler {
  /** Reduce one capture block, carrying the remainder into the next call. */
  process(block: Float32Array): Float32Array;
  /** Forget the carried samples - for reopening the microphone. */
  reset(): void;
}

export function createBlockDownsampler(
  inputRate: number,
  targetRate: number = VOICE_SAMPLE_RATE
): BlockDownsampler {
  const ratio = inputRate / targetRate;

  /** Input samples received but not yet consumed by a full output window. */
  let carry = new Float32Array(0);
  /** Global input index that `carry[0]` corresponds to. */
  let carryStart = 0;
  /** Index of the next output sample, in the continuous output stream. */
  let outIndex = 0;

  return {
    process(block: Float32Array): Float32Array {
      if (ratio <= 1 || block.length === 0) return block;

      const buf = new Float32Array(carry.length + block.length);
      buf.set(carry);
      buf.set(block, carry.length);
      const availableEnd = carryStart + buf.length;

      // Emit only windows whose input has fully arrived. A partial window
      // waits for the next block instead of being averaged short, which is
      // what put a step at every join.
      const out: number[] = [];
      for (;;) {
        const start = Math.floor(outIndex * ratio);
        const end = Math.floor((outIndex + 1) * ratio);
        if (end > availableEnd) break;
        let sum = 0;
        let count = 0;
        for (let j = start; j < end; j++) {
          sum += buf[j - carryStart];
          count++;
        }
        out.push(count > 0 ? sum / count : 0);
        outIndex++;
      }

      const nextStart = Math.floor(outIndex * ratio);
      carry = buf.slice(Math.max(0, nextStart - carryStart));
      carryStart = nextStart;

      return Float32Array.from(out);
    },

    reset(): void {
      carry = new Float32Array(0);
      carryStart = 0;
      outIndex = 0;
    },
  };
}

/**
 * Float samples (-1..1) to signed 16-bit, which is half the bytes and all
 * the fidelity a voice call can use.
 *
 * Clamped: a sample past 1.0 would otherwise wrap to a large negative value
 * and arrive as a click.
 */
export function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = input[i] < -1 ? -1 : input[i] > 1 ? 1 : input[i];
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Signed 16-bit back to floats, for handing to Web Audio. */
export function int16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] < 0 ? input[i] / 0x8000 : input[i] / 0x7fff;
  }
  return out;
}

/** Root mean square of a buffer: how loud it is, 0..1. */
export function rms(input: Float32Array): number {
  if (input.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  return Math.sqrt(sum / input.length);
}

/**
 * Pack samples for the wire, and unpack them at the other end.
 *
 * A plain ArrayBuffer of Int16 little-endian. The sample rate travels in
 * the socket payload beside it rather than in a header, so there is no
 * format to get out of sync with.
 */
export function encodePcm(samples: Int16Array): ArrayBuffer {
  // Copy into a buffer of exactly the right length: a view over a larger
  // pool would otherwise send the whole pool.
  const out = new Int16Array(samples.length);
  out.set(samples);
  return out.buffer;
}

export function decodePcm(buffer: ArrayBuffer): Int16Array {
  // An odd byte count cannot be whole samples - a truncated packet. Take
  // the samples that are complete rather than throwing away the audio.
  const usable = buffer.byteLength - (buffer.byteLength % 2);
  return new Int16Array(buffer.slice(0, usable));
}

/**
 * When the next packet of somebody's speech should start playing.
 *
 * Packets carry about 42ms of audio each and cross a network while the main
 * thread is busy encoding video, so some arrive late. Scheduling each one to
 * begin exactly where the last ended leaves no room for that: a late packet
 * leaves a gap, which is heard as a click, and the stream comes out stuttery
 * and robotic.
 *
 * So playback runs a little behind the speaker - a lead the queue can be
 * consumed from while the next packet is in flight. Two rules keep it there:
 * fallen behind, restart at the lead; run too far ahead, drop back to it,
 * because a queue that keeps growing is delay that never comes back.
 *
 * Pure, so the arithmetic can be tested without an audio device.
 */
export function scheduleStart(
  queuedUntil: number,
  now: number,
  leadSeconds: number,
  maxQueueSeconds: number
): number {
  const earliest = now + leadSeconds;
  if (queuedUntil < earliest) return earliest;
  if (queuedUntil > now + maxQueueSeconds) return earliest;
  return queuedUntil;
}
