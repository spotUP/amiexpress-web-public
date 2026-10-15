/**
 * DayDream BBS "dreamdoor.library" LVO/struct constants.
 *
 * Source of truth: thoughts/shared/research/2026-08-14_fame-dd-door-compat.md
 * "DayDream RE results (2026-08-15)" — recovered by walking the RTF_AUTOINIT
 * FunctionTable of DreamDoor.Library v1.0/v6.0 and cross-matching Xim.s's
 * Jsr calls against the disassembled `xim` client binary.
 *
 * Offsets marked "confirmed" have both a FunctionTable address AND a
 * matching client call site. Offsets marked "inferred" are recovered from
 * calling-convention shape alone (no client source calls them) — re-verify
 * against a real door if one misbehaves at that LVO.
 */

/** LVO offsets, dreamdoor.library base-relative (negative). */
export const DD_LVO = {
  InitDoor: -30, // confirmed
  CloseDoor: -36, // confirmed
  SendString: -42, // confirmed
  Prompt: -48, // confirmed
  InquirePointers: -54, // confirmed
  DisplayFile: -60, // confirmed
  JoinConference: -66, // inferred — single D1 numeric arg is the only
  // candidate LVO in the unnamed range that matches JoinConference(D1=confNum)
  XprSend: -84, // confirmed
  GetKey: -108, // confirmed
  ScanFileDirs: -114, // confirmed
  Disconnect: -126, // confirmed
  DDCommand: -132, // confirmed
} as const;

/** Pointers struct (dp_SIZEOF bytes), filled by InquirePointers. */
export const DP_SIZEOF = 0x54;
export const DP_OFFSET = {
  dp_DayDream: 0x0c, // BBS config block; CFG_SYSOPNAME sub-field at +0x1a
  dp_CurrConf: 0x1c, // CONF_NUMBER@0 byte, CONF_NAME@1
  dp_CurrUser: 0x28,
  // dp_DoorParams: present in the struct layout Xim.s expects, but NOT
  // written by dreamdoor.library v1.0's InquirePointers reply (a real gap
  // in the reference library, not an RE error). We populate it anyway
  // (door command-line params) since we control both sides — see plan
  // Task 2 "Known risks / decisions".
  dp_DoorParams: 0x34,
  dp_BpsRate: 0x38,
  dp_IODevice: 0x3c, // inferred position (between BpsRate and CurrentNode)
  dp_CurrentNode: 0x40, // node-id byte at sub-offset +0x0e
} as const;

/** USER struct fields, relative to dp_CurrUser. */
export const USER_OFFSET = {
  USER_HANDLE: 0x1a,
  USER_PASSWORD: 0x78,
  USER_ORGANIZATION: 0x34,
  USER_VOICEPHONE: 0x63,
  USER_SECURITYLEVEL: 0xeb, // byte
  USER_BYTERATIO: 0xcf, // byte
  USER_PUBMESSAGES: 0xc8, // word
  USER_ULFILES: 0xc4, // word
  USER_DLFILES: 0xc6, // word
  USER_CONNECTIONS: 0xcc, // word
  USER_LASTCALL: 0xf2, // word
  USER_DAILYTIMELIMIT: 0xfe, // word, minutes
  USER_TIMEREMAINING: 0x102, // word, minutes
  USER_ULBYTES: 0xbc, // long
  USER_DLBYTES: 0xc0, // long
  USER_SCREENLENGTH: 0x88, // byte
} as const;

/** CONF struct fields, relative to dp_CurrConf. */
export const CONF_OFFSET = {
  CONF_NUMBER: 0, // byte
  CONF_NAME: 1,
} as const;

/** CFG (BBS config) struct fields, relative to dp_DayDream. */
export const CFG_OFFSET = {
  CFG_SYSOPNAME: 0x1a,
} as const;
