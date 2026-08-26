/**
 * Voice audio as plain samples.
 *
 * Peer voice had never been audible. MediaRecorder with a chunk interval
 * produces one continuous WebM stream cut into fragments, only the first of
 * which carries the container headers - and the receiver tried to decode
 * each fragment on its own. Every fragment after the first failed, and the
 * fallback made an <audio> element per failed fragment until Chrome refused
 * to create more:
 *
 *   "Blocked attempt to create a WebMediaPlayer as there are too many
 *    WebMediaPlayers already in existence"
 *
 * at which point the tab froze. Samples carry no container, so a packet in
 * the middle of a stream is as playable as the first one.
 */

import {
  VOICE_SAMPLE_RATE,
  downsample,
  floatToInt16,
  int16ToFloat,
  encodePcm,
  decodePcm,
  rms,
  scheduleStart,
} from '../../../../sdk/media/pcm';

/** A sine wave, as a microphone would deliver it. */
function tone(frequency: number, sampleRate: number, samples: number): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5;
  }
  return out;
}

describe('voice pcm', () => {
  describe('downsample', () => {
    it('reduces 48 kHz to the voice rate', () => {
      const input = tone(440, 48000, 4800);
      const out = downsample(input, 48000, 16000);

      expect(out.length).toBe(1600);
    });

    it('leaves a buffer alone when it is already at the target rate', () => {
      const input = tone(440, 16000, 1600);
      expect(downsample(input, 16000, 16000)).toBe(input);
    });

    it('never upsamples', () => {
      const input = tone(440, 8000, 800);
      expect(downsample(input, 8000, 16000)).toBe(input);
    });

    it('survives an empty buffer', () => {
      expect(downsample(new Float32Array(0), 48000, 16000).length).toBe(0);
    });

    it('keeps the signal, rather than just its first samples', () => {
      // Averaging, not decimation: a decimating downsampler aliases high
      // frequencies into the voice band and rings on sibilants.
      const input = tone(200, 48000, 4800);
      const out = downsample(input, 48000, 16000);

      expect(rms(out)).toBeGreaterThan(0.2);
      expect(rms(out)).toBeLessThan(0.5);
    });
  });

  describe('float and int16', () => {
    it('round-trips a signal nearly unchanged', () => {
      const input = tone(440, 16000, 1600);
      const back = int16ToFloat(floatToInt16(input));

      for (let i = 0; i < input.length; i++) {
        expect(Math.abs(back[i] - input[i])).toBeLessThan(0.0001);
      }
    });

    it('clamps a sample past full scale instead of wrapping it', () => {
      // Wrapping turns a loud moment into a click at the opposite polarity.
      const loud = new Float32Array([2, -2]);
      const out = floatToInt16(loud);

      expect(out[0]).toBe(32767);
      expect(out[1]).toBe(-32768);
    });

    it('keeps silence silent', () => {
      const out = floatToInt16(new Float32Array(64));
      expect(Array.from(out).every(v => v === 0)).toBe(true);
    });
  });

  describe('wire format', () => {
    it('round-trips a packet', () => {
      const samples = floatToInt16(tone(440, VOICE_SAMPLE_RATE, 320));
      const decoded = decodePcm(encodePcm(samples));

      expect(decoded.length).toBe(samples.length);
      expect(Array.from(decoded)).toEqual(Array.from(samples));
    });

    it('sends only the samples, not the buffer they came from', () => {
      // A view over a bigger pool would put the whole pool on the wire.
      const pool = new Int16Array(4096);
      const view = pool.subarray(0, 320);
      expect(encodePcm(view).byteLength).toBe(640);
    });

    it('plays what it can of a truncated packet instead of dropping it', () => {
      const samples = floatToInt16(tone(440, VOICE_SAMPLE_RATE, 100));
      const truncated = encodePcm(samples).slice(0, 199); // odd byte count

      expect(decodePcm(truncated).length).toBe(99);
    });

    it('handles an empty packet without throwing', () => {
      expect(decodePcm(new ArrayBuffer(0)).length).toBe(0);
    });

    it('costs about 32 KB per second at the voice rate', () => {
      // The tradeoff this design makes, stated in a test so it cannot drift
      // unnoticed: more bandwidth than Opus, in exchange for audio that
      // works at all and works on Safari.
      const oneSecond = floatToInt16(new Float32Array(VOICE_SAMPLE_RATE));
      expect(encodePcm(oneSecond).byteLength).toBe(32000);
    });
  });

  describe('scheduling playback', () => {
    const LEAD = 0.08;
    const MAX = 0.4;

    it('starts a lead ahead of the playhead, not immediately', () => {
      // Starting exactly at `now` leaves no room for the next packet to be
      // late, and a late packet is an audible gap - heard as a stuttery,
      // robotic voice.
      expect(scheduleStart(0, 10, LEAD, MAX)).toBeCloseTo(10.08);
    });

    it('queues the next packet where the last one ended', () => {
      // Consecutive packets must be gapless, or speech clicks between them.
      expect(scheduleStart(10.5, 10.2, LEAD, MAX)).toBe(10.5);
    });

    it('restarts at the lead after falling behind', () => {
      // A gap in the network: catching up by playing a backlog only adds
      // delay, so the queue restarts rather than chases.
      expect(scheduleStart(9.0, 10, LEAD, MAX)).toBeCloseTo(10.08);
    });

    it('pulls back a queue that has run too far ahead', () => {
      // Otherwise the listener falls further behind the speaker forever.
      expect(scheduleStart(11.0, 10, LEAD, MAX)).toBeCloseTo(10.08);
    });

    it('keeps latency within the lead and the cap', () => {
      let queued = 0;
      for (let i = 0; i < 200; i++) {
        const now = i * 0.0426;
        queued = scheduleStart(queued, now, LEAD, MAX) + 0.0426;
        expect(queued - now).toBeLessThanOrEqual(MAX + 0.05);
      }
    });
  });

  describe('rms', () => {
    it('is zero for silence', () => {
      expect(rms(new Float32Array(128))).toBe(0);
    });

    it('rises with loudness', () => {
      const quiet = tone(440, 16000, 1600);
      const loud = new Float32Array(quiet.map(v => v * 2));

      expect(rms(loud)).toBeGreaterThan(rms(quiet));
    });

    it('survives an empty buffer', () => {
      expect(rms(new Float32Array(0))).toBe(0);
    });
  });
});
