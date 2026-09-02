/**
 * Rewrite every HeaderFile record this port wrote into the layout AmiExpress
 * reads.
 *
 * The board runs correctly without this: the reader understands both layouts
 * (services/msgheader-layout.ts). What it buys is the other direction - a
 * real Amiga, and any 68K door that opens HeaderFile itself, can read the
 * message base afterwards, which is the parity this project is for.
 *
 * Dry run unless told otherwise, and a `.backup` beside every file it
 * changes. A record it cannot identify is REPORTED and left exactly as it
 * was: 21 of this board's 545 are structurally odd in both layouts, and a
 * wrong guess here rewrites somebody's mail.
 *
 *   npx tsx src/scripts/migrate-msgheaders.ts <bbs-root>
 *   npx tsx src/scripts/migrate-msgheaders.ts <bbs-root> --apply
 */
import * as fs from 'fs';
import * as path from 'path';
import { AMIGA_MSGHEADER_SIZE } from '../services/amiga-msgheader';
import { classifyMsgHeaderRecord, portRecordToAmiga } from '../services/msgheader-layout';

export interface MigrationReport {
  file: string;
  records: number;
  converted: number;
  alreadyAmiga: number;
  unidentified: number[];
}

export function planHeaderFile(buffer: Buffer): { out: Buffer; report: Omit<MigrationReport, 'file'> } {
  const records = Math.floor(buffer.length / AMIGA_MSGHEADER_SIZE);
  const out = Buffer.from(buffer);
  const report = { records, converted: 0, alreadyAmiga: 0, unidentified: [] as number[] };

  for (let i = 0; i < records; i++) {
    const at = i * AMIGA_MSGHEADER_SIZE;
    switch (classifyMsgHeaderRecord(buffer, at)) {
      case 'port':
        portRecordToAmiga(buffer, at).copy(out, at);
        report.converted++;
        break;
      case 'amiga':
        report.alreadyAmiga++;
        break;
      default:
        report.unidentified.push(i);
    }
  }

  return { out, report };
}

/** Every conference's HeaderFile under a board root. */
function headerFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // MsgBase, or the numbered bases a conference with several of them keeps.
    const confDir = path.join(root, entry.name);
    for (const sub of fs.readdirSync(confDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const candidate = path.join(confDir, sub.name, 'HeaderFile');
      if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) found.push(candidate);
    }
  }
  return found.sort();
}

function main(): void {
  const [root, ...flags] = process.argv.slice(2);
  if (!root) {
    console.error('usage: migrate-msgheaders.ts <bbs-root> [--apply]');
    process.exit(2);
  }
  const apply = flags.includes('--apply');

  let totalConverted = 0;
  let totalUnidentified = 0;

  for (const file of headerFiles(root)) {
    const buffer = fs.readFileSync(file);
    const { out, report } = planHeaderFile(buffer);
    totalConverted += report.converted;
    totalUnidentified += report.unidentified.length;

    const rel = path.relative(root, file);
    console.log(
      `${rel}: ${report.records} records, ${report.converted} to convert, `
      + `${report.alreadyAmiga} already AmiExpress, ${report.unidentified.length} unidentified`,
    );
    if (report.unidentified.length > 0) {
      console.log(`  left untouched: records ${report.unidentified.join(', ')}`);
    }

    if (apply && report.converted > 0) {
      fs.copyFileSync(file, `${file}.backup`);
      fs.writeFileSync(file, out);
      console.log(`  written, backup at ${rel}.backup`);
    }
  }

  console.log(
    `\n${apply ? 'Converted' : 'Would convert'} ${totalConverted} record(s); `
    + `${totalUnidentified} left for a person to look at.`,
  );
  if (!apply) console.log('Dry run. Pass --apply to write.');
}

if (require.main === module) main();
