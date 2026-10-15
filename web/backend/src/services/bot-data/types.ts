import type { User as DatabaseUser } from '../../database/types';

/**
 * WEB_BOT_DATA types - the shared shape of the chatbot read API.
 *
 * New feature, no express.e counterpart: everything here carries the
 * WEB_/BOT_ prefix. One result shape serves both transports (chat tools
 * and HTTP): text the model reads, a truncation flag, and an optional
 * total so callers can say "+N more".
 */
export interface BOTActor {
  /** Caller's security level; filters what is visible. */
  secLevel: number;
  username?: string;
  userId?: string;
  /** Conference ids the caller may see; absent means "enforce nothing extra". */
  confAccess?: number[];
}

export interface BOTResult {
  /** Chat-ready text, already capped. */
  text: string;
  /** True when rows existed beyond what text holds. */
  truncated: boolean;
  /** Rows available in total, when known. */
  total?: number;
}

export const BOT_NO_DATA = (what: string): BOTResult => ({
  text: `The board cannot answer about ${what} right now.`,
  truncated: false,
});

/**
 * What this layer reads off a caller's record.
 *
 * It is a slice of the repository's own `User`, not a restatement of it: the
 * repository maps `deleted_at` to `deletedAt` on the way out, and while this
 * was typed `any` nothing noticed that the erased-user filter here asked for
 * the column name instead of the field. Tied to the real type, a rename over
 * there is a red build over here.
 */
export type BOTUser = Pick<
  DatabaseUser,
  'username' | 'secLevel' | 'location' | 'calls' | 'uploads' | 'downloads' | 'deletedAt' | 'erasedAt'
>;

/** Minimal database surface the bot-data layer needs; the real Database
 *  satisfies it, tests pass fakes. Repositories stay the single source. */
export interface BOTDb {
  getUserByUsername(username: string): Promise<BOTUser | null>;
  getUsers(filter?: { secLevel?: number; limit?: number }): Promise<BOTUser[]>;
  getConferences(): Promise<any[]>;
  getMessageBases(conferenceId: number): Promise<Array<{ id: number; name?: string }>>;
  getMessages(conferenceId: number, messageBaseId: number, options?: {
    limit?: number; offset?: number; search?: string;
  }): Promise<any[]>;
  getFileAreas(conferenceId: number): Promise<any[]>;
  getFileEntries(areaId: number, options?: { limit?: number; search?: string }): Promise<any[]>;
  getFileStatisticsByConference(conferenceId: number): Promise<any>;
  getActiveSessions(): Promise<any[]>;
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}
