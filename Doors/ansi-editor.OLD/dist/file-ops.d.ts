/**
 * File operations for ANSI Editor
 * Handles loading, saving, importing, and exporting ANSI/ASCII art
 * Supports formats: ANS, ASC, BIN, XB, TXT
 */
import { Cell, EditorState, FileMetadata } from './types.js';
export declare function loadFile(state: EditorState, filename: string): Promise<boolean>;
export declare function saveFile(state: EditorState, filename: string): Promise<boolean>;
export declare function listFiles(pattern?: string): string[];
export declare function importFile(state: EditorState, filename: string, x: number, y: number): Promise<boolean>;
export declare function exportSelection(state: EditorState, filename: string, x1: number, y1: number, x2: number, y2: number): Promise<boolean>;
export declare function getFileMetadata(filename: string): FileMetadata | null;
export declare function fileExists(filename: string): boolean;
/**
 * Deep clone canvas (for revert functionality)
 */
export declare function deepCloneCanvas(canvas: Cell[][]): Cell[][];
/**
 * Export to FILE_ID.DIZ format
 * DIZ files are plain text descriptions, typically 10-20 lines
 */
export declare function exportToDiz(state: EditorState, filename: string): Promise<boolean>;
