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
import { ExecLibrary } from '../amiga-emulation/api/ExecLibrary';
import { runExecuteOn } from '../services/batch-scheduler';

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
  private readonly MAX_NODES = 255;  // AmiExpress supports up to 255 nodes
  private multiPortAddress: number = 0;
  private singlePortAddresses: Map<number, number> = new Map();
  private nameAddresses: Map<number, number> = new Map(); // node -> name string address

  /**
   * Initialize node status structures in emulator memory
   *
   * This creates the "multiPort" semaphore that WHO doors search for.
   * The structure contains node information for all active nodes.
   *
   * @param emulator - The Moira emulator instance
   * @param execLibrary - The ExecLibrary instance for semaphore registration
   * @param baseAddress - Base address for semaphore structure (default: 0xB0000)
   */
  initializeInEmulator(emulator: MoiraEmulator, execLibrary: ExecLibrary, baseAddress: number = 0xB0000): void {
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
    const nameStringAddresses: number[] = [];

    for (let i = 0; i < this.MAX_NODES; i++) {
      this.singlePortAddresses.set(i, currentAddr);

      // Allocate space for semaphore name string (e.g., "AEServer.0")
      const nameStr = `AEServer.${i}`;
      const nameAddr = currentAddr + 0x180;  // Store name at end of structure

      // Write semaphore name string
      for (let j = 0; j < nameStr.length; j++) {
        emulator.writeMemory(nameAddr + j, nameStr.charCodeAt(j));
      }
      emulator.writeMemory(nameAddr + nameStr.length, 0);  // Null terminator

      nameStringAddresses.push(nameAddr);
      this.nameAddresses.set(i, nameAddr);  // Save for later updates

      this.writeSinglePortToMemory(emulator, i, currentAddr, nameAddr);
      currentAddr += 0x200;  // 512 bytes per node (plenty of space)
    }

    // Register all AEServer semaphores with ExecLibrary
console.log('[NodeStatusManager] Registering AEServer semaphores...');
    const fs = require('fs');
    for (let i = 0; i < this.MAX_NODES; i++) {
      const semaphoreAddr = this.singlePortAddresses.get(i)!;
      const nameAddr = this.nameAddresses.get(i)!;
      const semName = emulator.readString(nameAddr, 20);

      execLibrary.addSemaphore(semaphoreAddr);

      if (i < 3) {
        // Debug: verify first 3 semaphores
        const handle = emulator.readString(semaphoreAddr + 86, 20);
        const location = emulator.readString(semaphoreAddr + 117, 20);
        const msg = `[NodeStatusManager]   "${semName}" registered at 0x${semaphoreAddr.toString(16)}: "${handle}" from "${location}"\n`;
        console.log(msg.trim());
        fs.appendFileSync('/tmp/nodemgr-init-attempt.txt', msg);
      }
    }

console.log(`[NodeStatusManager] MultiPort at 0x${this.multiPortAddress.toString(16)}`);
console.log(`[NodeStatusManager] ${this.MAX_NODES} AEServer.N semaphores registered`);
    fs.appendFileSync('/tmp/nodemgr-init-attempt.txt', `Registered ${this.MAX_NODES} semaphores\n`);
  }

  /**
   * Write singlePort structure to emulator memory
   *
   * Structure (from axcommon.e):
   *   EXPORT OBJECT singlePort
   *     semi: ss -> length 46
   *     list: mlh  -> length 12   <- NOTE: 12 bytes, NOT 14!
   *     multiCom: LONG
   *     semiName[20]:ARRAY OF CHAR
   *     status:LONG -> 82         <- axcommon.e explicitly says offset 82
   *     handle[31]:ARRAY OF CHAR
   *     location[31]:ARRAY OF CHAR
   *     misc1[100]:ARRAY OF CHAR
   *     misc2[100]:ARRAY OF CHAR
   *     baud[10]:ARRAY OF CHAR
   *   ENDOBJECT
   *
   *   +0:   semi (semaphore header, 46 bytes)
   *          +0: ln_Succ (4 bytes)
   *          +4: ln_Pred (4 bytes)
   *          +8: ln_Name (4 bytes) - pointer to semaphore name string
   *          +12: ln_Type (1 byte)
   *          +13: ln_Pri (1 byte)
   *          +14-45: rest of semaphore structure
   *   +46:  list/mlh (12 bytes) <- CRITICAL: 12 bytes, not 14!
   *   +58:  multiCom (4 bytes)
   *   +62:  semiName (20 bytes)
   *   +82:  status (4 bytes)     <- axcommon.e says "-> 82"
   *   +86:  handle (31 bytes)
   *   +117: location (31 bytes)
   *   +148: misc1 (100 bytes)
   *   +248: misc2 (100 bytes)
   *   +348: baud (10 bytes)
   */
  private writeSinglePortToMemory(emulator: MoiraEmulator, nodeId: number, address: number, nameAddr: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Write semaphore header (Node structure + semaphore fields)
    // Clear the entire semaphore header
    for (let i = 0; i < 46; i++) {
      emulator.writeMemory(address + i, 0);
    }

    // Write ln_Name pointer (offset +8) - points to "AEServer.%d" string
    emulator.writeMemory32(address + 8, nameAddr);

    // Write ln_Type (offset +12) - NT_SIGNALSEM = 15
    emulator.writeMemory(address + 12, 15);

    // Write MinList header (12 bytes) <- CRITICAL FIX: 12 bytes, not 14!
    for (let i = 0; i < 12; i++) {
      emulator.writeMemory(address + 46 + i, 0);
    }

    // Write multiCom flag (4 bytes at +58)
    emulator.writeMemory32(address + 58, 1);  // Multicom enabled

    // Write semiName (20 bytes at +62) - e.g., "AENode0"
    const semiName = `AENode${nodeId}`;
    for (let i = 0; i < semiName.length && i < 19; i++) {
      emulator.writeMemory(address + 62 + i, semiName.charCodeAt(i));
    }
    emulator.writeMemory(address + 62 + semiName.length, 0);  // Null terminator

    // Write status (4 bytes at +82) <- axcommon.e: "status:LONG -> 82"
    emulator.writeMemory32(address + 82, node.status);

    // Write handle (31 bytes at +86)
    for (let i = 0; i < node.handle.length && i < 30; i++) {
      emulator.writeMemory(address + 86 + i, node.handle.charCodeAt(i));
    }
    emulator.writeMemory(address + 86 + node.handle.length, 0);

    // Write location (31 bytes at +117)
    for (let i = 0; i < node.location.length && i < 30; i++) {
      emulator.writeMemory(address + 117 + i, node.location.charCodeAt(i));
    }
    emulator.writeMemory(address + 117 + node.location.length, 0);

    // Write misc1 (100 bytes at +148)
    for (let i = 0; i < node.misc1.length && i < 99; i++) {
      emulator.writeMemory(address + 148 + i, node.misc1.charCodeAt(i));
    }
    emulator.writeMemory(address + 148 + node.misc1.length, 0);

    // Write misc2 (100 bytes at +248, first byte is chat availability flag)
    emulator.writeMemory(address + 248, node.misc2);
    for (let i = 1; i < 100; i++) {
      emulator.writeMemory(address + 248 + i, 0);
    }

    // Write baud (10 bytes at +348)
    for (let i = 0; i < node.baud.length && i < 9; i++) {
      emulator.writeMemory(address + 348 + i, node.baud.charCodeAt(i));
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
    const nameAddr = this.nameAddresses.get(nodeId);
    if (address && nameAddr) {
      this.writeSinglePortToMemory(emulator, nodeId, address, nameAddr);
    }

    // express.e:13229,13248,13469,13515 - runExecuteOn('STATUS_CHANGE')
    // Called when node status or misc info changes
    runExecuteOn('STATUS_CHANGE', nodeId, {
      username: node.handle,
      location: node.location
    }).catch((err) => console.error('[NodeStatusManager] EXECUTE_ON_STATUS_CHANGE failed:', err));

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
