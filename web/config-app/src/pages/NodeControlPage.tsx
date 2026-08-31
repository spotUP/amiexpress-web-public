/**
 * Node Control Page - Live node monitoring and control
 * Maps to ACP.e supervisor commands (SV_* command set)
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import {
  Activity,
  Monitor,
  RefreshCw,
  UserX,
  Play,
  Lock,
  X,
  Check,
} from 'lucide-react';

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
   * Username this node is reserved for (audit A-3, express.e:7649-7656).
   * null when the node is not reserved.
   */
  reservedFor: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

interface NodeStatusResponse extends ApiResponse<NodeStatus[]> {
  totalNodes: number;
  onlineNodes: number;
}

export function NodeControlPage() {
  const queryClient = useQueryClient();

  // Audit A-3: reservation control state.
  // - editingReserveNodeId: which node card has its inline input open
  // - reserveInput: the typed username while editing
  const [editingReserveNodeId, setEditingReserveNodeId] = useState<number | null>(null);
  const [reserveInput, setReserveInput] = useState('');

  // Fetch node status with auto-refresh
  const { data: nodeStatusData, isLoading, error } = useQuery<NodeStatusResponse>({
    queryKey: ['nodes', 'status'],
    queryFn: async () => {
      const response = await apiClient.get<NodeStatusResponse>('/api/nodes/status');
      return response.data;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Node command mutations
  const sendNodeCommand = useMutation({
    mutationFn: async ({ nodeId, command, data }: { nodeId: number; command: string; data?: any }) => {
      const response = await apiClient.post(`/api/nodes/${nodeId}/${command}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes', 'status'] });
    },
  });

  const handleNodeCommand = async (nodeId: number, command: string, data?: any) => {
    try {
      await sendNodeCommand.mutateAsync({ nodeId, command, data });
    } catch (error) {
      console.error(`Failed to send ${command} to node ${nodeId}:`, error);
    }
  };

  /**
   * Audit A-3: reserve a node for a specific user.
   * Empty/whitespace username clears (toggle, matches express.e:7652-7653 F4).
   * Backend persists in node-reservation.service; pre-login emits the
   * "*** Node N is reserved right now, for X ***" banner; auth handler
   * bumps non-matching connects with the express.e:28736 420 message.
   */
  const handleReserveSave = async (nodeId: number) => {
    const username = reserveInput.trim();
    try {
      await sendNodeCommand.mutateAsync({
        nodeId,
        command: 'reserve',
        data: username.length > 0 ? { username } : {},
      });
      setEditingReserveNodeId(null);
      setReserveInput('');
    } catch (error) {
      console.error(`Failed to reserve node ${nodeId}:`, error);
    }
  };

  const handleReserveClear = async (nodeId: number) => {
    try {
      // Empty body triggers the F4 toggle-clear path on the backend.
      await sendNodeCommand.mutateAsync({ nodeId, command: 'reserve', data: {} });
    } catch (error) {
      console.error(`Failed to clear reservation on node ${nodeId}:`, error);
    }
  };

  const handleReserveCancel = () => {
    setEditingReserveNodeId(null);
    setReserveInput('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-content-secondary">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading node status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-status-danger/10 border border-status-danger rounded">
        <p className="text-status-danger">Failed to load node status</p>
      </div>
    );
  }

  const nodes = nodeStatusData?.data || [];
  const totalNodes = nodeStatusData?.totalNodes || 0;
  const onlineNodes = nodeStatusData?.onlineNodes || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-content-secondary">Monitor and control BBS nodes in real-time</p>
      </div>

      {/* System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-surface-1 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <Monitor className="w-8 h-8 text-status-info" />
            <div>
              <div className="text-2xl font-bold text-content-primary">{totalNodes}</div>
              <div className="text-sm text-content-secondary">Total Nodes</div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-surface-1 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-status-ok" />
            <div>
              <div className="text-2xl font-bold text-content-primary">{onlineNodes}</div>
              <div className="text-sm text-content-secondary">Online Nodes</div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-surface-1 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <Monitor className="w-8 h-8 text-content-secondary" />
            <div>
              <div className="text-2xl font-bold text-content-primary">{totalNodes - onlineNodes}</div>
              <div className="text-sm text-content-secondary">Offline Nodes</div>
            </div>
          </div>
        </div>
      </div>

      {/* System Controls used to be two buttons here: Enable/Disable Chat
          and Quiet Mode. Both kept their state in this component, posted to an
          endpoint that broadcast `supervisor:command`, and NOTHING in this
          codebase subscribes to that channel - so the button showed a state
          the server had never been told and no node ever heard.

          Sysop availability is set on the Operator Chat page, which writes
          something the BBS reads; a node's quiet setting is a per-node
          tooltype on the Nodes page. */}

      {/* Node List */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-content-primary">Active Nodes</h2>

        {nodes.length === 0 ? (
          <div className="p-8 text-center text-content-secondary bg-surface-1/50 rounded-lg border border-border">
            <Monitor className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No nodes available</p>
          </div>
        ) : (
          nodes.map((node) => (
            <div
              key={node.nodeId}
              className={`p-4 rounded-lg border ${
                node.online
                  ? 'bg-surface-1 border-status-ok'
                  : 'bg-surface-1/50 border-border'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-content-primary">
                      Node {node.nodeId}
                    </h3>
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        node.online
                          ? 'bg-status-ok text-content-inverse'
                          : 'bg-surface-3 text-content-secondary'
                      }`}
                    >
                      {node.online ? 'ONLINE' : 'OFFLINE'}
                    </span>
                    {node.reservedFor && (
                      <span
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-status-warn text-content-inverse"
                        title={`Reserved for ${node.reservedFor}`}
                      >
                        <Lock className="w-3 h-3" />
                        Reserved: {node.reservedFor}
                      </span>
                    )}
                  </div>

                  {node.online && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <div>
                        <span className="text-content-secondary">User:</span>{' '}
                        <span className="text-content-primary">{node.username || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-content-secondary">Location:</span>{' '}
                        <span className="text-content-primary">{node.location || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-content-secondary">State:</span>{' '}
                        <span className="text-content-primary">{node.state || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-content-secondary">Activity:</span>{' '}
                        <span className="text-content-primary">{node.currentActivity || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-content-secondary">Connection:</span>{' '}
                        <span className="text-content-primary">{node.connectionType || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-content-secondary">Baud:</span>{' '}
                        <span className="text-content-primary">{node.baud || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-content-secondary">Time Left:</span>{' '}
                        <span className="text-content-primary">
                          {node.timeRemaining ? `${Math.floor(node.timeRemaining / 60)} min` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Node Controls */}
              {node.online && (
                <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                  {/* Open Window, Chat, Sysop Login, Instant, Off Hook, Init
                      Modem and Exit used to sit here. Each posted a supervisor
                      command that nothing subscribes to, and the route replied
                      success - so the sysop pressed Reinitialize Modem and was
                      told it had worked. They are Amiga MCP concepts with no
                      counterpart in a browser node; the endpoints now answer
                      501 rather than pretending. */}
                  <button
                    onClick={() => handleNodeCommand(node.nodeId, 'kick')}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-status-warn hover:bg-status-warn/90 text-content-inverse rounded transition-colors"
                    title="Force disconnect user (SV_KICKUSER)"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Kick
                  </button>

                  {/* Audit A-3: Reserve / Clear control. Mirrors express.e
                      F4 toggle (express.e:7649-7656). Editing-mode shows an
                      inline username input. */}
                  {node.reservedFor ? (
                    <button
                      onClick={() => handleReserveClear(node.nodeId)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-status-warn hover:bg-status-warn/90 text-content-inverse rounded transition-colors"
                      title={`Clear reservation (currently for ${node.reservedFor})`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Clear Reservation
                    </button>
                  ) : editingReserveNodeId === node.nodeId ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={reserveInput}
                        onChange={(e) => setReserveInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleReserveSave(node.nodeId);
                          if (e.key === 'Escape') handleReserveCancel();
                        }}
                        placeholder="username"
                        className="px-2 py-1 text-sm bg-surface-0 border border-border-strong rounded text-content-primary"
                      />
                      <button
                        onClick={() => handleReserveSave(node.nodeId)}
                        className="flex items-center gap-1 px-2 py-1.5 text-sm bg-status-warn hover:bg-status-warn/90 text-content-inverse rounded transition-colors"
                        title="Save reservation"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleReserveCancel}
                        className="flex items-center gap-1 px-2 py-1.5 text-sm bg-surface-3 hover:bg-surface-2 text-content-primary rounded transition-colors"
                        title="Cancel"
                        aria-label="Cancel reserving this node"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingReserveNodeId(node.nodeId);
                        setReserveInput('');
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-status-warn hover:bg-status-warn/90 text-content-inverse rounded transition-colors"
                      title="Reserve node for a specific user (SV_RESERVE)"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Reserve
                    </button>
                  )}
                </div>
              )}

              {!node.online && (
                <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                  <button
                    onClick={() => handleNodeCommand(node.nodeId, 'start')}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-status-ok hover:bg-status-ok/90 text-content-inverse rounded transition-colors"
                    title="Start node (SV_STARTNODE)"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start Node
                  </button>

                  {/* Audit A-3: pre-reserve an offline node so the next
                      caller is matched against this username. */}
                  {node.reservedFor ? (
                    <button
                      onClick={() => handleReserveClear(node.nodeId)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-status-warn hover:bg-status-warn/90 text-content-inverse rounded transition-colors"
                      title={`Clear reservation (currently for ${node.reservedFor})`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Clear Reservation
                    </button>
                  ) : editingReserveNodeId === node.nodeId ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={reserveInput}
                        onChange={(e) => setReserveInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleReserveSave(node.nodeId);
                          if (e.key === 'Escape') handleReserveCancel();
                        }}
                        placeholder="username"
                        className="px-2 py-1 text-sm bg-surface-0 border border-border-strong rounded text-content-primary"
                      />
                      <button
                        onClick={() => handleReserveSave(node.nodeId)}
                        className="flex items-center gap-1 px-2 py-1.5 text-sm bg-status-warn hover:bg-status-warn/90 text-content-inverse rounded transition-colors"
                        title="Save reservation"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleReserveCancel}
                        className="flex items-center gap-1 px-2 py-1.5 text-sm bg-surface-3 hover:bg-surface-2 text-content-primary rounded transition-colors"
                        title="Cancel"
                        aria-label="Cancel reserving this node"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingReserveNodeId(node.nodeId);
                        setReserveInput('');
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-status-warn hover:bg-status-warn/90 text-content-inverse rounded transition-colors"
                      title="Reserve node for a specific user (SV_RESERVE)"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Reserve
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Auto-refresh indicator */}
      <div className="text-center text-sm text-content-muted">
        <div className="flex items-center justify-center gap-2">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>Auto-refreshing every 5 seconds</span>
        </div>
      </div>
    </div>
  );
}
