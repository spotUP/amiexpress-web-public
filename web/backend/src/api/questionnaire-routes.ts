/**
 * The new-user questionnaire, editable from the admin.
 *
 * express.e:30323 doNewUserQuestions() reads `Node<n>/Script<baud>` after the
 * registration summary: a line ending in `~` is a question and the caller's
 * answer is appended to `Node<n>/Answers`; any other line is shown as-is. The
 * port's `findQuestionnaireScript()` looks for the same files, case-blind.
 *
 * On this board every node and every baud carried the SAME sixteen lines -
 * one questionnaire, 281 copies - and it was switched off on 2026-04-24 by
 * moving the copies into `Node<n>/disabled_scripts/`. The sysop found it gone
 * and asked for it back, editable: "add the questionaire back and make it
 * editable from the web ui".
 *
 * So the admin edits ONE text and this fans it out to every node and baud,
 * the way the screen editor fans one screen out to forty nodes. Enabling and
 * disabling keep the parking convention the April change introduced, so a
 * board disabled the old way reads as disabled here.
 */
import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import type { AuthRequest } from '../middleware/auth.middleware';
import { boardNodeIds } from '../services/user-already-online';

export const questionnaireRouter = express.Router();

/** The baud-named copies the board has always carried. */
export const QUESTIONNAIRE_BAUDS = ['2400', '14400', '16800', '19200', '38400', '57600', '115200'] as const;
const PARKED = 'disabled_scripts';

/** Only a sysop rewrites what every new caller is asked. */
function sysop(req: Request): boolean {
  const user = (req as AuthRequest).user as { secLevel?: number } | undefined;
  return (user?.secLevel ?? 0) >= 255;
}

function ok<T>(res: Response, data: T, message?: string): void {
  res.json({ success: true, data, ...(message ? { message } : {}), timestamp: new Date().toISOString() });
}
function fail(res: Response, status: number, error: string): void {
  res.status(status).json({ success: false, error, timestamp: new Date().toISOString() });
}

const nodeDir = (root: string, id: number) => path.join(root, `Node${id}`);

/** `script*` files in one directory, whatever their case. */
function scriptsIn(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter(name => /^script/i.test(name) && fs.statSync(path.join(dir, name)).isFile());
  } catch {
    return [];
  }
}

export interface QuestionnaireState {
  /** True when at least one node has a live script the flow would find. */
  enabled: boolean;
  /** The questionnaire text - from the first live copy, else the first parked one, else empty. */
  text: string;
  nodes: number;
  liveFiles: number;
  parkedFiles: number;
  /** Where `text` was read from, board-relative, or null when the board has none. */
  source: string | null;
}

export function readQuestionnaire(root: string): QuestionnaireState {
  const ids = boardNodeIds(root);
  let liveFiles = 0;
  let parkedFiles = 0;
  let source: string | null = null;
  let parkedSource: string | null = null;

  for (const id of ids) {
    const dir = nodeDir(root, id);
    const live = scriptsIn(dir);
    liveFiles += live.length;
    if (!source && live.length) source = path.join(`Node${id}`, live.sort()[0]);
    const parked = scriptsIn(path.join(dir, PARKED));
    parkedFiles += parked.length;
    if (!parkedSource && parked.length) parkedSource = path.join(`Node${id}`, PARKED, parked.sort()[0]);
  }

  const from = source ?? parkedSource;
  let text = '';
  if (from) {
    try { text = fs.readFileSync(path.join(root, from), 'latin1'); } catch { text = ''; }
  }
  return { enabled: liveFiles > 0, text, nodes: ids.length, liveFiles, parkedFiles, source: from };
}

/**
 * One text to every node and baud.
 *
 * Written LIVE when the questionnaire is enabled and PARKED when it is not, so
 * editing a disabled questionnaire does not switch it on behind the sysop's
 * back. Amiga text: latin1, LF, and a final newline so the last question is a
 * complete line.
 */
export function writeQuestionnaire(root: string, text: string): { files: number; enabled: boolean } {
  const state = readQuestionnaire(root);
  const body = text.replace(/\r\n?/g, '\n').replace(/\n*$/, '\n');
  let files = 0;
  for (const id of boardNodeIds(root)) {
    const dir = state.enabled ? nodeDir(root, id) : path.join(nodeDir(root, id), PARKED);
    fs.mkdirSync(dir, { recursive: true });
    for (const baud of QUESTIONNAIRE_BAUDS) {
      fs.writeFileSync(path.join(dir, `script${baud}`), body, 'latin1');
      files++;
    }
  }
  return { files, enabled: state.enabled };
}

/** Move every node's scripts between the live directory and the parking one. */
export function setQuestionnaireEnabled(root: string, enabled: boolean): { moved: number } {
  let moved = 0;
  for (const id of boardNodeIds(root)) {
    const live = nodeDir(root, id);
    const parked = path.join(live, PARKED);
    const [from, to] = enabled ? [parked, live] : [live, parked];
    const names = scriptsIn(from);
    if (!names.length) continue;
    fs.mkdirSync(to, { recursive: true });
    for (const name of names) {
      fs.renameSync(path.join(from, name), path.join(to, name));
      moved++;
    }
    if (!enabled) {
      fs.writeFileSync(path.join(parked, 'README.md'),
        '# Disabled questionnaire scripts\n\nMoved here by the admin. Re-enable from Screens > Questionnaire, ' +
        'or `mv disabled_scripts/script* .` in this node directory.\n', 'utf8');
    } else {
      // Two separate attempts: a parking directory the April change made has
      // a README, one this router made has one too, one made by hand has
      // none - and a missing README must not keep the empty directory alive.
      try { fs.rmSync(path.join(parked, 'README.md')); } catch { /* none there */ }
      try { fs.rmdirSync(parked); } catch { /* something else in it, or gone */ }
    }
  }
  return { moved };
}

questionnaireRouter.get('/', (_req: Request, res: Response) => {
  ok(res, readQuestionnaire(config.get('dataDir')));
});

questionnaireRouter.put('/', (req: Request, res: Response) => {
  if (!sysop(req)) return fail(res, 403, 'Only a sysop can edit the questionnaire');
  const text = (req.body as { text?: unknown })?.text;
  if (typeof text !== 'string') return fail(res, 400, 'text is required');
  // Amiga text is 8-bit; a character outside latin1 would not survive the write.
  if (/[^\x20-\xff\n\r\t]/.test(text)) return fail(res, 400, 'The questionnaire must be plain 8-bit text (no emoji or curly quotes)');
  const root = config.get('dataDir');
  const result = writeQuestionnaire(root, text);
  ok(res, { ...result, ...readQuestionnaire(root) },
    `Questionnaire written to ${result.files} files${result.enabled ? '' : ' (parked - the questionnaire is disabled)'}`);
});

questionnaireRouter.post('/enabled', (req: Request, res: Response) => {
  if (!sysop(req)) return fail(res, 403, 'Only a sysop can switch the questionnaire');
  const enabled = (req.body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== 'boolean') return fail(res, 400, 'enabled must be true or false');
  const root = config.get('dataDir');
  const before = readQuestionnaire(root);
  if (enabled && before.liveFiles === 0 && before.parkedFiles === 0) {
    return fail(res, 409, 'There is no questionnaire to enable - write one first');
  }
  const { moved } = setQuestionnaireEnabled(root, enabled);
  ok(res, { moved, ...readQuestionnaire(root) },
    enabled ? `Questionnaire enabled (${moved} files)` : `Questionnaire disabled (${moved} files parked)`);
});
