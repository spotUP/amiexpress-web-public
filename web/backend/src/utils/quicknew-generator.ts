import * as fs from 'fs';
import * as path from 'path';
import { db } from '../database';
import { config } from '../config';

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
  lines.push(sectionHeader(section));
  lines.push(sectionStats(section));
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
  const now = new Date();
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
  // Clear the screen before rendering QuickNew to match classic behavior
  output.push('\x1b[2J\x1b[H');

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
  const footer = `[44;33m  QuickNew V2.2 (Web)[36m Date : ${month}-${day}-${String(now.getFullYear()).slice(
    -2
  )}  [35m Time : ${timePart}  \r\n[0m`;

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

    const ansiReset = lines[0] || '[0m';
    const colorCode = lines[1] || '[35m';
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
 * This function reads a QuickNew config file and generates output matching the original format
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

  const now = new Date();
  const cutoff = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
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
      // Get file areas for this conference
      const areas = await db.getFileAreas(confId);
      const area = areas.find(a => a.id === dirNum) || areas[dirNum - 1];

      if (!area) {
        console.warn(`[QuickNew] Area not found for ${sectionCfg.dirPath}`);
        continue;
      }

      const files = await db.getFileEntries(area.id, { status: 'active', limit: 200 });
      const recent = files.filter(f => f.uploadDate >= cutoff);
      const yesterdayFiles = files.filter(
        f => f.uploadDate >= yesterdayStart && f.uploadDate < yesterdayEnd
      );

      const section: QuickNewSection = {
        title: area.name,
        files: recent.slice(0, 40).map(f => f.filename),
        filesCount: recent.length,
        megs: formatMegs(recent.reduce((sum, f) => sum + (f.size || 0), 0)),
        yesterdayCount: yesterdayFiles.length,
        yesterdayMegs: formatMegs(yesterdayFiles.reduce((sum, f) => sum + (f.size || 0), 0)),
        headerTemplate: sectionCfg.headerTemplate,
        statsTemplate: sectionCfg.statsTemplate
      };

      // Render section with templates
      output.push(replacePlaceholders(sectionCfg.headerTemplate, section, daysBack));
      output.push(replacePlaceholders(sectionCfg.statsTemplate, section, daysBack));
      output.push('');

      // Render file list (5 columns)
      if (section.files.length > 0) {
        for (let i = 0; i < section.files.length; i += 5) {
          const row = section.files.slice(i, i + 5).map(padFileName).join('  ');
          output.push(`     [0m${row}  `);
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
  const footer = `[44;33m  QuickNew V2.2 (Web)[36m Date : ${month}-${day}-${year}  [35m Time : ${timePart}  \r\n[0m`;

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
    .replace(/@M/g, section.megs.toFixed(1))
    .replace(/@Y/g, section.yesterdayCount.toString().padStart(2, '0'))
    .replace(/@Z/g, '00') // Yesterday fakes always 00
    .replace(/@B/g, section.yesterdayMegs.toFixed(1));
}
