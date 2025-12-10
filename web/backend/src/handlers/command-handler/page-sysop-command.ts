/**
 * Page Sysop Command Handler (O command)
 * express.e:25372-25405 (internalCommandO)
 *
 * Allows users to page the sysop for chat.
 * Matches express.e behavior exactly.
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../../index';
import { handlePageSysop } from '../operator-chat.handler';
import { db } from '../../database';

/**
 * Handle O command - Page Sysop
 *
 * express.e flow:
 * 1. Check pagesAllowed counter (our: cooldown check)
 * 2. If 0, redirect to Comment to Sysop (our: check cooldown)
 * 3. Check ACS_PAGE_SYSOP security
 * 4. Decrement pagesAllowed (our: set cooldown)
 * 5. Set ENV_REQ_CHAT (our: OPERATOR_CHAT_WAITING state)
 * 6. Set pagedFlag:=1 (our: create PageRequest)
 * 7. Call sysopPaged() (our: sendPageNotifications)
 * 8. Check sysopAvail and call ccom() (our: wait for accept)
 */
export async function handlePageSysopCommand(
  socket: Socket,
  session: BBSSession,
  io: any
): Promise<void> {
  try {
    // Get operator chat repository
    const operatorChatRepo = db.getOperatorChatRepository();

    // Call main page handler
    const response = await handlePageSysop(socket as any, session, io, operatorChatRepo);

    if (!response.success) {
      // Show error message from handler
      socket.emit('ansi-output', `${response.message}\r\n`);
    }

    // Note: Success messages are already sent by handlePageSysop
  } catch (error) {
    console.error('[Page Sysop Command] Error:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError paging sysop. Please try again later.\x1b[0m\r\n');
  }
}
