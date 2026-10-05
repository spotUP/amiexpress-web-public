/**
 * The voting booth - express.e internalCommandVO (25700-25710) and the
 * procedures it runs, 20537-21073, ported as procedures.
 *
 * The booth lives in files, as on the Amiga: `<conf>/Vote/VoteNN.def` (the
 * topic), `VoteNN.QQ.qst` (a question), answer files and `.cnt` counters
 * beside them, `VoteLock`, and `uservote<node>` (this caller's pending
 * votes). Whether a caller has voted on topic n is one bit of his Conf.DB
 * record's handle: byte (n+3)>>3, bit (n+3) mod 8 (20817-20819).
 *
 * The file names are express's own StringF formats, quirks included: the
 * question number in a .qst name is `\r\z\d[2]` ("01"), but in an answer or
 * .cnt name it is `\z\d[2]` - left-justified, zero-filled ("10" for
 * question 1). A board's existing Vote/ directory therefore reads as is.
 *
 * Keys come through express's own input calls (utils/await-input), which
 * handleCommand feeds before any sub-state; the session sits in
 * VO_TOPIC_SELECT while a procedure runs, and a key between prompts is
 * dropped there (voting-states).
 */
import * as fs from 'fs';
import * as path from 'path';

import type { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { RESULT_NOT_ALLOWED, type InternalCommandResult } from '../../constants/command-results';
import { checkSecurity } from '../../utils/acs.util';
import { emitText, clearTheScreen } from '../../utils/output.util';
import { lineInput, readChar } from '../../utils/await-input';
import { boardRoot } from '../../utils/board-root.util';
import { conferenceDir } from '../../conferences/conference-paths';
import { messagePointerFileManager } from '../../services/MessagePointerFileManager';
import { boardSysopName } from '../../utils/sysop-page-text.util';
import { report } from '../../achievements/reporter';

/** StringF's `\d[w]` with `\z` (zero fill) and optionally `\r` (right-justify). */
function z2(n: number, right: boolean): string {
  const s = String(n);
  if (s.length >= 2) return s.slice(0, 2);
  return right ? '0' + s : s + '0';
}

function voteDir(session: BBSSession): string {
  return path.join(conferenceDir(boardRoot(), session.currentConf || 1), 'Vote');
}

const defFile = (dir: string, t: number) => path.join(dir, `Vote${z2(t, true)}.def`);
const qstFile = (dir: string, t: number, q: number) => path.join(dir, `Vote${z2(t, true)}.${z2(q, true)}.qst`);
const totalCntFile = (dir: string, t: number, q: number) => path.join(dir, `Vote${z2(t, true)}.${z2(q, false)}.cnt`);
const answerFile = (dir: string, t: number, q: number, a: string) => path.join(dir, `Vote${z2(t, true)}.${z2(q, false)}.${a}`);
const answerCntFile = (dir: string, t: number, q: number, a: string) => path.join(dir, `Vote${z2(t, true)}.${z2(q, false)}.${a}.cnt`);

/** loadMsg (9969-9993): the file's lines, trailing blank lines dropped; [] if absent. */
function loadMsg(file: string): string[] {
  let text: string;
  try { text = fs.readFileSync(file, 'latin1'); } catch { return []; }
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  if (lines.length && lines[lines.length - 1] === '' && text.endsWith('\n')) lines.pop();
  let last = lines.length - 1;
  while (last > 0 && lines[last].length === 0) last--;
  return lines.slice(0, last + 1);
}

/** readFloatFromFile (MiscFuncs.e:504-512): the first line's value, 0 if absent. */
function readFloatFromFile(file: string): number {
  try { return parseFloat(fs.readFileSync(file, 'latin1').split('\n')[0]) || 0; } catch { return 0; }
}

/** writeFloatToFile (MiscFuncs.e:525-534): RealF(v,8) and a line feed. */
function writeFloatToFile(file: string, v: number): void {
  fs.writeFileSync(file, `${v.toFixed(8)}\n`, 'latin1');
}

/** The voted bit's place in the caller's Conf.DB handle (20817-20819). */
function voteBit(topicNum: number): { byte: number; bit: number } {
  return { byte: (topicNum + 3) >> 3, bit: 1 << ((topicNum + 3) % 8) };
}

function hasVoted(session: BBSSession, topicNum: number): boolean {
  const slot = Number(session.user?.slotNumber) || 0;
  if (slot < 1) return false;
  const { byte, bit } = voteBit(topicNum);
  const rec = messagePointerFileManager.readRecordOrZero(session.currentConf || 1, slot);
  return ((rec.handle[byte] ?? 0) & bit) !== 0;
}

function markVoted(session: BBSSession, topicNum: number): void {
  const slot = Number(session.user?.slotNumber) || 0;
  if (slot < 1) return;
  const conf = session.currentConf || 1;
  const rec = messagePointerFileManager.readRecordOrZero(conf, slot);
  const handle = Buffer.from(rec.handle);
  const { byte, bit } = voteBit(topicNum);
  handle[byte] = (handle[byte] | bit) & 0xff;
  messagePointerFileManager.patchRecord(conf, slot, { handle });
}

/** doPause, awaited. */
async function pause(socket: any, session: BBSSession): Promise<void> {
  const { doPause } = require('../screen.handler');
  await new Promise<void>((resolve) => doPause(socket, session, () => resolve()));
}

/** numberInputNoDefault (21085-21088). */
async function numberInputNoDefault(socket: any, session: BBSSession): Promise<number> {
  const str = await lineInput(socket, session as any, 5);
  return (parseInt(str, 10) || 0) & 0xffff;
}

/** One topic's lines as the menus print them (20825-20830, 20873-20878). */
function topicLines(socket: any, session: BBSSession, dir: string, topicNum: number): boolean {
  const lines = loadMsg(defFile(dir, topicNum));
  if (!fs.existsSync(defFile(dir, topicNum))) return false;
  const voted = hasVoted(session, topicNum);
  lines.forEach((line, i) => {
    emitText(socket, i === 0
      ? `\x1b[34m[\x1b[0m${String(topicNum).padStart(2)}\x1b[34m] \x1b[32m${line} \x1b[35m${voted ? 'VOTED' : '     '}\r\n`
      : `           \x1b[35m${line}\r\n`);
  });
  return true;
}

/** showVoteTopics (20537-20565). */
async function showVoteTopics(socket: any, session: BBSSession): Promise<void> {
  const dir = voteDir(session);
  for (let t = 1; t <= 25; t++) topicLines(socket, session, dir, t);
  await pause(socket, session);
}

/** deleteVoteTopic (20639-20686). */
async function deleteVoteTopic(socket: any, session: BBSSession): Promise<void> {
  emitText(socket, '\r\n\x1b[34mENTER TOPIC NUMBER TO DELETE \x1b[33m>:\x1b[0m ');
  const topicNum = await numberInputNoDefault(socket, session);
  if (topicNum < 1 || topicNum > 25) return;
  const dir = voteDir(session);
  if (!fs.existsSync(defFile(dir, topicNum))) {
    emitText(socket, '\r\n\x1b[0mTHIS TOPIC DOES NOT EXIST\r\n');
    await pause(socket, session);
    return;
  }
  const rm = (f: string) => { try { fs.unlinkSync(f); } catch { /* DeleteFile of nothing */ } };
  rm(defFile(dir, topicNum));
  // express deletes these with `\r\z\d[2]` question numbers (20661-20672).
  for (let q = 1; q <= 99; q++) {
    const qst = qstFile(dir, topicNum, q);
    if (!fs.existsSync(qst)) break;
    rm(qst);
    rm(path.join(dir, `Vote${z2(topicNum, true)}.${z2(q, true)}.cnt`));
    for (let a = 'A'.charCodeAt(0); a <= 'Z'.charCodeAt(0); a++) {
      const ans = path.join(dir, `Vote${z2(topicNum, true)}.${z2(q, true)}.${String.fromCharCode(a)}`);
      if (!fs.existsSync(ans)) break;
      rm(ans);
      rm(`${ans}.cnt`);
    }
  }
  emitText(socket, '\r\n\x1b[33mTOPIC DELETED\x1b[0m\r\n');
  await pause(socket, session);
}

/** One question's text and total line (20856-20868, 20929-20941). */
function questionHead(socket: any, dir: string, topicNum: number, questNum: number): number {
  emitText(socket, '\r\n');
  for (const line of loadMsg(qstFile(dir, topicNum, questNum))) emitText(socket, `${line}\r\n`);
  emitText(socket, '\r\n');
  const cnt1 = readFloatFromFile(totalCntFile(dir, topicNum, questNum));
  emitText(socket, `\x1b[35mTOTAL VOTES FOR THIS QUESTION \x1b[0m= \x1b[33m${cnt1.toFixed(0)}\r\n`);
  return cnt1;
}

const nextLetter = (a: string) => String.fromCharCode(a.charCodeAt(0) + 1);

/** showTopicVotes (20841-20902). */
async function showTopicVotes(socket: any, session: BBSSession, topicNum: number): Promise<void> {
  const dir = voteDir(session);
  emitText(socket, `\r\n\x1b[33mTOPIC \x1b[34m[\x1b[0m${topicNum}\x1b[34m]\x1b[0m\r\n`);
  for (let q = 1; fs.existsSync(qstFile(dir, topicNum, q)); q++) {
    const cnt1 = questionHead(socket, dir, topicNum, q);
    for (let a = 'A'; fs.existsSync(answerFile(dir, topicNum, q, a)); a = nextLetter(a)) {
      const lines = loadMsg(answerFile(dir, topicNum, q, a));
      const cnt2 = readFloatFromFile(answerCntFile(dir, topicNum, q, a));
      lines.forEach((line, i) => {
        if (i > 0) emitText(socket, `    ${line}\r\n`);
        else if (cnt1 > 0) {
          emitText(socket, `\x1b[34m[\x1b[0m${a}\x1b[34m]\x1b[0m ${line.padEnd(40)} \x1b[35mVOTES\x1b[33m: \x1b[0m${cnt2.toFixed(0)}, ${(cnt2 / cnt1 * 100).toFixed(1)}%\r\n`);
        } else {
          emitText(socket, `\x1b[34m[\x1b[0m${a}\x1b[34m]\x1b[0m ${line.padEnd(40)}\r\n`);
        }
      });
    }
    await pause(socket, session);
  }
}

/** topicVote (20904-21023). */
async function topicVote(socket: any, session: BBSSession, topicNum: number): Promise<void> {
  const dir = voteDir(session);
  const userfile = path.join(dir, `uservote${session.nodeId || 0}`);
  const pending: string[] = [];
  try {
    fs.writeFileSync(userfile, '', 'latin1');
  } catch {
    emitText(socket, `\r\nTell ${boardSysopName()} an error occured creating the uservote file\r\n`);
    return;
  }

  emitText(socket, `\r\n\x1b[33mTOPIC \x1b[34m[\x1b[0m${topicNum}\x1b[34m]\x1b[0m\r\n`);
  for (let q = 1; fs.existsSync(qstFile(dir, topicNum, q)); q++) {
    questionHead(socket, dir, topicNum, q);
    for (let a = 'A'; fs.existsSync(answerFile(dir, topicNum, q, a)); a = nextLetter(a)) {
      loadMsg(answerFile(dir, topicNum, q, a)).forEach((line, i) => {
        emitText(socket, i === 0 ? `\x1b[34m[\x1b[0m${a}\x1b[34m]\x1b[0m ${line.padEnd(40)}\r\n` : `    ${line}\r\n`);
      });
    }
    emitText(socket, '\r\n\x1b[0mCHOICE >: ');
    const ch = (await readChar(socket, session as any)).toUpperCase();
    emitText(socket, ch + '\r\n');
    if (ch.length === 1 && ch >= 'A' && ch <= 'Z' && fs.existsSync(answerFile(dir, topicNum, q, ch))) {
      pending.push(totalCntFile(dir, topicNum, q), answerCntFile(dir, topicNum, q, ch));
      fs.writeFileSync(userfile, pending.map(f => f + '\n').join(''), 'latin1');
    }
    await pause(socket, session);
  }

  // 20991-21021: under VoteLock, every pending counter goes up by one, and
  // the topic's bit is set. One node process: the counters are written in
  // one synchronous pass, which no other caller can interleave.
  for (const counter of pending) writeFloatToFile(counter, readFloatFromFile(counter) + 1.0);
  markVoted(session, topicNum);
  report(session as any, 'social.vote');
}

/** vote (20783-20839). */
async function vote(socket: any, session: BBSSession): Promise<void> {
  const dir = voteDir(session);
  for (;;) {
    emitText(socket, '\r\n\r\n                  \x1b[34m*\x1b[0m--\x1b[33mVOTING TOPICS MENU\x1b[0m--\x1b[34m*\x1b[0m\r\n\r\n');
    let found = 0;
    for (let t = 1; t <= 25; t++) if (topicLines(socket, session, dir, t)) found++;
    if (found === 0) {
      emitText(socket, '\x1b[0mVOTING IS NOT ESTABLISHED FOR THIS CONFERENCE\r\n\r\n');
      await pause(socket, session);
      return;
    }
    emitText(socket, '\x1b[34m[\x1b[0m Q\x1b[34m] \x1b[33mQUIT\x1b[0m\r\n');
    emitText(socket, '>: ');
    const str = await lineInput(socket, session as any, 2);
    const topicNum = parseInt(str, 10) || 0;
    if (topicNum > 0 && topicNum < 26) {
      if (hasVoted(session, topicNum)) await showTopicVotes(socket, session, topicNum);
      else await topicVote(socket, session, topicNum);
    }
    if (str.toUpperCase() === 'Q') return;
  }
}

/** showVoteStats (21025-21035). */
async function showVoteStats(socket: any, session: BBSSession): Promise<void> {
  const dir = voteDir(session);
  for (let t = 1; t <= 25; t++) {
    if (fs.existsSync(defFile(dir, t))) await showTopicVotes(socket, session, t);
  }
}

/** voteMenu (21037-21074). Create and edit wait on an awaitable edit(). */
async function voteMenu(socket: any, session: BBSSession): Promise<void> {
  for (;;) {
    emitText(socket, clearTheScreen(socket));
    emitText(socket, '\r\n                 \x1b[34m*\x1b[0m--\x1b[33mVOTE MAINTENANCE\x1b[0m--\x1b[34m*\x1b[0m\r\n\r\n');
    emitText(socket, '\x1b[34m[\x1b[0m 1\x1b[34m] \x1b[35mSHOW VOTING STATISTICS\x1b[0m\r\n');
    emitText(socket, '\x1b[34m[\x1b[0m 2\x1b[34m] \x1b[35mSHOW TOPICS\x1b[0m\r\n');
    emitText(socket, '\x1b[34m[\x1b[0m 3\x1b[34m] \x1b[35mCREATE VOTE TOPIC\x1b[0m\r\n');
    emitText(socket, '\x1b[34m[\x1b[0m 4\x1b[34m] \x1b[35mDELETE VOTE TOPIC\x1b[0m\r\n');
    emitText(socket, '\x1b[34m[\x1b[0m 5\x1b[34m] \x1b[35mEDIT   VOTE TOPIC\x1b[0m\r\n');
    emitText(socket, '\x1b[34m[\x1b[0m 6\x1b[34m] \x1b[35mVOTE\x1b[0m\r\n');
    emitText(socket, '\x1b[34m[\x1b[0m 7\x1b[34m] \x1b[33mEXIT VOTE MAINTENANCE\x1b[0m\r\n');
    emitText(socket, '\r\n>');

    let ch = await readChar(socket, session as any);
    emitText(socket, ch + '\r\n');
    switch (ch) {
      case '1': await showVoteStats(socket, session); break;
      case '2': await showVoteTopics(socket, session); break;
      case '4': await deleteVoteTopic(socket, session); break;
      case '6': await vote(socket, session); ch = '\0'; break;
      default: break;
    }
    if (ch < '1' || ch === '7') return;
  }
}

/** internalCommandVO (25700-25710). */
export async function handleVotingBoothCommand(socket: any, session: BBSSession): Promise<InternalCommandResult> {
  if (!checkSecurity(session.user, ACSPermission.VOTE)) return RESULT_NOT_ALLOWED;
  // The session waits here while the procedure runs; see voting-states.
  session.subState = LoggedOnSubState.VO_TOPIC_SELECT;
  try {
    if (checkSecurity(session.user, ACSPermission.MODIFY_VOTE)) await voteMenu(socket, session);
    else await vote(socket, session);
  } finally {
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}
