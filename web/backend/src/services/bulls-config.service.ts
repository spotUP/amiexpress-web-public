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

/** Menu entry column: ';' sits at this index, like every shipped line. */
export const BULLS_MENU_COLUMN = 51;

export function formatMenuLine(title: string, file: string): string {
  const t = title.trim();
  const pad = Math.max(1, BULLS_MENU_COLUMN - t.length);
  return `${t}${' '.repeat(pad)}; ${file.trim()}`;
}

/**
 * Replace ONLY the bull menu section (between [Init_END] and
 * [BullNames_END]) with these entries. Settings, masks and title art pass
 * through byte-identical - the 68K binary reads all four sections, and
 * only the menu is edited here. Throws on structural errors (empty title
 * or file, path separators); content problems (duplicates, missing files)
 * are reported by the rechecked parse, not refused.
 */
export function saveBullsMenuEntries(
  bbsRoot: string,
  entries: Array<{ title: string; file: string }>,
): BullsConfig {
  for (const [i, e] of entries.entries()) {
    if (!e || !e.title.trim() || !e.file.trim()) {
      throw new Error(`Entry ${i + 1} needs a title and a file.`);
    }
    if (/[\\/]/.test(e.file) || e.file.includes('..')) {
      throw new Error(`Entry ${i + 1} takes a bare filename, not a path.`);
    }
  }
  const file = path.join(bbsRoot, 'Doors', 'emp_tools', 'Bulls.CFG');
  const raw = fs.readFileSync(file, 'latin1');
  const lines = raw.split('\n');
  const start = lines.findIndex((l) => l.trim().startsWith('[Init_END]'));
  const end = lines.findIndex((l) => l.trim().startsWith('[BullNames_END]'));
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Bulls.CFG has no menu section between [Init_END] and [BullNames_END].');
  }
  const menu = entries.map((e) => formatMenuLine(e.title, e.file));
  const next = [...lines.slice(0, start + 1), ...menu, ...lines.slice(end)].join('\n');
  return saveBullsConfig(bbsRoot, next);
}

export interface BulletinInfo {
  name: string;
  size: number;
  mtimeMs: number;
  /** Generated bulletins are read-only here: batches own 1-6, the news
   *  service owns 7-8, and an edit would be overwritten within the hour. */
  generated: boolean;
  generator?: string;
}

const GENERATED_BULLETINS: Record<string, string> = {
  bull1: 'batch (MultiTop)',
  bull2: 'batch (MultiTop)',
  bull3: 'batch (MultiTop)',
  bull4: 'batch (MultiTop)',
  bull5: 'batch (MultiTop)',
  bull6: 'batch (SamiLog)',
  bull7: 'news service (hourly Text-TV)',
  bull8: 'news service (hourly Text-TV)',
};

function bulletinName(name: unknown): string {
  const n = String(name ?? '').trim();
  if (!/^bull\d+\.txt$/i.test(n)) throw new Error(`Not a bulletin file: ${n || '(empty)'}.`);
  return n;
}

export function listBulletins(bbsRoot: string): BulletinInfo[] {
  const dir = path.join(bbsRoot, 'Bulletins');
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => /^bull\d+\.txt$/i.test(n));
  } catch {
    return [];
  }
  return names
    .sort((a, b) => parseInt(a.match(/\d+/)?.[0] ?? '0', 10) - parseInt(b.match(/\d+/)?.[0] ?? '0', 10))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      const generator = GENERATED_BULLETINS[name.replace(/\.txt$/i, '').toLowerCase()];
      return {
        name,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        generated: generator !== undefined,
        ...(generator ? { generator } : {}),
      };
    });
}

export function readBulletin(bbsRoot: string, name: unknown): string {
  const n = bulletinName(name);
  return fs.readFileSync(path.join(bbsRoot, 'Bulletins', n), 'latin1');
}

/** Static bulletins only: generated ones are refused, never silently taken. */
export function writeBulletin(bbsRoot: string, name: unknown, content: unknown): BulletinInfo {
  const n = bulletinName(name);
  if (typeof content !== 'string') throw new Error('Bulletin content must be text.');
  const key = n.replace(/\.txt$/i, '').toLowerCase();
  const generator = GENERATED_BULLETINS[key];
  if (generator) throw new Error(`${n} is generated by ${generator} - edits would be overwritten.`);
  const file = path.join(bbsRoot, 'Bulletins', n);
  try {
    fs.copyFileSync(file, `${file}.bak`);
  } catch {
    /* new file: nothing to back up */
  }
  fs.writeFileSync(file, content, 'latin1');
  const [info] = listBulletins(bbsRoot).filter((b) => b.name.toLowerCase() === n.toLowerCase());
  if (!info) throw new Error(`Bulletin vanished after write: ${n}.`);
  return info;
}
