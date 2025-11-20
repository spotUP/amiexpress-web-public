/**
 * TrackerDoor - Professional Music Tracker BBS Door
 * Inspired by Renoise, Protracker, and FastTracker II
 *
 * Now runs as a CLIENT DOOR in the browser with real Web Audio API!
 */

import {
  ClientDoor,
  AnsiColor,
  visibleLength,
  padEndVisible
} from '@amiexpress/bbs-door-sdk/client';
import { GraphicsEngine } from './graphics-engine';
import { AudioEngine } from './audio/engine';
import { TrackerVisualizer } from './visualizations/tracker-visualizer';
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
// Browser-compatible imports only
import { AIGenerator } from './ai/generator';
import { UndoManager, ClipboardManager } from './utils/undo';

// Note: File-based features (export, sample loading, autosave) are disabled in browser mode
// These features require Node.js file system access which is not available in the browser
import { MODParser } from './formats/mod-parser';
import { XMParser } from './formats/xm-parser';
import { ITParser } from './formats/it-parser';
import { XIParser, ITIParser, XRNIParser } from './formats/instrument-parsers';
import { formatVolumeColumn, parseVolumeColumn } from './audio/volume-column';

type View = 'main' | 'pattern-editor' | 'instrument-editor' | 'sample-editor' | 'effects-editor' | 'song-editor' | 'export' | 'ai-assistant' | 'help';

class TrackerDoor {
  private door: ClientDoor;
  private gfx: GraphicsEngine;
  private audio: AudioEngine;
  private aiGenerator: AIGenerator;
  private undoManager: UndoManager;
  private clipboardManager: ClipboardManager;
  private visualizer: TrackerVisualizer;
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

  // Display
  private scrollRow: number = 0;
  private scrollChannel: number = 0;
  private visibleRows: number = 16;
  private visibleChannels: number = 6;

  // Selection
  private selectionMode: boolean = false;
  private selectionStart: { row: number; channel: number } = { row: 0, channel: 0 };
  private selectionEnd: { row: number; channel: number } = { row: 0, channel: 0 };

  // Channel controls
  private channelMute: boolean[] = new Array(16).fill(false);
  private channelSolo: boolean[] = new Array(16).fill(false);

  // Visualization
  private showVisualizer: boolean = true;
  private visualizerMode: 'vu' | 'waveform' | 'spectrum' | 'off' = 'vu';

  constructor() {
    this.door = new ClientDoor({
      name: 'TrackerDoor',
      version: '1.0.0',
      author: 'Demo Scene Community',
      description: 'Professional Music Tracker',
      minSecurity: 0,
      runtime: 'client'
    });

    this.gfx = new GraphicsEngine();
    this.audio = new AudioEngine(16);
    this.aiGenerator = new AIGenerator();
    this.visualizer = new TrackerVisualizer(8);

    // Initialize default song
    this.song = this.createDefaultSong();

    // Initialize undo/redo and clipboard (browser-compatible features)
    this.undoManager = new UndoManager(this.song);
    this.clipboardManager = new ClipboardManager();

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
      console.log('[TrackerDoor] User connected:', user);
      this.userId = user.id;
      await this.audio.init();
      // Start directly in pattern editor
      this.currentView = 'pattern-editor';
      this.showPatternEditor();
    });

    this.door.onInput((user: any, key: any) => {
      console.log('[TrackerDoor] Input received:', key);
      const keyStr = key.key || key;
      console.log('[TrackerDoor] Handling key:', keyStr);
      this.handleInput(keyStr);
    });

    this.door.onDisconnect(() => {
      console.log('[TrackerDoor] User disconnected');
      this.audio.dispose();
    });
  }

  /**
   * Handle keyboard input
   */
  private handleInput(key: string): void {
    // Global commands (accessible from anywhere with Ctrl key)
    if (this.handleGlobalCommands(key)) {
      return;
    }

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

  /**
   * Handle global commands (accessible from any view)
   * Returns true if command was handled
   * NOTE: Some Ctrl commands are disabled in pattern-editor to avoid clashing with editing
   */
  private handleGlobalCommands(key: string): boolean {
    const k = key.toLowerCase();

    // F1 - Help (always available)
    if (key === 'F1' || key === '\x1b[11~') {
      this.currentView = 'help';
      this.showHelp();
      return true;
    }

    // Ctrl+Q - Quit (always available)
    if (key === '\x11') {
      this.quit();
      return true;
    }

    // Disable other Ctrl commands in pattern-editor to avoid clashing with editing shortcuts
    // (Ctrl+C/X/V for copy/paste, Ctrl+Z/Y for undo/redo, etc.)
    if (this.currentView === 'pattern-editor') {
      return false;
    }

    // Ctrl+P - Pattern Editor
    if (key === '\x10') {
      this.currentView = 'pattern-editor';
      this.showPatternEditor();
      return true;
    }

    // Ctrl+I - Instrument Editor
    if (key === '\t') {
      this.currentView = 'instrument-editor';
      this.showInstrumentEditor();
      return true;
    }

    // Ctrl+M - Sample Manager
    if (key === '\r') {
      this.currentView = 'sample-editor';
      this.showSampleEditor();
      return true;
    }

    // Ctrl+F - Effects Editor
    if (key === '\x06') {
      this.currentView = 'effects-editor';
      this.showEffectsEditor();
      return true;
    }

    // Ctrl+S - Song Arranger
    if (key === '\x13') {
      this.currentView = 'song-editor';
      this.showSongEditor();
      return true;
    }

    // Ctrl+E - Export
    if (key === '\x05') {
      this.currentView = 'export';
      this.showExport();
      return true;
    }

    // Ctrl+L - Import
    if (key === '\x0c') {
      this.gfx.clear();
      this.gfx.drawText(5, 5, 'Import feature: Place .mod, .xm, or .it files in data/import/');
      this.gfx.drawText(5, 6, 'Then use Load from Export menu.');
      this.gfx.drawText(5, 8, 'Press any key to continue...');
      this.door.sendAnsi(this.gfx.render());
      return true;
    }

    // Ctrl+A - AI Assistant
    if (key === '\x01') {
      this.currentView = 'ai-assistant';
      this.showAIAssistant();
      return true;
    }

    // Ctrl+V - Toggle Visualizer (not in pattern editor due to early return above)
    if (key === '\x16') {
      this.cycleVisualizerMode();
      return true;
    }

    return false;
  }

  // ==========================================================================
  // MAIN MENU
  // ==========================================================================

  private showMainMenu(): void {
    if (!this.userId) return;

    this.gfx.clear();

    // Title
    this.gfx.drawText(10, 2, '_____________________________________________________________');
    this.gfx.drawText(10, 3, '|          T R A C K E R D O O R   v 1 . 0                 |');
    this.gfx.drawText(10, 4, '|        Professional Music Tracker for BBS                 |');
    this.gfx.drawText(10, 5, '|___________________________________________________________|');

    // Song info
    this.gfx.drawText(10, 7, `Song: ${this.song.title}`);
    this.gfx.drawText(10, 8, `BPM: ${this.song.bpm}  Channels: ${this.song.channels}  Patterns: ${this.song.patterns.length}`);

    // Menu
    this.gfx.drawText(10, 9, ' --------------- MAIN MENU --------------- ');
    this.gfx.drawText(10, 10, '|                                          |');
    this.gfx.drawText(10, 11, '|  [P] Pattern Editor                      |');
    this.gfx.drawText(10, 12, '|  [I] Instrument Editor                   |');
    this.gfx.drawText(10, 13, '|  [M] Sample Manager                      |');
    this.gfx.drawText(10, 14, '|  [F] Effects Editor                      |');
    this.gfx.drawText(10, 15, '|  [S] Song Arranger                       |');
    this.gfx.drawText(10, 16, '|  [E] Export Module                       |');
    this.gfx.drawText(10, 17, '|  [L] Import (MOD/XM/IT)                  |');
    this.gfx.drawText(10, 18, '|  [A] AI Assistant                        |');
    this.gfx.drawText(10, 19, '|  [H] Help & Shortcuts                    |');
    this.gfx.drawText(10, 20, '|  [Q] Quit                                |');
    this.gfx.drawText(10, 21, '|                                          |');
    this.gfx.drawText(10, 22, '|__________________________________________|');

    this.door.sendAnsi(this.gfx.render());
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
    } else if (k === 'l') {
      // Show import info message
      this.gfx.clear();
      this.gfx.drawText(5, 5, 'Import feature: Place .mod, .xm, or .it files in data/import/');
      this.gfx.drawText(5, 6, 'Then use Load from Export menu.');
      this.gfx.drawText(5, 8, 'Press any key to continue...');
      this.door.sendAnsi(this.gfx.render());
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

    this.gfx.clear();

    const pattern = this.song.patterns[this.currentPattern];

    // Update visualizer with mock channel levels (will be real-time when audio plays)
    if (this.visualizerMode !== 'off') {
      for (let ch = 0; ch < this.song.channels; ch++) {
        // Mock level based on whether channel has data at current row
        const key = `${this.currentRow}:${ch}`;
        const hasNote = pattern.data.has(key);
        this.visualizer.setChannelLevel(ch, hasNote ? Math.random() * 0.8 + 0.2 : 0);
      }
    }

    // Header
    this.gfx.drawText(0, 0, '________________________________________________________________________________');
    const vizMode = this.visualizerMode === 'off' ? 'OFF' : this.visualizerMode.toUpperCase();
    const header = ` TrackerDoor v1.0  BPM:${String(this.song.bpm).padStart(3)} Row:${String(this.currentRow).padStart(2,'0')}/${pattern.rows} Pat:${String(this.currentPattern + 1).padStart(2,'0')} Ch:${String(this.currentChannel + 1).padStart(2,'0')}/${this.song.channels} Viz:${vizMode} `;
    this.gfx.drawText(0, 1, `|${padEndVisible(header, 78)}|`);
    this.gfx.drawText(0, 2, '+--------+----------+----------+----------+----------+----------+----------+');

    // Channel headers
    let headerLine = '|   ROW  |';
    for (let ch = 0; ch < Math.min(6, this.song.channels); ch++) {
      headerLine += ` CH${String(ch + 1).padStart(2,'0')}     |`;
    }
    headerLine = padEndVisible(headerLine, 79) + '|';
    this.gfx.drawText(0, 3, headerLine);
    this.gfx.drawText(0, 4, '+--------+----------+----------+----------+----------+----------+----------+');

    // Pattern data (16 visible rows)
    const startRow = this.scrollRow;
    const endRow = Math.min(startRow + this.visibleRows, pattern.rows);

    for (let row = startRow; row < endRow; row++) {
      const y = 5 + (row - startRow);
      const cursor = row === this.currentRow ? '>' : ' ';

      let line = `| ${cursor} ${String(row).padStart(2,'0')}  |`;

      for (let ch = 0; ch < Math.min(6, this.song.channels); ch++) {
        const key = `${row}:${ch}`;
        const note = pattern.data.get(key) || { note: '...', instrument: 0, volume: 0 };

        // Format: "C-4 01 40" where 40 is volume column display
        let noteStr: string;
        if (note.note === '...') {
          noteStr = '... .. ..';
        } else {
          const instrStr = String(note.instrument).padStart(2,'0');
          const volColStr = note.volumeColumn !== undefined && note.volumeColumn !== 0
            ? formatVolumeColumn(parseVolumeColumn(note.volumeColumn))
            : '..';
          noteStr = `${note.note} ${instrStr} ${volColStr}`;
        }

        line += ` ${noteStr}|`;
      }

      line = padEndVisible(line, 79) + '|';
      this.gfx.drawText(0, y, line);
    }

    // Footer
    const footerY = 5 + this.visibleRows;
    this.gfx.drawText(0, footerY, '+------------------------------------------------------------------------------+');

    // Show visualizer if enabled
    if (this.visualizerMode !== 'off') {
      const vizOutput = this.visualizer.renderLayout(this.visualizerMode, this.currentRow, pattern.rows);
      const vizLines = vizOutput.split('\n');
      vizLines.forEach((line, idx) => {
        if (footerY + idx < 22) {
          this.gfx.drawText(0, footerY + idx, line);
        }
      });
    }

    this.gfx.drawText(0, footerY + 1, '| [F1] Help  [Space] Play  [V] Viz  [Tab] Ch  [Arrows] Nav  [ESC] Menu       |');
    this.gfx.drawText(0, footerY + 2, '| [Q-I,A-K] Notes  [Z-/] Octave  [0-9] Volume  [1-9] Instrument              |');
    this.gfx.drawText(0, footerY + 3, '|______________________________________________________________________________|');

    this.door.sendAnsi(this.gfx.render());
  }

  private handlePatternEditorInput(key: string): void {
    const pattern = this.song.patterns[this.currentPattern];

    // Undo/Redo (Ctrl+Z, Ctrl+Y)
    if (key === '\x1a') { // Ctrl+Z
      const undoneState = this.undoManager.undo();
      if (undoneState) {
        this.song = undoneState;
        this.showPatternEditor();
      }
      return;
    } else if (key === '\x19') { // Ctrl+Y
      const redoneState = this.undoManager.redo();
      if (redoneState) {
        this.song = redoneState;
        this.showPatternEditor();
      }
      return;
    }

    // Copy/Cut/Paste (Ctrl+C, Ctrl+X, Ctrl+V)
    if (key === '\x03') { // Ctrl+C
      if (this.selectionMode) {
        const startRow = Math.min(this.selectionStart.row, this.selectionEnd.row);
        const endRow = Math.max(this.selectionStart.row, this.selectionEnd.row);
        const startCh = Math.min(this.selectionStart.channel, this.selectionEnd.channel);
        const endCh = Math.max(this.selectionStart.channel, this.selectionEnd.channel);
        this.clipboardManager.copy(pattern, startRow, endRow, startCh, endCh);
      } else {
        this.clipboardManager.copy(pattern, this.currentRow, this.currentRow, this.currentChannel, this.currentChannel);
      }
      this.showPatternEditor();
      return;
    } else if (key === '\x18') { // Ctrl+X
      this.undoManager.updateState(this.song);
      this.undoManager.pushState('Cut block');
      if (this.selectionMode) {
        const startRow = Math.min(this.selectionStart.row, this.selectionEnd.row);
        const endRow = Math.max(this.selectionStart.row, this.selectionEnd.row);
        const startCh = Math.min(this.selectionStart.channel, this.selectionEnd.channel);
        const endCh = Math.max(this.selectionStart.channel, this.selectionEnd.channel);
        this.clipboardManager.cut(pattern, startRow, endRow, startCh, endCh);
      } else {
        this.clipboardManager.cut(pattern, this.currentRow, this.currentRow, this.currentChannel, this.currentChannel);
      }
      this.showPatternEditor();
      return;
    } else if (key === '\x16') { // Ctrl+V
      if (this.clipboardManager.hasData()) {
        this.undoManager.updateState(this.song);
        this.undoManager.pushState('Paste block');
        this.clipboardManager.paste(pattern, this.currentRow, this.currentChannel, false);
        this.showPatternEditor();
      }
      return;
    }

    // Block selection (Shift+arrows)
    const isShift = key.startsWith('Shift+') || key.includes('Shift');

    if (isShift && !this.selectionMode) {
      this.selectionMode = true;
      this.selectionStart = { row: this.currentRow, channel: this.currentChannel };
      this.selectionEnd = { row: this.currentRow, channel: this.currentChannel };
    }

    // Channel mute/solo
    if (key.toLowerCase() === 'm') {
      this.channelMute[this.currentChannel] = !this.channelMute[this.currentChannel];
      this.showPatternEditor();
      return;
    } else if (key.toLowerCase() === 's' && key.length === 1) {
      this.channelSolo[this.currentChannel] = !this.channelSolo[this.currentChannel];
      this.showPatternEditor();
      return;
    }

    // Toggle visualizer
    if (key.toLowerCase() === 'v' && key.length === 1) {
      this.cycleVisualizerMode();
      this.showPatternEditor();
      return;
    }

    // Navigation
    if (key === 'ArrowUp' || (isShift && key.includes('Up'))) {
      this.currentRow = Math.max(0, this.currentRow - 1);
      if (this.currentRow < this.scrollRow) this.scrollRow = Math.max(0, this.scrollRow - 1);
      if (this.selectionMode) {
        this.selectionEnd = { row: this.currentRow, channel: this.currentChannel };
      }
      this.showPatternEditor();
    } else if (key === 'ArrowDown' || (isShift && key.includes('Down'))) {
      this.currentRow = Math.min(pattern.rows - 1, this.currentRow + 1);
      if (this.currentRow >= this.scrollRow + this.visibleRows) this.scrollRow++;
      if (this.selectionMode) {
        this.selectionEnd = { row: this.currentRow, channel: this.currentChannel };
      }
      this.showPatternEditor();
    } else if (key === 'ArrowLeft' || (key === '\t' && key.includes('Shift'))) {
      this.currentChannel = Math.max(0, this.currentChannel - 1);
      if (this.selectionMode) {
        this.selectionEnd = { row: this.currentRow, channel: this.currentChannel };
      }
      this.showPatternEditor();
    } else if (key === 'ArrowRight' || (isShift && key.includes('Right'))) {
      this.currentChannel = Math.min(this.song.channels - 1, this.currentChannel + 1);
      if (this.selectionMode) {
        this.selectionEnd = { row: this.currentRow, channel: this.currentChannel };
      }
      this.showPatternEditor();
    } else if (key === '\t' && !isShift) {
      this.currentChannel = Math.min(this.song.channels - 1, this.currentChannel + 1);
      this.showPatternEditor();
    } else if (key === 'PageUp') {
      this.currentRow = Math.max(0, this.currentRow - 16);
      this.scrollRow = Math.max(0, this.scrollRow - 16);
      if (this.selectionMode) {
        this.selectionEnd = { row: this.currentRow, channel: this.currentChannel };
      }
      this.showPatternEditor();
    } else if (key === 'PageDown') {
      this.currentRow = Math.min(pattern.rows - 1, this.currentRow + 16);
      this.scrollRow = Math.min(pattern.rows - this.visibleRows, this.scrollRow + 16);
      if (this.selectionMode) {
        this.selectionEnd = { row: this.currentRow, channel: this.currentChannel };
      }
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
      this.undoManager.updateState(this.song);
      this.undoManager.pushState('Delete note');
      this.deleteNote();
      this.showPatternEditor();
    }

    // Insert row
    if (key === 'Insert') {
      this.undoManager.updateState(this.song);
      this.undoManager.pushState('Insert row');
      this.insertRow();
      this.showPatternEditor();
    }

    // Delete row
    if (key === 'Delete') {
      this.undoManager.updateState(this.song);
      this.undoManager.pushState('Delete row');
      this.deleteRow();
      this.showPatternEditor();
    }

    // Playback
    if (key === ' ') {
      this.togglePlayback();
    }

    // Back to menu or cancel selection
    if (key === 'Escape' || key === '\x1b') {
      if (this.selectionMode) {
        // Cancel selection
        this.selectionMode = false;
        this.showPatternEditor();
      } else {
        this.currentView = 'main';
        this.showMainMenu();
      }
    }
  }

  /**
   * Add note to current position
   */
  private addNote(note: NoteValue): void {
    // Save undo state
    this.undoManager.updateState(this.song);
    this.undoManager.pushState('Add note');

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

    this.gfx.clear();

    const inst = this.song.instruments[this.currentInstrument - 1];
    if (!inst) return;

    this.gfx.drawText(0, 0, '________________________________________________________________________________');
    this.gfx.drawText(0, 1, `| INSTRUMENT EDITOR                      Instrument ${String(inst.id).padStart(2,'0')}: "${inst.name.padEnd(20).substring(0,20)}" |`);
    this.gfx.drawText(0, 2, '+------------------------------------------------------------------------------+');

    let y = 4;

    // Type
    this.gfx.drawText(5, y++, `Type: [${inst.type === 'synth' ? '*' : ' '}] Synth  [${inst.type === 'sample' ? '*' : ' '}] Sample`);
    y++;

    // Oscillator (if synth)
    if (inst.type === 'synth' && inst.oscillator) {
      this.gfx.drawText(5, y++, 'Oscillator');
      this.gfx.drawText(5, y++, ' ----------------------------------------------------------------------');
      this.gfx.drawText(5, y++, `| Waveform: ${inst.oscillator.type.padEnd(20)}                                        |`);
      this.gfx.drawText(5, y++, '|______________________________________________________________________|');
      y++;
    }

    // Envelope
    this.gfx.drawText(5, y++, 'Amplitude Envelope');
    this.gfx.drawText(5, y++, ' ----------------------------------------------------------------------');
    this.gfx.drawText(5, y++, `| A:${String(Math.floor(inst.envelope.attack * 1000)).padStart(4)}ms  D:${String(Math.floor(inst.envelope.decay * 1000)).padStart(4)}ms  S:${String(Math.floor(inst.envelope.sustain * 100)).padStart(3)}%  R:${String(Math.floor(inst.envelope.release * 1000)).padStart(4)}ms                 |`);
    this.gfx.drawText(5, y++, '|______________________________________________________________________|');

    // Footer
    this.gfx.drawText(0, 22, '+------------------------------------------------------------------------------+');
    this.gfx.drawText(0, 23, '| [Lt/Rt] Select Instrument  [P] Preview  [ESC] Back                          |');
    this.gfx.drawText(0, 24, '|______________________________________________________________________________|');

    this.door.sendAnsi(this.gfx.render());
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

    this.gfx.clear();

    this.gfx.drawText(0, 0, '________________________________________________________________________________');
    this.gfx.drawText(0, 1, '|                    TRACKERDOOR HELP & SHORTCUTS                            |');
    this.gfx.drawText(0, 2, '+------------------------------------------------------------------------------+');

    let y = 3;
    this.gfx.drawText(2, y++, 'GLOBAL COMMANDS (work from any screen):');
    this.gfx.drawText(2, y++, '  F1 - Help          Ctrl+P - Pattern Editor   Ctrl+I - Instrument Editor');
    this.gfx.drawText(2, y++, '  Ctrl+M - Samples   Ctrl+F - Effects          Ctrl+S - Song Arranger');
    this.gfx.drawText(2, y++, '  Ctrl+E - Export    Ctrl+L - Import           Ctrl+A - AI Assistant');
    this.gfx.drawText(2, y++, '  Ctrl+Q - Quit      ESC - Back/Cancel');
    y++;
    this.gfx.drawText(2, y++, 'PATTERN EDITOR:');
    this.gfx.drawText(2, y++, '  Arrows - Navigate  Tab - Next channel  Space - Play/pause');
    this.gfx.drawText(2, y++, '  Q-I,A-K,Z-M - Piano keyboard  -/+ - Octave  Backspace - Del note');
    y++;
    this.gfx.drawText(2, y++, 'EDITING:');
    this.gfx.drawText(2, y++, '  Ctrl+Z - Undo  Ctrl+Y - Redo  Insert - Insert row  Delete - Del row');
    this.gfx.drawText(2, y++, '  Ctrl+C - Copy  Ctrl+X - Cut  Ctrl+V - Paste  Shift+Arrows - Select');
    y++;
    this.gfx.drawText(2, y++, 'CHANNEL: M - Mute  S - Solo     FORMAT: MOD/XM/IT import supported');

    this.gfx.drawText(0, 22, '+------------------------------------------------------------------------------+');
    this.gfx.drawText(0, 23, '| [ESC] Back to Pattern Editor                                               |');
    this.gfx.drawText(0, 24, '|______________________________________________________________________________|');

    this.door.sendAnsi(this.gfx.render());
  }

  private handleHelpInput(key: string): void {
    if (key === 'Escape' || key === '\x1b') {
      this.currentView = 'pattern-editor';
      this.showPatternEditor();
    }
  }

  // ==========================================================================
  // SAMPLE EDITOR
  // ==========================================================================

  private showSampleEditor(): void {
    if (!this.userId) return;

    this.gfx.clear();

    this.gfx.drawText(0, 0, '________________________________________________________________________________');
    this.gfx.drawText(0, 1, '|                           SAMPLE MANAGER                                   |');
    this.gfx.drawText(0, 2, '+------------------------------------------------------------------------------+');

    let y = 4;

    this.gfx.drawText(5, y++, 'Sample loading not available in browser mode');
    y++;
    this.gfx.drawText(5, y++, 'In browser mode, you can:');
    this.gfx.drawText(5, y++, '  - Create synth instruments in Instrument Editor');
    this.gfx.drawText(5, y++, '  - Use the built-in synthesizer oscillators');
    this.gfx.drawText(5, y++, '  - Apply effects to instruments');
    y++;
    this.gfx.drawText(5, y++, 'For advanced sample loading, use a Node.js door instead.');

    y = Math.max(y, 20);
    this.gfx.drawText(0, 22, '+------------------------------------------------------------------------------+');
    this.gfx.drawText(0, 23, '| [ESC] Back                                                                 |');
    this.gfx.drawText(0, 24, '|______________________________________________________________________________|');

    this.door.sendAnsi(this.gfx.render());
  }

  private handleSampleEditorInput(key: string): void {
    if (key === 'Escape' || key === '\x1b') {
      this.currentView = 'main';
      this.showMainMenu();
    }
  }

  // ==========================================================================
  // EFFECTS EDITOR
  // ==========================================================================

  private showEffectsEditor(): void {
    if (!this.userId) return;

    this.gfx.clear();

    const inst = this.song.instruments[this.currentInstrument - 1];

    this.gfx.drawText(0, 0, '________________________________________________________________________________');
    this.gfx.drawText(0, 1, `| EFFECTS EDITOR                         Instrument ${String(inst.id).padStart(2,'0')}: "${inst.name.substring(0,20).padEnd(20)}" |`);
    this.gfx.drawText(0, 2, '+------------------------------------------------------------------------------+');

    let y = 4;

    this.gfx.drawText(5, y++, 'Effects Chain:');
    y++;

    if (inst.effects.length === 0) {
      this.gfx.drawText(5, y++, '  (No effects)');
    } else {
      inst.effects.forEach((fx, idx) => {
        const status = fx.enabled ? '[ON ]' : '[OFF]';
        this.gfx.drawText(5, y++, `  ${idx + 1}. ${status} ${fx.type.toUpperCase()}`);
      });
    }

    y++;
    y++;
    this.gfx.drawText(5, y++, 'Available Effects:');
    this.gfx.drawText(5, y++, '  [R] Reverb    [D] Delay      [C] Chorus    [B] Bitcrusher');
    this.gfx.drawText(5, y++, '  [P] Compressor [F] Filter    [O] Overdrive [T] Tremolo');

    this.gfx.drawText(0, 22, '+------------------------------------------------------------------------------+');
    this.gfx.drawText(0, 23, '| [R-T] Add Effect  [1-9] Toggle  [ESC] Back                                |');
    this.gfx.drawText(0, 24, '|______________________________________________________________________________|');

    this.door.sendAnsi(this.gfx.render());
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

    this.gfx.clear();

    this.gfx.drawText(0, 0, '________________________________________________________________________________');
    this.gfx.drawText(0, 1, `| SONG ARRANGER                       Song: ${this.song.title.substring(0,30).padEnd(30)} |`);
    this.gfx.drawText(0, 2, '+------------------------------------------------------------------------------+');

    let y = 4;

    this.gfx.drawText(5, y++, `BPM: ${this.song.bpm}  Channels: ${this.song.channels}  Patterns: ${this.song.patterns.length}`);
    y++;

    this.gfx.drawText(5, y++, 'Pattern Sequence:');
    y++;

    this.song.sequence.slice(0, 12).forEach((patternId, idx) => {
      const pattern = this.song.patterns.find(p => p.id === patternId);
      const marker = idx === 0 ? '>' : ' ';
      this.gfx.drawText(5, y++, `  ${marker} ${String(idx).padStart(2,'0')}: Pattern ${String(patternId).padStart(2,'0')} - ${pattern?.name || 'Unknown'}`);
    });

    y++;
    y++;
    this.gfx.drawText(5, y++, 'Available Patterns:');
    this.song.patterns.slice(0, 4).forEach(pattern => {
      const noteCount = pattern.data.size;
      this.gfx.drawText(5, y++, `  ${String(pattern.id).padStart(2,'0')}. ${pattern.name.padEnd(20)} (${noteCount} notes)`);
    });

    this.gfx.drawText(0, 22, '+------------------------------------------------------------------------------+');
    this.gfx.drawText(0, 23, '| [+] Add Pattern  [-] Remove  [Space] Play Song  [ESC] Back                |');
    this.gfx.drawText(0, 24, '|______________________________________________________________________________|');

    this.door.sendAnsi(this.gfx.render());
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

    this.gfx.clear();

    this.gfx.drawText(0, 0, '________________________________________________________________________________');
    this.gfx.drawText(0, 1, '|                           MODULE EXPORT                                    |');
    this.gfx.drawText(0, 2, '+------------------------------------------------------------------------------+');

    let y = 4;

    this.gfx.drawText(5, y++, `Song: ${this.song.title}`);
    this.gfx.drawText(5, y++, `Artist: ${this.song.artist}`);
    y++;

    this.gfx.drawText(5, y++, 'Statistics:');
    this.gfx.drawText(5, y++, `  Patterns: ${this.song.patterns.length}`);
    this.gfx.drawText(5, y++, `  Instruments: ${this.song.instruments.length}`);
    this.gfx.drawText(5, y++, `  BPM: ${this.song.bpm}`);
    this.gfx.drawText(5, y++, `  Channels: ${this.song.channels}`);
    y++;

    this.gfx.drawText(5, y++, 'File export not available in browser mode');
    y++;
    this.gfx.drawText(5, y++, 'Your work is stored in browser memory only.');
    this.gfx.drawText(5, y++, 'Future updates may add localStorage export.');

    this.gfx.drawText(0, 22, '+------------------------------------------------------------------------------+');
    this.gfx.drawText(0, 23, '| [ESC] Back                                                                 |');
    this.gfx.drawText(0, 24, '|______________________________________________________________________________|');

    this.door.sendAnsi(this.gfx.render());
  }

  private handleExportInput(key: string): void {
    if (key === 'Escape' || key === '\x1b') {
      this.currentView = 'main';
      this.showMainMenu();
    }
  }

  // ==========================================================================
  // AI ASSISTANT
  // ==========================================================================

  private showAIAssistant(): void {
    if (!this.userId) return;

    this.gfx.clear();

    this.gfx.drawText(0, 0, '________________________________________________________________________________');
    this.gfx.drawText(0, 1, '|                           AI ASSISTANT                                     |');
    this.gfx.drawText(0, 2, '+------------------------------------------------------------------------------+');

    let y = 4;

    this.gfx.drawText(5, y++, 'AI Composition Tools:');
    y++;

    this.gfx.drawText(5, y++, 'Melody Generation:');
    this.gfx.drawText(5, y++, '  [M] Generate melody in C major');
    this.gfx.drawText(5, y++, '  [N] Generate melody in A minor');
    y++;

    this.gfx.drawText(5, y++, 'Chord Progressions:');
    this.gfx.drawText(5, y++, '  [C] Generate pop progression');
    this.gfx.drawText(5, y++, '  [J] Generate jazz progression');
    this.gfx.drawText(5, y++, '  [B] Generate blues progression');
    y++;

    this.gfx.drawText(5, y++, 'Drum Patterns:');
    this.gfx.drawText(5, y++, '  [D] Electronic drum pattern');
    this.gfx.drawText(5, y++, '  [R] Rock drum pattern');
    this.gfx.drawText(5, y++, '  [F] Funk drum pattern');
    y++;

    this.gfx.drawText(5, y++, 'Pattern Variations:');
    this.gfx.drawText(5, y++, '  [V] Create variation of current pattern');

    this.gfx.drawText(0, 22, '+------------------------------------------------------------------------------+');
    this.gfx.drawText(0, 23, '| Select option above  [ESC] Back                                            |');
    this.gfx.drawText(0, 24, '|______________________________________________________________________________|');

    this.door.sendAnsi(this.gfx.render());
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

  /**
   * Cycle through visualizer modes
   */
  private cycleVisualizerMode(): void {
    const modes: Array<'vu' | 'waveform' | 'spectrum' | 'off'> = ['vu', 'waveform', 'spectrum', 'off'];
    const currentIndex = modes.indexOf(this.visualizerMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.visualizerMode = modes[nextIndex];

    // Reset visualizer when switching modes
    this.visualizer.reset();
  }

  private quit(): void {
    this.door.shutdown();
  }

  start(): void {
    this.door.start();
  }
}

// Start the tracker (only in browser environment)
if (typeof window !== 'undefined') {
  const tracker = new TrackerDoor();
  tracker.start();
}

export async function runDoor(doorSession: any): Promise<void> {
  const { socket } = doorSession;

  socket.emit('ansi-output', '\r\n\x1b[33mTRACKER requires the browser-based hybrid runtime for full audio/visual support.\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33mPlease launch it from the web interface to experience the tracker UI.\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to return to the BBS...\x1b[0m');

  await new Promise<void>((resolve) => {
    const handler = () => {
      socket.off('user-input', handler);
      resolve();
    };
    socket.on('user-input', handler);
  });
}
