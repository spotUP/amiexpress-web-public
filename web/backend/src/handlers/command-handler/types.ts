import { BBSSession } from "../../index";

// Re-export key types for convenience
export { BBSSession } from "../../index";
export { BBSState, LoggedOnSubState } from "../../constants/bbs-states";
export { ACSCode } from "../../constants/acs-codes";
export { EnvStat } from "../../constants/env-codes";

// Common handler signatures
export type CommandHandler = (
  socket: any,
  session: BBSSession,
  params?: string
) => Promise<void> | void;
export type InputHandler = (
  socket: any,
  session: BBSSession,
  data: string
) => Promise<void> | void;
export type MenuDisplayHandler = (
  socket: any,
  session: BBSSession
) => Promise<void> | void;

// Command processing result types
export type CommandResult = "SUCCESS" | "FAILURE" | "NOT_ALLOWED";

// Menu configuration interface
export interface MenuConfig {
  bbsName: string;
  currentConf: number;
  currentConfName: string;
  relConfNum: number;
  currentMsgBase: number;
  timeRemaining: number;
}

// Upload batch interface
export interface UploadBatchItem {
  filename: string;
  description: string;
  isPrivate: boolean;
}

// Command execution context
export interface CommandContext {
  socket: any;
  session: BBSSession;
  command: string;
  params: string;
}

// Input buffer state
export interface InputBufferState {
  inputBuffer?: string;
  currentLineBuffer?: string;
  messageSubject?: string;
  messageBody?: string;
  messageRecipient?: string;
  tempData?: any;
}

// Session extensions for command handler
export interface CommandSessionData extends BBSSession {
  commandText?: string;
  inSysopMenu?: boolean;
  messageSubject?: string;
  messageBody?: string;
  messageRecipient?: string;
  tempData?: any;
  pendingScreenCommand?: Promise<any>;
  executingScreenCommand?: boolean;
  pendingScreenInput?: boolean;
}
