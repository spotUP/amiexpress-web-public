/**
 * The conference access a new account starts with - what express.e writes.
 *
 * express.e builds a new caller's record in initNewUser (express.e:30432):
 * the record is cleared, then Preset.1 is applied - the node's own
 * `Node<n>/PRESET.1` when it has one, else the board's `Access/PRESET.1`
 * (30438-30443; the paths are tooltypes.e:95-100). applyPreset copies the
 * preset's PRESET.AREA into `user.conferenceAccess` with AstrCopy(...,10):
 * nine characters and a NUL (29358-29369).
 *
 * Nothing pads it to the conference count, anywhere. An area NAME grants
 * through `Access/AREA.<name>.info`'s `Conf.<n>` tooltypes (checkConfAccess,
 * 8499-8512), so a conference the board gains later reaches every account in
 * that area the moment the sysop adds it to the area.
 *
 * Both new-account paths read this - the BBS registration, which writes the
 * user.data record, and the web register route.
 */
import * as path from 'path';
import * as amigafs from './amigafs';
import { readTooltypeMap } from './info-file.util';
import { getBoardConfig } from '../services/bbs-config-file.service';

/** user.conferenceAccess is CHAR[10]: AstrCopy keeps nine and the NUL. */
const CONFERENCE_ACCESS_CHARS = 9;

/** `<dir>/PRESET.<n>.info`, found the way AmigaDOS finds it - case-blind. */
function presetFile(dir: string, presetNumber: number): string | null {
  return amigafs.findCaseInsensitive(dir, `PRESET.${presetNumber}.info`);
}

/**
 * The preset express.e applies to a new account on `nodeId`, as a tooltype
 * map, or null when the board has none.
 *
 * The node's own file wins when it EXISTS (express.e:30439 `configFileExists`),
 * whether or not it carries a PRESET.AREA - applyPreset then applies nothing,
 * exactly as express.e does.
 */
export function readNewUserPreset(bbsRoot: string, nodeId?: number): Map<string, string> | null {
  const nodePreset = nodeId !== undefined ? presetFile(path.join(bbsRoot, `Node${nodeId}`), 1) : null;
  return readTooltypes(nodePreset ?? presetFile(path.join(bbsRoot, 'Access'), 1));
}

/**
 * TOOLTYPE_PRESET n - `Access/PRESET.<n>` (tooltypes.e:95-97), the board's
 * preset, as the account editor's 1-8 read it (express.e:21330-21334). Null
 * when the board has none.
 */
export function readPreset(bbsRoot: string, presetNumber: number): Map<string, string> | null {
  return readTooltypes(presetFile(path.join(bbsRoot, 'Access'), presetNumber));
}

function readTooltypes(file: string | null): Map<string, string> | null {
  if (!file) return null;
  try {
    return readTooltypeMap(file);
  } catch {
    return null;
  }
}

/**
 * A new account's `conferenceAccess`: Preset.1's PRESET.AREA, cut to nine.
 *
 * WEB_: express.e:30443 applies Preset.1 and nothing else - a board with no
 * Preset.1 (or one with no PRESET.AREA) leaves the field empty, which grants
 * no conference at all. This board has always had a NEW_USER_CONF_ACCESS
 * setting of its own in bbsConfig.info, so such a board falls back to THAT,
 * read from disk, rather than locking every new caller out.
 */
export function newUserConferenceAccess(bbsRoot: string, nodeId?: number): string {
  const area = readNewUserPreset(bbsRoot, nodeId)?.get('PRESET.AREA');
  if (area !== undefined && area.length > 0) return area.slice(0, CONFERENCE_ACCESS_CHARS);

  const configured = getBoardConfig(bbsRoot).new_user_conf_access;
  return typeof configured === 'string' && configured.length > 0 ? configured : 'XXX';
}

/** What express.e's applyPreset sets on a new record (29360-29369). */
export interface NewUserPreset {
  secLevel: number;
  ratioType: number;
  ratio: number;
  timeLimit: number;
  confRJoin: number;
  msgBaseRJoin: number;
  byteLimit: number;
  confAccess: string;
}

/**
 * E's Val into a LONG field: a number too big for 32 bits wraps, as the
 * Amiga's arithmetic does (PRESET.DAILY_BYTE_LIMIT=999999999999999 on this
 * board). A key the preset does not carry is readToolTypeInt's -1
 * (tooltypes.e:176-181).
 */
function presetInt(preset: Map<string, string>, key: string): number {
  const raw = preset.get(key);
  if (raw === undefined) return -1;
  const digits = /^\s*-?\d+/.exec(raw)?.[0]?.trim();
  if (!digits) return 0;
  return Number(BigInt.asIntN(32, BigInt(digits)));
}

/**
 * express.e:29358-29370 applyPreset for Preset.1, as initNewUser applies it
 * (30438-30443): only when the preset has a PRESET.AREA does it set
 * anything. Then 30446: a rejoin conference of 0 becomes 1.
 *
 * null: no preset, or one without PRESET.AREA - the new record keeps the
 * board's own defaults (WEB_, see newUserConferenceAccess).
 */
export function newUserPreset(bbsRoot: string, nodeId?: number): NewUserPreset | null {
  const preset = readNewUserPreset(bbsRoot, nodeId);
  const area = preset?.get('PRESET.AREA');
  if (area === undefined || area.length === 0) return null;
  const applied = applyPreset(preset);
  if (!applied) return null;
  return { ...applied, confRJoin: applied.confRJoin === 0 ? 1 : applied.confRJoin };
}

/**
 * applyPreset (express.e:29358-29370): what a preset sets, or null when it
 * carries no PRESET.AREA (`IF readToolType(...,'PRESET.AREA',...)`) and sets
 * nothing. A key the preset does not carry is readToolTypeInt's -1.
 */
export function applyPreset(preset: Map<string, string> | null): NewUserPreset | null {
  const area = preset?.get('PRESET.AREA');
  if (!preset || area === undefined) return null;
  return {
    secLevel: presetInt(preset, 'PRESET.ACCESS'),
    ratioType: presetInt(preset, 'PRESET.RATIO_TYPE'),
    ratio: presetInt(preset, 'PRESET.RATIO'),
    timeLimit: presetInt(preset, 'PRESET.TIME_LIMIT'),
    confRJoin: presetInt(preset, 'PRESET.CONFRJOIN'),
    msgBaseRJoin: presetInt(preset, 'PRESET.MSGBASERJOIN'),
    byteLimit: presetInt(preset, 'PRESET.DAILY_BYTE_LIMIT'),
    confAccess: area.slice(0, CONFERENCE_ACCESS_CHARS),
  };
}

/**
 * applyConfPresets' two values (express.e:21664-21670): PRESET.RATIO and
 * PRESET.RATIOTYPE - spelled without the underscore applyPreset's
 * PRESET.RATIO_TYPE has - each only when the preset carries it.
 */
export function confPresetValues(preset: Map<string, string>): { ratio?: number; ratioType?: number } {
  const out: { ratio?: number; ratioType?: number } = {};
  if (preset.has('PRESET.RATIO')) out.ratio = presetInt(preset, 'PRESET.RATIO');
  if (preset.has('PRESET.RATIOTYPE')) out.ratioType = presetInt(preset, 'PRESET.RATIOTYPE');
  return out;
}
