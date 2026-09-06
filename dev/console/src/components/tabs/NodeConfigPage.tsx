/**
 * Node Configuration — per-node settings, previously browser-only
 * (web-vs-tui-admin-gap-audit.md, Depth Gap 6). GET/POST/PUT/DELETE
 * /api/config/nodes* (config-routes.ts:168-243), matching
 * web/config-app/src/api/client.ts:443-464 exactly.
 *
 * Reuses CrudList (dev/console/src/components/CrudList.tsx) rather than a
 * bespoke page — same reasoning as the other Lookup Tables entries. CrudList
 * requires a numeric `id`; the backend's rows have none (they're keyed by
 * node_number), so client.ts's getNodeConfigs() synthesises `id =
 * node_number` and every write below is keyed off that same value, matching
 * the backend's own :nodeNumber route param.
 *
 * NodeConfigSchema (config.schemas.ts:184-221) declares 23 fields.
 * CrudList's edit form has no scrolling — it renders every editField in one
 * column — so this deliberately exposes the dozen most commonly touched
 * ones rather than all 23, the same trade-off wave 1's SecurityPage made
 * porting ~90 ACS permissions to a flat list. Left out, on purpose:
 *   - node_start: a multi-line NODESTART block (command + one tooltype per
 *     line, up to 4000 chars) — CrudList's single-line text editor cannot
 *     represent a newline, so this is a genuinely different editor, not a
 *     missing field.
 *   - nrams: an array — CrudList's EditField only supports
 *     string/number/bool.
 *   - sentby_files, keep_upload_credit, free_resuming, start_log, ud_log,
 *     log_host, view_password, no_rad_boogie: rarely-touched flags. Still
 *     settable via the web admin's Nodes Configuration tab or by hand in
 *     NodeX/Node.info.
 */
import React from 'react';
import { CrudList, type ColumnDef, type EditField } from '../CrudList.js';
import { getNodeConfigs, createNodeConfig, updateNodeConfig, deleteNodeConfig } from '../../api/client.js';
import type { NodeConfigRow } from '../../api/types.js';

const columns: ColumnDef<NodeConfigRow>[] = [
  { label: 'NODE',     render: r => String(r.node_number),            width: 6 },
  { label: 'PRIORITY', render: r => String(r.priority ?? '—'),        width: 10 },
  { label: 'SCREENS',  render: r => r.screens || '(default)',         width: 24 },
  { label: 'TELNET',   render: r => r.telnet ? 'yes' : 'no',          width: 8 },
  { label: 'FTP',      render: r => r.ftp ? 'yes' : 'no',             width: 6 },
];

const editFields: EditField[] = [
  { key: 'node_number',           label: 'Node number',              type: 'number' },
  { key: 'priority',              label: 'Task priority',            type: 'number' },
  { key: 'screens',               label: 'Screens dir override',     type: 'string' },
  { key: 'def_screens',           label: 'Use default screens',      type: 'bool'   },
  { key: 'capitol_files',         label: 'Capitol files',            type: 'bool'   },
  { key: 'no_mci_msg',            label: 'Suppress MCI in messages', type: 'bool'   },
  { key: 'sysop_chat_color',      label: 'Sysop chat colour (30-37)', type: 'number' },
  { key: 'user_chat_color',       label: 'User chat colour (30-37)', type: 'number' },
  { key: 'break_chat',            label: 'Allow break into chat',    type: 'bool'   },
  { key: 'callers_log',           label: 'Callers log',              type: 'bool'   },
  { key: 'door_log',              label: 'Door log',                 type: 'bool'   },
  { key: 'telnet',                label: 'Telnet',                   type: 'bool'   },
  { key: 'ftp',                   label: 'FTP',                      type: 'bool'   },
  { key: 'disable_quick_logons',  label: 'Disable quick logons',     type: 'bool'   },
];

export function NodeConfigPage() {
  return (
    <CrudList<NodeConfigRow>
      title="NODE CONFIGURATION"
      columns={columns}
      editFields={editFields}
      getAll={getNodeConfigs}
      create={(row) => createNodeConfig(row)}
      update={(id, patch) => updateNodeConfig(id, patch)}
      remove={(id) => deleteNodeConfig(id)}
    />
  );
}
