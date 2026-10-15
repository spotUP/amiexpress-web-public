import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { CrudList } from '../CrudList.js';
import {
  getFileCheckers, createFileChecker, updateFileChecker, deleteFileChecker,
  getFileCheckerErrors, createFileCheckerError, deleteFileCheckerError,
} from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import { isTextEntryActive } from '../../state/text-entry-lock.js';
import type { FileCheckerRow, FileCheckerErrorRow } from '../../api/types.js';

export function FileCheckersPage() {
  // The specific error strings a checker treats as "archive is bad"
  // (Depth Gap 8) — previously only top-level CRUD on the checker itself
  // existed here, matching web/config-app/src/pages/FileCheckersPage.tsx's
  // inline sub-list. Set to a checker to drill into its errors.
  const [errorsFor, setErrorsFor] = useState<FileCheckerRow | null>(null);

  // Escape backs out to the checker list — but only while the nested
  // CrudList's own mode is idle 'list' (isTextEntryActive() is false then);
  // while it's editing/creating/confirming/searching, THAT escape must
  // cancel just the sub-mode, not blow past it back to the checker list.
  // Both this and CrudList's own useInput fire on every keystroke (Ink has
  // no focus model), so this is the same lock CrudList itself now sets. See
  // dev/console/src/state/text-entry-lock.ts.
  useInput((_input, key) => {
    if (!errorsFor) return;
    if (key.escape && !isTextEntryActive()) setErrorsFor(null);
  });

  if (errorsFor) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color={T.accent}>ERROR PATTERNS: {errorsFor.checker_name}</Text>
          <Text dimColor>  [esc] back to checkers</Text>
        </Box>
        <FileCheckerErrorsList checker={errorsFor} />
      </Box>
    );
  }

  return (
    <CrudList<FileCheckerRow>
      title="FILE CHECKERS"
      columns={[
        { label: 'ID',      render: r => String(r.id),               width: 5 },
        { label: 'NAME',    render: r => r.checker_name,             width: 16 },
        { label: 'PATH',    render: r => r.checker_path ?? '—',      width: 28 },
        { label: 'OPTS',    render: r => r.options ?? '—',           width: 8 },
        { label: 'ENABLED', render: r => r.enabled ? 'yes' : 'no',   width: 8 },
      ]}
      editFields={[
        { key: 'checker_name', label: 'Name',     type: 'string' },
        { key: 'checker_path', label: 'Path',     type: 'string' },
        { key: 'options',      label: 'Options',  type: 'string' },
        { key: 'priority',     label: 'Priority', type: 'number' },
        { key: 'enabled',      label: 'Enabled',  type: 'bool'   },
      ]}
      getAll={getFileCheckers}
      create={createFileChecker}
      update={updateFileChecker}
      remove={deleteFileChecker}
      extraActions={[
        { key: 'E', label: "Manage this checker's error patterns", onSelect: setErrorsFor },
      ]}
    />
  );
}

/**
 * A checker's error patterns, scoped by closing over `checker.id` — create
 * nests under the checker (POST /file-checkers/:checkerId/errors), delete
 * does not (DELETE /file-checker-errors/:id), matching the backend's own
 * asymmetric routes (config-routes.ts:1578-1626) and web's
 * FileCheckersPage.tsx handling of the two differently. Unlike web's form
 * (which auto-increments error_number from the highest existing one -
 * FileCheckersPage.tsx:93-101), CrudList's generic "new row" defaults every
 * number field to 0 - the sysop sets error_number by hand here.
 */
function FileCheckerErrorsList({ checker }: { checker: FileCheckerRow }) {
  const getAll = () => getFileCheckerErrors(checker.id);
  const create = (row: Partial<FileCheckerErrorRow>) => createFileCheckerError(checker.id, row);

  return (
    <CrudList<FileCheckerErrorRow>
      title={`ERRORS: ${checker.checker_name}`}
      columns={[
        { label: '#',       render: r => String(r.error_number), width: 5 },
        { label: 'PATTERN', render: r => r.error_pattern,        width: 50 },
      ]}
      editFields={[
        { key: 'error_number',  label: 'Number',  type: 'number' },
        { key: 'error_pattern', label: 'Pattern', type: 'string' },
      ]}
      getAll={getAll}
      create={create}
      remove={deleteFileCheckerError}
    />
  );
}
