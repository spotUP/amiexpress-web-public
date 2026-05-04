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
import {
  setNodeReservation,
  getNodeReservation,
  clearNodeReservation,
} from '../services/node-reservation.service';

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
  /**
   * Username this node is reserved for, or null if unreserved.
   * Driven by node-reservation.service (audit A-3, express.e:7649-7656).
   * Surfaced here so the admin UI can show the badge + Reserve/Clear
   * control without a per-node round-trip.
   */
  reservedFor: string | null;
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
   * Reserve node for a specific user (SV_RESERVE: 171, audit A-3, express.e:7649-7656).
   *
   * Body shape:
   *   { username: string } — set reservation to that user
   *   {} or { username: '' } — clear reservation (express.e F4 toggle when set);
   *                            if no reservation existed, returns 400.
   *
   * Persistence is via node-reservation.service so the reservation survives
   * across the node coming and going. Unlike most supervisor commands this
   * endpoint does NOT require the node to currently be online — sysops
   * routinely pre-reserve nodes ahead of expected callers in the web admin.
   * The supervisor:command is still emitted as a courtesy to any live admin
   * UI listener but its delivery is not required for the reservation to apply.
   */
  router.post('/:nodeId/reserve', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const body = req.body || {};
    const rawUsername = typeof body.username === 'string' ? body.username : '';
    const trimmedUsername = rawUsername.trim();

    const existing = getNodeReservation(nodeId);

    if (trimmedUsername.length === 0) {
      // Toggle / clear path. express.e:7652-7653 only clears when set; the
      // F4 ELSE branch reads a username via chooseAName before setting,
      // which the body-with-username path covers.
      if (!existing) {
        return res.status(400).json({
          success: false,
          message: 'No reservation set; supply { username: "..." } to reserve this node.',
        });
      }
      clearNodeReservation(nodeId);
      // Best-effort live UI notify; does not affect persistence.
      sendSupervisorCommand(nodeId, 'SV_RESERVE', { reservedFor: null });
      return res.json({
        success: true,
        message: `Node ${nodeId} reservation cleared`,
        reservedFor: null,
        timestamp: getSystemTime().toISOString(),
      });
    }

    setNodeReservation(nodeId, trimmedUsername);
    sendSupervisorCommand(nodeId, 'SV_RESERVE', { reservedFor: trimmedUsername });
    res.json({
      success: true,
      message: `Node ${nodeId} reserved for ${trimmedUsername}`,
      reservedFor: trimmedUsername,
      timestamp: getSystemTime().toISOString(),
    });
  });

  /**
   * GET /api/nodes/:nodeId/reserve
   * Read the current reservation for a node. Returns
   * { reservedFor: string | null } so the admin UI can show a status.
   */
  router.get('/:nodeId/reserve', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    res.json({
      success: true,
      reservedFor: getNodeReservation(nodeId),
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
        // Audit A-3: surface the per-node reservation in the status row so
        // the admin UI doesn't need to round-trip per node.
        reservedFor: getNodeReservation(nodeId),
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
