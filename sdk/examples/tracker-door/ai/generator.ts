/**
 * AI-Assisted Composition
 * Uses Scribbletune for melody and rhythm generation
 */

import { Note, NoteValue, Pattern } from '../data/types';
const scribble = require('scribbletune');

export class AIGenerator {
  /**
   * Generate melody pattern
   */
  generateMelody(params: {
    scale?: string;
    pattern?: string;
    octave?: number;
    length?: number;
  }): NoteValue[] {
    const scale = params.scale || 'C major';
    const pattern = params.pattern || 'x_x_x_x_';
    const octave = params.octave || 4;
    const length = params.length || 16;

    const clip = scribble.clip({
      notes: scribble.scale(scale),
      pattern: pattern.substring(0, length),
      subdiv: '8n'
    });

    const notes: NoteValue[] = [];
    for (let i = 0; i < length; i++) {
      if (clip.notes[i]) {
        const noteStr = clip.notes[i].replace(/\d/, '') + `-${octave}`;
        notes.push(noteStr as NoteValue);
      } else {
        notes.push('...');
      }
    }

    return notes;
  }

  /**
   * Generate chord progression
   */
  generateChords(params: {
    progression?: string[];
    octave?: number;
    length?: number;
  }): Map<number, NoteValue[]> {
    const progression = params.progression || ['C maj', 'F maj', 'G maj', 'C maj'];
    const octave = params.octave || 3;
    const length = params.length || 64;
    const rowsPerChord = Math.floor(length / progression.length);

    const chords = new Map<number, NoteValue[]>();

    progression.forEach((chordName, idx) => {
      const startRow = idx * rowsPerChord;
      const chord = scribble.chord(chordName);

      const notes: NoteValue[] = chord.map((note: string) => {
        const noteName = note.replace(/\d/, '');
        return `${noteName}-${octave}` as NoteValue;
      });

      chords.set(startRow, notes);
    });

    return chords;
  }

  /**
   * Generate rhythm pattern
   */
  generateRhythm(params: {
    complexity?: 'simple' | 'medium' | 'complex';
    length?: number;
  }): string {
    const complexity = params.complexity || 'medium';
    const length = params.length || 16;

    const patterns = {
      simple: 'x---x---x---x---',
      medium: 'x-x-x-x-x-x-x-x-',
      complex: 'x-xx--x-x-x--xx-'
    };

    const basePattern = patterns[complexity];
    let result = '';

    while (result.length < length) {
      result += basePattern;
    }

    return result.substring(0, length);
  }

  /**
   * Generate drum pattern
   */
  generateDrumPattern(params: {
    style?: 'rock' | 'electronic' | 'funk';
    rows?: number;
  }): { kick: number[]; snare: number[]; hihat: number[] } {
    const style = params.style || 'electronic';
    const rows = params.rows || 64;

    const patterns = {
      rock: {
        kick: [0, 8, 16, 24, 32, 40, 48, 56],
        snare: [8, 24, 40, 56],
        hihat: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60]
      },
      electronic: {
        kick: [0, 6, 16, 22, 32, 38, 48, 54],
        snare: [8, 24, 40, 56],
        hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62]
      },
      funk: {
        kick: [0, 5, 16, 21, 32, 37, 48, 53],
        snare: [8, 24, 40, 56],
        hihat: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63]
      }
    };

    const pattern = patterns[style];

    return {
      kick: pattern.kick.filter(row => row < rows),
      snare: pattern.snare.filter(row => row < rows),
      hihat: pattern.hihat.filter(row => row < rows)
    };
  }

  /**
   * Create variation of existing pattern
   */
  createVariation(pattern: Pattern, params: {
    transpose?: number;
    randomize?: number;
    reverse?: boolean;
  }): Pattern {
    const transpose = params.transpose || 0;
    const randomize = params.randomize || 0;
    const reverse = params.reverse || false;

    const newPattern: Pattern = {
      ...pattern,
      id: pattern.id + 1,
      name: `${pattern.name} (Variation)`,
      data: new Map()
    };

    const entries = Array.from(pattern.data.entries());

    if (reverse) {
      entries.reverse();
    }

    entries.forEach(([key, note], idx) => {
      let newNote = { ...note };

      if (transpose !== 0 && note.note !== '...' && note.note !== '---') {
        newNote.note = this.transposeNote(note.note as string, transpose);
      }

      if (randomize > 0 && Math.random() < randomize) {
        newNote.volume = Math.floor(Math.random() * 128) + 64;
      }

      newPattern.data.set(key, newNote);
    });

    return newPattern;
  }

  /**
   * Transpose a note by semitones
   */
  private transposeNote(noteStr: string, semitones: number): NoteValue {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const match = noteStr.match(/([A-G]#?)-(\d)/);

    if (!match) return noteStr as NoteValue;

    const [, noteName, octaveStr] = match;
    let octave = parseInt(octaveStr);
    let noteIndex = notes.indexOf(noteName);

    if (noteIndex === -1) return noteStr as NoteValue;

    noteIndex += semitones;

    while (noteIndex < 0) {
      noteIndex += 12;
      octave--;
    }

    while (noteIndex >= 12) {
      noteIndex -= 12;
      octave++;
    }

    octave = Math.max(0, Math.min(8, octave));
    return `${notes[noteIndex]}-${octave}` as NoteValue;
  }

  /**
   * Suggest chord progression based on key
   */
  suggestProgression(key: string = 'C', style: 'pop' | 'jazz' | 'blues' = 'pop'): string[] {
    const progressions = {
      pop: ['I', 'V', 'vi', 'IV'],
      jazz: ['IIM7', 'V7', 'IM7', 'VIM7'],
      blues: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']
    };

    const pattern = progressions[style];

    return pattern.map(degree => {
      const chord = scribble.getChordsByProgression(key, degree);
      return chord[0];
    });
  }
}
