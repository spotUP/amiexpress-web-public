import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, X, Save, MessageSquare, Settings as SettingsIcon } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

interface WallComment {
  id: string;
  userName: string;
  source: string;
  comment: string;
  bbsshortcode: string;
  timestamp?: string;
}

interface GlobalWallConfig {
  style: number;
  mybbsshortcode: string;
  coloursettings: string;
}

interface EditCommentData {
  userName: string;
  source: string;
  comment: string;
  bbsshortcode: string;
}

export function GlobalWallPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [activeTab, setActiveTab] = useState<'comments' | 'settings'>('comments');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingComment, setEditingComment] = useState<WallComment | null>(null);
  const [editFormData, setEditFormData] = useState<EditCommentData>({
    userName: '',
    source: '',
    comment: '',
    bbsshortcode: '',
  });

  // Config state
  const [configFormData, setConfigFormData] = useState<GlobalWallConfig>({
    style: 4,
    mybbsshortcode: 'AMI',
    coloursettings: '42626717772363',
  });

  // Fetch comments
  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: ['globalwall-comments', page, limit],
    queryFn: () => apiClient.getGlobalWallComments(page, limit),
    enabled: activeTab === 'comments',
  });

  // Fetch config
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['globalwall-config'],
    queryFn: () => apiClient.getGlobalWallConfig(),
    enabled: activeTab === 'settings',
  });

  // Update configFormData when config loads
  useEffect(() => {
    if (configData?.data) {
      setConfigFormData(configData.data);
    }
  }, [configData]);

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditCommentData }) =>
      apiClient.updateGlobalWallComment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalwall-comments'] });
      showSuccess('Comment updated successfully');
      setIsEditModalOpen(false);
      setEditingComment(null);
    },
    onError: (error: Error) => {
      showError(`Failed to update comment: ${error.message}`);
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteGlobalWallComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalwall-comments'] });
      showSuccess('Comment deleted successfully');
    },
    onError: (error: Error) => {
      showError(`Failed to delete comment: ${error.message}`);
    },
  });

  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: (config: GlobalWallConfig) => apiClient.updateGlobalWallConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalwall-config'] });
      showSuccess('Configuration saved successfully');
    },
    onError: (error: Error) => {
      showError(`Failed to save configuration: ${error.message}`);
    },
  });

  const handleEditComment = (comment: WallComment) => {
    setEditFormData({
      userName: comment.userName || '',
      source: comment.source || '',
      comment: comment.comment || '',
      bbsshortcode: comment.bbsshortcode || '',
    });
    setEditingComment(comment);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingComment) {
      updateCommentMutation.mutate({
        id: editingComment.id,
        data: editFormData,
      });
    }
  };

  const handleDeleteComment = async (comment: WallComment) => {
    const confirmed = await confirm({
      title: 'Delete Comment',
      message: `Are you sure you want to delete this comment from "${comment.userName}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
    });
    if (confirmed) {
      deleteCommentMutation.mutate(comment.id);
    }
  };

  const handleConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfigMutation.mutate(configFormData);
  };

  const comments = commentsData?.data || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-bbs-accent mb-2">Global Wall Management</h1>
        <p className="text-bbs-muted">Manage Global Wall comments and settings</p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 mb-6 border-b border-bbs-border">
        <button
          onClick={() => setActiveTab('comments')}
          className={`px-4 py-2 font-semibold transition-colors border-b-2 ${
            activeTab === 'comments'
              ? 'border-bbs-accent text-bbs-accent'
              : 'border-transparent text-bbs-muted hover:text-bbs-text'
          }`}
        >
          <div className="flex items-center space-x-2">
            <MessageSquare size={18} />
            <span>Comments</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 font-semibold transition-colors border-b-2 ${
            activeTab === 'settings'
              ? 'border-bbs-accent text-bbs-accent'
              : 'border-transparent text-bbs-muted hover:text-bbs-text'
          }`}
        >
          <div className="flex items-center space-x-2">
            <SettingsIcon size={18} />
            <span>Settings</span>
          </div>
        </button>
      </div>

      {/* Comments Tab */}
      {activeTab === 'comments' && (
        <div>
          {commentsLoading ? (
            <div className="text-bbs-text">Loading comments...</div>
          ) : (
            <>
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-bbs-border">
                      <th className="text-left py-3 px-4 text-bbs-text font-semibold">ID</th>
                      <th className="text-left py-3 px-4 text-bbs-text font-semibold">User</th>
                      <th className="text-left py-3 px-4 text-bbs-text font-semibold">Source</th>
                      <th className="text-left py-3 px-4 text-bbs-text font-semibold">BBS</th>
                      <th className="text-left py-3 px-4 text-bbs-text font-semibold">Comment</th>
                      <th className="text-right py-3 px-4 text-bbs-text font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comments.map((comment: WallComment) => (
                      <tr
                        key={comment.id}
                        className="border-b border-bbs-border hover:bg-bbs-secondary/20 transition-colors"
                      >
                        <td className="py-3 px-4 text-bbs-text font-mono text-sm">{comment.id}</td>
                        <td className="py-3 px-4 text-bbs-text">{comment.userName}</td>
                        <td className="py-3 px-4 text-bbs-text">{comment.source}</td>
                        <td className="py-3 px-4 text-bbs-text font-mono text-sm">
                          {comment.bbsshortcode}
                        </td>
                        <td className="py-3 px-4 text-bbs-muted text-sm max-w-md truncate">
                          {comment.comment}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex space-x-2 justify-end">
                            <button
                              onClick={() => handleEditComment(comment)}
                              className="p-2 bg-bbs-secondary hover:bg-bbs-secondary/80 text-bbs-text rounded transition-colors"
                              title="Edit comment"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteComment(comment)}
                              className="p-2 bg-bbs-accent hover:bg-bbs-accent/90 text-white rounded transition-colors"
                              title="Delete comment"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {comments.length === 0 && (
                <div className="card text-center text-bbs-muted">
                  No comments found on the Global Wall.
                </div>
              )}

              {/* Pagination */}
              <div className="flex justify-center space-x-4 mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-bbs-text flex items-center px-4">Page {page}</span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={comments.length < limit}
                  className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div>
          {configLoading ? (
            <div className="text-bbs-text">Loading settings...</div>
          ) : (
            <form onSubmit={handleConfigSubmit} className="card max-w-2xl">
              <h2 className="text-xl font-bold text-bbs-accent mb-6">Global Wall Settings</h2>

              <div className="space-y-6">
                <div>
                  <label htmlFor="mybbsshortcode" className="label">
                    BBS Short Code *
                  </label>
                  <input
                    id="mybbsshortcode"
                    type="text"
                    maxLength={3}
                    value={configFormData.mybbsshortcode}
                    onChange={(e) =>
                      setConfigFormData({ ...configFormData, mybbsshortcode: e.target.value })
                    }
                    className="input-field w-full font-mono"
                    required
                  />
                  <p className="text-bbs-muted text-sm mt-1">
                    3-character identifier for your BBS (e.g., AMI, XPR, BBS)
                  </p>
                </div>

                <div>
                  <label htmlFor="style" className="label">
                    Wall Style *
                  </label>
                  <select
                    id="style"
                    value={configFormData.style}
                    onChange={(e) =>
                      setConfigFormData({ ...configFormData, style: parseInt(e.target.value) })
                    }
                    className="input-field w-full"
                    required
                  >
                    <option value="1">Style 1</option>
                    <option value="2">Style 2</option>
                    <option value="3">Style 3</option>
                    <option value="4">Style 4</option>
                  </select>
                  <p className="text-bbs-muted text-sm mt-1">Display style for the wall (1-4)</p>
                </div>

                <div>
                  <label htmlFor="coloursettings" className="label">
                    Color Settings *
                  </label>
                  <input
                    id="coloursettings"
                    type="text"
                    maxLength={14}
                    minLength={14}
                    value={configFormData.coloursettings}
                    onChange={(e) =>
                      setConfigFormData({ ...configFormData, coloursettings: e.target.value })
                    }
                    className="input-field w-full font-mono"
                    required
                  />
                  <p className="text-bbs-muted text-sm mt-1">
                    14-character color preset string (default: 42626717772363)
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6 mt-6 border-t border-bbs-primary">
                <button type="submit" className="btn-primary flex items-center space-x-2">
                  <Save size={16} />
                  <span>
                    {updateConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Edit Comment Modal */}
      {isEditModalOpen && editingComment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-bg border-2 border-bbs-accent rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-bbs-bg border-b border-bbs-primary p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-bbs-accent">Edit Wall Comment</h2>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingComment(null);
                }}
                className="text-bbs-muted hover:text-bbs-text transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-6">
              <div>
                <label htmlFor="edit_userName" className="label">
                  User Name
                </label>
                <input
                  id="edit_userName"
                  type="text"
                  value={editFormData.userName}
                  onChange={(e) => setEditFormData({ ...editFormData, userName: e.target.value })}
                  className="input-field w-full"
                />
              </div>

              <div>
                <label htmlFor="edit_source" className="label">
                  Source
                </label>
                <input
                  id="edit_source"
                  type="text"
                  value={editFormData.source}
                  onChange={(e) => setEditFormData({ ...editFormData, source: e.target.value })}
                  className="input-field w-full"
                />
              </div>

              <div>
                <label htmlFor="edit_bbsshortcode" className="label">
                  BBS Short Code
                </label>
                <input
                  id="edit_bbsshortcode"
                  type="text"
                  maxLength={3}
                  value={editFormData.bbsshortcode}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, bbsshortcode: e.target.value })
                  }
                  className="input-field w-full font-mono"
                />
              </div>

              <div>
                <label htmlFor="edit_comment" className="label">
                  Comment
                </label>
                <textarea
                  id="edit_comment"
                  value={editFormData.comment}
                  onChange={(e) => setEditFormData({ ...editFormData, comment: e.target.value })}
                  className="input-field w-full font-mono"
                  rows={4}
                />
                <p className="text-bbs-muted text-sm mt-1">
                  ANSI color codes will be preserved (e.g., \x1b[31mRed text\x1b[0m)
                </p>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-bbs-primary">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingComment(null);
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={updateCommentMutation.isPending}
                >
                  {updateCommentMutation.isPending ? 'Updating...' : 'Update Comment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
