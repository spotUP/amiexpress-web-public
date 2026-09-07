/**
 * THE BOARD CARD - what this board is, for the AI co-sysop.
 *
 * Until 2026-09-08 the bot was told a 60-line list of stock /X commands and
 * nothing about the board it was answering for: not its commands, doors,
 * conferences, bulletins, sysop, or the caller in front of it. It guessed
 * ("Docs are in ^"). This builds the facts from the same places the board
 * reads them - the command icons, the door registry, the conference list,
 * the bulletin files, bbsConfig, the caller's own record - and hands them
 * to the model as one system message, built once when the bot takes a page.
 *
 * Every section is guarded: a card is never the reason a reply fails. A
 * section that cannot be read is left out and logged.
 *
 * Plan: thoughts/shared/plans/2026-09-08-ai-sysop-knowledge.md, K1.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { BBSSession } from '../../index';
import { loadBBSConfig } from '../../services/bbs-config-file.service';
import { loadConfConfig } from '../../services/conf-config.service';
import { readTooltypeMap } from '../../utils/info-file.util';
import { listOnlineNodes } from '../../doors/who-is-online';
import { conferenceDir } from '../../conferences/conference-paths';
import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';

// DISK, NOT REGISTRIES. The in-memory door registry is filled once at boot
// (server/initialization.ts:674) and a door installed or deleted at runtime is
// invisible to it until the next restart ("door in a bbs gets deleted and new
// ones gets added" - sysop, 2026-09-08). The command icons and ConfConfig.info
// are what the board itself reads, and they are current the moment the admin
// writes them. It also keeps door.handler and screen.handler - and through
// them src/index.ts, which starts the server - out of this module's imports.

/** The card must fit beside the personality and the history on a small model. */
export const BOARD_CARD_MAX_CHARS = 3500;

export interface ConferenceOnCard { id: number; name: string; description?: string }

export interface BoardCardOptions {
  /** The board root; defaults to BBS_ROOT or the repo root. */
  bbsRoot?: string;
  /** Injected for tests; default readers are the board's own files and session map. */
  conferences?: (bbsRoot: string) => ConferenceOnCard[];
  online?: () => ReturnType<typeof listOnlineNodes>;
  now?: () => Date;
}

/** ConfConfig.info as the board reads it: NAME.n for n in 1..NCONFS. */
export function conferencesFromDisk(bbsRoot: string): ConferenceOnCard[] {
  const data = loadConfConfig(bbsRoot);
  if (!data) return [];
  return data.entries
    .map((e, i) => ({ id: i + 1, name: e.name }))
    .filter((c) => c.name && c.name.trim() !== '');
}

const defaultRoot = () => process.env.BBS_ROOT || path.join(__dirname, '../../../../..');

function section(name: string, build: () => string[]): string[] {
  try {
    const lines = build().filter((l) => l.trim() !== '');
    return lines.length ? [`== ${name} ==`, ...lines, ''] : [];
  } catch (err) {
console.log(`[Board Card] ${name}: not included (${(err as Error).message})`);
    return [];
  }
}

/** Commands/BBSCmd/*.info the caller may run, by name, with what the icon says. */
function commandLines(bbsRoot: string, level: number): string[] {
  const dir = path.join(bbsRoot, 'Commands', 'BBSCmd');
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.info'));
  const internal: string[] = [];
  const external: string[] = [];
  for (const file of names.sort((a, b) => a.localeCompare(b))) {
    const tt = readTooltypeMap(path.join(dir, file));
    const access = parseInt(tt.get('ACCESS') ?? '0', 10);
    if (Number.isFinite(access) && access > level) continue;
    const name = file.replace(/\.info$/i, '');
    const type = (tt.get('TYPE') ?? '').toUpperCase();
    (type === 'BBS' || type === '' ? internal : external).push(name);
  }
  const out: string[] = [];
  if (internal.length) out.push('built-in:', ...fold(internal));
  if (external.length) out.push(`doors and programs (${external.length}):`, ...fold(external));
  return out;
}

/** Fold a list of items into lines of at most `width` columns. */
function fold(items: string[], width = 78): string[] {
  const lines: string[] = [];
  let line = '';
  for (const item of items) {
    const next = line ? `${line}, ${item}` : item;
    if (next.length > width && line) { lines.push(line + ','); line = item; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function conferenceLines(conferences: ConferenceOnCard[], current: number | undefined): string[] {
  return conferences.map((c) => `${c.id}: ${c.name}${c.description ? ` - ${c.description}` : ''}${c.id === current ? ' (the caller is here)' : ''}`);
}

/** Bulletin titles in the caller's conference: the first non-empty line of each file. */
function bulletinLines(bbsRoot: string, confId: number | undefined): string[] {
  if (!confId) return [];
  const dir = path.join(conferenceDir(bbsRoot, confId), 'Bulletins');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^bull\d+\.txt$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), 'latin1');
      const title = text.split(/\r?\n/).map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim()).find((l) => l !== '') ?? '';
      return `${f.replace(/\.txt$/i, '')}: ${title.slice(0, 70)}`;
    });
}

function callerLines(session: BBSSession): string[] {
  const u = session.user;
  if (!u) return [];
  const mb = (n: number | undefined) => `${((n ?? 0) / 1048576).toFixed(1)} MB`;
  // express.e:28417 - (timeTotal - timeUsed) / 60; OVERRIDE_TIMELIMIT is unlimited.
  const left = checkSecurity(u as any, ACSPermission.OVERRIDE_TIMELIMIT) ? 9999 : Math.max(0, Math.floor(((u.timeTotal ?? 0) - (u.timeUsed ?? 0)) / 60));
  return [
    `handle: ${u.username}`,
    `security level: ${u.secLevel}`,
    `location: ${u.location || 'unknown'}`,
    `calls: ${u.calls ?? 0} (today ${u.callsToday ?? 0}); member since ${u.firstLogin ? new Date(u.firstLogin).toISOString().slice(0, 10) : 'unknown'}`,
    `uploads: ${u.uploads ?? 0} files, ${mb(u.bytesUpload)}; downloads: ${u.downloads ?? 0} files, ${mb(u.bytesDownload)}; ratio setting ${u.ratio ?? 0}`,
    `messages posted: ${u.messagesPosted ?? 0}`,
    `time left today: ${left >= 9999 ? 'unlimited' : `${left} min`}`,
    `node: ${session.nodeId ?? '?'}; connection: ${session.connectionType || 'web'}`,
  ];
}

/**
 * The card for one caller, at the moment the bot takes the page.
 * Trimmed from the bottom (commands first to go) to BOARD_CARD_MAX_CHARS.
 */
export async function buildBoardCard(session: BBSSession, options: BoardCardOptions = {}): Promise<string> {
  const bbsRoot = options.bbsRoot ?? defaultRoot();
  const level = session.user?.secLevel ?? 0;
  const now = (options.now ?? (() => new Date()))();
  const conferences = (options.conferences ?? conferencesFromDisk)(bbsRoot);
  const online = (options.online ?? listOnlineNodes)();

  const head = section('THIS BOARD', () => {
    const cfg = loadBBSConfig(bbsRoot);
    return [
      `name: ${cfg.bbs_name || 'this BBS'}`,
      `sysop: ${cfg.sysop_name || 'the sysop'} (you are the co-sysop, not the sysop)`,
      `location: ${cfg.location || 'unknown'}`,
      `software: AmiExpress (web port); date now: ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      `callers online now: ${online.length}${online.length ? ' - ' + online.map((n) => `${n.username}@Node${n.nodeNumber}`).join(', ') : ''}`,
    ];
  });
  const caller = section('THE CALLER YOU ARE TALKING TO', () => callerLines(session));
  const confs = section('CONFERENCES (J <number> joins one)', () => conferenceLines(conferences, session.currentConf));
  const bulls = section('BULLETINS IN THE CALLER\'S CONFERENCE (B reads them)', () => bulletinLines(bbsRoot, session.currentConf));
  const cmds = section('MENU COMMANDS THE CALLER MAY USE (the doors are the second list)', () => commandLines(bbsRoot, level));

  // Every section stays; a long one is shortened. Line caps first (a real
  // board has a hundred command icons), then the command list gives up lines
  // until the whole card fits - it is the longest and the least conversational.
  const capped = (block: string[], max: number): string[] =>
    block.length > max + 2 ? [...block.slice(0, max + 1), `(+${block.length - max - 2} more)`, ''] : block;
  const blocks = [head, caller, capped(confs, 40), capped(bulls, 20), capped(cmds, 120)];
  const render = () => blocks.map((b) => b.join('\n')).join('\n').trim();
  let text = render();
  while (text.length > BOARD_CARD_MAX_CHARS && blocks[4]!.length > 4) {
    const cmdBlock = blocks[4]!;
    // Drop the last command line (keep the header, the (+N more) note and the blank).
    const cut = cmdBlock.length - 3;
    const dropped = parseInt((cmdBlock[cut] || '').match(/^\(\+(\d+) more\)$/)?.[1] ?? '0', 10);
    cmdBlock.splice(cut - 1, 1);
    const note = `(+${dropped + 1} more)`;
    if (/^\(\+\d+ more\)$/.test(cmdBlock[cmdBlock.length - 2] || '')) cmdBlock[cmdBlock.length - 2] = note;
    else cmdBlock.splice(cmdBlock.length - 1, 0, note);
    text = render();
  }
  return `=== FACTS ABOUT THIS BOARD AND THIS CALLER (read from the board itself) ===\nAnswer from these. If something is not here, say you do not know rather than invent a command.\n\n${text}`;
}
