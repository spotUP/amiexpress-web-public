/**
 * Named bit-flag constants from express.e / axconsts.e / axenums.e.
 *
 * Audit H-ED flagged that these flags were used inline as magic
 * numbers across the codebase with no central reference. This module
 * is the single source of truth — if a value drifts out of sync with
 * AmiExpress-Sources/, fix it here once instead of chasing every
 * call site.
 *
 * Cross-reference (canonical source line numbers):
 *   ED_*    — axconsts.e:66-72
 *   PG_*    — axconsts.e:94-113
 *   USER_*  — axenums.e:46
 *
 * Use bitwise & to test a flag, | to set, & ~ to clear, ^ to toggle.
 * Example:
 *   if ((user.userFlags & UserFlag.SCRNCLR) !== 0) { ... }
 */

/**
 * Editor flags (`editor.editorFlags`) — express.e msgEditor uses these
 * to gate which features the editor allows for the current message
 * entry session.
 *
 * Source: axconsts.e:66-72
 */
export const EditorFlag = {
  /** ANSI escape sequences are allowed in the message body. */
  ANSI_ALLOWED: 1,
  /** The user can abort entry by pressing the configured abort key. */
  ABORT_ALLOWED: 2,
  /** The L (load) command is enabled in the editor. */
  LOAD_ALLOWED: 4,
  /** The U (upload) command is enabled in the editor. */
  BATCH_UPLOAD: 8,
  /** The file-attach command is enabled in the editor. */
  ATTACH_FILE: 16,
  /** Set when the user has requested a batch operation. */
  BATCH_REQUESTED: 32768,
  /** Set when the user has requested file attachment. */
  ATTACH_REQUESTED: 16384,
} as const;

/**
 * User flags (`loggedOnUserKeys.userFlags`) — bit field of per-user
 * preferences stored in the user record.
 *
 * Source: axenums.e:46
 */
export const UserFlag = {
  /** User wants to be notified of new messages on login. */
  NEWMSG: 1,
  /** Forced re-join to conference 1 on next login. */
  TOCONF1: 2,
  /** One-time-only message pending (cleared after display). */
  ONETIME_MSG: 4,
  /** Clear screen between messages. */
  SCRNCLR: 8,
  /** User has made a donation (cosmetic credit). */
  DONATED: 16,
  /** Use the full-screen ANSI editor instead of the line-mode editor. */
  ED_FULLSCREEN: 32,
  /** Show editor command prompts. */
  ED_PROMPT: 64,
  /** Run BGFILECHECK on this user's uploads (background virus / DIZ check). */
  BGFILECHECK: 128,
} as const;

/**
 * Page-message types (`pgMessage.type`) — selects which inter-node
 * message protocol is being sent / received. Used by the OLM, sysop
 * page, and door RPC paths.
 *
 * Source: axconsts.e:94-113
 */
export const PageType = {
  SM: 1,    // Sysop Mail (OLM)
  CO: 2,    // Chat Online
  SO: 3,    // Sysop Online (avail toggle)
  CC: 4,    // Conference Chat
  CH: 5,    // Chat Hangup
  PM: 6,    // Private Message (DM)
  SC: 7,    // Sysop Comment
  HK: 8,    // Hot Key
  SF: 10,   // Show Files
  FF: 11,   // Flag File
  EF: 12,   // Edit File
  UD: 13,   // User Data
  US: 14,   // User Stats
  PS: 15,   // Page Sysop
  CS: 16,   // Conference Status
  RD: 17,   // Reread (refresh)
  CL: 18,   // Conference List
  SG: 19,   // Sysop General
  SHUTDOWN: 20,
  TM: 21,   // Time Message
} as const;

export type EditorFlagValue = typeof EditorFlag[keyof typeof EditorFlag];
export type UserFlagValue = typeof UserFlag[keyof typeof UserFlag];
export type PageTypeValue = typeof PageType[keyof typeof PageType];
