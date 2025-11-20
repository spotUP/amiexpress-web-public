/**
 * Comprehensive Tracker Effects
 * All classic tracker effect commands with modern implementations
 */

import * as Tone from 'tone';

export type EffectCode =
  | '0' // Arpeggio
  | '1' // Portamento up
  | '2' // Portamento down
  | '3' // Tone portamento
  | '4' // Vibrato
  | '5' // Tone portamento + volume slide
  | '6' // Vibrato + volume slide
  | '7' // Tremolo
  | '8' // Set panning
  | '9' // Sample offset
  | 'A' // Volume slide
  | 'B' // Position jump
  | 'C' // Set volume
  | 'D' // Pattern break
  | 'E' // Extended commands
  | 'F' // Set speed/BPM
  | 'G' // Set global volume
  | 'H' // Global volume slide
  | 'I' // Tremor
  | 'J' // Arpeggio (extended)
  | 'K' // Key off
  | 'L' // Set envelope position
  | 'M' // Set channel volume
  | 'N' // Channel volume slide
  | 'O' // Set sample offset (high)
  | 'P' // Panning slide
  | 'Q' // Retrigger note
  | 'R' // Tremor (extended)
  | 'S' // Special commands
  | 'T' // Tempo slide
  | 'U' // Fine vibrato
  | 'V' // Set global volume (extended)
  | 'W' // Global volume slide (extended)
  | 'X' // Set panning (extended)
  | 'Y' // Panbrello
  | 'Z' // MIDI macro;

export interface EffectState {
  // Portamento
  portamentoSpeed: number;
  portamentoTarget: number;
  portamentoDirection: 'up' | 'down' | 'tone';
  glissandoEnabled: boolean;

  // Vibrato
  vibratoSpeed: number;
  vibratoDepth: number;
  vibratoPhase: number;
  vibratoWaveform: 'sine' | 'square' | 'sawtooth' | 'random';
  vibratoRetrigger: boolean;

  // Tremolo
  tremoloSpeed: number;
  tremoloDepth: number;
  tremoloPhase: number;
  tremoloWaveform: 'sine' | 'square' | 'sawtooth' | 'random';
  tremoloRetrigger: boolean;

  // Arpeggio
  arpeggioNote1: number;
  arpeggioNote2: number;
  arpeggioPhase: number;

  // Volume
  volumeSlideSpeed: number;
  volumeSlideDirection: 'up' | 'down';

  // Panning
  panningSlideSpeed: number;
  panningSlideDirection: 'left' | 'right';

  // Pattern control
  patternLoopStart: number;
  patternLoopCount: number;
  patternLoopTarget: number;
  patternDelayRows: number;

  // Note timing
  noteCutTick: number;
  noteDelayTick: number;
  noteDelayed: boolean;

  // Other
  retriggerCount: number;
  retriggerInterval: number;
  sampleOffset: number;
  finetune: number;
  tremor: { onTime: number; offTime: number; phase: number };
}

export class TrackerEffectProcessor {
  private state: EffectState;
  private synth: Tone.Synth | null = null;
  private baseFrequency: number = 440;
  private baseVolume: number = 1.0;
  private basePanning: number = 0;

  constructor() {
    this.state = this.createDefaultState();
  }

  private createDefaultState(): EffectState {
    return {
      portamentoSpeed: 0,
      portamentoTarget: 0,
      portamentoDirection: 'up',
      glissandoEnabled: false,
      vibratoSpeed: 0,
      vibratoDepth: 0,
      vibratoPhase: 0,
      vibratoWaveform: 'sine',
      vibratoRetrigger: false,
      tremoloSpeed: 0,
      tremoloDepth: 0,
      tremoloPhase: 0,
      tremoloWaveform: 'sine',
      tremoloRetrigger: false,
      arpeggioNote1: 0,
      arpeggioNote2: 0,
      arpeggioPhase: 0,
      volumeSlideSpeed: 0,
      volumeSlideDirection: 'up',
      panningSlideSpeed: 0,
      panningSlideDirection: 'left',
      patternLoopStart: 0,
      patternLoopCount: 0,
      patternLoopTarget: 0,
      patternDelayRows: 0,
      noteCutTick: -1,
      noteDelayTick: -1,
      noteDelayed: false,
      retriggerCount: 0,
      retriggerInterval: 0,
      sampleOffset: 0,
      finetune: 0,
      tremor: { onTime: 0, offTime: 0, phase: 0 }
    };
  }

  /**
   * Set the synth to process effects on
   */
  setSynth(synth: Tone.Synth, baseFrequency: number): void {
    this.synth = synth;
    this.baseFrequency = baseFrequency;
  }

  /**
   * Process effect command
   */
  processEffect(code: EffectCode, param: number): void {
    const x = (param >> 4) & 0x0f; // Upper nibble
    const y = param & 0x0f; // Lower nibble

    switch (code) {
      case '0':
        this.effectArpeggio(x, y);
        break;
      case '1':
        this.effectPortamentoUp(param);
        break;
      case '2':
        this.effectPortamentoDown(param);
        break;
      case '3':
        this.effectTonePortamento(param);
        break;
      case '4':
        this.effectVibrato(x, y);
        break;
      case '5':
        this.effectTonePortamentoVolSlide(x, y);
        break;
      case '6':
        this.effectVibratoVolSlide(x, y);
        break;
      case '7':
        this.effectTremolo(x, y);
        break;
      case '8':
        this.effectSetPanning(param);
        break;
      case '9':
        this.effectSampleOffset(param);
        break;
      case 'A':
        this.effectVolumeSlide(x, y);
        break;
      case 'C':
        this.effectSetVolume(param);
        break;
      case 'E':
        this.effectExtended(x, y);
        break;
      case 'F':
        this.effectSetSpeed(param);
        break;
      case 'G':
        this.effectSetGlobalVolume(param);
        break;
      case 'H':
        this.effectGlobalVolumeSlide(x, y);
        break;
      case 'K':
        this.effectKeyOff();
        break;
      case 'M':
        this.effectSetChannelVolume(param);
        break;
      case 'P':
        this.effectPanningSlide(x, y);
        break;
      case 'Q':
        this.effectRetrigger(x, y);
        break;
      case 'R':
        this.effectTremor(x, y);
        break;
      case 'U':
        this.effectFineVibrato(x, y);
        break;
      case 'Y':
        this.effectPanbrello(x, y);
        break;
    }
  }

  /**
   * Update effects (called every tick)
   */
  updateEffects(tickNumber: number): void {
    if (!this.synth) return;

    // Note cut
    if (this.state.noteCutTick === tickNumber) {
      this.synth.triggerRelease();
      this.state.noteCutTick = -1;
    }

    // Note delay (trigger delayed note)
    if (this.state.noteDelayTick === tickNumber && this.state.noteDelayed) {
      // Note will be triggered by the caller
      this.state.noteDelayed = false;
      this.state.noteDelayTick = -1;
    }

    // Portamento
    if (this.state.portamentoSpeed > 0) {
      this.updatePortamento();
    }

    // Vibrato
    if (this.state.vibratoSpeed > 0) {
      this.updateVibrato(tickNumber);
    }

    // Tremolo
    if (this.state.tremoloSpeed > 0) {
      this.updateTremolo(tickNumber);
    }

    // Arpeggio
    if (this.state.arpeggioNote1 > 0 || this.state.arpeggioNote2 > 0) {
      this.updateArpeggio(tickNumber);
    }

    // Volume slide
    if (this.state.volumeSlideSpeed > 0) {
      this.updateVolumeSlide();
    }

    // Panning slide
    if (this.state.panningSlideSpeed > 0) {
      this.updatePanningSlide();
    }

    // Retrigger
    if (this.state.retriggerInterval > 0) {
      this.updateRetrigger(tickNumber);
    }

    // Tremor
    if (this.state.tremor.onTime > 0) {
      this.updateTremor(tickNumber);
    }
  }

  // Effect implementations

  private effectArpeggio(note1: number, note2: number): void {
    this.state.arpeggioNote1 = note1;
    this.state.arpeggioNote2 = note2;
    this.state.arpeggioPhase = 0;
  }

  private updateArpeggio(tick: number): void {
    if (!this.synth) return;

    const phase = tick % 3;
    let semitones = 0;

    switch (phase) {
      case 0:
        semitones = 0;
        break;
      case 1:
        semitones = this.state.arpeggioNote1;
        break;
      case 2:
        semitones = this.state.arpeggioNote2;
        break;
    }

    const frequency = this.baseFrequency * Math.pow(2, semitones / 12);
    this.synth.frequency.value = frequency;
  }

  private effectPortamentoUp(speed: number): void {
    this.state.portamentoSpeed = speed;
    this.state.portamentoDirection = 'up';
  }

  private effectPortamentoDown(speed: number): void {
    this.state.portamentoSpeed = speed;
    this.state.portamentoDirection = 'down';
  }

  private effectTonePortamento(speed: number): void {
    if (speed > 0) {
      this.state.portamentoSpeed = speed;
    }
    this.state.portamentoDirection = 'tone';
  }

  private updatePortamento(): void {
    if (!this.synth) return;

    const currentFreq = this.synth.frequency.value as number;
    const step = this.state.portamentoSpeed;
    let newFreq = currentFreq;

    if (this.state.portamentoDirection === 'up') {
      newFreq = currentFreq + step;
    } else if (this.state.portamentoDirection === 'down') {
      newFreq = Math.max(20, currentFreq - step);
    } else if (this.state.portamentoDirection === 'tone') {
      // Slide towards target
      if (currentFreq < this.state.portamentoTarget) {
        newFreq = Math.min(this.state.portamentoTarget, currentFreq + step);
      } else if (currentFreq > this.state.portamentoTarget) {
        newFreq = Math.max(this.state.portamentoTarget, currentFreq - step);
      }
    }

    // Apply glissando (round to nearest semitone)
    if (this.state.glissandoEnabled) {
      const semitones = 12 * Math.log2(newFreq / 440);
      const roundedSemitones = Math.round(semitones);
      newFreq = 440 * Math.pow(2, roundedSemitones / 12);
    }

    this.synth.frequency.value = newFreq;
  }

  private effectVibrato(speed: number, depth: number): void {
    if (speed > 0) this.state.vibratoSpeed = speed / 16;
    if (depth > 0) this.state.vibratoDepth = depth / 16;
  }

  private updateVibrato(tick: number): void {
    if (!this.synth) return;

    this.state.vibratoPhase += this.state.vibratoSpeed;

    // Calculate offset based on waveform
    let waveValue = 0;
    switch (this.state.vibratoWaveform) {
      case 'sine':
        waveValue = Math.sin(this.state.vibratoPhase);
        break;
      case 'square':
        waveValue = Math.sin(this.state.vibratoPhase) >= 0 ? 1 : -1;
        break;
      case 'sawtooth':
        waveValue = (this.state.vibratoPhase % (2 * Math.PI)) / Math.PI - 1;
        break;
      case 'random':
        waveValue = Math.random() * 2 - 1;
        break;
    }

    const offset = waveValue * this.state.vibratoDepth * 10;
    this.synth.frequency.value = this.baseFrequency + offset;
  }

  private effectFineVibrato(speed: number, depth: number): void {
    if (speed > 0) this.state.vibratoSpeed = speed / 64;
    if (depth > 0) this.state.vibratoDepth = depth / 64;
  }

  private effectTremolo(speed: number, depth: number): void {
    if (speed > 0) this.state.tremoloSpeed = speed / 16;
    if (depth > 0) this.state.tremoloDepth = depth / 16;
  }

  private updateTremolo(tick: number): void {
    if (!this.synth) return;

    this.state.tremoloPhase += this.state.tremoloSpeed;

    // Calculate offset based on waveform
    let waveValue = 0;
    switch (this.state.tremoloWaveform) {
      case 'sine':
        waveValue = Math.sin(this.state.tremoloPhase);
        break;
      case 'square':
        waveValue = Math.sin(this.state.tremoloPhase) >= 0 ? 1 : -1;
        break;
      case 'sawtooth':
        waveValue = (this.state.tremoloPhase % (2 * Math.PI)) / Math.PI - 1;
        break;
      case 'random':
        waveValue = Math.random() * 2 - 1;
        break;
    }

    const offset = waveValue * this.state.tremoloDepth;
    const volume = Math.max(0, Math.min(1, this.baseVolume + offset));
    this.synth.volume.value = Tone.gainToDb(volume);
  }

  private effectTonePortamentoVolSlide(portamento: number, volSlide: number): void {
    // Combine tone portamento with volume slide
    if (portamento > 0) {
      this.effectTonePortamento(portamento);
    }
    this.effectVolumeSlide(volSlide >> 4, volSlide & 0x0f);
  }

  private effectVibratoVolSlide(vibrato: number, volSlide: number): void {
    // Combine vibrato with volume slide
    if (vibrato > 0) {
      const x = (vibrato >> 4) & 0x0f;
      const y = vibrato & 0x0f;
      this.effectVibrato(x, y);
    }
    this.effectVolumeSlide(volSlide >> 4, volSlide & 0x0f);
  }

  private effectSetPanning(panning: number): void {
    this.basePanning = (panning / 255) * 2 - 1; // Convert 0-255 to -1 to 1
    // Apply to synth if available
  }

  private effectSampleOffset(offset: number): void {
    this.state.sampleOffset = offset * 256;
    // Would apply to sample playback start position
  }

  private effectVolumeSlide(up: number, down: number): void {
    if (up > 0) {
      this.state.volumeSlideSpeed = up;
      this.state.volumeSlideDirection = 'up';
    } else if (down > 0) {
      this.state.volumeSlideSpeed = down;
      this.state.volumeSlideDirection = 'down';
    }
  }

  private updateVolumeSlide(): void {
    if (!this.synth) return;

    const currentVolume = Tone.dbToGain(this.synth.volume.value);
    const step = this.state.volumeSlideSpeed / 64;

    if (this.state.volumeSlideDirection === 'up') {
      const newVolume = Math.min(1, currentVolume + step);
      this.synth.volume.value = Tone.gainToDb(newVolume);
      this.baseVolume = newVolume;
    } else {
      const newVolume = Math.max(0, currentVolume - step);
      this.synth.volume.value = Tone.gainToDb(newVolume);
      this.baseVolume = newVolume;
    }
  }

  private effectSetVolume(volume: number): void {
    if (!this.synth) return;

    this.baseVolume = Math.min(64, volume) / 64;
    this.synth.volume.value = Tone.gainToDb(this.baseVolume);
  }

  private effectExtended(type: number, param: number): void {
    switch (type) {
      case 0x1: // E1x - Fine portamento up
        if (this.synth) {
          this.synth.frequency.value = (this.synth.frequency.value as number) + param;
        }
        break;

      case 0x2: // E2x - Fine portamento down
        if (this.synth) {
          this.synth.frequency.value = (this.synth.frequency.value as number) - param;
        }
        break;

      case 0x3: // E3x - Set glissando control
        // 0 = off, 1 = on (semitone rounding during portamento)
        this.state.glissandoEnabled = param > 0;
        break;

      case 0x4: // E4x - Set vibrato waveform
        // 0-3: sine, ramp down, square, random
        // +4: don't retrigger waveform on new note
        const vibratoWaveforms: Array<'sine' | 'sawtooth' | 'square' | 'random'> = [
          'sine',
          'sawtooth',
          'square',
          'random'
        ];
        this.state.vibratoWaveform = vibratoWaveforms[param & 0x03];
        this.state.vibratoRetrigger = (param & 0x04) === 0;
        if (this.state.vibratoRetrigger) {
          this.state.vibratoPhase = 0;
        }
        break;

      case 0x5: // E5x - Set finetune
        // Adjust finetune (-8 to +7)
        this.state.finetune = param < 8 ? param : param - 16;
        if (this.synth) {
          const detune = this.state.finetune * 12.5; // Convert to cents
          this.synth.detune.value = detune;
        }
        break;

      case 0x6: // E6x - Pattern loop
        // 0 = set loop start, 1-15 = loop N times
        if (param === 0) {
          // Mark loop start point (would be handled by pattern sequencer)
          this.state.patternLoopStart = 0; // Current row
        } else {
          // Loop back N times
          this.state.patternLoopTarget = param;
          this.state.patternLoopCount++;
        }
        break;

      case 0x7: // E7x - Set tremolo waveform
        // 0-3: sine, ramp down, square, random
        // +4: don't retrigger waveform on new note
        const tremoloWaveforms: Array<'sine' | 'sawtooth' | 'square' | 'random'> = [
          'sine',
          'sawtooth',
          'square',
          'random'
        ];
        this.state.tremoloWaveform = tremoloWaveforms[param & 0x03];
        this.state.tremoloRetrigger = (param & 0x04) === 0;
        if (this.state.tremoloRetrigger) {
          this.state.tremoloPhase = 0;
        }
        break;

      case 0x8: // E8x - Set panning (fine)
        this.effectSetPanning(param * 16);
        break;

      case 0x9: // E9x - Retrigger note
        this.state.retriggerInterval = param;
        this.state.retriggerCount = 0;
        break;

      case 0xA: // EAx - Fine volume slide up
        if (this.synth) {
          const vol = Tone.dbToGain(this.synth.volume.value);
          this.synth.volume.value = Tone.gainToDb(Math.min(1, vol + param / 256));
        }
        break;

      case 0xB: // EBx - Fine volume slide down
        if (this.synth) {
          const vol = Tone.dbToGain(this.synth.volume.value);
          this.synth.volume.value = Tone.gainToDb(Math.max(0, vol - param / 256));
        }
        break;

      case 0xC: // ECx - Note cut
        // Cut note after param ticks
        this.state.noteCutTick = param;
        break;

      case 0xD: // EDx - Note delay
        // Delay note trigger by param ticks
        this.state.noteDelayTick = param;
        this.state.noteDelayed = true;
        break;

      case 0xE: // EEx - Pattern delay
        // Delay pattern by param rows
        this.state.patternDelayRows = param;
        break;
    }
  }

  private effectSetSpeed(speed: number): void {
    // Set ticks per row or BPM depending on value
    // speed < 32: ticks per row
    // speed >= 32: BPM
  }

  private effectSetGlobalVolume(volume: number): void {
    // Set global volume (affects all channels)
  }

  private effectGlobalVolumeSlide(up: number, down: number): void {
    // Slide global volume
  }

  private effectKeyOff(): void {
    if (this.synth) {
      this.synth.triggerRelease();
    }
  }

  private effectSetChannelVolume(volume: number): void {
    this.baseVolume = Math.min(64, volume) / 64;
    if (this.synth) {
      this.synth.volume.value = Tone.gainToDb(this.baseVolume);
    }
  }

  private effectPanningSlide(left: number, right: number): void {
    if (left > 0) {
      this.state.panningSlideSpeed = left;
      this.state.panningSlideDirection = 'left';
    } else if (right > 0) {
      this.state.panningSlideSpeed = right;
      this.state.panningSlideDirection = 'right';
    }
  }

  private updatePanningSlide(): void {
    const step = this.state.panningSlideSpeed / 64;

    if (this.state.panningSlideDirection === 'left') {
      this.basePanning = Math.max(-1, this.basePanning - step);
    } else {
      this.basePanning = Math.min(1, this.basePanning + step);
    }
  }

  private effectRetrigger(volume: number, interval: number): void {
    this.state.retriggerInterval = interval;
    this.state.retriggerCount = 0;
  }

  private updateRetrigger(tick: number): void {
    if (tick % this.state.retriggerInterval === 0 && this.synth) {
      // Retrigger the note
      this.synth.triggerAttackRelease(this.baseFrequency, '16n');
    }
  }

  private effectTremor(onTime: number, offTime: number): void {
    this.state.tremor = { onTime, offTime, phase: 0 };
  }

  private updateTremor(tick: number): void {
    if (!this.synth) return;

    const cycle = this.state.tremor.onTime + this.state.tremor.offTime;
    const phase = tick % cycle;

    if (phase < this.state.tremor.onTime) {
      this.synth.volume.value = Tone.gainToDb(this.baseVolume);
    } else {
      this.synth.volume.value = Tone.gainToDb(0.0001); // Silent
    }
  }

  private effectPanbrello(speed: number, depth: number): void {
    // Pan oscillation (like vibrato for panning)
  }

  /**
   * Reset all effect states
   */
  reset(): void {
    this.state = this.createDefaultState();
  }

  /**
   * Get current effect state
   */
  getState(): EffectState {
    return { ...this.state };
  }
}
