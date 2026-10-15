/**
 * Node Configuration — per-node settings, previously browser-only
 * (web-vs-tui-admin-gap-audit.md, Depth Gap 6). GET/POST/PUT/DELETE
 * /api/config/nodes* (config-routes.ts:168-243), matching
 * web/config-app/src/api/client.ts:443-464 exactly.
 *
 * Reuses CrudList (dev/console/src/components/CrudList.tsx) rather than a
 * bespoke page — same reasoning as the other Lookup Tables entries. CrudList
 * requires a numeric `id`; the backend's own rows already carry one
 * (node-config.service.ts: `id: nodeNum + 1`, 1-based — distinct from the
 * 0-based `node_number` field), and it is the value every
 * GET/PUT/DELETE /api/config/nodes/:nodeNumber route actually expects. See
 * client.ts's getNodeConfigs() doc comment for the bug this used to be
 * (deleting the wrong node) when that real id was overwritten with
 * node_number instead of trusted as-is.
 *
 * `node_number` stays out of the PATCH body on every `update` call below —
 * the backend's own updateNodeConfig prefers `updates.node_number` (read as
 * a raw 0-based node index) over the URL's id whenever it's present
 * (node-config.service.ts:212), so resubmitting an edited node_number on an
 * EXISTING row would redirect the write to a DIFFERENT node's Node<N>.info,
 * independent of which row was actually selected. It stays an editable
 * field only because `create` needs it (a new node config has no other way
 * to say which node it's for).
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
      update={(id, patch) => updateNodeConfig(id, { ...patch, node_number: undefined })}
      remove={(id) => deleteNodeConfig(id)}
    />
  );
}
