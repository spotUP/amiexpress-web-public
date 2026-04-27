import { EventEmitter } from 'events';

export interface VoiceCaptureOptions {
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
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private levelInterval: ReturnType<typeof setInterval> | null = null;
  private audioPlayers = new Map<string | number, {
    gainNode: GainNode;
    source: AudioBufferSourceNode | null;
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

    this.door.on('audio:start-streaming', onStart);
    this.door.on('audio:stop-streaming', onStop);
    this.door.on('audio:mute', onMuteCmd);
    this.door.on('audio:data', onData);
    this.doorListeners.push(
      ['audio:start-streaming', onStart],
      ['audio:stop-streaming', onStop],
      ['audio:mute', onMuteCmd],
      ['audio:data', onData],
    );
  }

  async start(opts?: VoiceCaptureOptions): Promise<void> {
    if (this.mediaStream) return;
    try {
      const o = { ...this.opts, ...opts };
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: o.sampleRate,
          echoCancellation: o.echoCancellation,
          noiseSuppression: o.noiseSuppression,
          autoGainControl: o.autoGainControl,
          channelCount: 1,
        },
        video: false,
      });

      this.audioContext = new AudioContext();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyserNode);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType,
        audioBitsPerSecond: o.bitrate,
      });
      this.mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0 && !this._isMuted) {
          void ev.data.arrayBuffer().then((buf) => this.door.emit('audio:data', buf));
        }
      };
      this.mediaRecorder.start(o.chunkIntervalMs);
      this.startLevelMonitor();
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  stop(): void {
    if (this.levelInterval) { clearInterval(this.levelInterval); this.levelInterval = null; }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    this.mediaRecorder = null;
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    if (this.audioContext) { void this.audioContext.close(); this.audioContext = null; }
    this.analyserNode = null;
    this.sourceNode = null;
    this.audioPlayers.clear();
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
    if (!this.audioContext) return;
    try {
      let p = this.audioPlayers.get(userId);
      if (!p) {
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0.8;
        gainNode.connect(this.audioContext.destination);
        p = { gainNode, source: null };
        this.audioPlayers.set(userId, p);
      }
      const decoded = await this.audioContext.decodeAudioData(chunk.slice(0));
      const src = this.audioContext.createBufferSource();
      src.buffer = decoded;
      src.connect(p.gainNode);
      src.start(0);
      p.source = src;
      src.onended = () => { if (p && p.source === src) p.source = null; };
    } catch { /* decode failed -- skip chunk */ }
  }
}
