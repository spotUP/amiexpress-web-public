import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

/**
 * Generate a simple last callers bulletin from the most recent entries in CallersLog.
 * This mirrors the reference-board batch job that copies lastc.txt into bull6.txt after
 * running the lastcallers door.
 */
export function generateLastCallersBulletin(limit = 20): string {
  const baseDir = config.getConfig().dataDir;
  const candidates = [
    path.join(baseDir, 'CallersLog'),
    path.join(baseDir, 'Node1', 'CallersLog'),
    path.join(baseDir, 'Node0', 'CallersLog'),
  ];

  let lines: string[] = [];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length > 0) break;
      } catch (err) {
        console.error('[LastCallers] Failed to read', file, err);
      }
    }
  }

  if (lines.length === 0) {
    return 'No callers logged yet.\r\n';
  }

  const recent = lines.slice(-limit);
  const header = 'Last Callers\r\n============\r\n';
  return header + recent.join('\r\n') + '\r\n';
}

export function writeLastCallersBulletin(limit = 20): void {
  const baseDir = config.getConfig().dataDir;
  const outputPath = path.join(baseDir, 'Bulletins', 'lastc.txt');

  try {
    const content = generateLastCallersBulletin(limit);
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log('[LastCallers] Bulletin written to', outputPath);
  } catch (err) {
    console.error('[LastCallers] Failed to write bulletin:', err);
  }
}
