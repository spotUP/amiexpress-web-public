/**
 * The node's own icon, at runtime.
 *
 * `Node<n>.info` is where AmiExpress keeps per-node switches, and express reads
 * them with `checkToolTypeExists(TOOLTYPE_NODE, node, KEY)` wherever the
 * behaviour lives - not through a config screen. Several of those switches had
 * no reader in this port at all, so the tooltype could be set on disk and the
 * board would never act on it.
 *
 * The admin's node-config service reads the same file for its own listing;
 * this is the runtime side, and both take the names from the setup tool, which
 * is what actually writes them (axSetupTool/frmNodeEdit.e:841-935).
 *
 * Results are cached per node: these are read on the input path, and a board
 * that stats an icon for every keystroke is a board with a new problem. A
 * sysop who edits an icon while callers are online can clear it.
 */
import * as fs from 'fs';
import * as path from 'path';

import { config } from '../config';
import { readTooltypeMap } from './info-file.util';

const cache = new Map<number, Map<string, string>>();

/** Forget what was read, for a sysop who has just edited an icon. */
export function clearNodeTooltypeCache(nodeId?: number): void {
  if (nodeId === undefined) cache.clear();
  else cache.delete(nodeId);
}

function tooltypesFor(nodeId: number): Map<string, string> {
  const cached = cache.get(nodeId);
  if (cached) return cached;

  let map = new Map<string, string>();
  try {
    const iconPath = path.join(config.get('dataDir'), `Node${nodeId}.info`);
    if (fs.existsSync(iconPath)) map = readTooltypeMap(iconPath);
  } catch (err) {
    // A node with no icon simply has no switches set.
    console.warn(`[NODE] could not read Node${nodeId}.info:`, err);
  }
  cache.set(nodeId, map);
  return map;
}

/**
 * Is this switch on for this node?
 *
 * Presence is the value, which is how express tests them
 * (`checkToolTypeExists`); a `=0` written by hand still reads as off, matching
 * how conference flags are treated elsewhere in this port.
 */
export function nodeFlag(nodeId: number, key: string): boolean {
  const map = tooltypesFor(nodeId);
  if (!map.has(key)) return false;
  return (map.get(key) ?? '').trim() !== '0';
}

/** A node switch that carries a value, e.g. OVERRIDE_TIMEOUT. */
export function nodeTooltype(nodeId: number, key: string): string | undefined {
  return tooltypesFor(nodeId).get(key);
}

/**
 * The logon name prompt, as express.e builds it for this node
 * (express.e:31770-31775): NAME_PROMPT2 as written, or "Enter your
 * <NAME_PROMPT>:", or "Enter your Name:". The screen shows it followed by a
 * space (29571). The port asked "Username:" on every board.
 */
export function loginNamePrompt(nodeId: number): string {
  const whole = nodeTooltype(nodeId, 'NAME_PROMPT2');
  if (whole) return whole;
  const noun = nodeTooltype(nodeId, 'NAME_PROMPT');
  return noun ? `Enter your ${noun}:` : 'Enter your Name:';
}

/**
 * The logon password prompt (express.e:31778-31780): "Password: ", or the
 * node's PASSWORD_PROMPT with a space after it.
 */
export function loginPasswordPrompt(nodeId: number): string {
  const own = nodeTooltype(nodeId, 'PASSWORD_PROMPT');
  return own ? `${own} ` : 'Password: ';
}
