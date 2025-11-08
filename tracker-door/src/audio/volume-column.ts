/**
 * Volume Column Commands
 * FastTracker II compatible volume column implementation
 */

export type VolumeCommand =
  | { type: 'volume'; value: number } // 00-40 (0-64)
  | { type: 'volumeSlideUp'; speed: number } // +1 to +F
  | { type: 'volumeSlideDown'; speed: number } // -1 to -F
  | { type: 'fineVolumeUp'; speed: number } // U1 to UF
  | { type: 'fineVolumeDown'; speed: number } // D1 to DF
  | { type: 'vibratoSpeed'; speed: number } // S1 to SF
  | { type: 'vibrato'; depth: number } // V1 to VF
  | { type: 'setPanning'; position: number } // P00 to PFF
  | { type: 'panSlideLeft'; speed: number } // L1 to LF
  | { type: 'panSlideRight'; speed: number } // R1 to RF
  | { type: 'tonePortamento'; speed: number }; // M1 to MF

export interface VolumeColumnState {
  volume: number; // 0-64
  volumeSlideSpeed: number;
  volumeSlideDirection: 'up' | 'down' | 'none';
  vibratoSpeed: number;
  vibratoDepth: number;
  vibratoPhase: number;
  panning: number; // 0-255
  panSlideSpeed: number;
  panSlideDirection: 'left' | 'right' | 'none';
  tonePortamentoSpeed: number;
}

/**
 * Parse volume column value (FastTracker II format)
 * Format:
 * $10-$50: Set volume (subtract $10 to get 0-64)
 * $60-$6F: Volume slide down
 * $70-$7F: Volume slide up
 * $80-$8F: Fine volume slide down
 * $90-$9F: Fine volume slide up
 * $A0-$AF: Set vibrato speed
 * $B0-$BF: Vibrato (depth)
 * $C0-$CF: Set panning
 * $D0-$DF: Panning slide left
 * $E0-$EF: Panning slide right
 * $F0-$FF: Tone portamento
 */
export function parseVolumeColumn(value: number): VolumeCommand | null {
  if (value === 0) return null;

  // Set volume (0x10-0x50)
  if (value >= 0x10 && value <= 0x50) {
    return { type: 'volume', value: value - 0x10 };
  }

  // Volume slide down (0x60-0x6F)
  if (value >= 0x60 && value <= 0x6f) {
    return { type: 'volumeSlideDown', speed: value - 0x60 };
  }

  // Volume slide up (0x70-0x7F)
  if (value >= 0x70 && value <= 0x7f) {
    return { type: 'volumeSlideUp', speed: value - 0x70 };
  }

  // Fine volume slide down (0x80-0x8F)
  if (value >= 0x80 && value <= 0x8f) {
    return { type: 'fineVolumeDown', speed: value - 0x80 };
  }

  // Fine volume slide up (0x90-0x9F)
  if (value >= 0x90 && value <= 0x9f) {
    return { type: 'fineVolumeUp', speed: value - 0x90 };
  }

  // Set vibrato speed (0xA0-0xAF)
  if (value >= 0xa0 && value <= 0xaf) {
    return { type: 'vibratoSpeed', speed: value - 0xa0 };
  }

  // Vibrato (0xB0-0xBF)
  if (value >= 0xb0 && value <= 0xbf) {
    return { type: 'vibrato', depth: value - 0xb0 };
  }

  // Set panning (0xC0-0xCF)
  if (value >= 0xc0 && value <= 0xcf) {
    return { type: 'setPanning', position: (value - 0xc0) * 17 }; // Convert to 0-255
  }

  // Panning slide left (0xD0-0xDF)
  if (value >= 0xd0 && value <= 0xdf) {
    return { type: 'panSlideLeft', speed: value - 0xd0 };
  }

  // Panning slide right (0xE0-0xEF)
  if (value >= 0xe0 && value <= 0xef) {
    return { type: 'panSlideRight', speed: value - 0xe0 };
  }

  // Tone portamento (0xF0-0xFF)
  if (value >= 0xf0 && value <= 0xff) {
    return { type: 'tonePortamento', speed: value - 0xf0 };
  }

  return null;
}

/**
 * Format volume column command to display string
 */
export function formatVolumeColumn(cmd: VolumeCommand | null): string {
  if (!cmd) return '..';

  switch (cmd.type) {
    case 'volume':
      return cmd.value.toString(16).padStart(2, '0').toUpperCase();
    case 'volumeSlideDown':
      return `-${cmd.speed.toString(16).toUpperCase()}`;
    case 'volumeSlideUp':
      return `+${cmd.speed.toString(16).toUpperCase()}`;
    case 'fineVolumeDown':
      return `D${cmd.speed.toString(16).toUpperCase()}`;
    case 'fineVolumeUp':
      return `U${cmd.speed.toString(16).toUpperCase()}`;
    case 'vibratoSpeed':
      return `S${cmd.speed.toString(16).toUpperCase()}`;
    case 'vibrato':
      return `V${cmd.depth.toString(16).toUpperCase()}`;
    case 'setPanning':
      return `P${Math.floor(cmd.position / 17)
        .toString(16)
        .toUpperCase()}`;
    case 'panSlideLeft':
      return `L${cmd.speed.toString(16).toUpperCase()}`;
    case 'panSlideRight':
      return `R${cmd.speed.toString(16).toUpperCase()}`;
    case 'tonePortamento':
      return `M${cmd.speed.toString(16).toUpperCase()}`;
  }
}

export class VolumeColumnProcessor {
  private state: VolumeColumnState;
  private baseVolume: number = 64;
  private basePanning: number = 128;

  constructor() {
    this.state = {
      volume: 64,
      volumeSlideSpeed: 0,
      volumeSlideDirection: 'none',
      vibratoSpeed: 0,
      vibratoDepth: 0,
      vibratoPhase: 0,
      panning: 128,
      panSlideSpeed: 0,
      panSlideDirection: 'none',
      tonePortamentoSpeed: 0
    };
  }

  /**
   * Process volume column command
   */
  processCommand(cmd: VolumeCommand | null): void {
    if (!cmd) return;

    switch (cmd.type) {
      case 'volume':
        this.state.volume = Math.min(64, cmd.value);
        this.baseVolume = this.state.volume;
        break;

      case 'volumeSlideDown':
        this.state.volumeSlideSpeed = cmd.speed;
        this.state.volumeSlideDirection = 'down';
        break;

      case 'volumeSlideUp':
        this.state.volumeSlideSpeed = cmd.speed;
        this.state.volumeSlideDirection = 'up';
        break;

      case 'fineVolumeDown':
        // Apply immediately (single tick)
        this.state.volume = Math.max(0, this.state.volume - cmd.speed);
        this.baseVolume = this.state.volume;
        break;

      case 'fineVolumeUp':
        // Apply immediately (single tick)
        this.state.volume = Math.min(64, this.state.volume + cmd.speed);
        this.baseVolume = this.state.volume;
        break;

      case 'vibratoSpeed':
        this.state.vibratoSpeed = cmd.speed;
        break;

      case 'vibrato':
        this.state.vibratoDepth = cmd.depth;
        break;

      case 'setPanning':
        this.state.panning = cmd.position;
        this.basePanning = this.state.panning;
        break;

      case 'panSlideLeft':
        this.state.panSlideSpeed = cmd.speed;
        this.state.panSlideDirection = 'left';
        break;

      case 'panSlideRight':
        this.state.panSlideSpeed = cmd.speed;
        this.state.panSlideDirection = 'right';
        break;

      case 'tonePortamento':
        this.state.tonePortamentoSpeed = cmd.speed;
        break;
    }
  }

  /**
   * Update per tick (for continuous effects)
   */
  updateTick(tickNumber: number): void {
    // Skip tick 0 (note trigger tick in FT2)
    if (tickNumber === 0) return;

    // Volume slide
    if (this.state.volumeSlideDirection !== 'none') {
      if (this.state.volumeSlideDirection === 'up') {
        this.state.volume = Math.min(64, this.state.volume + this.state.volumeSlideSpeed);
      } else {
        this.state.volume = Math.max(0, this.state.volume - this.state.volumeSlideSpeed);
      }
      this.baseVolume = this.state.volume;
    }

    // Pan slide
    if (this.state.panSlideDirection !== 'none') {
      if (this.state.panSlideDirection === 'right') {
        this.state.panning = Math.min(255, this.state.panning + this.state.panSlideSpeed * 4);
      } else {
        this.state.panning = Math.max(0, this.state.panning - this.state.panSlideSpeed * 4);
      }
      this.basePanning = this.state.panning;
    }

    // Vibrato (if enabled)
    if (this.state.vibratoSpeed > 0 && this.state.vibratoDepth > 0) {
      this.state.vibratoPhase += this.state.vibratoSpeed / 64;
      // Vibrato offset calculated by caller using this.state.vibratoPhase and depth
    }
  }

  /**
   * Get current volume (0-64)
   */
  getVolume(): number {
    return this.state.volume;
  }

  /**
   * Get current panning (0-255)
   */
  getPanning(): number {
    return this.state.panning;
  }

  /**
   * Get vibrato offset for current tick
   */
  getVibratoOffset(): number {
    if (this.state.vibratoSpeed === 0 || this.state.vibratoDepth === 0) {
      return 0;
    }
    return Math.sin(this.state.vibratoPhase) * this.state.vibratoDepth;
  }

  /**
   * Get tone portamento speed
   */
  getTonePortamentoSpeed(): number {
    return this.state.tonePortamentoSpeed;
  }

  /**
   * Reset state for new note
   */
  reset(): void {
    this.state.volumeSlideDirection = 'none';
    this.state.panSlideDirection = 'none';
    this.state.vibratoPhase = 0;
  }

  /**
   * Get current state
   */
  getState(): VolumeColumnState {
    return { ...this.state };
  }
}
