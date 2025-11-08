/**
 * Undo/Redo System
 * Provides full undo/redo functionality for pattern editing
 */

import { Song, Pattern, Note } from '../data/types';

interface UndoState {
  song: string; // JSON serialized song state
  description: string;
  timestamp: number;
}

export class UndoManager {
  private undoStack: UndoState[] = [];
  private redoStack: UndoState[] = [];
  private maxHistorySize: number = 100;
  private currentState: Song;

  constructor(initialSong: Song) {
    this.currentState = initialSong;
    this.pushState('Initial state');
  }

  /**
   * Save current state to undo stack
   */
  pushState(description: string): void {
    const state: UndoState = {
      song: JSON.stringify(this.serializeSong(this.currentState)),
      description,
      timestamp: Date.now()
    };

    this.undoStack.push(state);

    // Clear redo stack when new action is performed
    this.redoStack = [];

    // Limit history size
    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }
  }

  /**
   * Undo last action
   */
  undo(): Song | null {
    if (this.undoStack.length <= 1) {
      return null; // Can't undo initial state
    }

    // Move current state to redo stack
    const currentState = this.undoStack.pop()!;
    this.redoStack.push(currentState);

    // Restore previous state
    const previousState = this.undoStack[this.undoStack.length - 1];
    this.currentState = this.deserializeSong(JSON.parse(previousState.song));

    return this.currentState;
  }

  /**
   * Redo last undone action
   */
  redo(): Song | null {
    if (this.redoStack.length === 0) {
      return null;
    }

    const state = this.redoStack.pop()!;
    this.undoStack.push(state);

    this.currentState = this.deserializeSong(JSON.parse(state.song));
    return this.currentState;
  }

  /**
   * Update current state
   */
  updateState(song: Song): void {
    this.currentState = song;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get undo history description
   */
  getUndoHistory(): string[] {
    return this.undoStack.map(s => s.description);
  }

  /**
   * Get redo history description
   */
  getRedoHistory(): string[] {
    return this.redoStack.map(s => s.description);
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pushState('Clear history');
  }

  /**
   * Serialize song for storage
   */
  private serializeSong(song: Song): any {
    return {
      ...song,
      patterns: song.patterns.map(pattern => ({
        ...pattern,
        data: Array.from(pattern.data.entries()).map(([key, note]) => ({ key, note }))
      })),
      instruments: song.instruments.map(inst => ({
        ...inst,
        sample: inst.sample ? {
          ...inst.sample,
          data: Array.from(inst.sample.data)
        } : undefined
      }))
    };
  }

  /**
   * Deserialize song from storage
   */
  private deserializeSong(data: any): Song {
    return {
      ...data,
      patterns: data.patterns.map((pattern: any) => ({
        ...pattern,
        data: new Map(pattern.data.map((item: any) => [item.key, item.note]))
      })),
      instruments: data.instruments.map((inst: any) => ({
        ...inst,
        sample: inst.sample ? {
          ...inst.sample,
          data: new Float32Array(inst.sample.data)
        } : undefined
      }))
    };
  }
}

/**
 * Clipboard Manager for copy/paste operations
 */
export class ClipboardManager {
  private clipboard: Map<string, Note> | null = null;
  private clipboardSize: { rows: number; channels: number } = { rows: 0, channels: 0 };

  /**
   * Copy selection to clipboard
   */
  copy(
    pattern: Pattern,
    startRow: number,
    endRow: number,
    startChannel: number,
    endChannel: number
  ): void {
    this.clipboard = new Map();
    this.clipboardSize = {
      rows: endRow - startRow + 1,
      channels: endChannel - startChannel + 1
    };

    for (let row = startRow; row <= endRow; row++) {
      for (let ch = startChannel; ch <= endChannel; ch++) {
        const key = `${row}:${ch}`;
        const note = pattern.data.get(key);
        if (note) {
          const relativeKey = `${row - startRow}:${ch - startChannel}`;
          this.clipboard.set(relativeKey, { ...note });
        }
      }
    }
  }

  /**
   * Cut selection to clipboard
   */
  cut(
    pattern: Pattern,
    startRow: number,
    endRow: number,
    startChannel: number,
    endChannel: number
  ): void {
    this.copy(pattern, startRow, endRow, startChannel, endChannel);

    // Delete selected area
    for (let row = startRow; row <= endRow; row++) {
      for (let ch = startChannel; ch <= endChannel; ch++) {
        pattern.data.delete(`${row}:${ch}`);
      }
    }
  }

  /**
   * Paste clipboard to pattern
   */
  paste(pattern: Pattern, startRow: number, startChannel: number, mix: boolean = false): void {
    if (!this.clipboard) return;

    this.clipboard.forEach((note, key) => {
      const [relRow, relCh] = key.split(':').map(Number);
      const targetRow = startRow + relRow;
      const targetCh = startChannel + relCh;

      if (targetRow < pattern.rows && targetCh < pattern.channels) {
        const targetKey = `${targetRow}:${targetCh}`;
        if (mix) {
          // Mix mode: only paste if target is empty
          if (!pattern.data.has(targetKey)) {
            pattern.data.set(targetKey, { ...note });
          }
        } else {
          // Overwrite mode
          pattern.data.set(targetKey, { ...note });
        }
      }
    });
  }

  /**
   * Check if clipboard has data
   */
  hasData(): boolean {
    return this.clipboard !== null && this.clipboard.size > 0;
  }

  /**
   * Get clipboard size
   */
  getSize(): { rows: number; channels: number } {
    return this.clipboardSize;
  }

  /**
   * Clear clipboard
   */
  clear(): void {
    this.clipboard = null;
    this.clipboardSize = { rows: 0, channels: 0 };
  }
}
