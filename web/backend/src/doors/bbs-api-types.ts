/**
 * The public shapes of the door API (BBSApi): what a door is handed about
 * users, conferences, nodes and the board, and the closed set of UI sounds.
 *
 * Moved out of BBSApi.ts on 2026-09-28 to keep that file under the repo's
 * 2000-line limit; BBSApi re-exports every name, so importers are unchanged.
 */

export interface BBSUser {
  id: string;
  username: string;
  realname?: string;
  location?: string;
  phone?: string;
  email?: string;
  secLevel: number;
  downloads?: number;
  uploads?: number;
  timeToday?: number;
  lastCall?: Date;
  numCalls?: number;
  birthday?: string;
  gender?: string;
}

export interface BBSConference {
  id: number;
  name: string;
  description?: string;
  accessLevel: number;
}

export interface BBSNode {
  nodeId: number;
  username?: string;
  location?: string;
  activity?: string;
  online: boolean;
}

export interface BBSSystemInfo {
  bbsName: string;
  sysopName: string;
  version: string;
  nodes: number;
}

/**
 * The board's UI sound library, as the terminal actually implements it.
 *
 * Every name here exists in `packages/terminal/src/utils/media-handler.ts`'s
 * `soundLibrary`. The union is closed on purpose: a typo becomes a type error
 * rather than silence, which is the one bug a sound effect cannot report
 * about itself. (An unknown name falls through MediaHandler's switch and
 * plays nothing at all.)
 */
export type UiSound =
  | 'click' | 'hover' | 'select' | 'menu-open' | 'menu-close' | 'menu-select'
  | 'success' | 'error' | 'warning' | 'confirm' | 'cancel'
  | 'notification' | 'message' | 'send' | 'typing'
  | 'join' | 'leave' | 'mention'
  | 'popup' | 'close' | 'minimize' | 'maximize' | 'dock'
  | 'default';
