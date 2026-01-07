/**
 * Node Control API Routes
 * Provides real-time node control for admin dashboard (ACP.e supervisor commands)
 *
 * Endpoints:
 * - POST /api/nodes/:nodeId/uniconify - Open/show node window (SV_UNICONIFY)
 * - POST /api/nodes/:nodeId/sysop-login - Login as sysop on node (SV_SYSOPLOG)
 * - POST /api/nodes/:nodeId/instant-login - Instant sysop access (SV_INSTANT)
 * - POST /api/nodes/:nodeId/reserve - Reserve node for sysop (SV_RESERVE)
 * - POST /api/nodes/:nodeId/exit - Force node to exit (SV_EXITNODE)
 * - POST /api/nodes/:nodeId/offhook - Take node off hook (SV_NODEOFFHOOK)
 * - POST /api/nodes/:nodeId/init-modem - Reinitialize modem (SV_INITMODEM)
 * - POST /api/nodes/:nodeId/chat - Initiate sysop chat (SV_CHAT)
 * - POST /api/nodes/:nodeId/kick - Force disconnect user (SV_KICKUSER)
 * - POST /api/nodes/:nodeId/start - Start node (SV_STARTNODE)
 * - GET  /api/nodes/status - Get real-time status for all nodes
 * - POST /api/system/toggle-chat - Enable/disable chat globally (SV_CHATTOGGLE)
 * - POST /api/system/quiet-mode - Toggle MCP quiet mode (SV_QUIETNODE)
 */

import express, { Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { sessions, socketToNodeId, getSocketIdByNodeId } from '../server/session-manager';
import { getSystemTime } from '../utils/date-time.util';

interface NodeStatus {
  nodeId: number;
  online: boolean;
  userId?: string;
  username?: string;
  location?: string;
  baud?: number;
  state?: string;
  currentActivity?: string;
  connectionType?: string;
  lastActivity?: string;
  timeRemaining?: number;
}

export function createNodeControlRouter(io: SocketIOServer): ReturnType<typeof express.Router> {
  const router = express.Router();

  /**
   * Helper: Validate node exists and return socket ID
   */
  function validateNode(nodeId: number): { success: boolean; socketId?: string; error?: string } {
    const session = sessions.get(nodeId.toString());
    if (!session) {
      return { success: false, error: `Node ${nodeId} not found or offline` };
    }

    const socketId = getSocketIdByNodeId(nodeId);
    if (!socketId) {
      return { success: false, error: `Node ${nodeId} has no active socket connection` };
    }

    return { success: true, socketId };
  }

  /**
   * Helper: Send supervisor command to node via Socket.IO
   */
  function sendSupervisorCommand(
    nodeId: number,
    command: string,
    data?: any
  ): { success: boolean; error?: string } {
    const validation = validateNode(nodeId);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }

    // Emit supervisor command to node's socket
    io.to(validation.socketId!).emit('supervisor:command', {
      command,
      nodeId,
      timestamp: getSystemTime().toISOString(),
      ...data,
    });

    console.log(`[Node Control] Sent ${command} to node ${nodeId} (socket: ${validation.socketId})`);
    return { success: true };
  }

  /**
   * POST /api/nodes/:nodeId/uniconify
   * Open/show node window (SV_UNICONIFY: 153)
   */
  router.post('/:nodeId/uniconify', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const result = sendSupervisorCommand(nodeId, 'SV_UNICONIFY');

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Node ${nodeId} window opened`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * POST /api/nodes/:nodeId/sysop-login
   * Login as sysop on node (SV_SYSOPLOG: 154)
   */
  router.post('/:nodeId/sysop-login', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const result = sendSupervisorCommand(nodeId, 'SV_SYSOPLOG');

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Sysop login initiated on node ${nodeId}`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * POST /api/nodes/:nodeId/instant-login
   * Instant sysop access (SV_INSTANT: 170)
   */
  router.post('/:nodeId/instant-login', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const result = sendSupervisorCommand(nodeId, 'SV_INSTANT');

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Instant sysop access granted on node ${nodeId}`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * POST /api/nodes/:nodeId/reserve
   * Reserve node for sysop (SV_RESERVE: 171)
   */
  router.post('/:nodeId/reserve', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const result = sendSupervisorCommand(nodeId, 'SV_RESERVE');

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Node ${nodeId} reserved for sysop`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * POST /api/nodes/:nodeId/exit
   * Force node to exit (SV_EXITNODE: 159)
   */
  router.post('/:nodeId/exit', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const result = sendSupervisorCommand(nodeId, 'SV_EXITNODE');

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Node ${nodeId} exit initiated`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * POST /api/nodes/:nodeId/offhook
   * Take node off hook (SV_NODEOFFHOOK: 158)
   */
  router.post('/:nodeId/offhook', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const result = sendSupervisorCommand(nodeId, 'SV_NODEOFFHOOK');

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Node ${nodeId} taken off hook`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * POST /api/nodes/:nodeId/init-modem
   * Reinitialize modem (SV_INITMODEM: 160)
   */
  router.post('/:nodeId/init-modem', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const result = sendSupervisorCommand(nodeId, 'SV_INITMODEM');

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Modem initialized on node ${nodeId}`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * POST /api/nodes/:nodeId/chat
   * Initiate sysop chat (SV_CHAT: 157)
   */
  router.post('/:nodeId/chat', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const result = sendSupervisorCommand(nodeId, 'SV_CHAT');

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Chat initiated with node ${nodeId}`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * POST /api/nodes/:nodeId/kick
   * Force disconnect user (SV_KICKUSER: 184)
   */
  router.post('/:nodeId/kick', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const { reason } = req.body;
    const result = sendSupervisorCommand(nodeId, 'SV_KICKUSER', { reason });

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `User kicked from node ${nodeId}`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * POST /api/nodes/:nodeId/start
   * Start node (SV_STARTNODE: 185)
   */
  router.post('/:nodeId/start', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const result = sendSupervisorCommand(nodeId, 'SV_STARTNODE');

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Node ${nodeId} start initiated`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * GET /api/nodes/status
   * Get real-time status for all nodes
   */
  router.get('/status', (req: Request, res: Response) => {
    const nodeStatuses: NodeStatus[] = [];

    // Iterate through all sessions (keyed by nodeId)
    for (const [nodeIdStr, session] of sessions.entries()) {
      const nodeId = parseInt(nodeIdStr);
      const socketId = getSocketIdByNodeId(nodeId);

      const status: NodeStatus = {
        nodeId,
        online: !!socketId,
        userId: session.user?.id,
        username: session.user?.username,
        location: session.user?.location || session.remoteAddress,
        baud: session.connectionBaud,
        state: session.state,
        currentActivity: session.subState,
        connectionType: session.connectionType,
        lastActivity: session.lastActivity ? new Date(session.lastActivity).toISOString() : undefined,
        timeRemaining: session.timeRemaining,
      };

      nodeStatuses.push(status);
    }

    // Sort by node ID
    nodeStatuses.sort((a, b) => a.nodeId - b.nodeId);

    res.json({
      success: true,
      data: nodeStatuses,
      totalNodes: nodeStatuses.length,
      onlineNodes: nodeStatuses.filter(n => n.online).length,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * POST /api/system/toggle-chat
   * Enable/disable chat globally (SV_CHATTOGGLE: 172)
   */
  router.post('/toggle-chat', (req: Request, res: Response) => {
    const { enabled } = req.body;

    // Broadcast to all nodes
    io.emit('supervisor:command', {
      command: 'SV_CHATTOGGLE',
      enabled,
      timestamp: getSystemTime().toISOString(),
    });

    console.log(`[Node Control] Chat ${enabled ? 'enabled' : 'disabled'} globally`);

    res.json({
      success: true,
      message: `Chat ${enabled ? 'enabled' : 'disabled'} on all nodes`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * POST /api/system/quiet-mode
   * Toggle MCP quiet mode (SV_QUIETNODE: 178)
   */
  router.post('/quiet-mode', (req: Request, res: Response) => {
    const { enabled } = req.body;

    // Broadcast to all nodes
    io.emit('supervisor:command', {
      command: 'SV_QUIETNODE',
      enabled,
      timestamp: getSystemTime().toISOString(),
    });

    console.log(`[Node Control] Quiet mode ${enabled ? 'enabled' : 'disabled'} globally`);

    res.json({
      success: true,
      message: `Quiet mode ${enabled ? 'enabled' : 'disabled'} on all nodes`,
      timestamp: getSystemTime().toISOString(),
    });
  });

  return router;
}
