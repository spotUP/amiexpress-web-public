/**
 * AmiExpress Multinode System
 * 1:1 port from AmiExpress E source (axcommon.e lines 572-603)
 */

import AsyncLock from 'async-lock';

// Node status values (from original E source)
export enum NodeStatus {
  AVAILABLE = 0,
  BUSY = 1,
  OFFLINE = 2,
  MAINTENANCE = 3
}

// Node statistics for a single node
export interface NodeStats {
  nodeId: number;
  timeOnline: number;
  totalCalls: number;
  lastActivity: Date;
}

// Node information for each BBS node (from nodeInfo object in axcommon.e)
export interface NodeInfo {
  nodeId: number;
  handle: string;              // Username (31 chars max) - from handle[31]
  netSocket: string;           // Socket ID - from netSocket
  chatColor: number;           // ANSI color code for chat - from chatColor
  offHook: boolean;            // Node off-hook status - from offHook
  private: boolean;            // Private mode - from private
  stats: NodeStats[];          // Stats for all nodes - from stats[MAX_NODES]
  taskSignal: number;          // Signal flags - from taskSignal
  status: NodeStatus;          // Current status - from singlePort.status
  location: string;            // User location (31 chars) - from location[31]
  misc1: string;               // Misc data (100 chars) - from misc1[100]
  misc2: string;               // Misc data (100 chars) - from misc2[100]
  baud: string;                // Connection speed (10 chars) - from baud[10]
  lastUpdate: Date;            // Last update timestamp
}

/**
 * Multi-node port manager
 * Based on multiPort object from axcommon.e
 *
 * Original E structure:
 * EXPORT OBJECT multiPort
 *   semi:ss                          -> semaphore (AsyncLock)
 *   list: mlh                        -> message list header (Map)
 *   myNode[MAX_NODES]:ARRAY OF nodeInfo -> nodes Map
 *   semiName[20]:ARRAY OF CHAR       -> semaphoreName
 * ENDOBJECT
 */
export class MultiNodeManager {
  private nodes: Map<number, NodeInfo>;
  private maxNodes: number = 8;  // MAX_NODES from original
  private semaphore: AsyncLock;  // For thread-safe access (Amiga semaphore equivalent)
  private semaphoreName: string = 'AXMultiNode';

  constructor(maxNodes: number = 8) {
    this.maxNodes = maxNodes;
    this.nodes = new Map();
    this.semaphore = new AsyncLock();
    this.initialize();
  }

  /**
   * Initialize node array
   * Creates all nodes in AVAILABLE state
   */
  private initialize(): void {
    for (let i = 1; i <= this.maxNodes; i++) {
      this.nodes.set(i, {
        nodeId: i,
        handle: '',
        netSocket: '',
        chatColor: 32, // Green default (matches original)
        offHook: false,
        private: false,
        stats: [],
        taskSignal: 0,
        status: NodeStatus.AVAILABLE,
        location: '',
        misc1: '',
        misc2: '',
        baud: '115200', // Default for web connections
        lastUpdate: new Date()
      });
    }

    console.log(`MultiNode: Initialized ${this.maxNodes} nodes`);
  }

  /**
   * Get available node
   * Returns first available node ID or null if all busy
   */
  async getAvailableNode(): Promise<number | null> {
    return this.semaphore.acquire('nodes', async () => {
      for (const [id, node] of this.nodes) {
        if (node.status === NodeStatus.AVAILABLE) {
          return id;
        }
      }
      return null;
    });
  }

  /**
   * Assign user to node
   * Returns true if assignment successful
   *
   * @param nodeId - Node number to assign
   * @param username - User's handle (max 30 chars)
   * @param socket - Socket ID
   * @param location - User location/city (max 30 chars)
   */
  async assignNode(nodeId: number, username: string, socket: string, location: string = ''): Promise<boolean> {
    return this.semaphore.acquire('nodes', async () => {
      const node = this.nodes.get(nodeId);
      if (!node || node.status !== NodeStatus.AVAILABLE) {
        return false;
      }

      // Update node info (respecting original field lengths)
      node.handle = username.substring(0, 30);
      node.location = location.substring(0, 30);
      node.netSocket = socket;
      node.status = NodeStatus.BUSY;
      node.lastUpdate = new Date();

      console.log(`MultiNode: Assigned node ${nodeId} to ${username} (${socket})`);
      return true;
    });
  }

  /**
   * Release node
   * Clears node and returns to AVAILABLE state
   */
  async releaseNode(nodeId: number): Promise<void> {
    return this.semaphore.acquire('nodes', async () => {
      const node = this.nodes.get(nodeId);
      if (node) {
        console.log(`MultiNode: Releasing node ${nodeId} (was ${node.handle})`);

        node.handle = '';
        node.netSocket = '';
        node.location = '';
        node.status = NodeStatus.AVAILABLE;
        node.offHook = false;
        node.private = false;
        node.lastUpdate = new Date();
      }
    });
  }

  /**
   * Get node info
   * Returns copy of node info or null if not found
   */
  async getNodeInfo(nodeId: number): Promise<NodeInfo | null> {
    return this.semaphore.acquire('nodes', async () => {
      const node = this.nodes.get(nodeId);
      return node ? { ...node } : null;
    });
  }

  /**
   * Get all nodes
   * Returns copy of all node info
   */
  async getAllNodes(): Promise<NodeInfo[]> {
    return this.semaphore.acquire('nodes', async () => {
      return Array.from(this.nodes.values()).map(n => ({ ...n }));
    });
  }

  /**
   * Get online users (all busy nodes with users)
   * Returns array of busy nodes
   */
  async getOnlineUsers(): Promise<NodeInfo[]> {
    return this.semaphore.acquire('nodes', async () => {
      return Array.from(this.nodes.values())
        .filter(n => n.status === NodeStatus.BUSY && n.handle)
        .map(n => ({ ...n }));
    });
  }

  /**
   * Update node status
   * Changes node status (AVAILABLE, BUSY, OFFLINE, MAINTENANCE)
   */
  async updateNodeStatus(nodeId: number, status: NodeStatus): Promise<boolean> {
    return this.semaphore.acquire('nodes', async () => {
      const node = this.nodes.get(nodeId);
      if (!node) {
        return false;
      }

      node.status = status;
      node.lastUpdate = new Date();
      return true;
    });
  }

  /**
   * Set node off-hook status
   * When off-hook, node won't accept pages/interruptions
   */
  async setNodeOffHook(nodeId: number, offHook: boolean): Promise<boolean> {
    return this.semaphore.acquire('nodes', async () => {
      const node = this.nodes.get(nodeId);
      if (!node) {
        return false;
      }

      node.offHook = offHook;
      node.lastUpdate = new Date();
      return true;
    });
  }

  /**
   * Set node private mode
   * When private, node hidden from who's online lists
   */
  async setNodePrivate(nodeId: number, isPrivate: boolean): Promise<boolean> {
    return this.semaphore.acquire('nodes', async () => {
      const node = this.nodes.get(nodeId);
      if (!node) {
        return false;
      }

      node.private = isPrivate;
      node.lastUpdate = new Date();
      return true;
    });
  }

  /**
   * Set node chat color
   * ANSI color code for this node's chat text
   */
  async setNodeChatColor(nodeId: number, color: number): Promise<boolean> {
    return this.semaphore.acquire('nodes', async () => {
      const node = this.nodes.get(nodeId);
      if (!node) {
        return false;
      }

      node.chatColor = color;
      return true;
    });
  }

  /**
   * Update node misc fields
   * Sets misc1/misc2 fields (100 chars each)
   */
  async updateNodeMisc(nodeId: number, misc1?: string, misc2?: string): Promise<boolean> {
    return this.semaphore.acquire('nodes', async () => {
      const node = this.nodes.get(nodeId);
      if (!node) {
        return false;
      }

      if (misc1 !== undefined) {
        node.misc1 = misc1.substring(0, 100);
      }
      if (misc2 !== undefined) {
        node.misc2 = misc2.substring(0, 100);
      }
      node.lastUpdate = new Date();
      return true;
    });
  }

  /**
   * Get node by socket ID
   * Finds which node is using a specific socket
   */
  async getNodeBySocket(socketId: string): Promise<NodeInfo | null> {
    return this.semaphore.acquire('nodes', async () => {
      for (const node of this.nodes.values()) {
        if (node.netSocket === socketId) {
          return { ...node };
        }
      }
      return null;
    });
  }

  /**
   * Get node by username
   * Finds which node a user is on
   */
  async getNodeByUsername(username: string): Promise<NodeInfo | null> {
    return this.semaphore.acquire('nodes', async () => {
      const normalizedUsername = username.toLowerCase();
      for (const node of this.nodes.values()) {
        if (node.handle.toLowerCase() === normalizedUsername) {
          return { ...node };
        }
      }
      return null;
    });
  }

  /**
   * Get total node count
   */
  getMaxNodes(): number {
    return this.maxNodes;
  }

  /**
   * Get count of available nodes
   */
  async getAvailableNodeCount(): Promise<number> {
    return this.semaphore.acquire('nodes', async () => {
      let count = 0;
      for (const node of this.nodes.values()) {
        if (node.status === NodeStatus.AVAILABLE) {
          count++;
        }
      }
      return count;
    });
  }

  /**
   * Get count of busy nodes
   */
  async getBusyNodeCount(): Promise<number> {
    return this.semaphore.acquire('nodes', async () => {
      let count = 0;
      for (const node of this.nodes.values()) {
        if (node.status === NodeStatus.BUSY) {
          count++;
        }
      }
      return count;
    });
  }
}

// Global instance (singleton pattern matching original)
export const multiNodeManager = new MultiNodeManager(8);
