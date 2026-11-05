/** Sound configuration */
export interface SoundConfig {
  note?: string;
  notes?: string[];
  duration: number;
}

/** Available sounds */
export const SOUNDS: Record<string, SoundConfig> = {
  message: { note: 'C5', duration: 0.05 },
  mention: { notes: ['E5', 'G5', 'C6'], duration: 0.1 },
  join: { notes: ['C4', 'E4', 'G4'], duration: 0.15 },
  leave: { notes: ['G4', 'E4', 'C4'], duration: 0.15 },
  error: { note: 'C3', duration: 0.2 },
  notification: { note: 'A4', duration: 0.05 },
  reaction: { note: 'E5', duration: 0.03 },
  dm: { notes: ['C5', 'E5'], duration: 0.1 }
};
