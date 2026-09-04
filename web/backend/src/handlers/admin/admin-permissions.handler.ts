import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../config';
import { AuthRequest } from '../../middleware/auth.middleware';

export interface AdminSectionPerm {
  key: string;
  label: string;
  defaultMinLevel: number;
}

export const ADMIN_SECTIONS: AdminSectionPerm[] = [
  { key: 'overview',   label: 'Overview',        defaultMinLevel: 100 },
  { key: 'activity',   label: 'Activity Feed',   defaultMinLevel: 255 },
  { key: 'nodes',      label: 'Nodes',           defaultMinLevel: 255 },
  { key: 'operator-chat', label: 'Operator Chat', defaultMinLevel: 255 },
  { key: 'users',      label: 'Users',           defaultMinLevel: 255 },
  { key: 'security',   label: 'Access Levels',   defaultMinLevel: 255 },
  { key: 'conferences', label: 'Conferences',    defaultMinLevel: 255 },
  { key: 'doors',      label: 'Doors',           defaultMinLevel: 255 },
  { key: 'screens',    label: 'Screen Files',    defaultMinLevel: 100 },
  { key: 'system',     label: 'Configuration',   defaultMinLevel: 255 },
  { key: 'config-files', label: 'Config Files',  defaultMinLevel: 255 },
  { key: 'lookup-tables', label: 'Lookup Tables', defaultMinLevel: 255 },
  { key: 'health',     label: 'Health & Deploy', defaultMinLevel: 255 },
  { key: 'statistics', label: 'Statistics',      defaultMinLevel: 255 },
  { key: 'logs',       label: 'System Logs',     defaultMinLevel: 255 },
  { key: 'session-logs', label: 'Session Logs',  defaultMinLevel: 255 },
  { key: 'audit',      label: 'Audit Log',       defaultMinLevel: 255 },
  { key: 'import-export', label: 'Import/Export',defaultMinLevel: 255 },
];

const PERMS_FILE = 'AdminPermissions.json';

function permsPath(): string {
  return path.join(config.get('dataDir'), 'config', PERMS_FILE);
}

function loadPerms(): Record<string, number> {
  const p = permsPath();
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch {
    // corrupt or missing — fall back to defaults
  }
  // Return defaults on first load or error
  const defaults: Record<string, number> = {};
  for (const s of ADMIN_SECTIONS) {
    defaults[s.key] = s.defaultMinLevel;
  }
  return defaults;
}

function savePerms(perms: Record<string, number>): void {
  const p = permsPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Always ensure every known section exists, and strip unknown keys
  const cleaned: Record<string, number> = {};
  for (const s of ADMIN_SECTIONS) {
    cleaned[s.key] = perms[s.key] ?? s.defaultMinLevel;
  }
  fs.writeFileSync(p, JSON.stringify(cleaned, null, 2), 'utf-8');
}

export function getAdminPerm(key: string): number {
  return loadPerms()[key] ?? 255;
}

export class AdminPermissionsHandler {
  async get(_req: Request, res: Response): Promise<void> {
    try {
      const perms = loadPerms();
      res.json({ perms, sections: ADMIN_SECTIONS });
    } catch (e: unknown) {
      res.status(500).json({ error: 'Failed to load permissions' });
    }
  }

  async put(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { perms } = req.body;
      if (!perms || typeof perms !== 'object') {
        res.status(400).json({ error: 'Invalid permissions object' });
        return;
      }
      savePerms(perms);
      res.json({ perms: loadPerms(), sections: ADMIN_SECTIONS });
    } catch (e: unknown) {
      res.status(500).json({ error: 'Failed to save permissions' });
    }
  }
}