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
 * - POST /api/nodes/toggle-chat - Enable/disable chat globally (SV_CHATTOGGLE)
 * - POST /api/nodes/quiet-mode - Toggle MCP quiet mode (SV_QUIETNODE)
 */

import express, { Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { sessions, socketToNodeId, getSocketIdByNodeId } from '../server/session-manager';
import { emitterForNodeId } from '../server/session-emitter-registry';
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
   * A supervisor command with nothing on the other end.
   *
   * `supervisor:command` is emitted and NOTHING in this codebase subscribes to
   * it - not the BBS session layer, not the terminal, not the SDK. Nine of the
   * eleven Node Control buttons ended in that emit and the route answered
   * `{ success: true }`, so the sysop pressed Reinitialize Modem and was told
   * it had worked.
   *
   * These are Amiga MCP concepts - open the node's Workbench window, take the
   * line off hook, reinitialise a modem - and a browser BBS has no counterpart
   * for most of them. Saying so is the fix; inventing behaviour for them is a
   * feature, not a repair.
   */
  function notImplemented(res: Response, command: string, what: string) {
    return res.status(501).json({
      success: false,
      command,
      message: `${command} is not implemented: ${what}`,
      timestamp: getSystemTime().toISOString(),
    });
  }

  /**
   * POST /api/nodes/:nodeId/uniconify
   * Open/show node window (SV_UNICONIFY: 153)
   */
  router.post('/:nodeId/uniconify', (_req: Request, res: Response) => {
    return notImplemented(res, 'SV_UNICONIFY', "it opens a node's Workbench window, and a browser node has no window to open");
  });

  /**
   * POST /api/nodes/:nodeId/sysop-login
   * Login as sysop on node (SV_SYSOPLOG: 154)
   */
  router.post('/:nodeId/sysop-login', (_req: Request, res: Response) => {
    return notImplemented(res, 'SV_SYSOPLOG', "it drives the node's local console, which this port does not have");
  });

  /**
   * POST /api/nodes/:nodeId/instant-login
   * Instant sysop access (SV_INSTANT: 170)
   */
  router.post('/:nodeId/instant-login', (_req: Request, res: Response) => {
    return notImplemented(res, 'SV_INSTANT', "it drives the node's local console, which this port does not have");
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
  router.post('/:nodeId/exit', (_req: Request, res: Response) => {
    return notImplemented(res, 'SV_EXITNODE', 'nothing subscribes to the supervisor channel, so the node never hears it');
  });

  /**
   * POST /api/nodes/:nodeId/offhook
   * Take node off hook (SV_NODEOFFHOOK: 158)
   */
  router.post('/:nodeId/offhook', (_req: Request, res: Response) => {
    return notImplemented(res, 'SV_NODEOFFHOOK', 'there is no modem to take off hook');
  });

  /**
   * POST /api/nodes/:nodeId/init-modem
   * Reinitialize modem (SV_INITMODEM: 160)
   */
  router.post('/:nodeId/init-modem', (_req: Request, res: Response) => {
    return notImplemented(res, 'SV_INITMODEM', 'there is no modem to reinitialise');
  });

  /**
   * POST /api/nodes/:nodeId/chat
   * Initiate sysop chat (SV_CHAT: 157)
   */
  router.post('/:nodeId/chat', (_req: Request, res: Response) => {
    return notImplemented(res, 'SV_CHAT', 'nothing subscribes to the supervisor channel, so the node never hears it');
  });

  /**
   * POST /api/nodes/:nodeId/kick
   * Force disconnect user (SV_KICKUSER: 184)
   */
  router.post('/:nodeId/kick', (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    const { reason } = req.body;
    const validation = validateNode(nodeId);

    if (!validation.success) {
      return res.status(404).json({ success: false, message: validation.error });
    }

    // Actually disconnect. This used to emit SV_KICKUSER on a channel nothing
    // subscribes to and report success, so the caller stayed online and the
    // sysop was told they had been removed.
    //
    // TP-10: resolved through the ONE session-emitter registry. The lookup this
    // replaced reached into the io namespace by getSocketIdByNodeId(nodeId) -
    // and that map holds socket.io sockets and nothing else, so kicking a telnet or
    // SSH node from the admin dashboard 404'd with "no active socket
    // connection" while the caller stayed online. `system-message` is rendered
    // on a byte transport by the transport adapter (TP-4), and the connection
    // emitter maps `disconnect` to closing the connection, so both halves of
    // the kick now cross.
    const target = emitterForNodeId(nodeId, io);
    if (!target) {
      return res.status(404).json({
        success: false,
        message: `Node ${nodeId} has no active connection`,
      });
    }

    target.emitter.emit('system-message', {
      text: reason
        ? `\r\nDisconnected by the sysop: ${reason}\r\n`
        : '\r\nDisconnected by the sysop.\r\n',
    });
    target.emitter.disconnect(true);

    console.log(`[Node Control] Kicked node ${nodeId} (socket: ${validation.socketId})`);

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
  router.post('/:nodeId/start', (_req: Request, res: Response) => {
    return notImplemented(res, 'SV_STARTNODE', 'nodes are started by the server, not by a supervisor message');
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
   * POST /api/nodes/toggle-chat
   * Enable/disable chat globally (SV_CHATTOGGLE: 172)
   */
  router.post('/toggle-chat', (_req: Request, res: Response) => {
    // The page kept its own boolean and this endpoint answered success, so
    // the toggle showed a state the server had never been told and no node
    // ever heard. Sysop availability is configured on the Operator Chat page,
    // which writes something the BBS reads.
    return notImplemented(
      res,
      'SV_CHATTOGGLE',
      'nothing subscribes to the supervisor channel; set sysop availability on the Operator Chat page'
    );
  });

  /**
   * POST /api/nodes/quiet-mode
   * Toggle MCP quiet mode (SV_QUIETNODE: 178)
   */
  router.post('/quiet-mode', (_req: Request, res: Response) => {
    // Same shape as toggle-chat: local state, a broadcast nothing hears, and
    // a success reply. A node's quiet setting is a per-node tooltype and
    // belongs on the Nodes page.
    return notImplemented(
      res,
      'SV_QUIETNODE',
      'nothing subscribes to the supervisor channel; quiet mode is a per-node setting'
    );
  });

  return router;
}
