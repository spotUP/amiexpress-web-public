import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getImportSessions, validateImport, executeImport, cancelImport, deleteImport, listExports, createExport } from '../../api/client.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { ImportSession } from '../../api/client.js';

const ITEMS_START_ROW = 7;

type Section = 'import' | 'export';
type Mode = 'list' | 'confirm';

export function ImportExportPage() {
  const [section, setSection] = useState<Section>('import');
  const [mode, setMode] = useState<Mode>('list');

  // Import state
  const [sessions, setSessions] = useState<ImportSession[]>([]);
  const [selectedSessionIdx, setSelectedSessionIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Export state
  const [exports, setExports] = useState<Array<{ filename: string; size?: number; createdAt?: string }>>([]);
  const [exportCheckboxes, setExportCheckboxes] = useState({ users: true, messages: false, files: false });
  const [confirmMsg, setConfirmMsg] = useState('');

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getImportSessions();
      setSessions(data);
      setSelectedSessionIdx(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listExports();
      setExports(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load exports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section === 'import') loadSessions();
    else loadExports();
  }, [section, loadSessions, loadExports]);

  const selected = sessions[selectedSessionIdx];

  const handleImportAction = async (action: 'validate' | 'execute' | 'cancel' | 'delete') => {
    if (!selected) return;
    setStatus(null);
    try {
      if (action === 'validate') await validateImport(selected.id);
      else if (action === 'execute') await executeImport(selected.id);
      else if (action === 'cancel') await cancelImport(selected.id);
      else if (action === 'delete') await deleteImport(selected.id);
      setStatus(`${action === 'validate' ? 'Validated' : action === 'execute' ? 'Executed' : action === 'cancel' ? 'Cancelled' : 'Deleted'}`);
      await loadSessions();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  useInput((input, key) => {
    if (mode === 'confirm') return;

    if (input === '1') { setSection('import'); return; }
    if (input === '2') { setSection('export'); return; }

    if (section === 'import') {
      if (key.upArrow) setSelectedSessionIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setSelectedSessionIdx(i => Math.min(sessions.length - 1, i + 1));
      if (input === 'v' && selected) handleImportAction('validate');
      if (input === 'x' && selected) handleImportAction('execute');
      if (input === 'c' && selected) handleImportAction('cancel');
      if (input === 'd' && selected) handleImportAction('delete');
    } else {
      if (input === 'u') setExportCheckboxes(c => ({ ...c, users: !c.users }));
      if (input === 'm') setExportCheckboxes(c => ({ ...c, messages: !c.messages }));
      if (input === 'f') setExportCheckboxes(c => ({ ...c, files: !c.files }));
      if (input === 'n') {
        setConfirmMsg(`Create export: [u]sers=${exportCheckboxes.users}, [m]essages=${exportCheckboxes.messages}, [f]iles=${exportCheckboxes.files}`);
        setMode('confirm');
      }
    }
  });

  const handleExportConfirm = async () => {
    setMode('list');
    try {
      await createExport({
        includeUsers: exportCheckboxes.users,
        includeMessages: exportCheckboxes.messages,
        includeFiles: exportCheckboxes.files,
      });
      setStatus('Export created');
      await loadExports();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading...</Text></Box>;

  return (
    <Box flexDirection="column">
      {mode === 'confirm' && (
        <ConfirmDialog
          message={confirmMsg}
          onConfirm={handleExportConfirm}
          onCancel={() => setMode('list')}
        />
      )}

      <Box marginBottom={1}>
        <Text bold color={section === 'import' ? 'cyan' : 'white'}>[1] Import</Text>
        <Text>  </Text>
        <Text bold color={section === 'export' ? 'cyan' : 'white'}>[2] Export</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {status && (
        <Box marginBottom={1}>
          <Text color="green">{status}</Text>
        </Box>
      )}

      {section === 'import' ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>Import Sessions</Text>
          </Box>
          {sessions.length === 0 ? (
            <Text dimColor>No import sessions</Text>
          ) : (
            <>
              {sessions.map((s, i) => (
                <Box key={s.id}>
                  <Text color={i === selectedSessionIdx ? 'cyan' : 'white'} bold={i === selectedSessionIdx}>
                    {i === selectedSessionIdx ? '▶ ' : '  '}
                    {s.filename ?? `(${s.id.slice(0, 8)}...)`}
                  </Text>
                  <Text dimColor>  {s.status ?? 'pending'}</Text>
                </Box>
              ))}
              {selected && (
                <Box marginTop={1}>
                  <Text dimColor>
                    [v]alidate  [x]ecute  [c]ancel  [d]elete
                  </Text>
                </Box>
              )}
            </>
          )}
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>Export Options</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>{exportCheckboxes.users ? '[X]' : '[ ]'} [u]sers</Text>
            <Text>  </Text>
            <Text>{exportCheckboxes.messages ? '[X]' : '[ ]'} [m]essages</Text>
            <Text>  </Text>
            <Text>{exportCheckboxes.files ? '[X]' : '[ ]'} [f]iles</Text>
          </Box>
          <Box marginBottom={2}>
            <Text dimColor>[n]ew export  [u/m/f] toggle</Text>
          </Box>

          <Box marginBottom={1}>
            <Text dimColor>Previous Exports</Text>
          </Box>
          {exports.length === 0 ? (
            <Text dimColor>No exports yet</Text>
          ) : (
            exports.map(e => (
              <Box key={e.filename}>
                <Text>{e.filename}</Text>
                {e.size && <Text dimColor>  {e.size} bytes</Text>}
              </Box>
            ))
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>[1]Import [2]Export</Text>
      </Box>
    </Box>
  );
}
