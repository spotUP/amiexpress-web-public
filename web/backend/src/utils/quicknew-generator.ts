import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { getSystemTime } from '../utils/date-time.util';
// The board's one DIR reader - the same one F, N, FM and FTP list through.
import { parseDirFile, getDirFilePath } from './dir-file-reader.util';
import { wrapLineToWidth } from '@amiexpress/bbs-door-sdk/petscii';
// A conference's directory is LOCATION.n, never a hand-built Conf<n>.
import { conferenceDir } from '../conferences/conference-paths';

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
      /*
       * THE DIR FILE IS THE WHOLE TRUTH.
       *
       * express.e keeps no file catalogue: N lists a conference's DIR files
       * (displayFileList, express.e:27626, the date scan at 27840+), and the
       * QuickNew door this stands in for opens the DIR file its config names
       * and reads nothing else (QuickNew.asm processBlock -> loadfile). This
       * used to ask the SQL file_entries table first and read the DIR only
       * when that came back empty - and a catalogue row outlives its file, so
       * the screen listed files FM had deleted and missed files moved in.
       *
       * A missing or empty DIR is zero files, not an error: the board's own
       * readers treat it the same way.
       */
      const bbsRoot = config.getConfig().dataDir;
      const dirFilePath = getDirFilePath(conferenceDir(bbsRoot, confId), dirNum);
      let content = '';
      try {
        content = fs.readFileSync(dirFilePath, 'latin1');
      } catch { /* no DIR file: no files */ }
      const files = parseDirFile(content).map(f => ({
        filename: f.filename,
        uploadDate: f.uploadDate,
        size: f.fileSize,
      }));

      const recent = files.filter(f => f.uploadDate >= cutoff);
      const yesterdayFiles = files.filter(
        f => f.uploadDate >= yesterdayStart && f.uploadDate < yesterdayEnd
      );

      const section: QuickNewSection = {
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
