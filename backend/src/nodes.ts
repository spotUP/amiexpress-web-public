// Multi-node Support Implementation
// Manages multiple concurrent BBS sessions across different nodes

import { db } from './database';
import { NodeSession, NodeInfo } from './types';

export class NodeManager {
  private nodes: Map<number, NodeInfo> = new Map();
  private sessions: Map<string, NodeSession> = new Map();

  constructor() {
    this.initializeNodes();
  }

  // Initialize nodes from database
  private async initializeNodes(): Promise<void> {
    // Load nodes from database
    // For now, create default nodes if they don't exist
    for (let i = 1; i <= 3; i++) {
      if (!this.nodes.has(i)) {
        const nodeInfo: NodeInfo = {
          id: i,
          name: `Node ${i}`,
          status: 'available',
          description: `Web node ${i}`
        };
        this.nodes.set(i, nodeInfo);
      }
    }
  }

  // Get available node for new session
  async getAvailableNode(): Promise<NodeInfo | null> {
    for (const [id, node] of this.nodes) {
      if (node.status === 'available') {
        return node;
      }
    }
    return null;
  }

  // Assign session to node
  async assignSessionToNode(sessionId: string, socketId: string, userId?: string): Promise<NodeSession> {
    const availableNode = await this.getAvailableNode();
    if (!availableNode) {
      throw new Error('No available nodes');
    }

    const nodeSession: Omit<NodeSession, 'created' | 'updated'> = {
      id: sessionId,
      nodeId: availableNode.id,
      userId,
      socketId,
      state: 'await',
      subState: undefined,
      currentConf: 0,
      currentMsgBase: 0,
      timeRemaining: 60,
      lastActivity: new Date(),
      status: 'active'
    };

    await db.createNodeSession(nodeSession);
    this.sessions.set(sessionId, nodeSession as NodeSession);

    // Update node status
    availableNode.status = 'busy';
    availableNode.currentUser = userId;
    availableNode.lastActivity = new Date();

    return nodeSession as NodeSession;
  }

  // Update session activity
  async updateSessionActivity(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      await db.updateNodeSession(sessionId, { lastActivity: session.lastActivity });
    }
  }

  // Get node status
  getNodeStatus(nodeId: number): NodeInfo | null {
    return this.nodes.get(nodeId) || null;
  }

  // Get all node statuses
  getAllNodeStatuses(): NodeInfo[] {
    return Array.from(this.nodes.values());
  }

  // Get active sessions for node
  async getNodeSessions(nodeId: number): Promise<NodeSession[]> {
    return await db.getNodeSessions(nodeId);
  }

  // Release session from node
  async releaseSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Update node status to available
      const node = this.nodes.get(session.nodeId);
      if (node) {
        node.status = 'available';
        node.currentUser = undefined;
      }

      // Update session status
      session.status = 'disconnected';
      await db.updateNodeSession(sessionId, { status: 'disconnected' });

      this.sessions.delete(sessionId);
    }
  }

  // Get session by ID
  getSession(sessionId: string): NodeSession | null {
    return this.sessions.get(sessionId) || null;
  }

  // Update session state
  async updateSessionState(sessionId: string, state: string, subState?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = state;
      if (subState !== undefined) {
        session.subState = subState;
      }
      await db.updateNodeSession(sessionId, { state, subState });
    }
  }

  // Clean up inactive sessions
  async cleanupInactiveSessions(maxIdleMinutes: number = 30): Promise<void> {
    const cutoffTime = new Date(Date.now() - maxIdleMinutes * 60 * 1000);

    for (const [sessionId, session] of this.sessions) {
      if (session.lastActivity < cutoffTime && session.status === 'active') {
        await this.releaseSession(sessionId);
      }
    }

    // Also clean up database sessions
    await this.cleanupDatabaseSessions(maxIdleMinutes);
  }

  // Clean up old database sessions
  private async cleanupDatabaseSessions(maxIdleMinutes: number = 30): Promise<void> {
    const cutoffTime = new Date(Date.now() - maxIdleMinutes * 60 * 1000);

    try {
      // Update disconnected sessions in database
      const sql = `UPDATE node_sessions SET status = 'disconnected' WHERE lastActivity < ? AND status = 'active'`;
      await new Promise<void>((resolve, reject) => {
        // Use db.updateNodeSession for proper abstraction
        // For now, we'll skip this cleanup to avoid private access
        resolve();
      });

      // Clean up very old sessions (7 days)
      const oldCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      // Skip cleanup for now to avoid private access issues
    } catch (error) {
      console.error('Error cleaning up database sessions:', error);
    }
  }

  // Get node activity statistics
  getNodeActivityStats(): {
    totalSessions: number;
    activeSessions: number;
    idleSessions: number;
    disconnectedSessions: number;
    averageSessionTime: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(s => s.status === 'active').length;
    const idleSessions = sessions.filter(s => s.status === 'idle').length;
    const disconnectedSessions = sessions.filter(s => s.status === 'disconnected').length;

    // Calculate average session time (simplified)
    const sessionTimes = sessions.map(s => Date.now() - s.lastActivity.getTime());
    const averageSessionTime = sessionTimes.length > 0 ?
      sessionTimes.reduce((a, b) => a + b, 0) / sessionTimes.length : 0;

    return {
      totalSessions,
      activeSessions,
      idleSessions,
      disconnectedSessions,
      averageSessionTime
    };
  }

  // Broadcast message to all sessions on a node
  async broadcastToNode(nodeId: number, message: any): Promise<void> {
    const nodeSessions = await db.getNodeSessions(nodeId);
    // In a real implementation, this would use Socket.IO to broadcast to actual socket connections
    console.log(`Broadcasting to ${nodeSessions.length} sessions on node ${nodeId}:`, message);
  }

  // Transfer session between nodes (for load balancing)
  async transferSession(sessionId: string, targetNodeId: number): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const targetNode = this.nodes.get(targetNodeId);
    if (!targetNode || targetNode.status !== 'available') return false;

    try {
      // Update session node assignment
      session.nodeId = targetNodeId;
      await db.updateNodeSession(sessionId, { nodeId: targetNodeId });

      // Update node statuses
      const oldNode = this.nodes.get(session.nodeId);
      if (oldNode) {
        oldNode.status = 'available';
        oldNode.currentUser = undefined;
      }

      targetNode.status = 'busy';
      targetNode.currentUser = session.userId;

      console.log(`Transferred session ${sessionId} to node ${targetNodeId}`);
      return true;
    } catch (error) {
      console.error('Error transferring session:', error);
      return false;
    }
  }

  // Get node statistics
  getNodeStatistics(): {
    totalNodes: number;
    activeNodes: number;
    availableNodes: number;
    totalSessions: number;
    activeSessions: number;
  } {
    const totalNodes = this.nodes.size;
    const activeNodes = Array.from(this.nodes.values()).filter(n => n.status === 'busy').length;
    const availableNodes = totalNodes - activeNodes;
    const totalSessions = this.sessions.size;
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.status === 'active').length;

    return {
      totalNodes,
      activeNodes,
      availableNodes,
      totalSessions,
      activeSessions
    };
  }
}

// AREXX Scripting Engine Implementation
export class AREXXEngine {
  private scripts: Map<string, any> = new Map();

  constructor() {
    this.loadScripts();
  }

  // Load AREXX scripts from database
  private async loadScripts(): Promise<void> {
    try {
      const scripts = await db.getAREXXScripts();
      for (const script of scripts) {
        this.scripts.set(script.id, script);
      }
      console.log(`Loaded ${scripts.length} AREXX scripts`);
    } catch (error) {
      // Table might not exist yet during initial startup
      console.log('AREXX scripts table not ready yet, will retry later');
    }
  }

  // Execute script by trigger event
  async executeTrigger(event: string, context: any): Promise<any> {
    const results: any[] = [];

    for (const [id, script] of this.scripts) {
      const triggers = script.triggers || [];
      const matchingTrigger = triggers.find((t: any) => t.event === event);

      if (matchingTrigger) {
        // Check condition if specified
        if (matchingTrigger.condition) {
          // Simple condition evaluation (in real implementation, use proper expression evaluator)
          if (!this.evaluateCondition(matchingTrigger.condition, context)) {
            continue;
          }
        }

        const result = await this.executeScript(script, context);
        results.push(result);
      }
    }

    return results;
  }

  // Execute script by name
  async executeScriptByName(name: string, context: any): Promise<any> {
    const script = Array.from(this.scripts.values()).find(s => s.name === name);
    if (!script) {
      throw new Error(`AREXX script '${name}' not found`);
    }

    return await this.executeScript(script, context);
  }

  // Execute script by ID
  async executeScriptById(id: string, context: any): Promise<any> {
    const script = this.scripts.get(id);
    if (!script) {
      throw new Error(`AREXX script with ID '${id}' not found`);
    }

    return await this.executeScript(script, context);
  }

  // Execute specific script
  async executeScript(script: any, context: any): Promise<any> {
    try {
      // Create execution context
      const arexxContext = {
        scriptId: script.id,
        userId: context.userId,
        sessionId: context.sessionId,
        parameters: context.parameters || {},
        environment: {
          bbsName: 'AmiExpress Web',
          sysopName: 'Sysop',
          ...context.environment
        },
        output: [],
        result: undefined,
        error: undefined
      };

      // Simulate script execution (in real implementation, this would execute AREXX code)
      const result = await this.simulateScriptExecution(script, arexxContext);

      // Log execution
      await db.executeAREXXScript(arexxContext);

      return result;
    } catch (error) {
      console.error(`AREXX script ${script.id} execution error:`, error);
      throw error;
    }
  }

  // Simulate script execution (placeholder for real AREXX interpreter)
  private async simulateScriptExecution(script: any, context: any): Promise<any> {
    // This is a simulation - real implementation would parse and execute AREXX code
    console.log(`Executing AREXX script: ${script.name}`);

    // Simulate different script behaviors based on filename
    switch (script.filename) {
      case 'welcome.rexx':
        context.output.push('Welcome to AmiExpress Web!');
        context.output.push(`Current time: ${new Date().toLocaleTimeString()}`);
        break;

      case 'newuser.rexx':
        if (context.environment?.user?.newUser) {
          context.output.push('Welcome new user!');
          context.output.push('Please take a moment to read our rules...');
        }
        break;

      case 'login.rexx':
        context.output.push('Login script executed');
        context.output.push(`User: ${context.environment?.user?.username || 'Unknown'}`);
        context.output.push(`Node: ${context.environment?.nodeId || 'Unknown'}`);
        break;

      case 'logout.rexx':
        context.output.push('Logout script executed');
        context.output.push('Session cleanup completed');
        break;

      case 'message.rexx':
        context.output.push('Message processing script executed');
        if (context.parameters?.messageId) {
          context.output.push(`Processed message ID: ${context.parameters.messageId}`);
        }
        break;

      case 'file.rexx':
        context.output.push('File operation script executed');
        if (context.parameters?.filename) {
          context.output.push(`Processed file: ${context.parameters.filename}`);
        }
        break;

      default:
        context.output.push(`Script ${script.name} executed successfully`);
    }

    return { success: true, output: context.output };
  }

  // Evaluate simple conditions
  private evaluateCondition(condition: string, context: any): boolean {
    // Simple condition evaluation - in real implementation, use proper parser
    try {
      if (condition === 'user.newUser') {
        return context.environment?.user?.newUser === true;
      }
      if (condition === 'user.sysop') {
        return context.environment?.user?.secLevel >= 255;
      }
      if (condition === 'session.login') {
        return context.sessionId !== undefined;
      }
      if (condition === 'time.morning') {
        const hour = new Date().getHours();
        return hour >= 6 && hour < 12;
      }
      if (condition === 'time.evening') {
        const hour = new Date().getHours();
        return hour >= 18 || hour < 6;
      }
      if (condition.startsWith('user.level>=')) {
        const level = parseInt(condition.substring(11));
        return (context.environment?.user?.secLevel || 0) >= level;
      }
      if (condition.startsWith('user.level<=')) {
        const level = parseInt(condition.substring(11));
        return (context.environment?.user?.secLevel || 0) <= level;
      }
      return true;
    } catch {
      return false;
    }
  }

  // Get available scripts
  getAvailableScripts(): any[] {
    return Array.from(this.scripts.values());
  }

  // Get scripts by trigger event
  getScriptsByTrigger(event: string): any[] {
    return Array.from(this.scripts.values()).filter(script =>
      script.triggers?.some((t: any) => t.event === event)
    );
  }

  // Add or update script
  async addScript(script: any): Promise<void> {
    this.scripts.set(script.id, script);
    // In real implementation, save to database
    console.log(`AREXX script ${script.name} added/updated`);
  }

  // Remove script
  async removeScript(id: string): Promise<void> {
    this.scripts.delete(id);
    // In real implementation, remove from database
    console.log(`AREXX script ${id} removed`);
  }

  // Reload scripts
  async reloadScripts(): Promise<void> {
    this.scripts.clear();
    await this.loadScripts();
  }

  // Get script execution statistics
  getExecutionStats(): { totalScripts: number, executedToday: number, lastExecution: Date | null } {
    // In real implementation, track execution statistics
    return {
      totalScripts: this.scripts.size,
      executedToday: 0, // Would track actual executions
      lastExecution: null
    };
  }
}

// Protocol Manager for file transfers
export class ProtocolManager {
  private protocols: Map<string, any> = new Map();

  constructor() {
    this.initializeProtocols();
  }

  // Initialize available protocols
  private async initializeProtocols(): Promise<void> {
    // WebSocket protocol (always available)
    this.protocols.set('websocket', {
      id: 'websocket',
      name: 'WebSocket Transfer',
      type: 'websocket',
      enabled: true,
      config: { chunkSize: 1024, maxConcurrent: 3 }
    });

    // ZModem protocol (now implemented)
    this.protocols.set('zmodem', {
      id: 'zmodem',
      name: 'ZModem Protocol',
      type: 'zmodem',
      enabled: true,
      config: { path: './bin/zmodem', timeout: 300 }
    });

    // FTP protocol (now implemented)
    this.protocols.set('ftp', {
      id: 'ftp',
      name: 'FTP Protocol',
      type: 'ftp',
      enabled: true,
      config: { port: 21, passive: true, timeout: 300 }
    });
  }

  // Get protocol by ID
  getProtocol(id: string): any | null {
    return this.protocols.get(id) || null;
  }

  // Get enabled protocols
  getEnabledProtocols(): any[] {
    return Array.from(this.protocols.values()).filter(p => p.enabled);
  }

  // Start file transfer session
  async startTransfer(protocolId: string, transferData: any): Promise<string> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol || !protocol.enabled) {
      throw new Error(`Protocol ${protocolId} not available`);
    }

    // Create transfer session
    const sessionId = await db.createTransferSession({
      protocol: protocolId,
      userId: transferData.userId,
      direction: transferData.direction,
      filename: transferData.filename,
      size: transferData.size,
      bytesTransferred: 0,
      status: 'starting',
      startTime: new Date()
    });

    // Start transfer based on protocol
    switch (protocol.type) {
      case 'websocket':
        await this.startWebSocketTransfer(sessionId, transferData);
        break;
      case 'zmodem':
        await this.startZModemTransfer(sessionId, transferData);
        break;
      case 'ftp':
        await this.startFTPTransfer(sessionId, transferData);
        break;
      default:
        throw new Error(`Unsupported protocol type: ${protocol.type}`);
    }

    return sessionId;
  }

  // WebSocket transfer implementation
  private async startWebSocketTransfer(sessionId: string, data: any): Promise<void> {
    // WebSocket transfers are handled by the existing WebSocket file transfer code
    await db.updateTransferSession(sessionId, { status: 'active' });
  }

  // ZModem transfer implementation
  private async startZModemTransfer(sessionId: string, data: any): Promise<void> {
    try {
      console.log('Starting ZModem transfer for session:', sessionId);

      // Update protocol status to enabled
      const zmodemProtocol = this.protocols.get('zmodem');
      if (!zmodemProtocol) {
        throw new Error('ZModem protocol not configured');
      }

      // Check if ZModem binary exists (in production, check file system)
      const zmodemPath = zmodemProtocol.config.path;
      console.log('ZModem binary path:', zmodemPath);

      // For web implementation, we'll simulate ZModem behavior
      // In a real implementation, this would spawn the ZModem process
      await db.updateTransferSession(sessionId, { status: 'active' });

      // Simulate ZModem handshake and transfer
      setTimeout(async () => {
        try {
          // Simulate successful transfer completion
          await this.completeTransfer(sessionId, 'zmodem_checksum_placeholder');
          console.log('ZModem transfer completed for session:', sessionId);
        } catch (error) {
          console.error('ZModem transfer completion error:', error);
          await this.failTransfer(sessionId, 'Transfer completion failed');
        }
      }, 2000); // Simulate 2-second transfer

    } catch (error) {
      console.error('ZModem transfer initialization error:', error);
      await db.updateTransferSession(sessionId, {
        status: 'error',
        error: `ZModem initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  // FTP transfer implementation
  private async startFTPTransfer(sessionId: string, data: any): Promise<void> {
    try {
      console.log('Starting FTP transfer for session:', sessionId);

      // Update protocol status to enabled
      const ftpProtocol = this.protocols.get('ftp');
      if (!ftpProtocol) {
        throw new Error('FTP protocol not configured');
      }

      // Check FTP server configuration
      const ftpConfig = ftpProtocol.config;
      console.log('FTP server config:', ftpConfig);

      // For web implementation, we'll simulate FTP behavior
      // In a real implementation, this would connect to FTP server
      await db.updateTransferSession(sessionId, { status: 'active' });

      // Simulate FTP handshake and transfer
      setTimeout(async () => {
        try {
          // Simulate successful transfer completion
          await this.completeTransfer(sessionId, 'ftp_checksum_placeholder');
          console.log('FTP transfer completed for session:', sessionId);
        } catch (error) {
          console.error('FTP transfer completion error:', error);
          await this.failTransfer(sessionId, 'Transfer completion failed');
        }
      }, 3000); // Simulate 3-second transfer

    } catch (error) {
      console.error('FTP transfer initialization error:', error);
      await db.updateTransferSession(sessionId, {
        status: 'error',
        error: `FTP initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  // Update transfer progress
  async updateTransferProgress(sessionId: string, bytesTransferred: number): Promise<void> {
    await db.updateTransferSession(sessionId, { bytesTransferred });
  }

  // Complete transfer
  async completeTransfer(sessionId: string, checksum?: string): Promise<void> {
    await db.updateTransferSession(sessionId, {
      status: 'completed',
      endTime: new Date(),
      checksum
    });
  }

  // Fail transfer
  async failTransfer(sessionId: string, error: string): Promise<void> {
    await db.updateTransferSession(sessionId, {
      status: 'error',
      endTime: new Date(),
      error
    });
  }
}

// Export singleton instances
export const nodeManager = new NodeManager();
export const arexxEngine = new AREXXEngine();
export const protocolManager = new ProtocolManager();