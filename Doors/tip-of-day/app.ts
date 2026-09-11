/**
 * TIP app: gather, pick, show, leave.
 *
 * Sources degrade one by one, never throw: the catalog may be missing
 * (no registry found), the board reads are best-effort (each wrapped),
 * storage may refuse (seen-set stays empty and tips repeat). The worst
 * case is the fallback tip, which is still a tip.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  createScreen,
  createBox,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import {
  themeById,
} from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/door-input-manager';
import { readDoorSettings } from '@amiexpress/bbs-door-sdk/core/settings';
import { loadDoorCatalog, resolveBoardRoot, type DoorEntry } from './catalog';
import { pickTip, type BoardFacts, type HowTo, type TipWeights } from './tips';

interface DoorSession {
  bbs: any;
  storage: { load<T>(key: string): Promise<T | null>; save(key: string, data: any): Promise<void> };
}

const SEEN_KEY = 'seen-tip-ids';
const SEEN_CAP = 200;

/** The curated command lessons. Content lives here, not in settings:
 *  the manifest schema holds flat scalar keys (weights), not lesson
 *  lists — phase 4 can promote these if the sysop wants the pen. */
const BUILTIN_HOWTOS: HowTo[] = [
  { id: 'howto-bulls', title: 'Bulletins', body: 'Press B at the menu: board news, file lists, party announcements.', command: 'B' },
  { id: 'howto-quick', title: 'Quick logon', body: 'Answer Q at the ANSI prompt to skip the LOGON screen next time.' },
  { id: 'howto-doors', title: 'Doors menu', body: 'The arrow-key door browser lists every game and tool in one place.' },
  { id: 'howto-achieve', title: 'Achievements', body: 'ACHIEVE shows the catalog, scoreboards, and your global profile link.', command: 'ACHIEVE' },
];

function readSettings(): { weights: TipWeights; howtos: HowTo[] } {
  const weights: TipWeights = { door: 5, fact: 3, howto: 2, event: 1 };
  try {
    const v = readDoorSettings(__dirname) as Record<string, unknown>;
    for (const k of ['door', 'fact', 'howto', 'event'] as const) {
      const n = Number((v as any)[`weight_${k}`]);
      if (Number.isFinite(n) && n >= 0) weights[k] = n;
    }
  } catch {
    /* defaults stand */
  }
  return { weights, howtos: BUILTIN_HOWTOS };
}

/** Board facts, each read best-effort. A missing method is a missing tip. */
async function gatherFacts(bbs: any, catalog: DoorEntry[]): Promise<BoardFacts> {
  const facts: BoardFacts = { conferences: [], doorsInstalled: catalog.length };
  try {
    const confs = await bbs.listConferences();
    if (Array.isArray(confs)) facts.conferences = confs.map((c: any) => ({ name: String(c.name ?? '') }));
  } catch { /* fewer tips */ }
  try {
    if (bbs.getSystemInfo) {
      const info = await bbs.getSystemInfo();
      if (info?.bbsName) facts.boardName = String(info.bbsName);
    }
  } catch { /* fewer tips */ }
  return facts;
}

export async function createApp(session: DoorSession): Promise<void> {
  const { bbs, storage } = session;

  const theme = bbs?.getTheme ? bbs.getTheme() : themeById('classic');
  const t = theme.tokens;

  const catalog = loadDoorCatalog(resolveBoardRoot(__dirname));
  const { weights, howtos } = readSettings();
  const facts = await gatherFacts(bbs, catalog);

  let seen: Set<string>;
  try {
    const stored = await storage.load<string[]>(SEEN_KEY);
    seen = new Set(Array.isArray(stored) ? stored : []);
  } catch {
    seen = new Set();
  }

  const tip = pickTip(catalog, facts, howtos, seen, weights);
  seen.add(tip.id);
  try {
    await storage.save(SEEN_KEY, [...seen].slice(-SEEN_CAP));
  } catch { /* repeats beat a crash */ }

  const screen = createScreen(bbs, { title: 'Tip of the day' });

  const input = new DoorInputManager(session as any, screen, {
    enableGameMode: false,
    enableGrabKeys: false,
    enableMouse: false,
  });
  input.enable();

  const frame = createBox({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 62,
    height: 9,
    border: { type: 'line' },
    focusable: false,
    content: '',
    style: { fg: t.ink, bg: t.ground, border: { fg: t.chrome } },
  } as never);

  const title = createBox({
    parent: frame,
    top: 1,
    left: 2,
    width: 56,
    height: 1,
    content: `Tip of the day — ${tip.title}`,
    style: { fg: t.accent, bg: t.ground },
  } as never);
  void title;

  const wrap = (text: string, width: number): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > width) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  };

  const bodyLines = wrap(tip.body, 56);
  const body = createBox({
    parent: frame,
    top: 3,
    left: 2,
    width: 56,
    height: 3,
    content: bodyLines.join('\n'),
    style: { fg: t.ink, bg: t.ground },
  } as never);
  void body;

  const hint = createBox({
    parent: frame,
    top: 7,
    left: 2,
    width: 56,
    height: 1,
    content: tip.command
      ? `Run ${tip.command} at the menu. Any key continues…`
      : 'Any key continues…',
    style: { fg: t.dim, bg: t.ground },
  } as never);
  void hint;

  screen.render();

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      try { input.disable(); } catch { /* leaving anyway */ }
      try { screen.destroy(); } catch { /* leaving anyway */ }
      try { bbs.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h'); } catch { /* leaving anyway */ }
      resolve();
    };
    const timer = setTimeout(done, 30000);
    (screen as any).key(['enter', 'space', 'escape', 'q', 'Q'], () => {
      clearTimeout(timer);
      done();
    });
    // Any other key also continues: blessed only fires listed keys, so
    // the input manager forwards the rest through the screen's keypress.
    (screen as any).on('keypress', () => {
      clearTimeout(timer);
      done();
    });
  });
}
