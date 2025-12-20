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

import { Socket as SocketIOSocket } from 'socket.io';
import * as os from 'os';

interface NodeInfo {
  nodeNumber: number;
  username: string;
  location: string;
  ipAddress: string;
  status: string;
}

/**
 * Get BBS IP address
 */
function getBBSIp(): string {
  // Try environment variable first
  if (process.env.BBS_IP) {
    return process.env.BBS_IP;
  }

  // Try to get primary network interface IP
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;

    for (const addr of iface) {
      // Skip internal and non-IPv4 addresses
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }

  return 'UNKNOWN';
}

/**
 * Center text within a fixed width
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
 * Get active nodes from BBS session manager
 */
async function getNodes(socket: SocketIOSocket, currentNodeNumber: number, currentUserIp: string): Promise<NodeInfo[]> {
  return new Promise((resolve) => {
    const maxNodes = parseInt(process.env.MAX_NODES || '8');

    // Request active users from backend
    socket.emit('get-active-users');

    // Wait for response
    const timeout = setTimeout(() => {
      console.log('[telnet-front] Timeout waiting for active-users, using defaults');
      resolve(getDefaultNodes(currentNodeNumber, maxNodes));
    }, 1000);

    socket.once('active-users', (data: { users: NodeInfo[] }) => {
      clearTimeout(timeout);
      console.log(`[telnet-front] Received ${data.users.length} active users from backend`);

      const nodes: NodeInfo[] = [];
      const activeUsers = data.users || [];

      // Fill all node slots
      for (let i = 0; i < maxNodes; i++) {
        // Find an active user for this node number
        const activeUser = activeUsers.find(u => u.nodeNumber === i);

        if (i === currentNodeNumber) {
          // Current connecting node
          nodes.push({
            nodeNumber: i,
            username: 'Connecting',
            location: '',
            ipAddress: currentUserIp,
            status: 'connecting'
          });
        } else if (activeUser) {
          // Real active user
          nodes.push(activeUser);
        } else {
          // Inactive/awaiting node
          nodes.push({
            nodeNumber: i,
            username: 'Awaiting Call',
            location: '',
            ipAddress: '',
            status: 'awaiting'
          });
        }
      }

      resolve(nodes);
    });
  });
}

/**
 * Fallback for when active-users request times out
 */
function getDefaultNodes(currentNodeNumber: number, maxNodes: number): NodeInfo[] {
  const nodes: NodeInfo[] = [];

  for (let i = 0; i < maxNodes; i++) {
    if (i === currentNodeNumber) {
      nodes.push({
        nodeNumber: i,
        username: 'Connecting',
        location: '',
        ipAddress: '',
        status: 'connecting'
      });
    } else {
      nodes.push({
        nodeNumber: i,
        username: 'Awaiting Call',
        location: '',
        ipAddress: '',
        status: 'awaiting'
      });
    }
  }

  return nodes;
}

/**
 * Display telnet frontend
 */
async function displayFrontend(socket: SocketIOSocket, user: any): Promise<void> {
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
  const bbsIp = getBBSIp();

  // Clear screen and show header
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '                   \x1b[32m/\x1b[33m-\x1b[34m/\x1b[37m kOOL fRONTEND V1.1 bY: rEBEL/QTX \x1b[34m\\\x1b[33m-\x1b[32m\\\r\n');
  socket.emit('ansi-output', '                         \x1b[32m\\\x1b[33m-\x1b[34m\\ \x1b[37mdES!GN bY: nOP!/STS \x1b[34m/\x1b[33m-\x1b[32m/\r\n');
  socket.emit('ansi-output', '     \x1b[35m.------------------------------------------------------------------.\r\n');
  socket.emit('ansi-output', '     \x1b[35m|\x1b[34mNode\x1b[35m| \x1b[34mHandle/Username \x1b[35m| \x1b[34mLocation/Group        \x1b[35m| \x1b[34mUser Ip Address   \x1b[35m|\r\n');
  socket.emit('ansi-output', '     \x1b[35m|----+-----------------+-----------------------+-------------------|\r\n');

  // Get all nodes (now with real user data from backend)
  const nodes = await getNodes(socket, nodeNumber, userIp);
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
 * Run Telnet Frontend door (TypeScript door interface)
 */
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, user, bbsSession } = doorSession;

  console.log('[TELNET-FRONT] Starting display');

  // Display the frontend
  await displayFrontend(socket, user);

  console.log('[TELNET-FRONT] Display complete');

  // During pre-login (AWAIT state), just display and exit - don't wait for input
  // The main BBS flow will handle the ANSI prompt
  if (!bbsSession || bbsSession.state === 'AWAIT') {
    console.log('[TELNET-FRONT] Pre-login mode, exiting immediately');
    return;
  }

  // For logged-in users, wait briefly for any key to continue
  const exitPromise = new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (bbsSession) {
        delete bbsSession.doorInputHandler;
      }
      resolve();
    }, 2000);

    const handleInput = (data: string) => {
      clearTimeout(timeout);
      if (bbsSession) {
        delete bbsSession.doorInputHandler;
      }
      resolve();
    };

    if (bbsSession) {
      bbsSession.doorInputHandler = handleInput;
    }
  });

  await exitPromise;
}
