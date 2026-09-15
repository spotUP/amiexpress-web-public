import * as fs from 'fs';
import * as path from 'path';
import { db } from '../database';
import { config } from '../config';
import { loadConferenceFileAreas } from '../services/file-areas-loader';
import { getSystemTime } from '../utils/date-time.util';
import { AnsiUtil } from './ansi.util';
import { wrapLineToWidth } from '@amiexpress/bbs-door-sdk/petscii';
// A conference's directory is LOCATION.n, never a hand-built Conf<n>.
import { conferenceSubdir } from '../conferences/conference-paths';

/** The width every QuickNew line must fit: AmiExpress's own. */
const SCREEN_COLUMNS = 80;

/**
 * Fold a header line at its natural seam.
 *
 * The board's config writes each header as `... >> TITLE << :        (Files:
 * ...)` - a title, then a run of spaces, then the counts. The sysop's own
 * hand-wrapped screen broke exactly there, keeping the title whole and
 * putting the counts on the next line. So: if the line fits, keep it; else
 * fold at the last run of two or more spaces that still lands inside the
 * width, indenting the remainder; else fall back to the SDK's word wrap.
 * Escapes are zero-width throughout and never split.
 */
function foldAtSeam(line: string, width: number): string[] {
  const tokens = line.split(/(\x1b\[[0-9;?]*[A-Za-z])/).filter(t => t !== '');
  const printableLength = (text: string) => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length;
  if (printableLength(line) <= width) return [line];

  // Walk once, remembering the last seam (>= 2 spaces) whose column fits.
  let column = 0;
  let seamAt = -1;         // index into `built` where the seam's spaces begin
  let built = '';
  for (const token of tokens) {
    if (token.startsWith('\x1b')) { built += token; continue; }
    for (let i = 0; i < token.length; i++) {
      const ch = token[i];
      if (ch === ' ' && token[i + 1] === ' ' && column < width) seamAt = built.length;
      built += ch;
      column += 1;
    }
  }
  if (seamAt < 0) return wrapLineToWidth(line, width);

  const head = built.slice(0, seamAt).replace(/ +$/, '');
  const rest = built.slice(seamAt).replace(/^ +/, '');
  const tail = '    ' + rest;
  return [head, ...(printableLength(tail) <= width ? [tail] : wrapLineToWidth(tail, width))];
}

interface QuickNewSection {
  title: string;
  files: string[];
  filesCount: number;
  megs: number;
  yesterdayCount: number;
  yesterdayMegs: number;
  headerTemplate?: string;
  statsTemplate?: string;
}

interface QuickNewConfig {
  ansiReset: string;
  colorCode: string;
  sections: Array<{
    headerTemplate: string;
    statsTemplate: string;
    dirPath: string;
  }>;
}

function formatMegs(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function padFileName(name: string): string {
  // reference-board layout uses 11-12 chars per filename column
  return name.padEnd(12, ' ');
}

function sectionHeader(section: QuickNewSection): string {
  return `[32mLast 07 Days Files in [33m>> ${section.title} <<[34m :        [0m([35mFiles[33m: [36m${section.filesCount
    .toString()
    .padStart(2, '0')}[0m, [35mFakes[33m: [36m00, [35mMegs[33m: [36m${section.megs.toFixed(1)}[0m)`;
}

function sectionStats(section: QuickNewSection): string {
  return `[35mYesterdays Statistics [0m: [32m${section.yesterdayCount
    .toString()
    .padStart(2, '0')} [36mFiles[33m, [32m00 [36mFakes[33m, [32m${section.yesterdayMegs.toFixed(
    1
  )} [36mMegs [33m![0m`;
}

function renderSection(section: QuickNewSection): string {
  const lines: string[] = [];
  lines.push(...foldAtSeam(sectionHeader(section), SCREEN_COLUMNS));
  lines.push(...foldAtSeam(sectionStats(section), SCREEN_COLUMNS));
  lines.push('');

  if (section.files.length > 0) {
    const rows = [];
    for (let i = 0; i < section.files.length; i += 5) {
      const row = section.files.slice(i, i + 5).map(padFileName).join('  ');
      rows.push(`     [0m${row}  `);
    }
    lines.push(...rows);
    lines.push(''); // blank line after file rows
  }

  return lines.join('\r\n');
}

export async function generateQuickNewScreen(confId: number, daysBack = 7): Promise<string> {
  const now = getSystemTime();
  const cutoff = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const yesterdayStart = new Date(now);
  yesterdayStart.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterdayStart.getTime() + 24 * 60 * 60 * 1000);

  const sections: QuickNewSection[] = [];

  try {
    const areas = await db.getFileAreas(confId);
    for (const area of areas) {
      const files = await db.getFileEntries(area.id, { status: 'active', limit: 200 });
      const recent = files.filter(f => f.uploadDate >= cutoff);
      const yesterdayFiles = files.filter(
        f => f.uploadDate >= yesterdayStart && f.uploadDate < yesterdayEnd
      );

      sections.push({
        title: area.name,
        files: recent.slice(0, 40).map(f => f.filename),
        filesCount: recent.length,
        megs: formatMegs(recent.reduce((sum, f) => sum + (f.size || 0), 0)),
        yesterdayCount: yesterdayFiles.length,
        yesterdayMegs: formatMegs(yesterdayFiles.reduce((sum, f) => sum + (f.size || 0), 0)),
      });
    }
  } catch (error) {
console.error('[QuickNew] Error generating QuickNew screen:', error);
  }

  const output: string[] = [];
  // Clear the screen before rendering QuickNew (scrollback-preserving)
  output.push(AnsiUtil.clearScreen());

  if (sections.length === 0) {
    output.push('No file areas available.');
  } else {
    for (const section of sections) {
      output.push(renderSection(section));
    }
  }

  const timePart = now.toTimeString().split(' ')[0];
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  // Build footer content without ANSI codes to calculate padding
  const footerText = `  QuickNew V2.2 (Web) Date : ${month}-${day}-${year}   Time : ${timePart}  `;
  const paddedFooter = footerText.padEnd(80, ' ');
  const footer = `[44;33m${paddedFooter}[0m`;

  output.push(footer);
  output.push('~SP.');

  return output.join('\r\n');
}

export async function writeQuickNewScreen(confId: number, daysBack = 7): Promise<void> {
  const content = await generateQuickNewScreen(confId, daysBack);
  const baseDir = config.getConfig().dataDir;
  const screenPath = path.join(baseDir, 'Screens', 'quicknew.txt');

  try {
    fs.writeFileSync(screenPath, content, 'utf-8');
  } catch (error) {
console.error('[QuickNew] Failed to write quicknew screen:', error);
  }
}

/**
 * Parse QuickNew config file format (compatible with 68K QuickNew)
 * Format:
 *   Line 0: ANSI reset code
 *   Line 1: Color code
 *   Line 2: Number of sections (informational, we process all)
 *   Then repeating:
 *     - Header template with placeholders (@D, @N, @F, @M, @Y, @Z, @B)
 *     - Stats template with placeholders
 *     - '#' separator
 *     - Directory path (BBS:ConfX/DirY)
 */
export function parseQuickNewConfigFile(configPath: string): QuickNewConfig | null {
  try {
    if (!fs.existsSync(configPath)) {
console.error(`[QuickNew] Config file not found: ${configPath}`);
      return null;
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const lines = content.split('\n').map(l => l.replace(/\r$/, ''));

    if (lines.length < 4) {
console.error('[QuickNew] Config file too short');
      return null;
    }

    const ansiReset = lines[0] || '\x1b[0m';
    const colorCode = lines[1] || '\x1b[35m';
    // Line 2 is section count - we ignore it and process all sections

    const sections: QuickNewConfig['sections'] = [];
    let i = 3; // Start after header lines

    // Skip any empty lines after section count
    while (i < lines.length && lines[i].trim().length === 0) {
      i++;
    }

    while (i + 3 < lines.length) {
      const headerTemplate = lines[i];
      const statsTemplate = lines[i + 1];
      const separator = lines[i + 2];
      const dirPath = lines[i + 3];

      // Stop if we don't have a complete section
      if (!headerTemplate || !statsTemplate || separator !== '#') {
        break;
      }

      if (dirPath && dirPath.trim().length > 0) {
        sections.push({
          headerTemplate,
          statsTemplate,
          dirPath: dirPath.trim()
        });
      }

      i += 4;
    }

console.log(`[QuickNew] Parsed ${sections.length} sections from config`);
    return { ansiReset, colorCode, sections };
  } catch (error) {
console.error('[QuickNew] Error parsing config:', error);
    return null;
  }
}

/**
 * Parse classic DIR1 file format
 * Format: filename     P sizeK  datestr  description
 */
export function parseDirFile(dirPath: string): Array<{ filename: string; uploadDate: Date; size: number }> {
  if (!fs.existsSync(dirPath)) return [];

  const MONTHS: { [key: string]: number } = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
  };

  try {
    const content = fs.readFileSync(dirPath, 'latin1');
    const lines = content.split('\n');
    const entries: Array<{ filename: string; uploadDate: Date; size: number }> = [];

    for (const line of lines) {
      // Basic heuristic for a file line: starts with non-space and has a date pattern
      // Example: "AQUASCAN.EXE  P   12K  07-Dec-92  Cool scanner"
      // Example: "-Z-B&GE1.DMS P 549027  10-15-95  ..."
      if (line.length > 30 && !line.startsWith(' ')) {
        const filename = line.substring(0, 13).trim();
        const rawSizeStr = line.substring(14, 22).trim();
        const dateStr = line.substring(23, 32).trim(); // "07-Dec-92" or "10-15-95"

        if (filename && dateStr.includes('-')) {
          const isKB = rawSizeStr.toUpperCase().endsWith('K');
          const sizeVal = parseInt(rawSizeStr.replace(/K$/i, ''), 10) || 0;
          const size = isKB ? sizeVal * 1024 : sizeVal;

          // Parse date DD-MMM-YY or MM-DD-YY (Amiga formats vary)
          const dateParts = dateStr.split('-');
          let day, month, year;

          if (isNaN(parseInt(dateParts[1], 10))) {
            // DD-MMM-YY
            day = parseInt(dateParts[0], 10);
            month = MONTHS[dateParts[1]] || 0;
            year = parseInt(dateParts[2], 10);
          } else {
            // MM-DD-YY
            month = parseInt(dateParts[0], 10) - 1;
            day = parseInt(dateParts[1], 10);
            year = parseInt(dateParts[2], 10);
          }
          
          year += year < 80 ? 2000 : 1900; // Y2K heuristic
          const uploadDate = new Date(year, month, day);

          entries.push({ filename, uploadDate, size });
        }
      }
    }
    return entries;
  } catch (error) {
console.error(`[QuickNew] Error parsing DIR file ${dirPath}:`, error);
    return [];
  }
}

/**
 * Generate QuickNew screen from config file (68K compatible)
 */
export async function generateQuickNewFromConfig(
  configPath: string,
  daysBack: number,
  outputPath?: string
): Promise<string | null> {
  const cfg = parseQuickNewConfigFile(configPath);
  if (!cfg) {
    return null;
  }

  const now = getSystemTime();
  const cutoff = new Date(now.getTime() - (daysBack + 1) * 24 * 60 * 60 * 1000); // +1 day buffer
  const yesterdayStart = new Date(now);
  yesterdayStart.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterdayStart.getTime() + 24 * 60 * 60 * 1000);

  const output: string[] = [];
  output.push('\x1b[2J\x1b[H'); // Clear screen
  output.push(cfg.ansiReset);
  output.push(cfg.colorCode);

  for (const sectionCfg of cfg.sections) {
    // Parse BBS:ConfX/DirY format
    const match = sectionCfg.dirPath.match(/BBS:Conf(\d+)(?:\/Dir(\d+))?/i);
    if (!match) {
console.warn(`[QuickNew] Invalid dir path: ${sectionCfg.dirPath}`);
      continue;
    }

    const confId = parseInt(match[1], 10);
    const dirNum = match[2] ? parseInt(match[2], 10) : 1;

    try {
      // Get file areas for this conference (prefer database, fallback to disk)
      let areas = await db.getFileAreas(confId);
      const bbsRoot = config.getConfig().dataDir;
      let usingDiskAreas = false;

      if (areas.length === 0) {
        usingDiskAreas = true;
        const diskAreas = loadConferenceFileAreas(bbsRoot, confId);
        // Map disk areas to match the expected structure (only need id for lookup)
        areas = diskAreas.map(a => ({
          id: a.dirNumber, // Use dirNumber as ID for lookup
          name: a.name,
          description: a.description || '',
          path: a.dlPath || a.ulPath || '',
          conferenceId: confId,
          maxFiles: 0,
          uploadAccess: 0,
          downloadAccess: 0,
          created: getSystemTime(),
          updated: getSystemTime()
        }));
      }

      // Find area by name pattern "Conference X - Dir Y" or use array index
      // Note: area.id is database auto-increment, NOT the dir number
      const dirPattern = new RegExp(`(Conference\\s*${confId}|Conf\\s*${confId}).*Dir\\s*${dirNum}`, 'i');
      let area = areas.find(a => dirPattern.test(a.name));
      if (!area) {
        // Fallback: use array index (assumes areas ordered by dir number within conference)
        area = areas[dirNum - 1];
      }

      // No area is not a reason to drop the section. The 68K door never
      // looks one up: the config names a DIR file and the template carries
      // the title, so a section with no registered area still reads its
      // DIR file from disk exactly as QuickNew.asm does.
      if (!area) {
console.warn(`[QuickNew] Area not found for ${sectionCfg.dirPath}; reading its DIR file directly`);
      }

      // Get file entries:
      // - If areas came from database, query database for files
      // - If areas came from disk, skip database (would match wrong area IDs) and parse DIR file
      let files: any[] = [];

      if (area && !usingDiskAreas) {
        files = await db.getFileEntries(area.id, { status: 'active', limit: 200 });
      }

      if (files.length === 0) {
        // Fallback to parsing DIR file from disk
        const dirFilePath = conferenceSubdir(bbsRoot, confId, `DIR${dirNum}`);
        const diskFiles = parseDirFile(dirFilePath);
        files = diskFiles.map(f => ({
          ...f,
          id: 0,
          description: '',
          uploader: 'sysop',
          downloads: 0,
          areaId: area ? area.id : 0,
          status: 'active',
          checked: 'P'
        } as any));
      }

      const recent = files.filter(f => f.uploadDate >= cutoff);
      const yesterdayFiles = files.filter(
        f => f.uploadDate >= yesterdayStart && f.uploadDate < yesterdayEnd
      );

      const section: QuickNewSection = {
        title: area ? area.name : sectionCfg.dirPath,
        files: recent.slice(0, 40).map(f => f.filename),
        filesCount: recent.length,
        megs: formatMegs(recent.reduce((sum, f) => sum + (f.size || 0), 0)),
        yesterdayCount: yesterdayFiles.length,
        yesterdayMegs: formatMegs(yesterdayFiles.reduce((sum, f) => sum + (f.size || 0), 0)),
        headerTemplate: sectionCfg.headerTemplate,
        statsTemplate: sectionCfg.statsTemplate
      };

      // Render section with templates
      // The header carries the area title and the config's own prose, and a
      // long title runs past 80 - "Abandoned Applications" did, and the sysop
      // had hand-wrapped the live screen to fit. Fold at a space, escapes
      // intact, with the SDK's wrapper rather than a third one of our own.
      // "fix it's output for 80 columns" (sysop, 2026-09-15).
      output.push(...foldAtSeam(replacePlaceholders(sectionCfg.headerTemplate, section, daysBack), SCREEN_COLUMNS));
      output.push(...foldAtSeam(replacePlaceholders(sectionCfg.statsTemplate, section, daysBack), SCREEN_COLUMNS));
      output.push('');

      // Render file list (5 columns)
      if (section.files.length > 0) {
        for (let i = 0; i < section.files.length; i += 5) {
          const row = section.files.slice(i, i + 5).map(padFileName).join('  ');
          output.push(`     \x1b[0m${row}  `);
        }
        output.push('');
      }
    } catch (error) {
console.error(`[QuickNew] Error processing section ${sectionCfg.dirPath}:`, error);
    }
  }

  // Footer
  const timePart = now.toTimeString().split(' ')[0];
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  // Build footer content without ANSI codes to calculate padding
  const footerText = `  QuickNew V2.2 (Web) Date : ${month}-${day}-${year}   Time : ${timePart}  `;
  const paddedFooter = footerText.padEnd(80, ' ');
  // Explicit escapes: these three characters were literal text in the
  // config path, which put a 90-column footer and a stray `[0m` in every
  // file row on the live screen (sysop, 2026-09-15: "fix it's output for 80
  // columns").
  const footer = `\x1b[44;33m${paddedFooter}\x1b[0m`;

  output.push(footer);
  output.push('~SP.');

  const result = output.join('\r\n');

  // Write to output file if specified
  if (outputPath) {
    try {
      const fullPath = path.isAbsolute(outputPath) ? outputPath : path.join(config.getConfig().dataDir, outputPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, result, 'utf-8');
console.log(`[QuickNew] Wrote output to ${fullPath}`);
    } catch (error) {
console.error(`[QuickNew] Error writing to ${outputPath}:`, error);
    }
  }

  return result;
}

function replacePlaceholders(template: string, section: QuickNewSection, daysBack: number): string {
  return template
    .replace(/@D/g, daysBack.toString().padStart(2, '0'))
    .replace(/@N/g, section.filesCount.toString().padStart(2, '0'))
    .replace(/@F/g, '00') // Fakes always 00
    .replace(/@M\.0/g, section.megs.toFixed(1))
    .replace(/@M/g, Math.floor(section.megs).toString())
    .replace(/@Y/g, section.yesterdayCount.toString().padStart(2, '0'))
    .replace(/@Z/g, '00') // Yesterday fakes always 00
    .replace(/@B\.0/g, section.yesterdayMegs.toFixed(1))
    .replace(/@B/g, Math.floor(section.yesterdayMegs).toString());
}
