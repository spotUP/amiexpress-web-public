/**
 * NodeStatusManager - Maintains shared node status for WHO doors
 *
 * AmiExpress WHO doors (like RTW) access node information via a shared
 * semaphore structure called "multiPort". This manager maintains that
 * structure and makes it available to doors via FindPort().
 *
 * Reference: AmiExpress-Sources/axcommon.e lines 584-605
 */

import { MoiraEmulator } from '../amiga-emulation/cpu/MoiraEmulator';

/**
 * Node status codes (from express.e)
 */
export enum NodeStatus {
  ENV_NOTACTIVE = -1,       // Node inactive
  ENV_IDLE = 0,            // Idle
  ENV_DOWNLOADING = 1,     // Downloading
  ENV_UPLOADING = 2,       // Uploading
  ENV_DOORS = 3,           // Running door
  ENV_MAIL = 4,            // Reading mail
  ENV_STATS = 5,           // Reviewing stats
  ENV_ACCOUNT = 6,         // Account editing
  ENV_ZOOM = 7,            // Zooming
  ENV_FILES = 8,           // Viewing dirs
  ENV_BULLETINS = 9,       // Reading bulletins
  ENV_VIEWING = 10,        // Viewing files
  ENV_ACCOUNTSEQ = 11,     // Account sequence
  ENV_LOGOFF = 12,         // Logging off
  ENV_SYSOP = 13,          // Sysop mode
  ENV_SHELL = 14,          // Shell
  ENV_EMACS = 15,          // Editing
  ENV_JOIN = 16,           // Joining conference
  ENV_CHAT = 17,           // Chatting
  ENV_REQ_CHAT = 18,       // Requesting chat
  ENV_CONNECT = 19,        // Connecting
  ENV_LOGGINGON = 20,      // Logging on
  ENV_AWAITCONNECT = 21,   // Awaiting connect
  ENV_SCANNING = 22,       // Scanning mail
  ENV_SHUTDOWN = 23,       // Shutdown
  ENV_MULTICHAT = 24,      // Multichat
  ENV_SUSPEND = 25,        // Suspended
  ENV_RESERVE = 26,        // Reserved
  ENV_ONLINEMSG = 27       // Online message
}

/**
 * Node information structure
 */
export interface NodeInfo {
  nodeId: number;
  status: NodeStatus;
  handle: string;         // User handle/name
  location: string;       // User location
  misc1: string;          // Misc info (e.g., filename being transferred)
  misc2: number;          // Misc flags (e.g., chat availability)
  baud: string;           // Baud rate
}

/**
 * Manages node status information for WHO doors
 */
export class NodeStatusManager {
  private nodes: Map<number, NodeInfo> = new Map();
  private readonly MAX_NODES = 8;  // AmiExpress supports up to 8 nodes
  private multiPortAddress: number = 0;
  private singlePortAddresses: Map<number, number> = new Map();

  /**
   * Initialize node status structures in emulator memory
   *
   * This creates the "multiPort" semaphore that WHO doors search for.
   * The structure contains node information for all active nodes.
   *
   * @param emulator - The Moira emulator instance
   * @param baseAddress - Base address for semaphore structure (default: 0xB0000)
   */
  initializeInEmulator(emulator: MoiraEmulator, baseAddress: number = 0xB0000): void {
    console.log('[NodeStatusManager] Initializing multiPort semaphore structure...');

    this.multiPortAddress = baseAddress;

    // Initialize all nodes as inactive
    for (let i = 0; i < this.MAX_NODES; i++) {
      this.nodes.set(i, {
        nodeId: i,
        status: NodeStatus.ENV_NOTACTIVE,
        handle: '',
        location: '',
        misc1: '',
        misc2: 0,
        baud: ''
      });
    }

    // Create singlePort structures for each node
    // Each singlePort is 300 bytes (approx)
    let currentAddr = baseAddress + 0x1000;  // Offset from multiPort

    for (let i = 0; i < this.MAX_NODES; i++) {
      this.singlePortAddresses.set(i, currentAddr);
      this.writeSinglePortToMemory(emulator, i, currentAddr);
      currentAddr += 0x200;  // 512 bytes per node (plenty of space)
    }

    console.log(`[NodeStatusManager] MultiPort at 0x${this.multiPortAddress.toString(16)}`);
    console.log(`[NodeStatusManager] Node status structures initialized`);
  }

  /**
   * Write singlePort structure to emulator memory
   *
   * Structure (from axcommon.e):
   *   +0:   semi (semaphore header, 46 bytes)
   *   +46:  list (14 bytes)
   *   +60:  multiCom (4 bytes)
   *   +64:  semiName (20 bytes)
   *   +84:  status (4 bytes)
   *   +88:  handle (31 bytes)
   *   +119: location (31 bytes)
   *   +150: misc1 (100 bytes)
   *   +250: misc2 (100 bytes)
   *   +350: baud (10 bytes)
   */
  private writeSinglePortToMemory(emulator: MoiraEmulator, nodeId: number, address: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Write semaphore header (simplified - just structure, no real semaphore)
    // ss structure: ln_Node (14 bytes) + rest of Semaphore structure
    for (let i = 0; i < 46; i++) {
      emulator.writeMemory(address + i, 0);
    }

    // Write MinList header (14 bytes)
    for (let i = 0; i < 14; i++) {
      emulator.writeMemory(address + 46 + i, 0);
    }

    // Write multiCom flag (4 bytes)
    emulator.writeMemory32(address + 60, 1);  // Multicom enabled

    // Write semiName (20 bytes) - e.g., "AENode0"
    const semiName = `AENode${nodeId}`;
    for (let i = 0; i < semiName.length && i < 19; i++) {
      emulator.writeMemory(address + 64 + i, semiName.charCodeAt(i));
    }
    emulator.writeMemory(address + 64 + semiName.length, 0);  // Null terminator

    // Write status (4 bytes)
    emulator.writeMemory32(address + 84, node.status);

    // Write handle (31 bytes)
    for (let i = 0; i < node.handle.length && i < 30; i++) {
      emulator.writeMemory(address + 88 + i, node.handle.charCodeAt(i));
    }
    emulator.writeMemory(address + 88 + node.handle.length, 0);

    // Write location (31 bytes)
    for (let i = 0; i < node.location.length && i < 30; i++) {
      emulator.writeMemory(address + 119 + i, node.location.charCodeAt(i));
    }
    emulator.writeMemory(address + 119 + node.location.length, 0);

    // Write misc1 (100 bytes)
    for (let i = 0; i < node.misc1.length && i < 99; i++) {
      emulator.writeMemory(address + 150 + i, node.misc1.charCodeAt(i));
    }
    emulator.writeMemory(address + 150 + node.misc1.length, 0);

    // Write misc2 (first byte is chat availability flag)
    emulator.writeMemory(address + 250, node.misc2);
    for (let i = 1; i < 100; i++) {
      emulator.writeMemory(address + 250 + i, 0);
    }

    // Write baud (10 bytes)
    for (let i = 0; i < node.baud.length && i < 9; i++) {
      emulator.writeMemory(address + 350 + i, node.baud.charCodeAt(i));
    }
    emulator.writeMemory(address + 350 + node.baud.length, 0);

    console.log(`[NodeStatusManager] Node ${nodeId} singlePort at 0x${address.toString(16)}: ${node.handle || '(inactive)'}`);
  }

  /**
   * Update node status and refresh emulator memory
   */
  updateNode(emulator: MoiraEmulator, nodeId: number, updates: Partial<NodeInfo>): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      console.warn(`[NodeStatusManager] Node ${nodeId} not found`);
      return;
    }

    // Apply updates
    Object.assign(node, updates);

    // Write updated structure to emulator memory
    const address = this.singlePortAddresses.get(nodeId);
    if (address) {
      this.writeSinglePortToMemory(emulator, nodeId, address);
    }

    console.log(`[NodeStatusManager] Updated node ${nodeId}: ${node.handle} - ${NodeStatus[node.status]}`);
  }

  /**
   * Get singlePort address for a specific node
   */
  getSinglePortAddress(nodeId: number): number {
    return this.singlePortAddresses.get(nodeId) || 0;
  }

  /**
   * Get multiPort address (contains array of all nodes)
   */
  getMultiPortAddress(): number {
    return this.multiPortAddress;
  }

  /**
   * Get current node information
   */
  getNodeInfo(nodeId: number): NodeInfo | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get all active nodes
   */
  getActiveNodes(): NodeInfo[] {
    return Array.from(this.nodes.values()).filter(
      node => node.status !== NodeStatus.ENV_NOTACTIVE
    );
  }
}

// Export singleton instance
export const nodeStatusManager = new NodeStatusManager();
