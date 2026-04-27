/**
 * XIM MCI Handler
 *
 * Extracted helper for the JH_MCI (MCI code processing) handler.
 * The XIMIOHandler delegates to this function passing `this` as `self`.
 */

import { XIMMessage } from './types';
import { debugLog } from '../../utils/debug-log';

/**
 * Handle JH_MCI (Process MCI codes)
 * From E sources (express.e:3456-3462)
 */
export async function handleMCI(self: any, msg: XIMMessage): Promise<void> {
debugLog(`[XIMIOHandler] JH_MCI: Processing MCI codes`);

  const inputString = self.getMessageString(msg).trim();

  try {
    // Import parseMciCodes dynamically since it's async
    const { parseMciCodes } = await import('../../handlers/screen.handler.js');

    // Get BBS session info for MCI processing
    const bbsSession = self.bbsSession || {};
    const bbsName = bbsSession.bbsName || 'AmiExpress-Web';
    const sysopName = bbsSession.sysopName || 'Sysop';
    const location = bbsSession.user?.location || 'The Internet';

    // express.e:3457 - processMci(msg.string)
    // Pass socket to enable inline emission and command execution
    const result = await parseMciCodes(inputString, bbsSession as any, bbsName, sysopName, location, self.socket);

    // express.e:3459-3461 - IF msg.data THEN aePuts('\b\n'); checkForPause()
    if (msg.data) {
      self.emitText('', true, true, true, msg);
    }

debugLog(`[XIMIOHandler] JH_MCI: Processed successfully`);
    self.reply(msg, 1);
  } catch (error: any) {
console.error(`[XIMIOHandler] JH_MCI: Error processing MCI codes:`, error.message || error);
    self.reply(msg, 0);
  }
}
