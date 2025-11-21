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
