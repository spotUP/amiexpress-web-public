/**
 * TrackerDoor - Professional Music Tracker BBS Door
 * Inspired by Renoise, Protracker, and FastTracker II
 */

import { Door, GraphicsEngine, AnsiColor } from '@amiexpress/bbs-door-sdk';
import { AudioEngine } from './audio/engine';
import {
  Song,
  Pattern,
  Note,
  Instrument,
  NoteValue,
  DEFAULT_INSTRUMENTS,
  EffectPluginType,
  EffectType,
  EffectCommand
} from './data/types';
import { ExportManager } from './utils/export';
import { SampleManager } from './utils/sample';
import { AIGenerator } from './ai/generator';
import * as fs from 'fs';
import * as path from 'path';

type View = 'main' | 'pattern-editor' | 'instrument-editor' | 'sample-editor' | 'effects-editor' | 'song-editor' | 'export' | 'ai-assistant' | 'help';

class TrackerDoor {
  private door: Door;
  private gfx: GraphicsEngine;
  private audio: AudioEngine;
  private exportManager: ExportManager;
  private sampleManager: SampleManager;
  private aiGenerator: AIGenerator;
  private userId?: number;

  // State
  private currentView: View = 'main';
  private song: Song;
  private currentPattern: number = 0;
  private currentRow: number = 0;
  private currentChannel: number = 0;
  private currentOctave: number = 4;
  private currentInstrument: number = 1;
  private currentVolume: number = 0x80;
  private editMode: 'note' | 'instrument' | 'volume' | 'effect' = 'note';
  private playing: boolean = false;
  private dataDir: string;

  // Display
  private scrollRow: number = 0;
  private visibleRows: number = 16;

  constructor() {
    this.door = new Door({
      name: 'TrackerDoor',
      version: '1.0.0',
      author: 'Demo Scene Community',
      description: 'Professional Music Tracker',
      minSecurity: 0
    });

    this.gfx = new GraphicsEngine({ width: 80, height: 24 });
    this.audio = new AudioEngine(16);
    this.dataDir = path.join(__dirname, '../data');
    this.exportManager = new ExportManager(this.dataDir);
    this.sampleManager = new SampleManager(this.dataDir);
    this.aiGenerator = new AIGenerator();

    // Initialize default song
    this.song = this.createDefaultSong();

    this.setupEventHandlers();
  }

  /**
   * Create default empty song
   */
  private createDefaultSong(): Song {
    const instruments: Instrument[] = DEFAULT_INSTRUMENTS.map((preset, idx) => ({
      id: idx + 1,
      name: preset.name || `Instrument ${idx + 1}`,
      type: preset.type || 'synth',
      oscillator: preset.oscillator,
      filter: preset.filter,
      envelope: preset.envelope || { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 },
      effects: preset.effects || []
    }));

    const pattern: Pattern = {
      id: 0,
      name: 'Pattern 00',
      rows: 64,
      channels: 8,
      data: new Map()
    };

    return {
      title: 'Untitled',
      artist: 'Unknown',
      comments: '',
      bpm: 140,
      ticksPerRow: 6,
      channels: 8,
      patterns: [pattern],
      instruments,
      sequence: [0],
      loopStart: 0,
      loopEnd: 0
    };
  }

  /**
   * Setup door event handlers
   */
  private setupEventHandlers(): void {
    this.door.onConnect(async (user: any) => {
      this.userId = user.id;
      await this.audio.init();
      this.showMainMenu();
    });

    this.door.onInput((user: any, key: any) => {
      this.handleInput(key.key || key);
    });

    this.door.onDisconnect(() => {
      this.audio.dispose();
    });
  }

  /**
   * Handle keyboard input
   */
  private handleInput(key: string): void {
    switch (this.currentView) {
      case 'main':
        this.handleMainMenuInput(key);
        break;
      case 'pattern-editor':
        this.handlePatternEditorInput(key);
        break;
      case 'instrument-editor':
        this.handleInstrumentEditorInput(key);
        break;
      case 'sample-editor':
        this.handleSampleEditorInput(key);
        break;
      case 'effects-editor':
        this.handleEffectsEditorInput(key);
        break;
      case 'song-editor':
        this.handleSongEditorInput(key);
        break;
      case 'export':
        this.handleExportInput(key);
        break;
      case 'ai-assistant':
        this.handleAIAssistantInput(key);
        break;
      case 'help':
        this.handleHelpInput(key);
        break;
    }
  }

  // ==========================================================================
  // MAIN MENU
  // ==========================================================================

  private showMainMenu(): void {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    // Title
    this.gfx.drawText(10, 2, '╔════════════════════════════════════════════════════════════╗', AnsiColor.Cyan);
    this.gfx.drawText(10, 3, '║          T R A C K E R D O O R   v 1 . 0                 ║', AnsiColor.Cyan);
    this.gfx.drawText(10, 4, '║        Professional Music Tracker for BBS                 ║', AnsiColor.Cyan);
    this.gfx.drawText(10, 5, '╚════════════════════════════════════════════════════════════╝', AnsiColor.Cyan);

    // Song info
    this.gfx.drawText(10, 7, `Song: ${this.song.title}`, AnsiColor.Yellow);
    this.gfx.drawText(10, 8, `BPM: ${this.song.bpm}  Channels: ${this.song.channels}  Patterns: ${this.song.patterns.length}`, AnsiColor.White);

    // Menu
    this.gfx.drawText(10, 10, '┌─────────────── MAIN MENU ────────────────┐', AnsiColor.White);
    this.gfx.drawText(10, 11, '│                                          │', AnsiColor.White);
    this.gfx.drawText(10, 12, '│  [P] Pattern Editor                      │', AnsiColor.Green);
    this.gfx.drawText(10, 13, '│  [I] Instrument Editor                   │', AnsiColor.Green);
    this.gfx.drawText(10, 14, '│  [M] Sample Manager                      │', AnsiColor.Green);
    this.gfx.drawText(10, 15, '│  [F] Effects Editor                      │', AnsiColor.Green);
    this.gfx.drawText(10, 16, '│  [S] Song Arranger                       │', AnsiColor.Green);
    this.gfx.drawText(10, 17, '│  [E] Export Module                       │', AnsiColor.Green);
    this.gfx.drawText(10, 18, '│  [A] AI Assistant                        │', AnsiColor.Cyan);
    this.gfx.drawText(10, 19, '│  [H] Help & Shortcuts                    │', AnsiColor.Yellow);
    this.gfx.drawText(10, 20, '│  [Q] Quit                                │', AnsiColor.Red);
    this.gfx.drawText(10, 21, '│                                          │', AnsiColor.White);
    this.gfx.drawText(10, 22, '└──────────────────────────────────────────┘', AnsiColor.White);

    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private handleMainMenuInput(key: string): void {
    const k = key.toLowerCase();

    if (k === 'p') {
      this.currentView = 'pattern-editor';
      this.showPatternEditor();
    } else if (k === 'i') {
      this.currentView = 'instrument-editor';
      this.showInstrumentEditor();
    } else if (k === 'm') {
      this.currentView = 'sample-editor';
      this.showSampleEditor();
    } else if (k === 'f') {
      this.currentView = 'effects-editor';
      this.showEffectsEditor();
    } else if (k === 's') {
      this.currentView = 'song-editor';
      this.showSongEditor();
    } else if (k === 'e') {
      this.currentView = 'export';
      this.showExport();
    } else if (k === 'a') {
      this.currentView = 'ai-assistant';
      this.showAIAssistant();
    } else if (k === 'h') {
      this.currentView = 'help';
      this.showHelp();
    } else if (k === 'q') {
      this.quit();
    }
  }

  // ==========================================================================
  // PATTERN EDITOR
  // ==========================================================================

  private showPatternEditor(): void {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    const pattern = this.song.patterns[this.currentPattern];

    // Header
    this.gfx.drawText(0, 0, '╔════════════════════════════════════════════════════════════════════════════╗', AnsiColor.Cyan);
    const header = ` TrackerDoor v1.0    BPM: ${String(this.song.bpm).padStart(3)}  Row: ${String(this.currentRow).padStart(2,'0')}/${pattern.rows}  Pat: ${String(this.currentPattern + 1).padStart(2,'0')}  Ch: ${String(this.currentChannel + 1).padStart(2,'0')}/${this.song.channels} `;
    this.gfx.drawText(0, 1, `║${header.padEnd(78)}║`, AnsiColor.Cyan);
    this.gfx.drawText(0, 2, '╠════════╪══════════╪══════════╪══════════╪══════════╪══════════╪══════════╣', AnsiColor.Cyan);

    // Channel headers
    let headerLine = '║   ROW  │';
    for (let ch = 0; ch < Math.min(6, this.song.channels); ch++) {
      headerLine += ` CH${String(ch + 1).padStart(2,'0')}     │`;
    }
    headerLine += ' '.repeat(78 - headerLine.length) + '║';
    this.gfx.drawText(0, 3, headerLine, AnsiColor.Yellow);
    this.gfx.drawText(0, 4, '╠════════╪══════════╪══════════╪══════════╪══════════╪══════════╪══════════╣', AnsiColor.Cyan);

    // Pattern data (16 visible rows)
    const startRow = this.scrollRow;
    const endRow = Math.min(startRow + this.visibleRows, pattern.rows);

    for (let row = startRow; row < endRow; row++) {
      const y = 5 + (row - startRow);
      const cursor = row === this.currentRow ? '►' : ' ';
      const rowColor = row === this.currentRow ? AnsiColor.Yellow : AnsiColor.White;

      let line = `║ ${cursor} ${String(row).padStart(2,'0')}  │`;

      for (let ch = 0; ch < Math.min(6, this.song.channels); ch++) {
        const key = `${row}:${ch}`;
        const note = pattern.data.get(key) || { note: '...', instrument: 0, volume: 0 };

        const noteStr = note.note === '...' ? '... .. ..' :
                       `${note.note} ${String(note.instrument).padStart(2,'0')} ${note.volume.toString(16).toUpperCase().padStart(2,'0')}`;

        const cellColor = ch === this.currentChannel && row === this.currentRow ? AnsiColor.Green : rowColor;
        line += ` ${noteStr}│`;
      }

      line += ' '.repeat(78 - line.length) + '║';
      this.gfx.drawText(0, y, line, rowColor);
    }

    // Footer
    const footerY = 5 + this.visibleRows;
    this.gfx.drawText(0, footerY, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);
    this.gfx.drawText(0, footerY + 1, '║ [F1] Help  [Space] Play  [Tab] Next Ch  [↑↓←→] Navigate  [ESC] Menu       ║', AnsiColor.White);
    this.gfx.drawText(0, footerY + 2, '║ [Q-I,A-K] Notes  [Z-/] Octave  [0-9] Volume  [1-9] Instrument            ║', AnsiColor.White);
    this.gfx.drawText(0, footerY + 3, '╚════════════════════════════════════════════════════════════════════════════╝', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private handlePatternEditorInput(key: string): void {
    const pattern = this.song.patterns[this.currentPattern];

    // Navigation
    if (key === 'ArrowUp') {
      this.currentRow = Math.max(0, this.currentRow - 1);
      if (this.currentRow < this.scrollRow) this.scrollRow = Math.max(0, this.scrollRow - 1);
      this.showPatternEditor();
    } else if (key === 'ArrowDown') {
      this.currentRow = Math.min(pattern.rows - 1, this.currentRow + 1);
      if (this.currentRow >= this.scrollRow + this.visibleRows) this.scrollRow++;
      this.showPatternEditor();
    } else if (key === 'ArrowLeft' || key === '\t' && key.includes('Shift')) {
      this.currentChannel = Math.max(0, this.currentChannel - 1);
      this.showPatternEditor();
    } else if (key === 'ArrowRight' || key === '\t') {
      this.currentChannel = Math.min(this.song.channels - 1, this.currentChannel + 1);
      this.showPatternEditor();
    } else if (key === 'PageUp') {
      this.currentRow = Math.max(0, this.currentRow - 16);
      this.scrollRow = Math.max(0, this.scrollRow - 16);
      this.showPatternEditor();
    } else if (key === 'PageDown') {
      this.currentRow = Math.min(pattern.rows - 1, this.currentRow + 16);
      this.scrollRow = Math.min(pattern.rows - this.visibleRows, this.scrollRow + 16);
      this.showPatternEditor();
    }

    // Note entry (piano keyboard layout)
    const noteMap: Record<string, string> = {
      'z': 'C', 's': 'C#', 'x': 'D', 'd': 'D#', 'c': 'E', 'v': 'F',
      'g': 'F#', 'b': 'G', 'h': 'G#', 'n': 'A', 'j': 'A#', 'm': 'B',
      'q': 'C', '2': 'C#', 'w': 'D', '3': 'D#', 'e': 'E', 'r': 'F',
      '5': 'F#', 't': 'G', '6': 'G#', 'y': 'A', '7': 'A#', 'u': 'B',
      'i': 'C', '9': 'C#', 'o': 'D', '0': 'D#', 'p': 'E'
    };

    const lowerKey = key.toLowerCase();
    if (noteMap[lowerKey]) {
      const noteName = noteMap[lowerKey];
      const octave = lowerKey.charCodeAt(0) >= 'q'.charCodeAt(0) ? this.currentOctave + 1 : this.currentOctave;
      const noteValue: NoteValue = `${noteName}-${octave}` as NoteValue;

      this.addNote(noteValue);
      this.showPatternEditor();
    }

    // Octave control
    if (key === '<' || key === '-') {
      this.currentOctave = Math.max(0, this.currentOctave - 1);
    } else if (key === '>' || key === '+') {
      this.currentOctave = Math.min(8, this.currentOctave + 1);
    }

    // Delete note
    if (key === 'Backspace' || key === '\x7f') {
      this.deleteNote();
      this.showPatternEditor();
    }

    // Insert row
    if (key === 'Insert') {
      this.insertRow();
      this.showPatternEditor();
    }

    // Delete row
    if (key === 'Delete') {
      this.deleteRow();
      this.showPatternEditor();
    }

    // Playback
    if (key === ' ') {
      this.togglePlayback();
    }

    // Back to menu
    if (key === 'Escape' || key === '\x1b') {
      this.currentView = 'main';
      this.showMainMenu();
    }
  }

  /**
   * Add note to current position
   */
  private addNote(note: NoteValue): void {
    const pattern = this.song.patterns[this.currentPattern];
    const key = `${this.currentRow}:${this.currentChannel}`;

    const noteData: Note = {
      note,
      instrument: this.currentInstrument,
      volume: this.currentVolume
    };

    pattern.data.set(key, noteData);

    // Advance to next row
    this.currentRow = Math.min(pattern.rows - 1, this.currentRow + 1);
    if (this.currentRow >= this.scrollRow + this.visibleRows) {
      this.scrollRow++;
    }

    // Preview note
    const inst = this.song.instruments.find(i => i.id === this.currentInstrument);
    if (inst) {
      this.audio.playNote(this.currentChannel, noteData, inst);
    }
  }

  /**
   * Toggle pattern playback
   */
  private togglePlayback(): void {
    if (this.playing) {
      this.audio.stop();
      this.playing = false;
    } else {
      const pattern = this.song.patterns[this.currentPattern];
      this.audio.playPattern(pattern, this.song.instruments, true);
      this.playing = true;
    }
  }

  /**
   * Delete note at current position
   */
  private deleteNote(): void {
    const pattern = this.song.patterns[this.currentPattern];
    const key = `${this.currentRow}:${this.currentChannel}`;
    pattern.data.delete(key);
  }

  /**
   * Insert row at current position
   */
  private insertRow(): void {
    const pattern = this.song.patterns[this.currentPattern];
    const newData = new Map<string, Note>();

    pattern.data.forEach((note, key) => {
      const [row, channel] = key.split(':').map(Number);
      if (row >= this.currentRow) {
        newData.set(`${row + 1}:${channel}`, note);
      } else {
        newData.set(key, note);
      }
    });

    pattern.data = newData;
  }

  /**
   * Delete row at current position
   */
  private deleteRow(): void {
    const pattern = this.song.patterns[this.currentPattern];
    const newData = new Map<string, Note>();

    pattern.data.forEach((note, key) => {
      const [row, channel] = key.split(':').map(Number);
      if (row !== this.currentRow) {
        if (row > this.currentRow) {
          newData.set(`${row - 1}:${channel}`, note);
        } else {
          newData.set(key, note);
        }
      }
    });

    pattern.data = newData;
  }

  // ==========================================================================
  // INSTRUMENT EDITOR
  // ==========================================================================

  private showInstrumentEditor(): void {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    const inst = this.song.instruments[this.currentInstrument - 1];
    if (!inst) return;

    this.gfx.drawText(0, 0, '╔════════════════════════════════════════════════════════════════════════════╗', AnsiColor.Cyan);
    this.gfx.drawText(0, 1, `║ INSTRUMENT EDITOR                      Instrument ${String(inst.id).padStart(2,'0')}: "${inst.name.padEnd(20).substring(0,20)}" ║`, AnsiColor.Cyan);
    this.gfx.drawText(0, 2, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);

    let y = 4;

    // Type
    this.gfx.drawText(5, y++, `Type: [${inst.type === 'synth' ? '●' : ' '}] Synth  [${inst.type === 'sample' ? '●' : ' '}] Sample`, AnsiColor.White);
    y++;

    // Oscillator (if synth)
    if (inst.type === 'synth' && inst.oscillator) {
      this.gfx.drawText(5, y++, 'Oscillator', AnsiColor.Yellow);
      this.gfx.drawText(5, y++, '┌──────────────────────────────────────────────────────────────────────┐', AnsiColor.White);
      this.gfx.drawText(5, y++, `│ Waveform: ${inst.oscillator.type.padEnd(20)}                                        │`, AnsiColor.White);
      this.gfx.drawText(5, y++, '└──────────────────────────────────────────────────────────────────────┘', AnsiColor.White);
      y++;
    }

    // Envelope
    this.gfx.drawText(5, y++, 'Amplitude Envelope', AnsiColor.Yellow);
    this.gfx.drawText(5, y++, '┌──────────────────────────────────────────────────────────────────────┐', AnsiColor.White);
    this.gfx.drawText(5, y++, `│ A:${String(Math.floor(inst.envelope.attack * 1000)).padStart(4)}ms  D:${String(Math.floor(inst.envelope.decay * 1000)).padStart(4)}ms  S:${String(Math.floor(inst.envelope.sustain * 100)).padStart(3)}%  R:${String(Math.floor(inst.envelope.release * 1000)).padStart(4)}ms                 │`, AnsiColor.White);
    this.gfx.drawText(5, y++, '└──────────────────────────────────────────────────────────────────────┘', AnsiColor.White);

    // Footer
    this.gfx.drawText(0, 22, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);
    this.gfx.drawText(0, 23, '║ [←→] Select Instrument  [P] Preview  [ESC] Back                              ║', AnsiColor.White);
    this.gfx.drawText(0, 24, '╚════════════════════════════════════════════════════════════════════════════╝', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private handleInstrumentEditorInput(key: string): void {
    if (key === 'ArrowLeft') {
      this.currentInstrument = Math.max(1, this.currentInstrument - 1);
      this.showInstrumentEditor();
    } else if (key === 'ArrowRight') {
      this.currentInstrument = Math.min(this.song.instruments.length, this.currentInstrument + 1);
      this.showInstrumentEditor();
    } else if (key === 'Escape' || key === '\x1b') {
      this.currentView = 'main';
      this.showMainMenu();
    }
  }

  // ==========================================================================
  // HELP
  // ==========================================================================

  private showHelp(): void {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    this.gfx.drawText(0, 0, '╔════════════════════════════════════════════════════════════════════════════╗', AnsiColor.Cyan);
    this.gfx.drawText(0, 1, '║                           TRACKERDOOR HELP                                 ║', AnsiColor.Cyan);
    this.gfx.drawText(0, 2, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);

    let y = 4;
    this.gfx.drawText(2, y++, 'PATTERN EDITOR:', AnsiColor.Yellow);
    this.gfx.drawText(2, y++, '  Arrow Keys - Navigate pattern', AnsiColor.White);
    this.gfx.drawText(2, y++, '  Q-I, A-K, Z-M - Play notes (piano layout)', AnsiColor.White);
    this.gfx.drawText(2, y++, '  -/+ - Lower/raise octave', AnsiColor.White);
    this.gfx.drawText(2, y++, '  Space - Play/pause pattern', AnsiColor.White);
    this.gfx.drawText(2, y++, '  Tab - Next channel', AnsiColor.White);
    this.gfx.drawText(2, y++, '  Backspace - Delete note', AnsiColor.White);
    y++;
    this.gfx.drawText(2, y++, 'NOTE FORMAT:', AnsiColor.Yellow);
    this.gfx.drawText(2, y++, '  C-4 01 80 = C note, octave 4, instrument 01, volume 80 (hex)', AnsiColor.White);
    this.gfx.drawText(2, y++, '  --- = Note off', AnsiColor.White);
    this.gfx.drawText(2, y++, '  ... = Empty cell', AnsiColor.White);

    this.gfx.drawText(0, 22, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);
    this.gfx.drawText(0, 23, '║ [ESC] Back to Menu                                                         ║', AnsiColor.White);
    this.gfx.drawText(0, 24, '╚════════════════════════════════════════════════════════════════════════════╝', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private handleHelpInput(key: string): void {
    if (key === 'Escape' || key === '\x1b') {
      this.currentView = 'main';
      this.showMainMenu();
    }
  }

  // ==========================================================================
  // SAMPLE EDITOR
  // ==========================================================================

  private showSampleEditor(): void {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    this.gfx.drawText(0, 0, '╔════════════════════════════════════════════════════════════════════════════╗', AnsiColor.Cyan);
    this.gfx.drawText(0, 1, '║                           SAMPLE MANAGER                                   ║', AnsiColor.Cyan);
    this.gfx.drawText(0, 2, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);

    const samples = this.sampleManager.listSamples();
    let y = 4;

    if (samples.length === 0) {
      this.gfx.drawText(5, y++, 'No samples found in data/samples/', AnsiColor.Yellow);
      this.gfx.drawText(5, y++, 'Place WAV or MP3 files there to load them.', AnsiColor.White);
    } else {
      this.gfx.drawText(5, y++, 'Available Samples:', AnsiColor.Yellow);
      y++;

      samples.slice(0, 15).forEach((sample, idx) => {
        const sizeKb = Math.floor(sample.size / 1024);
        this.gfx.drawText(5, y++, `  ${String(idx + 1).padStart(2, '0')}. ${sample.name.padEnd(40)} ${sizeKb}KB`, AnsiColor.White);
      });
    }

    y = Math.max(y, 20);
    this.gfx.drawText(0, 22, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);
    this.gfx.drawText(0, 23, '║ [1-9] Load Sample  [T] Test Tone  [ESC] Back                              ║', AnsiColor.White);
    this.gfx.drawText(0, 24, '╚════════════════════════════════════════════════════════════════════════════╝', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private handleSampleEditorInput(key: string): void {
    if (key === 'Escape' || key === '\x1b') {
      this.currentView = 'main';
      this.showMainMenu();
    } else if (key.toLowerCase() === 't') {
      const testSample = this.sampleManager.loadSample('test.wav');
      const instrument = this.sampleManager.createInstrumentFromSample(
        this.song.instruments.length + 1,
        'Test Sample',
        testSample,
        0,
        testSample.length
      );
      this.song.instruments.push(instrument);
      this.showSampleEditor();
    }
  }

  // ==========================================================================
  // EFFECTS EDITOR
  // ==========================================================================

  private showEffectsEditor(): void {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    const inst = this.song.instruments[this.currentInstrument - 1];

    this.gfx.drawText(0, 0, '╔════════════════════════════════════════════════════════════════════════════╗', AnsiColor.Cyan);
    this.gfx.drawText(0, 1, `║ EFFECTS EDITOR                         Instrument ${String(inst.id).padStart(2,'0')}: "${inst.name.substring(0,20).padEnd(20)}" ║`, AnsiColor.Cyan);
    this.gfx.drawText(0, 2, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);

    let y = 4;

    this.gfx.drawText(5, y++, 'Effects Chain:', AnsiColor.Yellow);
    y++;

    if (inst.effects.length === 0) {
      this.gfx.drawText(5, y++, '  (No effects)', AnsiColor.White);
    } else {
      inst.effects.forEach((fx, idx) => {
        const status = fx.enabled ? '[ON ]' : '[OFF]';
        const color = fx.enabled ? AnsiColor.Green : AnsiColor.Red;
        this.gfx.drawText(5, y++, `  ${idx + 1}. ${status} ${fx.type.toUpperCase()}`, color);
      });
    }

    y++;
    y++;
    this.gfx.drawText(5, y++, 'Available Effects:', AnsiColor.Yellow);
    this.gfx.drawText(5, y++, '  [R] Reverb    [D] Delay      [C] Chorus    [B] Bitcrusher', AnsiColor.White);
    this.gfx.drawText(5, y++, '  [P] Compressor [F] Filter    [O] Overdrive [T] Tremolo', AnsiColor.White);

    this.gfx.drawText(0, 22, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);
    this.gfx.drawText(0, 23, '║ [R-T] Add Effect  [1-9] Toggle  [ESC] Back                                ║', AnsiColor.White);
    this.gfx.drawText(0, 24, '╚════════════════════════════════════════════════════════════════════════════╝', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private handleEffectsEditorInput(key: string): void {
    const inst = this.song.instruments[this.currentInstrument - 1];
    const k = key.toLowerCase();

    if (key === 'Escape' || key === '\x1b') {
      this.currentView = 'main';
      this.showMainMenu();
    } else if (k === 'r') {
      inst.effects.push({ type: EffectPluginType.REVERB, enabled: true, params: { decay: 1.5, wet: 0.3 } });
      this.showEffectsEditor();
    } else if (k === 'd') {
      inst.effects.push({ type: EffectPluginType.DELAY, enabled: true, params: { time: 0.25, feedback: 0.5, wet: 0.3 } });
      this.showEffectsEditor();
    } else if (k === 'c') {
      inst.effects.push({ type: EffectPluginType.CHORUS, enabled: true, params: { frequency: 1.5, depth: 0.7, wet: 0.5 } });
      this.showEffectsEditor();
    } else if (k === 'b') {
      inst.effects.push({ type: EffectPluginType.BITCRUSHER, enabled: true, params: { bits: 4, wet: 0.5 } });
      this.showEffectsEditor();
    } else if (k === 'p') {
      inst.effects.push({ type: EffectPluginType.COMPRESSOR, enabled: true, params: { threshold: -24, ratio: 4 } });
      this.showEffectsEditor();
    } else if (/^[1-9]$/.test(k)) {
      const idx = parseInt(k) - 1;
      if (idx < inst.effects.length) {
        inst.effects[idx].enabled = !inst.effects[idx].enabled;
        this.showEffectsEditor();
      }
    }
  }

  // ==========================================================================
  // SONG ARRANGER
  // ==========================================================================

  private showSongEditor(): void {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    this.gfx.drawText(0, 0, '╔════════════════════════════════════════════════════════════════════════════╗', AnsiColor.Cyan);
    this.gfx.drawText(0, 1, `║ SONG ARRANGER                       Song: ${this.song.title.substring(0,30).padEnd(30)} ║`, AnsiColor.Cyan);
    this.gfx.drawText(0, 2, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);

    let y = 4;

    this.gfx.drawText(5, y++, `BPM: ${this.song.bpm}  Channels: ${this.song.channels}  Patterns: ${this.song.patterns.length}`, AnsiColor.Yellow);
    y++;

    this.gfx.drawText(5, y++, 'Pattern Sequence:', AnsiColor.Yellow);
    y++;

    this.song.sequence.slice(0, 12).forEach((patternId, idx) => {
      const pattern = this.song.patterns.find(p => p.id === patternId);
      const marker = idx === 0 ? '>' : ' ';
      this.gfx.drawText(5, y++, `  ${marker} ${String(idx).padStart(2,'0')}: Pattern ${String(patternId).padStart(2,'0')} - ${pattern?.name || 'Unknown'}`, AnsiColor.White);
    });

    y++;
    y++;
    this.gfx.drawText(5, y++, 'Available Patterns:', AnsiColor.Yellow);
    this.song.patterns.slice(0, 4).forEach(pattern => {
      const noteCount = pattern.data.size;
      this.gfx.drawText(5, y++, `  ${String(pattern.id).padStart(2,'0')}. ${pattern.name.padEnd(20)} (${noteCount} notes)`, AnsiColor.White);
    });

    this.gfx.drawText(0, 22, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);
    this.gfx.drawText(0, 23, '║ [+] Add Pattern  [-] Remove  [Space] Play Song  [ESC] Back                ║', AnsiColor.White);
    this.gfx.drawText(0, 24, '╚════════════════════════════════════════════════════════════════════════════╝', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private handleSongEditorInput(key: string): void {
    if (key === 'Escape' || key === '\x1b') {
      this.currentView = 'main';
      this.showMainMenu();
    } else if (key === '+') {
      if (this.song.patterns.length > 0) {
        this.song.sequence.push(0);
        this.showSongEditor();
      }
    } else if (key === '-') {
      if (this.song.sequence.length > 1) {
        this.song.sequence.pop();
        this.showSongEditor();
      }
    } else if (key === ' ') {
      this.audio.playSong(this.song, true);
    }
  }

  // ==========================================================================
  // EXPORT
  // ==========================================================================

  private showExport(): void {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    this.gfx.drawText(0, 0, '╔════════════════════════════════════════════════════════════════════════════╗', AnsiColor.Cyan);
    this.gfx.drawText(0, 1, '║                           MODULE EXPORT                                    ║', AnsiColor.Cyan);
    this.gfx.drawText(0, 2, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);

    let y = 4;

    this.gfx.drawText(5, y++, `Song: ${this.song.title}`, AnsiColor.Yellow);
    this.gfx.drawText(5, y++, `Artist: ${this.song.artist}`, AnsiColor.White);
    y++;

    this.gfx.drawText(5, y++, 'Statistics:', AnsiColor.Yellow);
    this.gfx.drawText(5, y++, `  Patterns: ${this.song.patterns.length}`, AnsiColor.White);
    this.gfx.drawText(5, y++, `  Instruments: ${this.song.instruments.length}`, AnsiColor.White);
    this.gfx.drawText(5, y++, `  BPM: ${this.song.bpm}`, AnsiColor.White);
    this.gfx.drawText(5, y++, `  Channels: ${this.song.channels}`, AnsiColor.White);
    y++;

    this.gfx.drawText(5, y++, 'Export Formats:', AnsiColor.Yellow);
    this.gfx.drawText(5, y++, '  [J] JSON Format (.json)       - Human-readable', AnsiColor.Green);
    this.gfx.drawText(5, y++, '  [B] Binary Format (.trkmod)   - Compact', AnsiColor.Green);
    this.gfx.drawText(5, y++, '  [G] Game Format (.game.json)  - For Door SDK games', AnsiColor.Green);
    y++;

    const modules = this.exportManager.listModules();
    if (modules.length > 0) {
      this.gfx.drawText(5, y++, 'Saved Modules:', AnsiColor.Yellow);
      modules.slice(0, 5).forEach(mod => {
        const sizeKb = Math.floor(mod.size / 1024);
        this.gfx.drawText(5, y++, `  ${mod.name.padEnd(40)} ${sizeKb}KB`, AnsiColor.White);
      });
    }

    this.gfx.drawText(0, 22, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);
    this.gfx.drawText(0, 23, '║ [J/B/G] Export  [L] Load  [ESC] Back                                      ║', AnsiColor.White);
    this.gfx.drawText(0, 24, '╚════════════════════════════════════════════════════════════════════════════╝', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private handleExportInput(key: string): void {
    const k = key.toLowerCase();

    if (key === 'Escape' || key === '\x1b') {
      this.currentView = 'main';
      this.showMainMenu();
    } else if (k === 'j') {
      const filename = this.song.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      this.exportManager.exportJSON(this.song, filename);
      this.showExport();
    } else if (k === 'b') {
      const filename = this.song.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      this.exportManager.exportBinary(this.song, filename);
      this.showExport();
    } else if (k === 'g') {
      const filename = this.song.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      this.exportManager.exportForGame(this.song, filename);
      this.showExport();
    } else if (k === 'l') {
      const modules = this.exportManager.listModules();
      if (modules.length > 0) {
        const module = modules[0];
        if (module.type === 'json') {
          this.song = this.exportManager.importJSON(module.name);
        } else {
          this.song = this.exportManager.importBinary(module.name);
        }
        this.showExport();
      }
    }
  }

  // ==========================================================================
  // AI ASSISTANT
  // ==========================================================================

  private showAIAssistant(): void {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    this.gfx.drawText(0, 0, '╔════════════════════════════════════════════════════════════════════════════╗', AnsiColor.Cyan);
    this.gfx.drawText(0, 1, '║                           AI ASSISTANT                                     ║', AnsiColor.Cyan);
    this.gfx.drawText(0, 2, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);

    let y = 4;

    this.gfx.drawText(5, y++, 'AI Composition Tools:', AnsiColor.Yellow);
    y++;

    this.gfx.drawText(5, y++, 'Melody Generation:', AnsiColor.Yellow);
    this.gfx.drawText(5, y++, '  [M] Generate melody in C major', AnsiColor.Green);
    this.gfx.drawText(5, y++, '  [N] Generate melody in A minor', AnsiColor.Green);
    y++;

    this.gfx.drawText(5, y++, 'Chord Progressions:', AnsiColor.Yellow);
    this.gfx.drawText(5, y++, '  [C] Generate pop progression', AnsiColor.Green);
    this.gfx.drawText(5, y++, '  [J] Generate jazz progression', AnsiColor.Green);
    this.gfx.drawText(5, y++, '  [B] Generate blues progression', AnsiColor.Green);
    y++;

    this.gfx.drawText(5, y++, 'Drum Patterns:', AnsiColor.Yellow);
    this.gfx.drawText(5, y++, '  [D] Electronic drum pattern', AnsiColor.Green);
    this.gfx.drawText(5, y++, '  [R] Rock drum pattern', AnsiColor.Green);
    this.gfx.drawText(5, y++, '  [F] Funk drum pattern', AnsiColor.Green);
    y++;

    this.gfx.drawText(5, y++, 'Pattern Variations:', AnsiColor.Yellow);
    this.gfx.drawText(5, y++, '  [V] Create variation of current pattern', AnsiColor.Green);

    this.gfx.drawText(0, 22, '╠════════════════════════════════════════════════════════════════════════════╣', AnsiColor.Cyan);
    this.gfx.drawText(0, 23, '║ Select option above  [ESC] Back                                            ║', AnsiColor.White);
    this.gfx.drawText(0, 24, '╚════════════════════════════════════════════════════════════════════════════╝', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  private handleAIAssistantInput(key: string): void {
    const k = key.toLowerCase();

    if (key === 'Escape' || key === '\x1b') {
      this.currentView = 'main';
      this.showMainMenu();
      return;
    }

    const pattern = this.song.patterns[this.currentPattern];

    if (k === 'm') {
      const notes = this.aiGenerator.generateMelody({ scale: 'C major', octave: 4, length: 16 });
      notes.forEach((note, idx) => {
        if (note !== '...') {
          pattern.data.set(`${idx}:0`, { note, instrument: 1, volume: 0x80 });
        }
      });
      this.currentView = 'pattern-editor';
      this.showPatternEditor();
    } else if (k === 'n') {
      const notes = this.aiGenerator.generateMelody({ scale: 'A minor', octave: 4, length: 16 });
      notes.forEach((note, idx) => {
        if (note !== '...') {
          pattern.data.set(`${idx}:0`, { note, instrument: 1, volume: 0x80 });
        }
      });
      this.currentView = 'pattern-editor';
      this.showPatternEditor();
    } else if (k === 'c') {
      const chords = this.aiGenerator.generateChords({ progression: ['C maj', 'F maj', 'G maj', 'C maj'], octave: 3 });
      chords.forEach((chordNotes, row) => {
        chordNotes.forEach((note, ch) => {
          pattern.data.set(`${row}:${ch}`, { note, instrument: 2, volume: 0x80 });
        });
      });
      this.currentView = 'pattern-editor';
      this.showPatternEditor();
    } else if (k === 'd') {
      const drums = this.aiGenerator.generateDrumPattern({ style: 'electronic', rows: 64 });
      drums.kick.forEach(row => {
        pattern.data.set(`${row}:0`, { note: 'C-2' as NoteValue, instrument: 4, volume: 0xFF });
      });
      drums.snare.forEach(row => {
        pattern.data.set(`${row}:1`, { note: 'C-3' as NoteValue, instrument: 5, volume: 0xFF });
      });
      this.currentView = 'pattern-editor';
      this.showPatternEditor();
    } else if (k === 'v') {
      const variation = this.aiGenerator.createVariation(pattern, { transpose: 2, randomize: 0.2 });
      this.song.patterns.push(variation);
      this.currentPattern = this.song.patterns.length - 1;
      this.currentView = 'pattern-editor';
      this.showPatternEditor();
    }
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private quit(): void {
    if (this.userId) {
      this.door.disconnect(this.userId);
    }
  }

  start(): void {
    this.door.start();
  }
}

// Start the tracker
const tracker = new TrackerDoor();
tracker.start();
