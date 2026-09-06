/**
 * Security levels, edited where the BBS actually reads them.
 *
 * This page used to call getSecurity/createSecurity/updateSecurity/
 * deleteSecurity against /api/config/security/:level — CRUD over a SQLite
 * table (security_level_access) express.e never reads. Every edit made
 * through it silently did nothing to the running board. See
 * web/backend/src/services/config-services/acs-level-file.service.ts:1-15
 * for the incident that forced the web admin off that table and onto the
 * real files.
 *
 * This now calls the same /api/config/security/levels* endpoints the web
 * admin uses, which read and write Access/ACS.<level>.info directly. The
 * web page groups ~90 permissions into labeled sections
 * (acs-permission-groups.ts); this is a flat, filterable list instead — a
 * smaller port that still fixes the thing that actually mattered: a change
 * made here now takes effect on the live board.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import {
  getAcsLevels, getAcsLevelFlags, saveAcsLevelFlags, createAcsLevel,
  type AcsLevelsInfo, type AcsLevelFlags,
} from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import { ToggleSwitch } from '../shared/InlineEdit.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import { useTextEntryLock } from '../../hooks/useTextEntryLock.js';
import { ACS_NOT_FROM_THIS_FILE } from './acs-not-from-file.js';

const PAGE = 15;

type Mode = 'list' | 'search' | 'new-level' | 'confirm-save';

export function SecurityPage() {
  const [info, setInfo] = useState<AcsLevelsInfo | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [flagsData, setFlagsData] = useState<AcsLevelFlags | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('list');
  const [searchText, setSearchText] = useState('');
  const [newLevelText, setNewLevelText] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pageStart, setPageStart] = useState(0);

  const loadLevels = useCallback(async () => {
    setLoading(true);
    // Cleared optimistically, not just left to the catch block below: a
    // stale error from a previous failed attempt must not keep showing
    // (and keep the "no working key" screen up) once a later attempt
    // succeeds - the success path never used to touch `error` at all.
    setError(null);
    try {
      const data = await getAcsLevels();
      setInfo(data);
      if (data.levels.length > 0 && level === null) {
        setLevel(data.levels[0]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load security levels');
    } finally {
      setLoading(false);
    }
    // level intentionally omitted: only used to seed the initial selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadLevels(); }, [loadLevels]);

  const loadFlags = useCallback(async (lvl: number) => {
    setFlagsLoading(true);
    setError(null);
    try {
      const data = await getAcsLevelFlags(lvl);
      setFlagsData(data);
      setFlags(data.flags);
      setDirty(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load level flags');
    } finally {
      setFlagsLoading(false);
    }
  }, []);

  useEffect(() => { if (level !== null) loadFlags(level); }, [level, loadFlags]);

  const permissions = info?.permissions ?? [];
  const filtered = searchText.trim()
    ? permissions.filter(p => p.toLowerCase().includes(searchText.trim().toLowerCase()))
    : permissions;
  const visible = filtered.slice(pageStart, pageStart + PAGE);
  const selectedFlag = visible[selectedIdx];

  // The page is "live" - a keypress can change what a real caller is
  // granted - whenever levels have loaded and there is no error blocking
  // the view. Locks out the global quit/help hotkeys and the sidebar's
  // arrow-key page cycling for as long as that's true: this page's OWN
  // idle state already uses up/down (permission list) and left/right
  // (level stepper), so even outside search/new-level/confirm-save, the
  // same "arrows also move the sidebar and unmount the page" defect
  // applies here from the moment the list first renders. See
  // dev/console/src/state/text-entry-lock.ts.
  useTextEntryLock(!loading && !error && (info?.levels?.length ?? 0) > 0);

  const doSave = useCallback(() => {
    if (level === null) return;
    saveAcsLevelFlags(level, flags)
      .then(() => { setStatus(`Level ${level} saved to ACS.${level}.info`); setDirty(false); loadFlags(level); })
      .catch((e: Error) => setStatus(`Error: ${e.message}`));
  }, [level, flags, loadFlags]);

  useInput((input, key) => {
    if (mode === 'search') {
      if (key.escape) { setMode('list'); setSearchText(''); setSelectedIdx(0); setPageStart(0); return; }
      if (key.return) { setMode('list'); return; }
      if (key.backspace || key.delete) { setSearchText(t => t.slice(0, -1)); setSelectedIdx(0); setPageStart(0); return; }
      if (input && !key.ctrl) { setSearchText(t => t + input); setSelectedIdx(0); setPageStart(0); }
      return;
    }

    if (mode === 'new-level') {
      if (key.escape) { setMode('list'); setNewLevelText(''); return; }
      if (key.return) {
        const lvl = parseInt(newLevelText, 10);
        if (!Number.isFinite(lvl) || lvl < 0 || lvl > 255) {
          setStatus('Security level must be a number between 0 and 255');
          return;
        }
        createAcsLevel(lvl)
          .then((res) => {
            setStatus(res.message ?? `Level ${lvl} created`);
            setNewLevelText('');
            setMode('list');
            setLevel(lvl);
            loadLevels();
          })
          .catch((e: Error) => setStatus(`Error: ${e.message}`));
        return;
      }
      if (key.backspace || key.delete) { setNewLevelText(t => t.slice(0, -1)); return; }
      if (input && /[0-9]/.test(input)) setNewLevelText(t => t + input);
      return;
    }

    if (mode === 'confirm-save') return; // handled by ConfirmDialog

    // mode === 'list'. `r` reloads regardless of whether a level is
    // selected or the last load failed - previously gated on `level !==
    // null`, which meant a failed INITIAL load (level still null) left no
    // key that did anything.
    if (input === 'r') { setError(null); loadLevels(); if (level !== null) loadFlags(level); return; }
    if (key.leftArrow && info) {
      const idx = info.levels.indexOf(level ?? -1);
      if (idx > 0) setLevel(info.levels[idx - 1]);
    }
    if (key.rightArrow && info) {
      const idx = info.levels.indexOf(level ?? -1);
      if (idx >= 0 && idx < info.levels.length - 1) setLevel(info.levels[idx + 1]);
    }
    if (key.upArrow) {
      if (selectedIdx > 0) setSelectedIdx(i => i - 1);
      else if (pageStart > 0) { setPageStart(p => Math.max(0, p - PAGE)); setSelectedIdx(PAGE - 1); }
    }
    if (key.downArrow) {
      if (selectedIdx < visible.length - 1) setSelectedIdx(i => i + 1);
      else if (pageStart + PAGE < filtered.length) { setPageStart(p => p + PAGE); setSelectedIdx(0); }
    }
    if ((input === ' ' || key.return) && selectedFlag) {
      setFlags(prev => ({ ...prev, [selectedFlag]: !prev[selectedFlag] }));
      setDirty(true);
    }
    if (input === '/') { setMode('search'); }
    if (input === 'n') { setMode('new-level'); setNewLevelText(''); }
    if (input === 's' && dirty) { setMode('confirm-save'); }
  });

  if (loading) return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading security levels...</Text></Box>;
  if (error) {
    return (
      <Box flexDirection="column">
        <Text color={T.alert}>Error: {error}</Text>
        <Text dimColor>[r] retry</Text>
      </Box>
    );
  }

  if (!info || info.levels.length === 0) {
    return <Text color={T.warn}>No ACS level files found in the Access directory.</Text>;
  }

  // Rows this file itself also serves (express.e:3025 rounds a caller's
  // level down to the nearest multiple of five with no file of its own),
  // EXCLUDING the level being viewed - the level always "serves itself",
  // and counting that as something ELSE it serves produced "Also serves:
  // level 20" while viewing level 20, and a save confirmation that read
  // "for level 20 and level 20".
  const servedByThisFile = (info.inUse ?? []).filter(row => row.servedBy === level && row.level !== level);
  // Rows with NO ACS file at all below them - the reported incident this
  // whole page exists to fix ("i tried to add one for users at 30, it
  // didn't let me pick a number"). The previous version only ever computed
  // servedByThisFile and never looked at this case, so a level with truly
  // nothing granting it stayed invisible.
  const unservedLevels = (info.inUse ?? []).filter(row => row.servedBy === null);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={T.accent}>
          Security levels — Access/ACS.&lt;level&gt;.info (the files the BBS reads)
        </Text>
        <Text dimColor>
          Levels: {info.levels.map(l => l === level ? `[${l}]` : String(l)).join('  ')}
          {'  '}[←/→] change level  [n]ew level
        </Text>
      </Box>

      {unservedLevels.length > 0 && (
        <Box marginBottom={1}>
          <Text color={T.alert} bold>
            No ACS file serves: {unservedLevels.map(r => `level ${r.level} (${r.users} user${r.users === 1 ? '' : 's'})`).join(', ')}
            {' '}— these callers are granted nothing through this mechanism at all.
          </Text>
        </Box>
      )}

      {servedByThisFile.length > 0 && (
        <Box marginBottom={1}>
          <Text color={T.dim}>
            Also serves: {servedByThisFile.map(r => `level ${r.level} (${r.users})`).join(', ')}
            {' '}— {servedByThisFile.length === 1 ? 'that level has' : 'those levels have'} no ACS file of its own.
          </Text>
        </Box>
      )}

      {flagsData && flagsData.ambiguous.length > 0 && (
        <Box marginBottom={1} flexDirection="column" borderStyle="round" borderColor={T.warn} paddingX={1}>
          <Text color={T.warn} bold>
            {flagsData.ambiguous.length} flag(s) written =NO in this file mean the OPPOSITE on a
            real AmiExpress (grants, not denies). Saving rewrites them to deny on both:
          </Text>
          <Text color={T.dim}>{flagsData.ambiguous.join(', ')}</Text>
        </Box>
      )}

      <Box marginBottom={1}>
        <Text bold color={T.accent}>
          {'  PERMISSION'.padEnd(38)}{'GRANTED'}
        </Text>
        <Text dimColor>
          {'  '}({filtered.length}{searchText ? `/${permissions.length}` : ''})
          {flagsLoading ? '  loading...' : ''}
        </Text>
      </Box>

      {visible.map((name, i) => {
        // express.e:8466-8485 resolves these BEFORE it ever opens this
        // file - toggling one here and saving changes nothing the board
        // actually checks. Still shown (the file still has the flag, and
        // it's what the AmiExpress docs call it), just marked so the
        // switch does not read as a live control it is not.
        const note = ACS_NOT_FROM_THIS_FILE[name];
        return (
          <Box key={name} flexDirection="column">
            <Box>
              <Text color={T.ink} bold={i === selectedIdx} inverse={i === selectedIdx}>
                {i === selectedIdx ? '▶ ' : '  '}
                {name.padEnd(36)}
              </Text>
              <ToggleSwitch value={!!flags[name]} />
            </Box>
            {note && (
              <Box>
                <Text color={T.warn}>{'      '}{note}</Text>
              </Box>
            )}
          </Box>
        );
      })}

      {mode === 'search' && (
        <Box marginTop={1}>
          <Text color={T.accent}>Filter: {searchText}█</Text>
          <Text dimColor>  [esc] clear  [enter] done</Text>
        </Box>
      )}

      {mode === 'new-level' && (
        <Box marginTop={1} flexDirection="column">
          <Text color={T.accent}>
            New level (0-255, creates ACS.&lt;n&gt;.info by copying the nearest lower level): {newLevelText}█
          </Text>
          <Text dimColor>[enter] create  [esc] cancel</Text>
        </Box>
      )}

      {mode === 'confirm-save' && level !== null && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`Save changes to ACS.${level}.info? This rewrites the file the BBS reads for level ${level}${servedByThisFile.length > 0 ? ` and ${servedByThisFile.map(l => `level ${l.level}`).join(', ')}` : ''}.`}
            onConfirm={() => { doSave(); setMode('list'); }}
            onCancel={() => setMode('list')}
          />
        </Box>
      )}

      {mode === 'list' && (
        <Box marginTop={1}>
          <Text dimColor>
            [space/enter] toggle  [/] filter  [s] save{dirty ? '*' : ''}  [n]ew level  [r] reload
          </Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color={T.ok}>{status}</Text></Box>}
    </Box>
  );
}
