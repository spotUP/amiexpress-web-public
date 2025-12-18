/**
 * Type definitions for ANSI Editor
 */

import { Socket } from 'socket.io';

// ANSI escape codes for cursor control and screen output
export const HIDE_CURSOR = '\x1b[?25l';
export const SHOW_CURSOR = '\x1b[?25h';
export const CLEAR_SCREEN = '\x1b[2J\x1b[H';

export interface DoorSession {
  socket: Socket;
  user: any;
  bbsSession?: any;  // Reference to the BBS session object
}

export interface Cell {
  char: string;
  fg: number;  // 0-15 (0-7 normal, 8-15 bright with iCE colors)
  bg: number;  // 0-15 (0-7 normal, 8-15 bright with iCE colors)
}

export type Tool = 'draw' | 'line' | 'box' | 'text' | 'fill' | 'pick' | 'ellipse' | 'ellipse-fill' | 'shifter';
export type BrushMode = 'half-block' | 'custom' | 'shading' | 'colorize' | 'blink' | 'replace';
export type OperationMode = 'normal' | 'transparent' | 'over' | 'underneath';
export type GuideType = 'none' | '80x25' | '80x40' | '44x22' | 'grid';

export interface ModalOption {
  value: string;
  label: string;
  description: string;
  icon?: string;
}

export interface FileLock {
  username: string;
  nodeId: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface SelectionBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
