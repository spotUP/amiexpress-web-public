/**
 * Door Types
 * Type definitions for door handling
 *
 * @module door-types
 */

import type { User } from '../../database/types';

/**
 * Door configuration
 */
export interface Door {
  id: string;
  name: string;
  description: string;
  command: string;
  path: string;
  accessLevel: number;
  enabled: boolean;
  type: string;
  size?: number;  // File/directory size in bytes
  conferenceId?: number;
  parameters?: string[];
  mciText?: string;  // For MCI type doors (express.e:4293-4297)
  stack?: number;
  priority?: string;
  resident?: boolean;
  expertMode?: boolean;
  trapOn?: boolean;
  silent?: boolean;
  quickMode?: boolean;
  multiNode?: boolean;
  logInputs?: boolean;
  scriptCheck?: boolean;
  banner?: string;
  mimicVer?: string;
  passParameters?: number;
  internal?: string;
  args?: string;
  toolTypes?: Record<string, string>;
  category?: string;  // Door category from CATEGORY= tooltype
}

/**
 * Active door session
 */
export interface DoorSession {
  doorId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  status: string;
  output?: string[]; // Array of output strings from door execution
}

/**
 * Chat session for door communication
 */
export interface ChatSession {
  id: string;
  userId: string;
  startTime: Date;
  status: string;
  messages: any[];
  pageCount: number;
  lastActivity: Date;
}

/**
 * Database interface for door queries
 */
export interface Database {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
}

/**
 * Door executor dependencies
 */
export interface DoorExecutorDeps {
  LoggedOnSubState: any;
  doors: Door[];
  doorSessions: DoorSession[];
  callersLog: (userId: string | null, username: string, action: string, details?: string, nodeId?: number) => Promise<void>;
  getRecentCallerActivity: (limit?: number, nodeId?: number) => Promise<any[]>;
}
