/**
 * MAIN: every command this caller may run, the way the board would run it
 * (Decision 9): internal commands from the table, BBSCmd (board, node and the
 * caller's conference, through the same cache runBbsCommand reads), SysCmd.
 */
import type { CatalogueEntry, MenuCaller, MenuSource } from '../types';
import { INTERNAL_COMMANDS, internalCommandRow } from '../../../screens/menu-config/internal-commands';
import { cleanText, LABEL_MAX, DESCRIPTION_MAX } from '../../../screens/menu-config/menu-config';
import { commandCache, revalidateBbsCommandsIfChanged, doorLevelForCommandAccess } from '../../../handlers/command-execution.handler';
import { COMPLETER_TOOLTYPE } from '../../../handlers/command-handler/prompt-completion';
import { config } from '../../../config';

/** Decision 36: the menu's own registrations, the prompt completer and the Bulls fallback are not commands a caller picks. */
const NOT_LISTED = new Set(['MENU', 'MENUSETTINGS', 'BULLS']);

function doorEntry(key: string, def: any, caller: MenuCaller, runAs: 'typed' | 'syscmd'): CatalogueEntry | null {
  if (NOT_LISTED.has(key)) return null;
  const tt = def.toolTypes || {};
  if (tt[COMPLETER_TOOLTYPE] !== undefined) return null;
  if (doorLevelForCommandAccess(def.access) > caller.secLevel) return null;
  if (caller.widthRefuses(def)) return null;
  const internal = internalCommandRow(key);
  return {
    key,
    label: cleanText(internal?.label ?? tt.NAME ?? def.name ?? key, LABEL_MAX),
    description: cleanText(tt.DESCRIPTION || internal?.description || '', DESCRIPTION_MAX),
    right: '', flags: '', runText: key, runAs,
    section: runAs === 'syscmd' ? 'system' : (internal?.section ?? 'doors'),
  };
}

export const mainMenuSource: MenuSource = {
  kind: 'MAIN',
  title: () => 'MAIN MENU',
  prompt: () => '',                     // AEW_MENU fills it from displayMenuPrompt's text (M6)
  gate: () => ({ ok: true }),
  entries(caller) {
    const out = new Map<string, CatalogueEntry>();
    for (const row of INTERNAL_COMMANDS) {
      if (!row.listed) continue;
      if (row.gate === 'SYSOP' ? !caller.isSysop : row.gate !== null && !caller.may(row.gate)) continue;
      out.set(row.code, { key: row.code, label: row.label, description: row.description, right: '', flags: '', runText: row.code, runAs: 'typed', section: row.section });
    }
    revalidateBbsCommandsIfChanged(config.get('dataDir'), caller.conference, caller.node);
    for (const [rawKey, def] of commandCache.bbscmd) {
      const key = rawKey.toUpperCase();
      if (NOT_LISTED.has(key)) continue;
      const e = doorEntry(key, def, caller, 'typed');
      if (e) { out.set(key, e); continue; }
      // A door registered under an internal command's name that refuses this caller:
      // by LEVEL, express.e answers NOT_ALLOWED and the internal command never runs
      // (express.e:4703-4708) - drop the row; by WIDTH only, dispatch falls through to
      // the internal command (command.handler.ts:3906-3909) - keep the internal row.
      if (out.has(key) && !caller.widthRefuses(def)) out.delete(key);
    }
    for (const [key, def] of commandCache.syscmd) {
      const e = doorEntry(key.toUpperCase(), def, caller, 'syscmd');
      if (e && !out.has(e.key)) out.set(e.key, e);
    }
    return [...out.values()];
  },
};
