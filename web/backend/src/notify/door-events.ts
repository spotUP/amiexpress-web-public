/**
 * The events installed doors declare: `notifications` in the door's own
 * door.settings.json - the one place a door declares things about itself
 * (doors/door-settings.service.ts readManifestFromDir is its only reader).
 *
 * Both halves ask here: the catalogue the NOTIFY door lists, and the check
 * bbs.notify makes before it queues a row. A door that does not declare an
 * event cannot raise it and nobody can opt in to it.
 *
 * Only registered, enabled doors count, and only under the door's own
 * command: a manifest whose `command` is another door's (one directory
 * serving two doors) declares nothing for this one.
 *
 * Imports are lazy: this file is reached from the data layer (sites.ts), and a
 * top-level import of the door handler would be a cycle.
 */
import { doorEventDef } from '@amiexpress/bbs-door-sdk/formats/notify';
import type { NotifyEventDef } from '@amiexpress/bbs-door-sdk/formats/notify';

/** The event definitions every installed door declares right now. */
export function productionDoorEvents(): NotifyEventDef[] {
  const out: NotifyEventDef[] = [];
  try {
    const { getDoors } = require('../handlers/door.handler');
    const { doorDirectoryFor, readManifestFromDir } = require('../doors/door-settings.service');
    const { isDoorEnabled } = require('../services/config-services/door-info-file.service');
    const { boardRoot } = require('../utils/board-root.util');
    for (const door of getDoors() as Array<{ command?: string; enabled?: boolean; toolTypes?: Record<string, string> }>) {
      const command = String(door.command ?? '').toLowerCase();
      if (!command || door.enabled === false || !isDoorEnabled(door.toolTypes)) continue;
      try {
        const dir = doorDirectoryFor(boardRoot(), door);
        const manifest = dir ? readManifestFromDir(dir) : null;
        if (!manifest?.notifications?.length || String(manifest.command).toLowerCase() !== command) continue;
        for (const n of manifest.notifications as Array<{ slug: string; label: string; description?: string }>) {
          const def = doorEventDef(`door.${command}.${n.slug}`, n.label, n.description);
          if (def && !out.some((e) => e.id === def.id)) out.push(def);
        }
      } catch (err) {
        console.warn(`[WARN] notify: door ${command} notifications unreadable: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    console.warn(`[WARN] notify: door events unavailable: ${(err as Error).message}`);
  }
  return out;
}
