/**
 * Door archive upload and install, and the BBC ROM grant, a door asks for through BBSApi.
 *
 * Moved out of BBSApi.ts (file size); BBSApi keeps a one-line method for each, so
 * the door-facing surface is unchanged.
 */
import type { Socket } from 'socket.io';

import type { BBSSession } from '../index';
import { grantRomAccess } from '../server/beeb-rom-access';


/**
 * Request the user to upload a door archive via the browser file picker.
 * Resolves with the local path once upload completes; rejects after 5 min or on cancel.
 */
export function doorRequestArchiveUpload(socket: Socket, session: BBSSession): Promise<{ path: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.pendingDoorUpload = false;
      session.pendingDoorUploadCallback = null;
      session.pendingDoorUploadReject = null;
      reject(new Error('Upload timed out after 5 minutes'));
    }, 5 * 60 * 1000);

    session.pendingDoorUpload = true;
    session.pendingDoorUploadCallback = (result) => {
      clearTimeout(timeout);
      session.pendingDoorUpload = false;
      session.pendingDoorUploadCallback = null;
      session.pendingDoorUploadReject = null;
      resolve(result);
    };
    session.pendingDoorUploadReject = (err) => {
      clearTimeout(timeout);
      session.pendingDoorUpload = false;
      session.pendingDoorUploadCallback = null;
      session.pendingDoorUploadReject = null;
      reject(err);
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { issueUploadTicket } = require('../handlers/file/download-ticket');
    socket.emit('show-file-upload', {
      // /api/upload takes no login: this one-time ticket is what says the
      // board asked THIS caller for a file.
      uploadUrl: issueUploadTicket(socket.id),
      accept: '.zip,.lha,.lzh,.lzx',
      maxSize: 100 * 1024 * 1024,
      multiple: false,
    });
  });
}

/**
 * Install a door archive at the given path.
 * Extracts, auto-detects type, places in Doors/, creates registration .info.
 */
export async function doorInstallDoor(archivePath: string): Promise<{
  success: boolean;
  message: string;
  doorName?: string;
  command?: string;
  type?: string;
}> {
  const { config } = require('../config');
  const { DoorInstaller } = require('./door-installer');
  const installer = new DoorInstaller(config.get('dataDir'));
  return installer.install(archivePath);
}

/**
 * A short-lived grant letting THIS caller fetch the BBC ROMs.
 *
 * The board refuses `/beeb/roms` to anyone who has not shown they own
 * them, so a door that is about to open the machine asks for one of
 * these and puts it on the emulator's URL. Callers who have not proved
 * are never given one - the door checks that before it calls.
 */
export function doorGrantBeebRomAccess(session: BBSSession): string {
  const who = String(session.user?.id ?? session.user?.username ?? 'unknown');
  return grantRomAccess(who);
}
