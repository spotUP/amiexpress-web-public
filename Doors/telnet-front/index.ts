/**
 * Telnet Frontend - "Who's Online" Login Display
 *
 * Shows active BBS nodes with user information at telnet login.
 * Ported from Amiga E version.
 *
 * Features:
 * - Display all active nodes
 * - Show username, location, IP for each connected user
 * - Show node status (Awaiting Call, Inactive, Suspended, Connecting)
 * - Display connecting user's hostname and IP address
 * - Display BBS's own IP address
 * - Fancy ANSI art borders
 *
 * Original: dev/docs/AmiExpressEDoorSources/TelnetFront/telnetfront.e
 */

import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { loadConfig, boardAddress } from './config';
import * as os from 'os';

// Metadata
export const metadata = {
  name: 'Telnet Frontend',
  version: '1.1.0',
  description: 'Who\'s Online Login Display',
  author: 'REBEL/QTX',
  // What the board registers: Commands/BBSCmd/Telnet-Front.info carries no
  // BBSCMD tooltype, so the command is its filename. Nothing on this board
  // registers FRONTEND.
  command: 'TELNET-FRONT',
};

interface NodeInfo {
  nodeNumber: number;
  username: string;
  location: string;
  ipAddress: string;
  status: string;
}

/**
 * Pad a string to width, a space at a time from each side.
 */
function centre(text: string, width: number): string {
  let result = text.substring(0, width);

  while (result.length < width) {
    if (result.length < width) {
      result = ' ' + result;
    }
    if (result.length < width) {
      result = result + ' ';
    }
  }

  return result;
}

/**
 * The node table: who is on which node.
 *
 * This used to ask over Socket.IO - emit `get-active-users`, wait 150ms for
 * an `active-users` reply - and the reply could never arrive. A door runs
 * INSIDE the backend, and the socket it holds is the user's own server-side
 * socket, so that emit went OUT to the browser, which has no listener for
 * it. The timeout fired every time and this drew a table of placeholders:
 * every row "Awaiting Call" and the sysop's own node "Connecting", on a
 * board with people on it.
 *
 * The session map is in this process. `bbs.getOnlineUsers()` reads it.
 */
function getNodes(
  bbs: any,
  currentNodeNumber: number,
  currentUserIp: string,
): NodeInfo[] {
  // Defaults, then BBS_IP/MAX_NODES, then what the sysop set in the admin
  // (Doors -> Telnet-Front -> Door settings). See config.ts.
  const maxNodes = loadConfig(__dirname).maxNodes;

  // Pre-login the door runs before a door API is handed out, and there is
  // genuinely nothing to show but the empty board.
  const activeUsers: NodeInfo[] =
    typeof bbs?.getOnlineUsers === 'function' ? bbs.getOnlineUsers() : [];

  const nodes: NodeInfo[] = [];
  for (let i = 0; i < maxNodes; i++) {
    if (i === currentNodeNumber) {
      nodes.push({
        nodeNumber: i,
        username: 'Connecting',
        location: '',
        ipAddress: currentUserIp,
        status: 'connecting',
      });
      continue;
    }

    const activeUser = activeUsers.find(u => u.nodeNumber === i);
    nodes.push(activeUser ?? {
      nodeNumber: i,
      username: 'Awaiting Call',
      location: '',
      ipAddress: '',
      status: 'awaiting',
    });
  }

  return nodes;
}

/**
 * Display telnet frontend
 */
async function displayFrontend(socket: any, user: any, bbs: any): Promise<void> {
  // Get connection info from user object or socket handshake
  let hostname = user?.hostname;
  let userIp = user?.ip;

  // For web connections, extract from Socket.IO handshake
  if (!hostname || hostname === 'NOT AVAILABLE') {
    const handshake = (socket as any).handshake;
    if (handshake) {
      // Get IP from Socket.IO headers
      userIp = handshake.address ||
               handshake.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
               handshake.headers?.['x-real-ip'] ||
               'WEB CLIENT';

      // For web connections, show connection type
      const referer = handshake.headers?.referer || handshake.headers?.origin;
      if (referer) {
        hostname = 'WEB CLIENT';
      } else {
        hostname = 'NOT AVAILABLE';
      }
    }
  }

  hostname = hostname || 'NOT AVAILABLE';
  userIp = userIp || 'NOT AVAILABLE';

  const nodeNumber = user?.nodeNumber || 0;
  // What users can actually dial: the sysop's answer, then BBS_IP, then this
  // machine's own address - which inside a container is a docker-bridge
  // address nobody outside can reach.
  const bbsIp = boardAddress(loadConfig(__dirname));

  // Clear screen and show header
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '                   \x1b[32m/\x1b[33m-\x1b[34m/\x1b[37m kOOL fRONTEND V1.1 bY: rEBEL/QTX \x1b[34m\\\x1b[33m-\x1b[32m\\\r\n');
  socket.emit('ansi-output', '                         \x1b[32m\\\x1b[33m-\x1b[34m\\ \x1b[37mdES!GN bY: nOP!/STS \x1b[34m/\x1b[33m-\x1b[32m/\r\n');
  socket.emit('ansi-output', '     \x1b[35m.------------------------------------------------------------------.\r\n');
  socket.emit('ansi-output', '     \x1b[35m|\x1b[34mNode\x1b[35m| \x1b[34mHandle/Username \x1b[35m| \x1b[34mLocation/Group        \x1b[35m| \x1b[34mUser Ip Address   \x1b[35m|\r\n');
  socket.emit('ansi-output', '     \x1b[35m|----+-----------------+-----------------------+-------------------|\r\n');

  // Get all nodes (now with real user data from backend)
  const nodes = getNodes(bbs, nodeNumber, userIp);
  const activeCount = nodes.filter(n => n.status === 'active' || n.status === 'connecting').length;
  let displayedCount = 0;

  // Display each node
  for (const node of nodes) {
    let username = node.username;
    let location = node.location;
    let ipAddress = node.ipAddress;

    // Format based on status
    if (node.status === 'awaiting') {
      username = 'Awaiting Call';
      location = '';
      ipAddress = '';
    } else if (node.status === 'inactive') {
      username = 'Inactive';
      location = '';
      ipAddress = '';
    } else if (node.status === 'suspended') {
      username = 'Suspended';
      location = '';
      ipAddress = '';
    } else if (node.status === 'connecting') {
      username = 'Connecting';
      location = '';
      ipAddress = userIp;
    }

    // Only show active/connecting nodes (skip awaiting/inactive for cleaner display)
    if (node.status === 'active' || node.status === 'connecting' || displayedCount < 2) {
      displayedCount++;

      // Center text in columns
      const centeredLocation = centre(location, 21);
      const centeredIp = centre(ipAddress, 17);

      // Format node number as 2 digits
      const nodeStr = node.nodeNumber.toString().padStart(2, ' ');

      // Determine border style based on position
      let border = '    |';
      if (displayedCount === activeCount - 1) {
        border = '_  _|';
      } else if (displayedCount === activeCount) {
        border = '\\|-\\|';
      }

      // Build and emit line
      const line = ` \x1b[35m${border} \x1b[32m${nodeStr} \x1b[35m| \x1b[37m${username.substring(0, 14).padEnd(14)} \x1b[35m | \x1b[37m${centeredLocation} \x1b[35m|\x1b[36m ${centeredIp} \x1b[35m|\r\n`;
      socket.emit('ansi-output', line);
    }
  }

  // Bottom border
  socket.emit('ansi-output', '    \x1b[35m `----+-----------------+-----------------------+-------------------|/-|/\r\n');

  // Show hostname and IPs
  const centeredHostname = hostname.substring(0, 26).padEnd(26);
  socket.emit('ansi-output', ` \x1b[32mYour Telnet Login Established from Host :  \x1b[37m${centeredHostname}  \x1b[35m|\r\n`);
  socket.emit('ansi-output', ' \x1b[35m<<-----------.   <<----------------------------------------------------\'\r\n');
  socket.emit('ansi-output', `              \x1b[35m|\x1b[32mCurrent iP of This System \x1b[32m:  \x1b[37m${bbsIp}\r\n`);
  socket.emit('ansi-output', '              \x1b[35m`----------------------------------------------------------->>\r\n');
  socket.emit('ansi-output', '\x1b[0m\r\n');
}

/**
 * Main door class
 */
const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  const { socket, user, bbsSession, bbs } = ctx;

  console.log('[TELNET-FRONT] Starting display');

  // Display the frontend
  await displayFrontend(socket, user, bbs);

  console.log('[TELNET-FRONT] Display complete');

  // During pre-login (AWAIT state), no pause needed - ANSI prompt follows immediately
  // The display is informational and the user will see it while logging in
  if (!bbsSession || bbsSession.state === 'AWAIT') {
    console.log('[TELNET-FRONT] Pre-login mode, continuing immediately');
    return;
  }

  // For logged-in users, wait briefly for any key to continue (or auto-continue after 500ms)
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      delete bbsSession.doorInputHandler;
      resolve();
    }, 500); // Reduced from 2000ms to 500ms

    const handleInput = (data: string) => {
      clearTimeout(timeout);
      delete bbsSession.doorInputHandler;
      resolve();
    };

    bbsSession.doorInputHandler = handleInput;
  });
});

export default door;
