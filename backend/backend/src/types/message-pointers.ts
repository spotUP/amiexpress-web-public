/**
 * Message Pointer System Types
 *
 * Based on AmiExpress express.e message pointer implementation
 * These types track which messages each user has read in each conference/message base
 *
 * Source: express.e:8672-8707 (getMailStatFile), 4882-4973 (loadMsgPointers/saveMsgPointers)
 * Source: axobjects.e:192-197 (mailStat), 136-155 (confBase)
 */

/**
 * MailStat - Per-conference/message-base statistics
 * Tracks the range of valid message numbers
 *
 * Based on axobjects.e:192-197
 */
export interface MailStat {
  /** Lowest message number in base (usually 1) */
  lowestKey: number;

  /** Next message number to be written (high watermark, exclusive upper bound) */
  highMsgNum: number;

  /** Lowest non-deleted message number (for boundary validation) */
  lowestNotDel: number;
}

/**
 * ConfBase - Per-user, per-conference/message-base data
 * Stores message read pointers and conference scan flags
 *
 * Based on axobjects.e:136-155
 */
export interface ConfBase {
  /** User ID this record belongs to */
  userId: string;

  /** Conference ID */
  conferenceId: number;

  /** Message base ID */
  messageBaseId: number;

  /** Last message number that was auto-scanned (confRead in express.e) */
  lastNewReadConf: number;

  /** Last message number that was manually read (confYM in express.e) */
  lastMsgReadConf: number;

  /** Conference scan flags (bit flags from handle[0]) */
  scanFlags: number;

  /** Messages posted by user in this conference */
  messagesPosted: number;

  /** Last "new since" date for this conference */
  newSinceDate: Date;

  /** Bytes downloaded from this conference */
  bytesDownload: number;

  /** Bytes uploaded to this conference */
  bytesUpload: number;

  /** Number of files uploaded */
  upload: number;

  /** Number of files downloaded */
  downloads: number;
}

/**
 * Conference Scan Flags (stored in confBase.scanFlags)
 * Based on express.e bit masks
 */
export const ScanFlags = {
  /** Bit 1 (value 2): Include in QWK/ASCII zoom packs */
  ZOOM_SCAN: 1 << 1,

  /** Bit 2 (value 4): Scan this conference for new mail */
  MAIL_SCAN: 1 << 2,

  /** Bit 3 (value 8): Scan this conference for new files */
  FILE_SCAN: 1 << 3,

  /** Bit 7 (value 128): Include "ALL" messages in mail scan (not just eALL) */
  MAILSCAN_ALL: 1 << 7
} as const;

/**
 * Default values for MailStat when creating new message base
 * Based on express.e:8672-8707
 */
export const DEFAULT_MAIL_STAT: MailStat = {
  lowestKey: 1,
  highMsgNum: 1,
  lowestNotDel: 0
};

/**
 * Default scan flags for new conference
 * Enable mail scan and file scan by default
 */
export const DEFAULT_SCAN_FLAGS = ScanFlags.MAIL_SCAN | ScanFlags.FILE_SCAN;
