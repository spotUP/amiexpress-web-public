/**
 * Advanced Sample Editor
 * Professional sample editing tools with waveform display
 */

import { Instrument } from '../data/types';

export interface WaveformSelection {
  start: number;
  end: number;
}

export interface SampleEditorState {
  zoom: number; // Samples per pixel
  scroll: number; // Scroll position
  selection: WaveformSelection | null;
  playbackPosition: number;
  loopPoints: { start: number; end: number } | null;
}

/**
 * Sample editing operations
 */
export class SampleEditor {
  private data: Float32Array;
  private sampleRate: number;
  private state: SampleEditorState;
  private undoStack: Float32Array[] = [];
  private redoStack: Float32Array[] = [];
  private maxUndoLevels: number = 50;

  constructor(data: Float32Array, sampleRate: number) {
    this.data = new Float32Array(data);
    this.sampleRate = sampleRate;
    this.state = {
      zoom: 1.0,
      scroll: 0,
      selection: null,
      playbackPosition: 0,
      loopPoints: null
    };
  }

  /**
   * Get current sample data
   */
  getData(): Float32Array {
    return new Float32Array(this.data);
  }

  /**
   * Get sample rate
   */
  getSampleRate(): number {
    return this.sampleRate;
  }

  /**
   * Get editor state
   */
  getState(): SampleEditorState {
    return { ...this.state };
  }

  /**
   * Set selection
   */
  setSelection(start: number, end: number): void {
    this.state.selection = {
      start: Math.max(0, Math.min(start, this.data.length - 1)),
      end: Math.max(0, Math.min(end, this.data.length - 1))
    };
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.state.selection = null;
  }

  /**
   * Select all
   */
  selectAll(): void {
    this.state.selection = { start: 0, end: this.data.length - 1 };
  }

  /**
   * Save current state to undo stack
   */
  private pushUndo(): void {
    this.undoStack.push(new Float32Array(this.data));
    if (this.undoStack.length > this.maxUndoLevels) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Undo last operation
   */
  undo(): boolean {
    if (this.undoStack.length === 0) return false;

    this.redoStack.push(new Float32Array(this.data));
    this.data = this.undoStack.pop()!;
    return true;
  }

  /**
   * Redo last undone operation
   */
  redo(): boolean {
    if (this.redoStack.length === 0) return false;

    this.undoStack.push(new Float32Array(this.data));
    this.data = this.redoStack.pop()!;
    return true;
  }

  /**
   * Normalize audio to peak at target level
   */
  normalize(targetLevel: number = 0.95): void {
    this.pushUndo();

    let peak = 0;
    for (let i = 0; i < this.data.length; i++) {
      peak = Math.max(peak, Math.abs(this.data[i]));
    }

    if (peak === 0) return;

    const scale = targetLevel / peak;
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] *= scale;
    }
  }

  /**
   * Normalize selection
   */
  normalizeSelection(targetLevel: number = 0.95): void {
    if (!this.state.selection) return;

    this.pushUndo();

    const { start, end } = this.state.selection;
    let peak = 0;

    for (let i = start; i <= end; i++) {
      peak = Math.max(peak, Math.abs(this.data[i]));
    }

    if (peak === 0) return;

    const scale = targetLevel / peak;
    for (let i = start; i <= end; i++) {
      this.data[i] *= scale;
    }
  }

  /**
   * Amplify by gain factor
   */
  amplify(gain: number): void {
    this.pushUndo();

    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = Math.max(-1, Math.min(1, this.data[i] * gain));
    }
  }

  /**
   * Fade in
   */
  fadeIn(duration?: number): void {
    this.pushUndo();

    const length = duration
      ? Math.min(Math.floor(duration * this.sampleRate), this.data.length)
      : this.data.length;

    for (let i = 0; i < length; i++) {
      const factor = i / length;
      this.data[i] *= factor;
    }
  }

  /**
   * Fade out
   */
  fadeOut(duration?: number): void {
    this.pushUndo();

    const length = duration
      ? Math.min(Math.floor(duration * this.sampleRate), this.data.length)
      : this.data.length;

    const startPos = this.data.length - length;

    for (let i = 0; i < length; i++) {
      const factor = 1 - i / length;
      this.data[startPos + i] *= factor;
    }
  }

  /**
   * Reverse sample
   */
  reverse(): void {
    this.pushUndo();

    const reversed = new Float32Array(this.data.length);
    for (let i = 0; i < this.data.length; i++) {
      reversed[i] = this.data[this.data.length - 1 - i];
    }
    this.data = reversed;
  }

  /**
   * Reverse selection
   */
  reverseSelection(): void {
    if (!this.state.selection) return;

    this.pushUndo();

    const { start, end } = this.state.selection;
    const length = end - start + 1;
    const reversed = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      reversed[i] = this.data[end - i];
    }

    for (let i = 0; i < length; i++) {
      this.data[start + i] = reversed[i];
    }
  }

  /**
   * Invert phase
   */
  invert(): void {
    this.pushUndo();

    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = -this.data[i];
    }
  }

  /**
   * Silence (set to zero)
   */
  silence(): void {
    this.pushUndo();
    this.data.fill(0);
  }

  /**
   * Silence selection
   */
  silenceSelection(): void {
    if (!this.state.selection) return;

    this.pushUndo();

    const { start, end } = this.state.selection;
    for (let i = start; i <= end; i++) {
      this.data[i] = 0;
    }
  }

  /**
   * Trim silence from start and end
   */
  trimSilence(threshold: number = 0.01): void {
    this.pushUndo();

    let start = 0;
    let end = this.data.length - 1;

    // Find first non-silent sample
    while (start < this.data.length && Math.abs(this.data[start]) < threshold) {
      start++;
    }

    // Find last non-silent sample
    while (end > start && Math.abs(this.data[end]) < threshold) {
      end--;
    }

    const newLength = end - start + 1;
    const trimmed = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      trimmed[i] = this.data[start + i];
    }

    this.data = trimmed;
  }

  /**
   * Crop to selection
   */
  cropToSelection(): void {
    if (!this.state.selection) return;

    this.pushUndo();

    const { start, end } = this.state.selection;
    const newLength = end - start + 1;
    const cropped = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      cropped[i] = this.data[start + i];
    }

    this.data = cropped;
    this.state.selection = null;
  }

  /**
   * Delete selection
   */
  deleteSelection(): void {
    if (!this.state.selection) return;

    this.pushUndo();

    const { start, end } = this.state.selection;
    const deleteLength = end - start + 1;
    const newLength = this.data.length - deleteLength;
    const result = new Float32Array(newLength);

    // Copy before selection
    for (let i = 0; i < start; i++) {
      result[i] = this.data[i];
    }

    // Copy after selection
    for (let i = end + 1; i < this.data.length; i++) {
      result[i - deleteLength] = this.data[i];
    }

    this.data = result;
    this.state.selection = null;
  }

  /**
   * Cut selection (delete and return data)
   */
  cutSelection(): Float32Array | null {
    if (!this.state.selection) return null;

    const { start, end } = this.state.selection;
    const cutData = new Float32Array(end - start + 1);

    for (let i = start; i <= end; i++) {
      cutData[i - start] = this.data[i];
    }

    this.deleteSelection();
    return cutData;
  }

  /**
   * Copy selection
   */
  copySelection(): Float32Array | null {
    if (!this.state.selection) return null;

    const { start, end } = this.state.selection;
    const copyData = new Float32Array(end - start + 1);

    for (let i = start; i <= end; i++) {
      copyData[i - start] = this.data[i];
    }

    return copyData;
  }

  /**
   * Paste data at position
   */
  paste(data: Float32Array, position: number, mix: boolean = false): void {
    this.pushUndo();

    if (mix) {
      // Mix with existing data
      for (let i = 0; i < data.length && position + i < this.data.length; i++) {
        this.data[position + i] = Math.max(-1, Math.min(1, this.data[position + i] + data[i]));
      }
    } else {
      // Insert mode - shift existing data
      const newLength = this.data.length + data.length;
      const result = new Float32Array(newLength);

      // Copy before paste position
      for (let i = 0; i < position; i++) {
        result[i] = this.data[i];
      }

      // Copy pasted data
      for (let i = 0; i < data.length; i++) {
        result[position + i] = data[i];
      }

      // Copy after paste position
      for (let i = position; i < this.data.length; i++) {
        result[data.length + i] = this.data[i];
      }

      this.data = result;
    }
  }

  /**
   * Apply DC offset removal
   */
  removeDCOffset(): void {
    this.pushUndo();

    // Calculate average
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      sum += this.data[i];
    }
    const average = sum / this.data.length;

    // Subtract average from all samples
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] -= average;
    }
  }

  /**
   * Apply simple lowpass filter
   */
  lowpassFilter(cutoff: number = 0.5): void {
    this.pushUndo();

    const filtered = new Float32Array(this.data.length);
    filtered[0] = this.data[0];

    for (let i = 1; i < this.data.length; i++) {
      filtered[i] = filtered[i - 1] * (1 - cutoff) + this.data[i] * cutoff;
    }

    this.data = filtered;
  }

  /**
   * Apply simple highpass filter
   */
  highpassFilter(cutoff: number = 0.1): void {
    this.pushUndo();

    const filtered = new Float32Array(this.data.length);
    let prev = 0;

    for (let i = 0; i < this.data.length; i++) {
      const current = this.data[i];
      filtered[i] = current - prev * (1 - cutoff);
      prev = current;
    }

    this.data = filtered;
  }

  /**
   * Detect zero-crossings for loop point suggestions
   */
  findZeroCrossings(start: number, end: number): number[] {
    const crossings: number[] = [];
    let lastSign = Math.sign(this.data[start]);

    for (let i = start + 1; i <= end; i++) {
      const currentSign = Math.sign(this.data[i]);
      if (currentSign !== lastSign && currentSign !== 0) {
        crossings.push(i);
      }
      lastSign = currentSign;
    }

    return crossings;
  }

  /**
   * Suggest loop points based on zero-crossings and correlation
   */
  suggestLoopPoints(): { start: number; end: number } | null {
    if (this.data.length < 1000) return null;

    // Start looking for loop from 75% through the sample
    const searchStart = Math.floor(this.data.length * 0.75);
    const searchEnd = this.data.length - 100;

    const zeroCrossings = this.findZeroCrossings(searchStart, searchEnd);
    if (zeroCrossings.length === 0) return null;

    // Use the last zero crossing as potential loop end
    const loopEnd = zeroCrossings[zeroCrossings.length - 1];

    // Find matching loop start by correlation
    const windowSize = Math.min(1000, loopEnd - 100);
    let bestStart = 0;
    let bestCorrelation = -Infinity;

    for (let start = 0; start < loopEnd - windowSize; start += 10) {
      let correlation = 0;

      for (let i = 0; i < windowSize; i++) {
        correlation += this.data[start + i] * this.data[loopEnd - windowSize + i];
      }

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestStart = start;
      }
    }

    // Find nearest zero crossing to best start
    const startCrossings = this.findZeroCrossings(
      Math.max(0, bestStart - 50),
      Math.min(this.data.length - 1, bestStart + 50)
    );

    const loopStart =
      startCrossings.length > 0
        ? startCrossings.reduce((closest, crossing) =>
            Math.abs(crossing - bestStart) < Math.abs(closest - bestStart) ? crossing : closest
          )
        : bestStart;

    return { start: loopStart, end: loopEnd };
  }

  /**
   * Set loop points
   */
  setLoopPoints(start: number, end: number): void {
    this.state.loopPoints = {
      start: Math.max(0, Math.min(start, this.data.length - 1)),
      end: Math.max(0, Math.min(end, this.data.length - 1))
    };
  }

  /**
   * Clear loop points
   */
  clearLoopPoints(): void {
    this.state.loopPoints = null;
  }

  /**
   * Crossfade loop (blend loop start/end for seamless looping)
   */
  crossfadeLoop(crossfadeLength: number = 100): void {
    if (!this.state.loopPoints) return;

    this.pushUndo();

    const { start, end } = this.state.loopPoints;
    const fadeLen = Math.min(crossfadeLength, end - start);

    for (let i = 0; i < fadeLen; i++) {
      const factor = i / fadeLen;
      const blended = this.data[end - fadeLen + i] * (1 - factor) + this.data[start + i] * factor;
      this.data[end - fadeLen + i] = blended;
    }
  }

  /**
   * Generate waveform display data
   */
  generateWaveformDisplay(width: number, height: number): Array<{ min: number; max: number }> {
    const result: Array<{ min: number; max: number }> = [];
    const samplesPerPixel = Math.max(1, Math.floor(this.data.length / width));

    for (let x = 0; x < width; x++) {
      const startSample = x * samplesPerPixel;
      const endSample = Math.min(startSample + samplesPerPixel, this.data.length);

      let min = 1;
      let max = -1;

      for (let i = startSample; i < endSample; i++) {
        min = Math.min(min, this.data[i]);
        max = Math.max(max, this.data[i]);
      }

      result.push({ min, max });
    }

    return result;
  }
}
