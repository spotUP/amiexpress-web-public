import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import { AmigaDoorSession } from '../amiga-emulation/AmigaDoorSession';
import { config } from '../config';
import type { BBSSession } from '../index';

class HeadlessDoorSocket extends EventEmitter {
  emit(event: string, ...args: any[]): boolean {
    // Swallow output events; no user is attached to this session.
    if (event === 'ansi-output' || event === 'door:status') {
      return true;
    }
    return super.emit(event, ...args);
  }
}

export async function runSamiLogUpdate(session: BBSSession): Promise<void> {
  try {
    const dataDir = config.get('dataDir');
    const samilogPath = path.join(dataDir, 'Utils', 'samilog', 'SAmiLog');
    if (!fs.existsSync(samilogPath)) {
      console.warn('[SAmiLogRunner] SAmiLog binary not found at', samilogPath);
      return;
    }

    const nodeId = session.nodeId ?? 0;
    const args = [`-U"${nodeId}"`];
    const silentSocket = new HeadlessDoorSocket();

    const amigaSession = new AmigaDoorSession(silentSocket as any, {
      executablePath: samilogPath,
      timeout: 60,
      args,
      bbsSession: {
        user: session.user,
        nodeId,
        bbsName: config.get('bbsName'),
        sysopName: config.get('sysopName') || 'Sysop',
        timeRemaining: session.timeRemaining || 60,
        doorCommand: 'SAmiLog',
        dataDir
      }
    } as any);

    console.log(`[SAmiLogRunner] Running SAmiLog update for node ${nodeId}`);
    await amigaSession.start();
    console.log('[SAmiLogRunner] SAmiLog update completed');
  } catch (error) {
    console.error('[SAmiLogRunner] Failed to run SAmiLog update:', error);
  }
}
