import { EventEmitter } from 'events';
import {
  VOICE_SAMPLE_RATE,
  createBlockDownsampler,
  type BlockDownsampler,
  floatToInt16,
  int16ToFloat,
  decodePcm,
  encodePcm,
  scheduleStart,
} from './pcm';

/**
 * How far ahead of the playhead a packet is scheduled.
 *
 * Absorbs late arrivals: without it a packet that misses its slot leaves an
 * audible gap. Roughly two packets' worth, which is enough for ordinary
 * network and main-thread jitter without a conversational delay anybody
 * notices.
 */
const JITTER_LEAD_SECONDS = 0.08;

/**
 * How far ahead the queue may run before it is pulled back.
 *
 * A queue that keeps growing is latency that never comes back - the
 * listener falls further behind the speaker with every packet.
 */
const MAX_QUEUE_SECONDS = 0.4;

export interface VoiceCaptureOptions {
  /**
   * Which input to open. Omitted means the system default - which is not
   * necessarily a microphone: a machine with BlackHole, Loopback or an
   * aggregate device can default to system audio, and the call then
   * transmits whatever is playing instead of the person talking.
   */
  deviceId?: string;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  sampleRate?: number;
  bitrate?: number;
  chunkIntervalMs?: number;
}

/**
 * Browser-side mic capture and playback for door voice chat.
 * Pairs with the server-side sdk/media/Audio.ts.
 *
 * Usage:
 *   const vc = new VoiceCapture(door);
 *   vc.on('speaking', (s: boolean) => ...);
 *   vc.on('level', (l: number) => ...);
 *   // Server calls session.bbs.audio.startStreaming() to trigger start().
 *   vc.destroy(); // on cleanup
 */
export class VoiceCapture extends EventEmitter {
  private door: any; // ClientDoor -- typed as any to avoid circular import
  private opts: Required<VoiceCaptureOptions>;
  private mediaStream: MediaStream | null = null;
  private captureNode: ScriptProcessorNode | null = null;
  private downsampler: BlockDownsampler | null = null;
  private audioContext: AudioContext | null = null;
  private playbackContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private levelInterval: ReturnType<typeof setInterval> | null = null;
  private audioPlayers = new Map<string | number, {
    gainNode: GainNode;
    source: AudioBufferSourceNode | null;
    /** When the next packet from this speaker should start. */
    nextTime: number;
  }>();
  private _isMuted = false;
  private lastSpeaking = false;
  private doorListeners: Array<[string, (...args: any[]) => void]> = [];

  constructor(door: any, options?: VoiceCaptureOptions) {
    super();
    this.door = door;
    this.opts = {
      echoCancellation: options?.echoCancellation ?? true,
      noiseSuppression: options?.noiseSuppression ?? true,
      autoGainControl: options?.autoGainControl ?? true,
      deviceId: options?.deviceId ?? '',
      sampleRate: options?.sampleRate ?? 48000,
      bitrate: options?.bitrate ?? 32000,
      chunkIntervalMs: options?.chunkIntervalMs ?? 100,
    };
    this.bindDoorEvents();
  }

  get isMuted(): boolean { return this._isMuted; }

  private bindDoorEvents(): void {
    const onStart = (opts?: VoiceCaptureOptions) => void this.start(opts);
    const onStop = () => this.stop();
    const onMuteCmd = (data: { muted: boolean }) => {
      if (data.muted) this._applyMute(true); else this._applyMute(false);
    };
    const onData = (data: { userId: string | number; chunk: ArrayBuffer }) =>
      void this.playChunk(data.userId, data.chunk);
    const onSelectDevice = (data: { deviceId: string }) =>
      void this.selectDevice(data?.deviceId);

    this.door.on('audio:start-streaming', onStart);
    this.door.on('audio:stop-streaming', onStop);
    this.door.on('audio:mute', onMuteCmd);
    this.door.on('audio:data', onData);
    this.door.on('audio:select-device', onSelectDevice);
    this.doorListeners.push(
      ['audio:start-streaming', onStart],
      ['audio:stop-streaming', onStop],
      ['audio:mute', onMuteCmd],
      ['audio:data', onData],
      ['audio:select-device', onSelectDevice],
    );
  }

  async start(opts?: VoiceCaptureOptions): Promise<void> {
    if (this.mediaStream) return;
    try {
      const o = { ...this.opts, ...opts };
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(o.deviceId ? { deviceId: { exact: o.deviceId } } : {}),
          sampleRate: o.sampleRate,
          echoCancellation: o.echoCancellation,
          noiseSuppression: o.noiseSuppression,
          autoGainControl: o.autoGainControl,
          channelCount: 1,
        },
        video: false,
      });

      // Say WHICH device we actually got.
      //
      // No deviceId is requested, so the browser hands over the system's
      // default input - and on a machine with a loopback or aggregate
      // device (BlackHole, Loopback, Soundflower) that default can be
      // system audio rather than a microphone. The meter then follows
      // whatever is playing instead of the person talking, which is
      // indistinguishable from a broken meter unless the device says its
      // name.
      // Publish what else is available, so the choice can be changed
      // without going through the operating system's settings.
      void this.publishInputDevices();

      const track = this.mediaStream.getAudioTracks()[0];
      if (track) {
        const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
        const label = track.label || 'unnamed device';
        console.log('[VoiceCapture] microphone:', label, settings);
        this.emit('device', { label: track.label, settings });
        this.door.emit('audio:device', { label: track.label, settings });
      }

      this.audioContext = new AudioContext();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyserNode);

      // Raw samples, not MediaRecorder.
      //
      // MediaRecorder with a chunk interval produces one continuous WebM
      // stream cut into fragments, and only the first fragment carries the
      // container headers. The receiver decoded each fragment on its own,
      // so every fragment after the first failed and peer audio was never
      // audible - while the fallback path burned a media element per
      // fragment until the browser refused to make more.
      //
      // Samples have no container to lose: every packet stands alone.
      //
      // ScriptProcessorNode rather than AudioWorklet because a worklet
      // needs a separately-served module, and this code ships inside a
      // bundle. It is deprecated but works everywhere the BBS runs,
      // Safari and iOS included. 2048 frames is ~43ms at 48kHz - small
      // enough for conversation, large enough not to thrash.
      // The rate is read ONCE, here, not inside the callback.
      //
      // A ScriptProcessorNode can fire after stop() has torn the graph down,
      // and reaching for this.audioContext.sampleRate at that moment threw
      // "Cannot read properties of null (reading 'sampleRate')" - which,
      // being an uncaught error inside an audio callback, took the whole
      // capture with it.
      const sampleRate = this.audioContext.sampleRate;

      // One downsampler for the whole session, not one per block.
      //
      // 2048 frames do not divide by the 48k -> 16k ratio of 3, so
      // downsampling each block on its own consumed 2046 frames and threw the
      // last 2 away: 58.6 ms of audio never sent per minute, and a step in
      // the waveform at every block join, 23 times a second. This carries the
      // remainder into the next block.
      this.downsampler = createBlockDownsampler(sampleRate, VOICE_SAMPLE_RATE);

      this.captureNode = this.audioContext.createScriptProcessor(2048, 1, 1);
      this.captureNode.onaudioprocess = (ev) => {
        if (this._isMuted || !this.captureNode || !this.downsampler) return;
        try {
          const input = ev.inputBuffer.getChannelData(0);
          const reduced = this.downsampler.process(input);
          if (reduced.length === 0) return;
          this.door.emit('audio:data', encodePcm(floatToInt16(reduced)));
        } catch (err) {
          // One bad buffer must not end the call.
          this.emit('error', err instanceof Error ? err : new Error(String(err)));
        }
      };
      this.sourceNode.connect(this.captureNode);
      // A ScriptProcessorNode only runs while connected to the graph. Zero
      // gain keeps it running without the microphone coming out of the
      // speakers.
      const mute = this.audioContext.createGain();
      mute.gain.value = 0;
      this.captureNode.connect(mute);
      mute.connect(this.audioContext.destination);

      this.startLevelMonitor();
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  stop(): void {
    if (this.levelInterval) { clearInterval(this.levelInterval); this.levelInterval = null; }
    if (this.captureNode) {
      this.captureNode.onaudioprocess = null;
      this.captureNode.disconnect();
      this.captureNode = null;
    }
    // Carried samples belong to the microphone that produced them; selectDevice
    // stops and restarts, and stale samples would be prepended to the new
    // device's first block.
    this.downsampler = null;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    for (const { gainNode, source } of this.audioPlayers.values()) {
      try { source?.stop(); } catch { /* already stopped */ }
      gainNode.disconnect();
    }
    this.audioPlayers.clear();
    if (this.audioContext) { void this.audioContext.close(); this.audioContext = null; }
    if (this.playbackContext) { void this.playbackContext.close(); this.playbackContext = null; }
    this.analyserNode = null;
    this.lastSpeaking = false;
  }

  mute(): void {
    this._applyMute(true);
    this.door.emit('audio:mute', { muted: true });
  }

  unmute(): void {
    this._applyMute(false);
    this.door.emit('audio:mute', { muted: false });
  }

  destroy(): void {
    this.stop();
    for (const [ev, fn] of this.doorListeners) this.door.off(ev, fn);
    this.doorListeners = [];
    this.removeAllListeners();
  }

  private _applyMute(muted: boolean): void {
    this._isMuted = muted;
    this.mediaStream?.getAudioTracks().forEach(t => { t.enabled = !muted; });
  }

  /**
   * Tell the door which inputs exist.
   *
   * Labels are only populated once microphone permission has been granted,
   * which is why this runs after getUserMedia rather than before it.
   */
  private async publishInputDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || 'unnamed input' }));
      this.door.emit('audio:devices', { devices: inputs });
    } catch {
      // Enumeration is a convenience; a failure must not stop the call.
    }
  }

  /** Reopen the microphone on a different device. */
  async selectDevice(deviceId: string): Promise<void> {
    this.opts.deviceId = deviceId;
    const wasRunning = !!this.mediaStream;
    if (wasRunning) this.stop();
    await this.start({ deviceId });
  }

  private startLevelMonitor(): void {
    if (this.levelInterval) return;
    const buf = new Uint8Array(this.analyserNode?.frequencyBinCount ?? 128);
    this.levelInterval = setInterval(() => {
      if (!this.analyserNode || !this.mediaStream) return;
      this.analyserNode.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const n = buf[i] / 255; sum += n * n; }
      const rms = Math.sqrt(sum / buf.length);
      this.emit('level', rms);
      const speaking = rms > 0.01 && !this._isMuted;
      if (speaking !== this.lastSpeaking) {
        this.lastSpeaking = speaking;
        this.emit('speaking', speaking);
      }
    }, 100);
  }

  private async playChunk(userId: string | number, chunk: ArrayBuffer): Promise<void> {
    if (!this.playbackContext) {
      this.playbackContext = new AudioContext();
    }
    try {
      let p = this.audioPlayers.get(userId);
      if (!p) {
        const gainNode = this.playbackContext.createGain();
        gainNode.gain.value = 0.8;
        gainNode.connect(this.playbackContext.destination);
        p = { gainNode, source: null, nextTime: 0 };
        this.audioPlayers.set(userId, p);
      }

      const samples = int16ToFloat(decodePcm(chunk));
      if (samples.length === 0) return;

      const buffer = this.playbackContext.createBuffer(1, samples.length, VOICE_SAMPLE_RATE);
      // set() on the channel rather than copyToChannel(): the latter is
      // typed Float32Array<ArrayBuffer> under newer TypeScript, and a
      // Float32Array built anywhere else is Float32Array<ArrayBufferLike>,
      // which does not satisfy it. set() takes an ArrayLike and has no such
      // constraint.
      buffer.getChannelData(0).set(samples);

      const src = this.playbackContext.createBufferSource();
      src.buffer = buffer;
      src.connect(p.gainNode);

      // Queue packets end to end, a little ahead of the playhead.
      //
      // Scheduling each packet to start EXACTLY where the last one ended
      // leaves no room for a late arrival: the gap is heard as a click, the
      // playhead resets, and speech comes out stuttery and robotic. Packets
      // carry 42ms of audio each and they cross a network while the main
      // thread is also encoding video, so some of them WILL be late.
      //
      // A small lead absorbs that. It is latency deliberately spent - a
      // twelfth of a second, against the alternative of audible gaps.
      p.nextTime = scheduleStart(
        p.nextTime,
        this.playbackContext.currentTime,
        JITTER_LEAD_SECONDS,
        MAX_QUEUE_SECONDS
      );

      src.start(p.nextTime);
      p.nextTime += buffer.duration;

      p.source = src;
      src.onended = () => { if (p && p.source === src) p.source = null; };
    } catch { /* malformed packet -- skip it */ }
  }
}
