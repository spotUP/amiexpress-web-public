/**
 * HOW A FILE REACHES THIS CALLER - one answer, for every download path.
 *
 * TP-11 of thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md.
 *
 * `download.handler.ts` has read `session.connectionType` and routed
 * telnet/SSH callers to ZMODEM since the fix whose comment says the BBS
 * "used to fake-complete the transfer in 1 second without actually sending
 * bytes". The BATCH path never got that fix: it emitted the browser's
 * `download-file` trigger per file, printed "Batch download complete! N
 * file(s) queued. / Check your browser downloads.", and booked the download
 * statistics - while zero bytes moved and a telnet caller sat looking at a
 * lie.
 *
 * The fix is not a second copy of the branch. Both paths call
 * `deliverFilesToCaller`, which is the only place that decides, and the
 * completion text and the statistics are chosen from what it returns.
 */
import { Socket } from 'socket.io';
import { BBSSession } from '../../index';
import { getStorageContext } from '../../storage/storage-context';
import { rematerialise, storageFailureText } from '../../storage/remote-download';
import { issueDownloadTicket } from './download-ticket';

/**
 * What actually happened to the caller's files.
 *
 * `refused` is not reachable from today's three transports - web takes the
 * HTTP trigger, telnet and SSH take ZMODEM - and exists because a transport
 * that can do NEITHER must say so rather than book statistics for bytes it
 * never sent. That was the whole defect on the batch path.
 */
export type DeliveryRoute = 'zmodem' | 'http' | 'refused';

/** What this transport can never receive. */
export const NO_TRANSFER_NOTICE =
  'THIS TRANSFER NEEDS A WEB BROWSER OR A ZMODEM CLIENT';

/** The least a caller has to know about a file to send it. */
export interface DeliverableFile {
  name?: string;
  filename?: string;
  size: number;
  fullPath?: string;
  path?: string;
  confNum?: number;
  areaId?: number;
  dirNum?: number;
  /**
   * The file is not in a file area (a message's attached file): the browser
   * fetches it through a one-time ticket for its path (download-ticket.ts)
   * instead of the file-area route, which would not find it.
   */
  outsideFileAreas?: boolean;
}

export interface DeliverOptions {
  /**
   * Called when a ZMODEM transfer has actually finished, with whether it
   * succeeded. express books a download behind `IF sentsize`
   * (express.e:15437), so anything that charges the caller belongs here
   * and nowhere earlier - an aborted batch must not be billed. There was an
   * `onBeforeHandoff` hook for booking at handoff; the batch path used it and
   * charged aborted batches, so it is gone (web-vs-telnet audit item 19).
   * The browser route has no such moment: its files are handed to the DOM
   * and are gone, so it books at handoff as before.
   */
  onTransferFinished?: (ok: boolean) => Promise<void> | void;
  /**
   * express.e downloadFiles(list, NIL, updateDownloadStats=FALSE) as
   * downloadFile (14957) calls it: the transfer and nothing after it - no
   * "File transfer Completed." block, no statistics, the flagged list left
   * alone, and the caller's state handed back when the transfer ends.
   */
  transferOnly?: boolean;
}

/** The name a file goes by, whichever of the two shapes it arrived in. */
export const fileNameOf = (file: DeliverableFile): string =>
  String(file.name ?? file.filename ?? '');

/** The path a file lives at, whichever of the two shapes it arrived in. */
export const filePathOf = (file: DeliverableFile): string | undefined =>
  file.fullPath ?? file.path;

/**
 * Which way this caller's files can travel.
 *
 * A session with no `connectionType` is the browser: `session-manager.ts`
 * creates web sessions and the field is only moved off `'web'` by the
 * telnet and SSH servers.
 */
export function deliveryRouteFor(session: BBSSession | null | undefined): DeliveryRoute {
  const transport = (session as any)?.connectionType;
  if (transport === 'telnet' || transport === 'ssh') return 'zmodem';
  if (transport === 'web' || transport === undefined || transport === null) return 'http';
  return 'refused';
}

/**
 * IAC WILL/DO BINARY, before any ZMODEM transfer on a telnet caller.
 *
 * express.e:15891-15896. Without it the client applies NVT rules (CR->CRLF,
 * NUL stripping) to binary frames and the receiver gets a CRC error on every
 * subpacket that happens to contain 0x0D.
 *
 * It goes out through `transferRawSendUnescaped`, NEVER `transport.send`:
 * the latter doubles every 0xFF, which would turn each IAC into IAC IAC and
 * break the negotiation it is performing.
 *
 * Returns whether the bytes went out, so a caller can log it.
 */
export function negotiateBinaryForTransfer(session: BBSSession): boolean {
  if ((session as any)?.connectionType !== 'telnet') return false;
  const rawSend = (session as any).transferRawSendUnescaped;
  if (typeof rawSend !== 'function') return false;
  rawSend(Buffer.from([255, 251, 0, 255, 253, 0]));
  return true;
}

/**
 * ...and IAC DONT/WONT BINARY when the transfer is over.
 *
 * express.e:15956-15959 does exactly this at the end of a transfer, and only
 * the entry half was ported: a telnet caller stayed in BINARY for the rest of
 * his call. A tolerant client never notices; a strict NVT one applies no
 * CR/LF translation to the menu that follows and renders it as a staircase.
 *
 * Same channel as its opposite - `transferRawSendUnescaped`, never
 * `transport.send`, which doubles 0xFF and would turn each IAC into IAC IAC.
 */
export function endBinaryAfterTransfer(session: BBSSession): boolean {
  if ((session as any)?.connectionType !== 'telnet') return false;
  const rawSend = (session as any).transferRawSendUnescaped;
  if (typeof rawSend !== 'function') return false;
  rawSend(Buffer.from([255, 254, 0, 255, 252, 0]));
  return true;
}

/**
 * Send these files the only way this caller can receive them.
 *
 * ZMODEM re-fetches every pooled file at SEND time: the caller has been
 * sitting at the download prompt since the paths were resolved, and another
 * node's fetch can evict a clean cached copy in that window -
 * `startZmodemDownload` existsSync-checks each path and would otherwise tell
 * the caller "files not found" about a file the bucket still holds.
 *
 * Answers `'refused'` - having said why on the caller's screen - when the
 * transport can receive neither, and when nothing could be resolved to send.
 * In both cases no transfer starts, so nothing is booked.
 */
export async function deliverFilesToCaller(
  socket: Socket,
  session: BBSSession,
  files: DeliverableFile[],
  opts: DeliverOptions = {},
): Promise<DeliveryRoute> {
  const route = deliveryRouteFor(session);

  if (route === 'refused') {
    socket.emit('ansi-output', `\r\n${NO_TRANSFER_NOTICE}\r\n\r\n`);
    return 'refused';
  }

  if (route === 'zmodem') {
    const { startZmodemDownload } = require('../commands/user-commands.handler');
    const storage = getStorageContext();
    const paths: string[] = [];

    for (const file of files) {
      if (!filePathOf(file)) continue;
      try {
        paths.push(await rematerialise(file as any, storage));
      } catch (error) {
console.error('[Download] re-fetch before transfer failed:', error);
        socket.emit('ansi-output', `\r\n[X] ${fileNameOf(file)}: ${storageFailureText(error)}\r\n\r\n`);
        return 'refused';
      }
    }

    if (paths.length === 0) {
      socket.emit('ansi-output', '\r\nNo file paths to send.\r\n\r\n');
      return 'refused';
    }

    startZmodemDownload(socket, session, paths, opts.onTransferFinished, { transferOnly: !!opts.transferOnly });
    return 'zmodem';
  }

  // The browser's DOM download trigger, one event per file. `batchIndex` and
  // `batchTotal` are what the frontend shows as progress through a batch.
  files.forEach((file, index) => {
    const name = fileNameOf(file);
    const confNum = file.confNum ?? file.areaId ?? (session as any)?.currentConf ?? 1;
    const dirNum = file.dirNum ?? 1;
    const hostPath = filePathOf(file);
    socket.emit('download-file', {
      filename: name,
      size: file.size,
      url: file.outsideFileAreas && hostPath
        ? issueDownloadTicket(hostPath)
        : `/api/download/${confNum}/${dirNum}/${encodeURIComponent(name)}`,
      path: filePathOf(file),
      batchIndex: index,
      batchTotal: files.length,
    });
  });
  return 'http';
}

/**
 * express.e downloadFile (14957-14988): the files at these paths go to the
 * caller - downloadFiles(templist, NIL, FALSE) - and this returns when the
 * transfer is over, as the E procedure does. Nothing is booked
 * (updateDownloadStats is FALSE). The browser's fetch reports no end, so
 * for it the hand-off is the end.
 */
export async function downloadFile(
  socket: Socket,
  session: BBSSession,
  hostPaths: string[],
): Promise<DeliveryRoute> {
  const files: DeliverableFile[] = hostPaths.map((hostPath) => {
    let size = 0;
    try { size = require('../../utils/amigafs').statSync(hostPath).size; } catch { /* sent as found */ }
    return {
      name: require('path').basename(hostPath),
      fullPath: hostPath,
      size,
      confNum: (session as any)?.currentConf,
      outsideFileAreas: true,
    };
  });
  let finished: () => void = () => undefined;
  const transferEnded = new Promise<void>((resolve) => { finished = resolve; });
  const route = await deliverFilesToCaller(socket, session, files, {
    transferOnly: true,
    onTransferFinished: () => finished(),
  });
  if (route === 'zmodem') await transferEnded;
  return route;
}
