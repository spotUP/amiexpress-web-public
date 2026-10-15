/**
 * One CallersLog retention pass, by hand - the same pass the daily log
 * retention job runs (services/callers-log-retention.ts).
 *
 *   npx tsx src/scripts/prune-callers-log.ts [--dry-run] [--days N]
 *
 * Prints, per Node<n>/CallersLog and CLogBackup, how many address and
 * typed-password lines older than N days (default 90) it removes - or, with
 * --dry-run, would remove - and how many such lines it kept for want of a
 * date. The board is BBS_DATA_DIR (the container's /app/data/bbs).
 */
import { boardRoot } from '../utils/board-root.util';
import { DEFAULT_CALLERS_LOG_MAX_AGE_DAYS, runCallersLogRetention } from '../services/callers-log-retention';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const daysAt = argv.indexOf('--days');
const maxAgeDays = daysAt >= 0 ? parseInt(argv[daysAt + 1] ?? '', 10) : DEFAULT_CALLERS_LOG_MAX_AGE_DAYS;
if (!Number.isFinite(maxAgeDays) || maxAgeDays < 1) {
  process.stderr.write('usage: prune-callers-log.ts [--dry-run] [--days N]\n');
  process.exit(2);
}

const root = boardRoot();
const reports = runCallersLogRetention(root, { maxAgeDays, dryRun });
let address = 0;
let password = 0;
let undated = 0;
for (const r of reports) {
  address += r.address;
  password += r.password;
  undated += r.undatedKept;
  if (r.error) {
    process.stdout.write(`[ERROR] ${r.path}: ${r.error}\n`);
  } else if (r.address + r.password + r.undatedKept > 0) {
    process.stdout.write(
      `${r.path}: address ${r.address}, password ${r.password}, undated kept ${r.undatedKept}, ${r.beforeBytes} -> ${r.afterBytes} bytes\n`,
    );
  }
}
process.stdout.write(
  `${dryRun ? '[DRY RUN] would remove' : '[OK] removed'} ${address} address and ${password} password lines older than ${maxAgeDays} days`
  + ` from ${reports.length} files under ${root}; ${undated} undated kept\n`,
);
