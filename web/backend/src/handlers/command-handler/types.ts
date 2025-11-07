/**
 * Command Handler Types
 * Shared types and interfaces for command handling system
 */

import { BBSSession } from '../../index';

/**
 * Context object passed to command handlers
 * Contains all dependencies needed for command processing
 */
export interface CommandContext {
  socket: any;
  session: BBSSession;
  db: any;
  config: any;
  conferences: any[];
  messageBases: any[];
  fileAreas: any[];
  doors: any[];
  checkSecurity: any;
  setEnvStat: any;
  getRecentCallerActivity: any;
  processOlmMessageQueue: any;
  SCREEN_MENU: string;
}

/**
 * Result of command processing
 */
export enum CommandResult {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  NOT_ALLOWED = 'NOT_ALLOWED'
}

/**
 * Command handler function signature
 */
export type CommandHandler = (
  socket: any,
  session: BBSSession,
  command: string,
  params: string
) => Promise<CommandResult | void>;

/**
 * Input handler function signature
 */
export type InputHandler = (
  socket: any,
  session: BBSSession,
  data: string
) => Promise<boolean>; // Returns true if handled

/**
 * Substate input handler map
 */
export interface SubstateHandler {
  state: string; // LoggedOnSubState value
  handler: InputHandler;
  buffered: boolean; // Whether input should be line-buffered
}
