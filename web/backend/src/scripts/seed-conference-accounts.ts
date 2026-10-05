/**
 * Give each caller's Conf.DB records the transfers and posts only his
 * user.data account holds, once, before conference accounting sums them.
 *
 * From 2026-10-05 the board does what express.e does under
 * ACS_CONFERENCE_ACCOUNTING: the account's upload/download counters at logoff
 * are the SUM of the caller's conference records (addMsgPointers,
 * express.e:8626-8659), and his post count always is. Until then the port
 * added every transfer and post to the account and (mostly) not to any
 * record, so on the live board an account can hold more than its records
 * sum to. The caller's next logoff would replace it with the smaller sum.
 *
 * For every account whose total is LARGER than the sum, the difference is
 * added to ONE record: the conference he last joined (confRJoin, express.e
 * 5134) when he may join it and its Conf.DB is not shared, otherwise the
 * first conference that qualifies. Counters only under conference accounting
 * (the sum ignores them otherwise); the post count always. An account at or
 * below its sum is left alone - the sum is express.e's answer.
 *
 * Each Conf.DB and user.data is copied to `<file>.pre-seed-<date>.backup`
 * before its first change. A second run finds nothing to change.
 *
 *     npx tsx src/scripts/seed-conference-accounts.ts --dry-run
 *     npx tsx src/scripts/seed-conference-accounts.ts
 *
 *     --root <path>    the board (default: BBS_DATA_DIR, as the board uses)
 *     --date <stamp>   the date in the backup names (default: today)
 */
import * as fs from 'fs';
import { UserFileManager } from '../services/UserFileManager';
import { MessagePointerFileManager, accountedBytes } from '../services/MessagePointerFileManager';
import { conferenceNumbers } from '../conferences/conference-paths';
import { loadAcsAccessFiles } from '../utils/acs-access-loader';
import type { User } from '../database/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export interface SeedPlan {
  slot: number;
  username: string;
  conference: number;
  uploads: number;
  downloads: number;
  bytesUpload: bigint;
  bytesDownload: bigint;
  messagesPosted: number;
}

/** What each account needs added to one record, without writing anything. */
export function planSeeds(root: string): SeedPlan[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { conferenceSums } = require('../utils/message-pointers.util') as typeof import('../utils/message-pointers.util');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { checkConfAccess } = require('../handlers/message/message-scan.handler') as { checkConfAccess: (u: unknown, c: number) => boolean };
  const users = new UserFileManager(root);
  const records = new MessagePointerFileManager(root);
  const conferences = conferenceNumbers(root);
  const plans: SeedPlan[] = [];

  users.readAllUsers().forEach((user: User) => {
    const slot = Number(user.slotNumber) || 0;
    if (slot < 1 || user.accountDeleted) return;
    const sums = conferenceSums(user, slot, root, records);
    const more = (account: number | undefined, sum: number) => Math.max(0, (account || 0) - sum);
    const plan: SeedPlan = {
      slot, username: user.username, conference: 0,
      uploads: sums.accounting ? more(user.uploads, sums.uploads) : 0,
      downloads: sums.accounting ? more(user.downloads, sums.downloads) : 0,
      bytesUpload: sums.accounting && BigInt(user.bytesUpload || 0) > sums.bytesUpload ? BigInt(user.bytesUpload || 0) - sums.bytesUpload : 0n,
      bytesDownload: sums.accounting && BigInt(user.bytesDownload || 0) > sums.bytesDownload ? BigInt(user.bytesDownload || 0) - sums.bytesDownload : 0n,
      messagesPosted: more(user.messagesPosted, sums.messagesPosted),
    };
    if (!plan.uploads && !plan.downloads && !plan.bytesUpload && !plan.bytesDownload && !plan.messagesPosted) return;
    const counted = (c: number) => !records.isShared(c) && checkConfAccess(user, c);
    const rejoin = Number(user.confRJoin || user.autoRejoin) || 0;
    plan.conference = conferences.includes(rejoin) && counted(rejoin) ? rejoin : (conferences.find(counted) ?? 0);
    if (plan.conference) plans.push(plan);
    else console.warn(`[seed] ${user.username} (slot ${slot}): no conference counts for him - left alone`);
  });
  return plans;
}

/** Add each plan to its record, backing every file up before its first change. */
export function applySeeds(root: string, plans: SeedPlan[], date: string): void {
  const records = new MessagePointerFileManager(root);
  const backedUp = new Set<string>();
  for (const plan of plans) {
    const file = records.getConfDbPath(plan.conference);
    if (!backedUp.has(file) && fs.existsSync(file)) {
      fs.copyFileSync(file, `${file}.pre-seed-${date}.backup`);
      backedUp.add(file);
    }
    const rec = records.readRecordOrZero(plan.conference, plan.slot);
    records.putAccount(plan.conference, plan.slot, {
      uploads: (rec.upload & 0xffff) + plan.uploads,
      downloads: (rec.downloads & 0xffff) + plan.downloads,
      bytesUpload: Number(accountedBytes(rec.bytesUpload, rec.uploadBytesBCD) + plan.bytesUpload),
      bytesDownload: Number(accountedBytes(rec.bytesDownload, rec.downloadBytesBCD) + plan.bytesDownload),
      ratioType: rec.ratioType,
      ratio: rec.ratio,
    });
    records.patchRecord(plan.conference, plan.slot, { messagesPosted: ((rec.messagesPosted & 0xffff) + plan.messagesPosted) & 0xffff });
  }
}

if (require.main === module) {
  const root = arg('--root') || process.env.BBS_DATA_DIR || process.env.BBS_ROOT;
  if (!root) {
    console.error('--root <board> or BBS_DATA_DIR is required');
    process.exit(1);
  }
  process.env.BBS_DATA_DIR = root;
  process.env.BBS_ROOT = root;
  const date = arg('--date') || new Date().toISOString().slice(0, 10);
  loadAcsAccessFiles(root);
  const plans = planSeeds(root);
  for (const p of plans) {
    console.log(
      `${p.username.padEnd(20)} slot ${String(p.slot).padStart(4)} -> Conf ${p.conference}: ` +
      `+${p.uploads} up (+${p.bytesUpload} bytes), +${p.downloads} down (+${p.bytesDownload} bytes), +${p.messagesPosted} posts`
    );
  }
  console.log(`${plans.length} account(s) to seed`);
  if (process.argv.includes('--dry-run')) process.exit(0);
  applySeeds(root, plans, date);
  console.log('done');
}
