/**
 * WEB_BULLS_CONFIG - Bulls.CFG for the 68K Bulls door, parsed and validated.
 *
 * The file is read by a real Amiga binary through emulated dos.library, so
 * the editor never reformats it: the admin edits text, the service validates
 * it, and saves write the exact bytes back (latin1). Structure:
 * settings lines (`KEY  VALUE ; comment`) to `[Init_END]`, bull menu
 * (`Title ; file`) to `[BullNames_END]`, conf masks (`XXXX---- ; Conference
 * N`) to `[CnfAccess_END]`, then the raw ANSI title to `[Title_END]`.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface BullsMenuEntry {
  line: number;
  title: string;
  file: string;
}

export interface BullsMask {
  line: number;
  conference: number;
  mask: string;
}

export interface BullsSetting {
  line: number;
  key: string;
  value: string;
}

export interface BullsProblem {
  line: number;
  kind: 'duplicate-file' | 'missing-file' | 'missing-conference' | 'bad-mask' | 'format';
  message: string;
}

export interface BullsConfig {
  settings: BullsSetting[];
  entries: BullsMenuEntry[];
  masks: BullsMask[];
  /** Byte offsets (line numbers) of the section markers, for diagnostics. */
  markers: { initEnd: number; bullNamesEnd: number; cnfAccessEnd: number; titleEnd: number };
  problems: BullsProblem[];
}

const MASK_LEN = 20;

function splitComment(line: string): { head: string; comment: string } {
  const i = line.indexOf(';');
  if (i === -1) return { head: line, comment: '' };
  return { head: line.slice(0, i), comment: line.slice(i + 1) };
}

export function parseBullsConfig(raw: string, bulletinFiles: Set<string>): BullsConfig {
  const lines = raw.split('\n');
  const settings: BullsSetting[] = [];
  const entries: BullsMenuEntry[] = [];
  const masks: BullsMask[] = [];
  const problems: BullsProblem[] = [];
  const markers = { initEnd: -1, bullNamesEnd: -1, cnfAccessEnd: -1, titleEnd: -1 };
  const seenFiles = new Map<string, number>();

  let section: 'settings' | 'menu' | 'masks' | 'title' | 'done' = 'settings';
  lines.forEach((rawLine, idx) => {
    const line = idx + 1;
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('[Init_END]')) { markers.initEnd = line; section = 'menu'; return; }
    if (trimmed.startsWith('[BullNames_END]')) { markers.bullNamesEnd = line; section = 'masks'; return; }
    if (trimmed.startsWith('[CnfAccess_END]')) { markers.cnfAccessEnd = line; section = 'title'; return; }
    if (trimmed.startsWith('[Title_END]')) { markers.titleEnd = line; section = 'done'; return; }
    if (!trimmed) return;

    if (section === 'settings') {
      const { head } = splitComment(rawLine);
      const parts = head.trim().split(/\s+/);
      if (parts.length >= 2) settings.push({ line, key: parts[0], value: parts[1] });
      else problems.push({ line, kind: 'format', message: 'Settings line needs KEY and VALUE.' });
      return;
    }
    if (section === 'menu') {
      const { head, comment } = splitComment(rawLine);
      const file = comment.trim().split(/\s+/)[0] ?? '';
      const title = head.trim();
      if (!title || !file) {
        problems.push({ line, kind: 'format', message: 'Menu line needs "Title ; file".' });
        return;
      }
      entries.push({ line, title, file });
      const prev = seenFiles.get(file.toLowerCase());
      if (prev !== undefined) {
        problems.push({ line, kind: 'duplicate-file', message: `${file} is already mapped on line ${prev}.` });
      } else {
        seenFiles.set(file.toLowerCase(), line);
        if (!bulletinFiles.has(file.toLowerCase())) {
          problems.push({ line, kind: 'missing-file', message: `${file} exists in no bulletin directory.` });
        }
      }
      return;
    }
    if (section === 'masks') {
      const { head } = splitComment(rawLine);
      const m = /([X\-]{1,40})/.exec(head);
      const conf = /conference\s+(\d+)/i.exec(rawLine);
      if (!m || !conf) {
        problems.push({ line, kind: 'format', message: 'Mask line needs an X/- mask and Conference N.' });
        return;
      }
      const mask = m[1];
      masks.push({ line, conference: parseInt(conf[1], 10), mask });
      if (mask.length !== MASK_LEN || /[^X-]/.test(mask)) {
        problems.push({ line, kind: 'bad-mask', message: `Mask should be ${MASK_LEN} X/- characters.` });
      }
    }
  });

  const confs = masks.map((m) => m.conference);
  const maxConf = confs.length ? Math.max(...confs) : 0;
  for (let c = 1; c <= maxConf; c++) {
    if (!confs.includes(c)) {
      problems.push({ line: 0, kind: 'missing-conference', message: `No mask row for Conference ${c}.` });
    }
  }
  if (markers.initEnd === -1 || markers.bullNamesEnd === -1 || markers.cnfAccessEnd === -1) {
    problems.push({ line: 0, kind: 'format', message: 'A section marker ([Init_END], [BullNames_END], [CnfAccess_END]) is missing.' });
  }
  return { settings, entries, masks, markers, problems };
}

/** Bulletin filenames (lowercased) the door can actually open. */
export function bulletinFilesAvailable(bbsRoot: string): Set<string> {
  const found = new Set<string>();
  for (const dir of [path.join(bbsRoot, 'Bulletins'), path.join(bbsRoot, 'Doors', 'emp_tools')]) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      if (/^bull\d+\.txt$/i.test(n)) found.add(n.toLowerCase());
    }
  }
  return found;
}

export function loadBullsConfig(bbsRoot: string): { raw: string; parsed: BullsConfig } {
  const file = path.join(bbsRoot, 'Doors', 'emp_tools', 'Bulls.CFG');
  const raw = fs.readFileSync(file, 'latin1');
  return { raw, parsed: parseBullsConfig(raw, bulletinFilesAvailable(bbsRoot)) };
}

/** Save exactly these bytes (latin1), keeping one .bak of the previous. */
export function saveBullsConfig(bbsRoot: string, raw: string): BullsConfig {
  const file = path.join(bbsRoot, 'Doors', 'emp_tools', 'Bulls.CFG');
  try {
    fs.copyFileSync(file, `${file}.bak`);
  } catch {
    /* first save ever: nothing to back up */
  }
  fs.writeFileSync(file, raw, 'latin1');
  return parseBullsConfig(raw, bulletinFilesAvailable(bbsRoot));
}
