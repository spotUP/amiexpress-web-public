import { MoiraEmulator } from '../amiga-emulation/cpu/MoiraEmulator';
import { debugLog } from '../utils/debug-log';

/**
 * MulticomManager
 *
 * Manages MULTICOM protocol structures for WHO doors (RTW, AquaWho, etc.).
 *
 * CRITICAL ARCHITECTURE:
 * - Each session has its own emulator with its own memory
 * - Structures are initialized ONCE per session (not recreated on every MULTICOM call)
 * - Central Map tracks all node status
 * - When ANY node status changes, ALL active emulators are updated
 * - MULTICOM handler just returns pointer to existing structures
 *
 * This matches express.e architecture where ACP creates structures at startup,
 * then express.e just updates and references them.
 *
 * Memory Layout:
 * NOTE: Using 0x1E0000 (1.875MB) to avoid collision with DOS.library at 0x0B0000!
 * - 0x1E0000: masterNode semaphore (58 bytes header)
 * - 0x1E003A: myNode array (32 nodes × 124 bytes = 3,968 bytes)
 * - 0x1E1000: singlePort structures (32 nodes × 512 bytes = 16,384 bytes)
 */

// Status codes from express.e
export const ENV_MENU = 0;        // At main menu
export const ENV_READING = 1;     // Reading messages
export const ENV_WRITING = 2;     // Writing messages
export const ENV_DOORS = 3;       // In a door
export const ENV_FILES = 4;       // In file areas
export const ENV_CONFERENCE = 5;  // Changing conferences

// Memory layout constants - MOVED TO 0x1E0000 to avoid DOS.library collision!
const MASTER_NODE_BASE = 0x1E0000;
const MY_NODE_ARRAY_BASE = 0x1E003A;
const SINGLE_PORTS_BASE = 0x1E1000;

const MAX_NODES = 32;
const MY_NODE_SIZE = 124;
const SINGLE_PORT_SIZE = 512;

/**
 * Node information (in-memory tracking)
 */
export interface NodeInfo {
  nodeId: number;
  username: string;
  location: string;
  status: number;
  baud: string;
}

/**
 * Emulator registration (for multi-session updates)
 */
interface EmulatorRegistration {
  emulator: MoiraEmulator;
  sessionId: string;
  initialized: boolean;
}

export class MulticomManager {
  private nodes: Map<number, NodeInfo> = new Map();
  private emulators: Map<string, EmulatorRegistration> = new Map();

  /**
   * Initialize MULTICOM structures in a session's emulator.
   * This should be called ONCE when a session starts.
   */
  // WEB_*: RTW-specific cap — RTW iterates until it finds a null singlePort ptr at
  // myNode[i]+0x74. Limiting to 8 prevents the table from overflowing a 24-line screen.
  // Other WHO doors are unaffected (they receive the full 32-entry struct).
  public initializeInEmulator(emulator: MoiraEmulator, sessionId: string, nodeId: number, maxLinkedNodes: number = MAX_NODES): void {
    console.error(`[MulticomManager] initializeInEmulator: sessionId=${sessionId}, nodeId=${nodeId}, maxLinkedNodes=${maxLinkedNodes}`);

    // CRITICAL: Each door run creates a NEW emulator instance, even if sessionId is reused.
    // We must ALWAYS initialize the new emulator, replacing any old reference.
    // Otherwise, the new emulator has uninitialized memory → garbage data in WHO doors.
    const existing = this.emulators.get(sessionId);
    if (existing?.initialized) {
      console.error(`[MulticomManager] Replacing existing emulator for session ${sessionId} with new instance`);
    }

    console.error(`[MulticomManager] Initializing MULTICOM structures for session ${sessionId}`);

    try {
      // Clear entire MULTICOM memory region
      this.clearMemoryRegion(emulator);

      // Create masterNode semaphore
      this.createMasterNode(emulator, maxLinkedNodes);

      // Create myNode array (32 nodes)
      this.createMyNodeArray(emulator);

      // Create singlePort structures (32 nodes)
      this.createSinglePorts(emulator);

      // Link myNode entries to their singlePort structures
      this.linkNodeStructures(emulator, maxLinkedNodes);

      // Write current status of ALL nodes to this emulator
      this.writeAllNodesToEmulator(emulator);

      // Register emulator for future updates
      this.emulators.set(sessionId, {
        emulator,
        sessionId,
        initialized: true
      });

      console.error(`[MulticomManager] Session ${sessionId} initialized successfully, emulators.size now=${this.emulators.size}`);
    } catch (error) {
      console.error(`[MulticomManager] Failed to initialize session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Update node information and sync to ALL active emulators.
   * This writes to EXISTING structures in ALL emulators.
   */
  public updateNode(
    nodeId: number,
    username: string,
    location: string,
    status: number
  ): void {
    if (nodeId < 0 || nodeId >= MAX_NODES) {
      debugLog(`[MulticomManager] Invalid node ID: ${nodeId} (must be 0-${MAX_NODES - 1})`);
      return;
    }

    console.error(`[MulticomManager] updateNode called: nodeId=${nodeId}, username="${username}", emulators.size=${this.emulators.size}`);

    // Update in-memory tracking
    this.nodes.set(nodeId, {
      nodeId,
      username,
      location,
      status,
      baud: '57600'
    });

    // Update ALL active emulators
    for (const reg of this.emulators.values()) {
      console.error(`[MulticomManager] Writing to emulator session ${reg.sessionId}`);
      if (reg.initialized) {
        try {
          this.writeNodeToEmulator(reg.emulator, nodeId);
        } catch (error) {
          console.error(`[MulticomManager] ERROR writing to emulator:`, error);
        }
      }
    }

    console.error(`[MulticomManager] Node ${nodeId} updated in ${this.emulators.size} emulator(s)`);
  }

  /**
   * Clear node information when user logs out.
   * Zeros out the node's data in ALL emulators.
   */
  public clearNode(nodeId: number): void {
    if (nodeId < 0 || nodeId >= MAX_NODES) {
      debugLog(`[MulticomManager] Invalid node ID: ${nodeId}`);
      return;
    }

    debugLog(`[MulticomManager] Clearing node ${nodeId}`);

    // Clear in-memory tracking
    this.nodes.delete(nodeId);

    // Clear in ALL active emulators
    for (const reg of this.emulators.values()) {
      if (reg.initialized) {
        try {
          // NOTE: nodeId is already the array index (0-31), don't subtract 1
          // Old code used: for (i=0; i<32; i++) { if (i === nodeId) ... }
          const myNodeAddr = MY_NODE_ARRAY_BASE + (nodeId * MY_NODE_SIZE);
          this.clearMyNodeInEmulator(reg.emulator, myNodeAddr);

          const singlePortAddr = SINGLE_PORTS_BASE + (nodeId * SINGLE_PORT_SIZE);
          this.clearSinglePortInEmulator(reg.emulator, singlePortAddr);
        } catch (error) {
          console.error(`[MulticomManager] Failed to clear node ${nodeId} in session ${reg.sessionId}:`, error);
        }
      }
    }

    debugLog(`[MulticomManager] Node ${nodeId} cleared in ${this.emulators.size} emulator(s)`);
  }

  /**
   * Unregister an emulator when session ends.
   */
  public unregisterEmulator(sessionId: string): void {
    if (this.emulators.delete(sessionId)) {
      debugLog(`[MulticomManager] Unregistered session ${sessionId}`);
    }
  }

  /**
   * Get masterNode pointer for MULTICOM handler.
   * This is the only thing MULTICOM handler needs to do.
   */
  public getMasterNodePointer(): number {
    return MASTER_NODE_BASE;
  }

  /**
   * Get active node count.
   */
  public getActiveNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Get all active nodes.
   */
  public getActiveNodes(): NodeInfo[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Look up a single node's live state (user handle / location / status)
   * by nodeId, or null if no session is logged in on that node.
   * Used by cross-node pollers (e.g. WarOLM table render) to answer
   * DT_NAME / DT_LOCATION for nodes other than the caller's own.
   */
  public getNode(nodeId: number): NodeInfo | null {
    return this.nodes.get(nodeId) ?? null;
  }

  // ===== Private Helper Methods =====

  /**
   * Write all nodes to an emulator.
   */
  private writeAllNodesToEmulator(emulator: MoiraEmulator): void {
    console.error(`[MulticomManager] writeAllNodesToEmulator: Writing ${this.nodes.size} tracked nodes`);
    if (this.nodes.size === 0) {
      console.error(`[MulticomManager] WARNING: No nodes tracked yet - emulator will have blank MULTICOM data`);
    }
    for (const node of this.nodes.values()) {
      console.error(`[MulticomManager]   Writing node ${node.nodeId}: ${node.username}`);
      this.writeNodeToEmulator(emulator, node.nodeId);
    }
    console.error(`[MulticomManager] writeAllNodesToEmulator complete`);
  }

  /**
   * Write a single node to an emulator.
   */
  private writeNodeToEmulator(emulator: MoiraEmulator, nodeId: number): void {
    const fs = require('fs');
    const node = this.nodes.get(nodeId);
    fs.appendFileSync('/tmp/multicom-debug.log', `[writeNodeToEmulator] nodeId=${nodeId}, node exists=${!!node}\n`);

    // NOTE: nodeId is already the array index (0-31), don't subtract 1
    // Old code used: for (i=0; i<32; i++) { if (i === nodeId) ... }
    const myNodeAddr = MY_NODE_ARRAY_BASE + (nodeId * MY_NODE_SIZE);
    const singlePortAddr = SINGLE_PORTS_BASE + (nodeId * SINGLE_PORT_SIZE);

    fs.appendFileSync('/tmp/multicom-debug.log', `[writeNodeToEmulator] myNodeAddr=0x${myNodeAddr.toString(16)}, singlePortAddr=0x${singlePortAddr.toString(16)}\n`);

    if (node) {
      fs.appendFileSync('/tmp/multicom-debug.log', `[writeNodeToEmulator] Writing node: ${node.username}\n`);
      // Write myNode structure
      this.writeMyNodeToEmulator(emulator, myNodeAddr, node);

      // Write singlePort structure
      this.writeSinglePortToEmulator(emulator, singlePortAddr, node);
    } else {
      // Clear structures if node is inactive
      this.clearMyNodeInEmulator(emulator, myNodeAddr);
      this.clearSinglePortInEmulator(emulator, singlePortAddr);
    }
  }

  /**
   * Clear entire MULTICOM memory region in an emulator.
   */
  private clearMemoryRegion(emulator: MoiraEmulator): void {
    const totalSize = (MY_NODE_ARRAY_BASE - MASTER_NODE_BASE) +
                      (MAX_NODES * MY_NODE_SIZE) +
                      (MAX_NODES * SINGLE_PORT_SIZE);

    debugLog(`[MulticomManager] Clearing ${totalSize} bytes at 0x${MASTER_NODE_BASE.toString(16)}`);

    for (let i = 0; i < totalSize; i++) {
      emulator.writeMemory(MASTER_NODE_BASE + i, 0);
    }
  }

  /**
   * Create masterNode semaphore structure.
   *
   * Structure (58 bytes header):
   * +0x00-0x2D: Semaphore header (46 bytes)
   * +0x2E-0x39: List header (12 bytes)
   */
  private createMasterNode(emulator: MoiraEmulator, maxLinkedNodes: number = MAX_NODES): void {
    const addr = MASTER_NODE_BASE;
    debugLog(`[MulticomManager] Creating masterNode semaphore at 0x${addr.toString(16)}, maxLinkedNodes=${maxLinkedNodes}`);

    // Semaphore structure (46 bytes for SignalSemaphore)
    emulator.writeMemory32(addr + 0x00, 0);          // ln_Succ
    emulator.writeMemory32(addr + 0x04, 0);          // ln_Pred
    emulator.writeMemory(addr + 0x08, 4);          // ln_Type = NT_SEMAPHORE
    emulator.writeMemory(addr + 0x09, 0);          // ln_Pri
    emulator.writeMemory32(addr + 0x0A, 0);          // ln_Name
    // WEB_*: ss_NestCount doubles as the active-node count that RTW reads to know
    // how many rows to render. Writing maxLinkedNodes here (instead of 0) makes RTW
    // iterate exactly that many times, fitting the table within a 24-line screen.
    emulator.writeMemory16(addr + 0x0E, maxLinkedNodes); // ss_NestCount / node count

    // Wait queue (MsgPort-like structure, 14 bytes)
    emulator.writeMemory32(addr + 0x10, 0);          // mp_Node.ln_Succ
    emulator.writeMemory32(addr + 0x14, 0);          // mp_Node.ln_Pred
    emulator.writeMemory(addr + 0x18, 0);          // mp_Node.ln_Type
    emulator.writeMemory(addr + 0x19, 0);          // mp_Node.ln_Pri
    emulator.writeMemory32(addr + 0x1A, 0);          // mp_Node.ln_Name

    // Multiple link (SemaphoreRequest, 16 bytes)
    emulator.writeMemory32(addr + 0x1E, 0);          // sr_Link.ln_Succ
    emulator.writeMemory32(addr + 0x22, 0);          // sr_Link.ln_Pred
    emulator.writeMemory(addr + 0x26, 0);          // sr_Link.ln_Type
    emulator.writeMemory(addr + 0x27, 0);          // sr_Link.ln_Pri
    emulator.writeMemory32(addr + 0x28, 0);          // sr_Link.ln_Name
    emulator.writeMemory32(addr + 0x2C, 0);          // sr_Waiter

    // Owner and queue count
    emulator.writeMemory32(addr + 0x2E, 0);          // ss_Owner
    emulator.writeMemory16(addr + 0x32, 0);          // ss_QueueCount

    // List header follows (12 bytes) - starts at offset 0x34
    const listHead = addr + 0x34;
    emulator.writeMemory32(listHead + 0x00, listHead + 4);  // lh_Head points to lh_Tail
    emulator.writeMemory32(listHead + 0x04, 0);             // lh_Tail = NULL
    emulator.writeMemory32(listHead + 0x08, listHead);      // lh_TailPred points to lh_Head
  }

  /**
   * Create myNode array (32 nodes × 124 bytes).
   * Each entry contains node information and pointer to singlePort.
   */
  private createMyNodeArray(emulator: MoiraEmulator): void {
    debugLog(`[MulticomManager] Creating myNode array at 0x${MY_NODE_ARRAY_BASE.toString(16)}`);

    for (let i = 0; i < MAX_NODES; i++) {
      const nodeAddr = MY_NODE_ARRAY_BASE + (i * MY_NODE_SIZE);
      this.clearMyNodeInEmulator(emulator, nodeAddr);
    }

    debugLog(`[MulticomManager] myNode array created (${MAX_NODES} nodes × ${MY_NODE_SIZE} bytes)`);
  }

  /**
   * Create singlePort structures (32 nodes × 512 bytes).
   * These are MsgPort-like structures for each node.
   */
  private createSinglePorts(emulator: MoiraEmulator): void {
    debugLog(`[MulticomManager] Creating singlePort structures at 0x${SINGLE_PORTS_BASE.toString(16)}`);

    for (let i = 0; i < MAX_NODES; i++) {
      const portAddr = SINGLE_PORTS_BASE + (i * SINGLE_PORT_SIZE);
      this.clearSinglePortInEmulator(emulator, portAddr);
    }

    debugLog(`[MulticomManager] singlePort structures created (${MAX_NODES} ports × ${SINGLE_PORT_SIZE} bytes)`);
  }

  /**
   * Link each myNode entry to its corresponding singlePort structure.
   *
   * NOTE: myNode is an ARRAY OF nodeInfo structures (124 bytes each), NOT pointers.
   * Express.e accesses it as: masterNode.myNode[i].s
   * We only need to set the .s pointer in each nodeInfo to its singlePort.
   *
   * CRITICAL: AmigaE LONG fields are aligned to even addresses.
   * After handle[31] (31 bytes), there's 1 byte padding before netSocket.
   * This shifts all subsequent offsets by 1 byte compared to naive calculation.
   */
  private linkNodeStructures(emulator: MoiraEmulator, maxLinkedNodes: number = MAX_NODES): void {
    console.error(`[MulticomManager] Linking myNode entries to singlePort structures (cap=${maxLinkedNodes})`);

    for (let i = 0; i < MAX_NODES; i++) {
      const nodeAddr = MY_NODE_ARRAY_BASE + (i * MY_NODE_SIZE);
      // WEB_*: only write non-null singlePort ptr for nodes within the cap;
      // nodes at and beyond the cap keep the zero written by clearMemoryRegion,
      // which RTW treats as end-of-list (it stops when myNode[i]+0x74 == 0).
      if (i < maxLinkedNodes) {
        const portAddr = SINGLE_PORTS_BASE + (i * SINGLE_PORT_SIZE);
        emulator.writeMemory32(nodeAddr + 0x74, portAddr);
        console.error(`[MulticomManager]   myNode[${i}] at 0x${nodeAddr.toString(16)} -> singlePort at 0x${portAddr.toString(16)}`);
      }
    }

    console.error('[MulticomManager] Node structures linked');
  }

  /**
   * Write myNode structure data to emulator.
   *
   * Structure (124 bytes, per axcommon.e with LONG alignment):
   * +0x00: handle (char[31]) - Username (31 bytes)
   * +0x1F: padding (1 byte for LONG alignment)
   * +0x20: netSocket (LONG) - Socket descriptor (-1 = not connected)
   * +0x24: chatColor (LONG)
   * +0x28: offHook (LONG)
   * +0x2C: private (LONG)
   * +0x30: stats (32 × semiNodestat = 64 bytes)
   * +0x70: t (LONG)
   * +0x74: s (APTR) - Pointer to singlePort
   * +0x78: taskSignal (LONG)
   * Total: 0x7C = 124 bytes
   */
  private writeMyNodeToEmulator(
    emulator: MoiraEmulator,
    addr: number,
    node: NodeInfo
  ): void {
    console.error(`[MulticomManager] Writing myNode[${node.nodeId}] at 0x${addr.toString(16)}: username="${node.username}"`);

    // Write handle (31 bytes at +0x00)
    this.writeStringToEmulator(emulator, addr + 0x00, node.username, 31);

    // Padding byte at +0x1F (automatically 0 from clearMemoryRegion)

    // Write netSocket at +0x20 (LONG, aligned)
    // express.e sets this to telnetSocket (positive value) for connected users
    // Use a positive value to indicate "connected" (RTW checks if >= 0)
    emulator.writeMemory32(addr + 0x20, 100);  // Connected (any positive value)

    // Write chatColor at +0x24 (LONG)
    emulator.writeMemory32(addr + 0x24, 0);

    // Write offHook at +0x28 (LONG)
    emulator.writeMemory32(addr + 0x28, 0);

    // Write private at +0x2C (LONG)
    emulator.writeMemory32(addr + 0x2C, 0);

    // stats array is at +0x30 (64 bytes), leave as zeros

    // Write t at +0x70 (LONG)
    emulator.writeMemory32(addr + 0x70, 0);

    // s pointer is written by linkNodeStructures() at +0x74, don't overwrite

    // Write taskSignal at +0x78 (LONG)
    emulator.writeMemory32(addr + 0x78, 0);
  }

  /**
   * Clear myNode structure for inactive node.
   * CRITICAL: Set netSocket = -1 (0xFFFFFFFF) to indicate "not connected"
   * express.e uses netSocket = -1 for disconnected users, NOT 0!
   * RTW checks netSocket to determine if a node is valid.
   */
  private clearMyNodeInEmulator(emulator: MoiraEmulator, addr: number): void {
    // First zero everything
    for (let i = 0; i < MY_NODE_SIZE; i++) {
      emulator.writeMemory(addr + i, 0);
    }
    // Then set netSocket to -1 (disconnected) at offset 0x20 (aligned)
    // express.e: ni.netSocket:=-1 for disconnected users
    emulator.writeMemory32(addr + 0x20, 0xFFFFFFFF);  // -1 in unsigned 32-bit
  }

  /**
   * Write singlePort structure data to emulator.
   *
   * Structure (per axcommon.e):
   * +0x00-0x2D: Semaphore header (46 bytes)
   * +0x2E-0x39: List header (12 bytes)
   * +0x3A: multiCom (LONG)
   * +0x3E: semiName (20 bytes)
   * +0x52: status (LONG) - at offset 82 decimal
   * +0x56: handle (31 bytes) - at offset 86 decimal
   * +0x75: location (31 bytes) - at offset 117 decimal
   * +0x94: misc1 (100 bytes)
   * +0xF8: misc2 (100 bytes)
   * +0x15C: baud (10 bytes)
   */
  private writeSinglePortToEmulator(
    emulator: MoiraEmulator,
    addr: number,
    node: NodeInfo
  ): void {
    console.error(`[MulticomManager] Writing singlePort[${node.nodeId}] at 0x${addr.toString(16)}: username="${node.username}", location="${node.location}", status=${node.status}`);

    // Write multiCom flag at +0x3A (offset 58)
    emulator.writeMemory32(addr + 0x3A, 1);

    // Write semiName at +0x3E (offset 62, 20 bytes)
    // NOTE: nodeId is already the array index (0-31)
    const semiName = `AENode${node.nodeId}`;
    this.writeStringToEmulator(emulator, addr + 0x3E, semiName, 20);

    // Write status at +0x52 (offset 82, LONG)
    emulator.writeMemory32(addr + 0x52, node.status);

    // Write handle at +0x56 (offset 86, 31 bytes)
    console.error(`[MulticomManager]   -> handle at 0x${(addr + 0x56).toString(16)}: "${node.username}"`);
    this.writeStringToEmulator(emulator, addr + 0x56, node.username, 31);

    // Write location at +0x75 (offset 117, 31 bytes)
    console.error(`[MulticomManager]   -> location at 0x${(addr + 0x75).toString(16)}: "${node.location}"`);
    this.writeStringToEmulator(emulator, addr + 0x75, node.location, 31);

    // misc1 and misc2 are at +0x94 and +0xF8, leave as zeros

    // Write baud at +0x15C (offset 348, 10 bytes)
    this.writeStringToEmulator(emulator, addr + 0x15C, node.baud, 10);

    // DEBUG: Verify the written data
    const readbackHandle = this.readStringFromEmulator(emulator, addr + 0x56, 31);
    const readbackLocation = this.readStringFromEmulator(emulator, addr + 0x75, 31);
    const readbackStatus = emulator.readMemory32(addr + 0x52);
    console.error(`[MulticomManager] VERIFY singlePort[${node.nodeId}]: handle="${readbackHandle}", location="${readbackLocation}", status=${readbackStatus}`);
  }

  /**
   * Read null-terminated string from emulator memory.
   */
  private readStringFromEmulator(emulator: MoiraEmulator, addr: number, maxLen: number): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const byte = emulator.readMemory(addr + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return Buffer.from(bytes).toString('ascii');
  }

  /**
   * Clear singlePort structure (set all bytes to 0) in emulator.
   */
  private clearSinglePortInEmulator(emulator: MoiraEmulator, addr: number): void {
    for (let i = 0; i < SINGLE_PORT_SIZE; i++) {
      emulator.writeMemory(addr + i, 0);
    }
  }

  /**
   * Write null-terminated string to emulator memory with max length.
   */
  private writeStringToEmulator(
    emulator: MoiraEmulator,
    addr: number,
    str: string,
    maxLen: number
  ): void {
    const bytes = Buffer.from(str, 'ascii');
    const len = Math.min(bytes.length, maxLen - 1);

    for (let i = 0; i < len; i++) {
      emulator.writeMemory(addr + i, bytes[i]);
    }

    // Null terminate
    emulator.writeMemory(addr + len, 0);

    // Fill remaining with zeros
    for (let i = len + 1; i < maxLen; i++) {
      emulator.writeMemory(addr + i, 0);
    }
  }
}

/**
 * Singleton instance - shared across all sessions
 */
export const multicomManager = new MulticomManager();
