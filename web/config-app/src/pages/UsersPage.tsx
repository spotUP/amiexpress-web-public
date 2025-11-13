import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User as UserIcon, Edit2, Trash2, Plus, X, Shield } from 'lucide-react';
import { apiClient } from '../api/client';

interface BbsUser {
  id: string;
  username: string;
  realname?: string;
  location?: string;
  phone?: string;
  email?: string;
  secLevel: number;
  timeLimit: number;
  ratio: number;
  uploads: number;
  downloads: number;
  calls: number;
  expert: boolean;
  ansi: boolean;
  lastLogin?: Date;
  firstLogin: Date;
}

interface UserFormData {
  username: string;
  password: string;
  realname: string;
  location: string;
  phone: string;
  email: string;
  secLevel: number;
  timeLimit: number;
  expert: boolean;
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<BbsUser | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    password: '',
    realname: '',
    location: '',
    phone: '',
    email: '',
    secLevel: 10,
    timeLimit: 60,
    expert: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers(),
  });

  const createMutation = useMutation({
    mutationFn: (user: UserFormData) => apiClient.createUser(user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      alert('User created successfully');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      alert(`Failed to create user: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<UserFormData> }) =>
      apiClient.updateUser(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      alert('User updated successfully');
      setIsModalOpen(false);
      setEditingUser(null);
      resetForm();
    },
    onError: (error: Error) => {
      alert(`Failed to update user: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      alert('User deleted successfully');
    },
    onError: (error: Error) => {
      alert(`Failed to delete user: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      realname: '',
      location: '',
      phone: '',
      email: '',
      secLevel: 10,
      timeLimit: 60,
      expert: false,
    });
  };

  const handleAdd = () => {
    resetForm();
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleEdit = (user: BbsUser) => {
    setFormData({
      username: user.username,
      password: '', // Password field left empty for editing
      realname: user.realname || '',
      location: user.location || '',
      phone: user.phone || '',
      email: user.email || '',
      secLevel: user.secLevel,
      timeLimit: user.timeLimit,
      expert: user.expert,
    });
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password for new users
    if (!editingUser && !formData.password) {
      alert('Password is required for new users');
      return;
    }

    const submitData = { ...formData };
    // Remove password from updates if empty (for edits)
    if (editingUser && !submitData.password) {
      delete (submitData as any).password;
    }

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, updates: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleDelete = (user: BbsUser) => {
    if (confirm(`Are you sure you want to delete user "${user.username}"?\n\nThis action cannot be undone.`)) {
      deleteMutation.mutate(user.id);
    }
  };

  const getSecurityLevelColor = (level: number) => {
    if (level >= 255) return 'text-red-500';
    if (level >= 200) return 'text-orange-500';
    if (level >= 100) return 'text-yellow-500';
    if (level >= 50) return 'text-green-500';
    return 'text-bbs-muted';
  };

  const getSecurityLevelLabel = (level: number) => {
    if (level >= 255) return 'Sysop';
    if (level >= 200) return 'Co-Sysop';
    if (level >= 100) return 'Privileged';
    if (level >= 50) return 'User';
    return 'Limited';
  };

  if (isLoading) {
    return <div className="text-bbs-text">Loading users...</div>;
  }

  const users = (data?.data || []) as BbsUser[];

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">User Management</h1>
          <p className="text-bbs-muted">Manage BBS user accounts and permissions</p>
        </div>
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add User</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user: BbsUser) => (
          <div key={user.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-bbs-primary rounded">
                  <UserIcon className="text-bbs-accent" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bbs-text">{user.username}</h3>
                  {user.realname && <p className="text-xs text-bbs-muted">{user.realname}</p>}
                </div>
              </div>
              <div className={`flex items-center space-x-1 px-2 py-1 rounded text-xs ${getSecurityLevelColor(user.secLevel)} bg-bbs-secondary`}>
                <Shield size={14} />
                <span>{getSecurityLevelLabel(user.secLevel)}</span>
              </div>
            </div>

            <div className="space-y-2 text-sm mb-4">
              {user.email && (
                <div className="flex justify-between">
                  <span className="text-bbs-muted">Email:</span>
                  <span className="text-bbs-text text-xs">{user.email}</span>
                </div>
              )}
              {user.location && (
                <div className="flex justify-between">
                  <span className="text-bbs-muted">Location:</span>
                  <span className="text-bbs-text text-xs">{user.location}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-bbs-muted">Security Level:</span>
                <span className="text-bbs-text">{user.secLevel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Time Limit:</span>
                <span className="text-bbs-text">{user.timeLimit} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Calls:</span>
                <span className="text-bbs-text">{user.calls}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Files:</span>
                <span className="text-bbs-text">{user.uploads}↑ / {user.downloads}↓</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleEdit(user)}
                className="btn-secondary flex-1 flex items-center justify-center space-x-2"
              >
                <Edit2 size={16} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDelete(user)}
                className="bg-bbs-accent hover:bg-bbs-accent/90 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No users found. Add users to provide access to the BBS.
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-bg border-2 border-bbs-accent rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-bbs-bg border-b border-bbs-primary p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-bbs-accent">
                {editingUser ? 'Edit User' : 'Add User'}
              </h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingUser(null);
                  resetForm();
                }}
                className="text-bbs-muted hover:text-bbs-text transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="username" className="label">Username *</label>
                  <input
                    id="username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="input-field w-full font-mono"
                    required
                    disabled={!!editingUser}
                  />
                  {editingUser && <p className="text-xs text-bbs-muted mt-1">Username cannot be changed</p>}
                </div>

                <div>
                  <label htmlFor="password" className="label">
                    Password {!editingUser && '*'}
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="input-field w-full"
                    required={!editingUser}
                    placeholder={editingUser ? 'Leave blank to keep current password' : ''}
                  />
                </div>

                <div>
                  <label htmlFor="realname" className="label">Real Name</label>
                  <input
                    id="realname"
                    type="text"
                    value={formData.realname}
                    onChange={(e) => setFormData({ ...formData, realname: e.target.value })}
                    className="input-field w-full"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="label">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input-field w-full"
                  />
                </div>

                <div>
                  <label htmlFor="location" className="label">Location</label>
                  <input
                    id="location"
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="input-field w-full"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="label">Phone</label>
                  <input
                    id="phone"
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="input-field w-full"
                  />
                </div>

                <div>
                  <label htmlFor="secLevel" className="label">Security Level *</label>
                  <input
                    id="secLevel"
                    type="number"
                    min="0"
                    max="255"
                    value={formData.secLevel}
                    onChange={(e) => setFormData({ ...formData, secLevel: parseInt(e.target.value) })}
                    className="input-field w-full"
                    required
                  />
                  <p className="text-xs text-bbs-muted mt-1">0-255 (255=Sysop, 200=Co-Sysop, 100=Privileged)</p>
                </div>

                <div>
                  <label htmlFor="timeLimit" className="label">Time Limit (min) *</label>
                  <input
                    id="timeLimit"
                    type="number"
                    min="0"
                    value={formData.timeLimit}
                    onChange={(e) => setFormData({ ...formData, timeLimit: parseInt(e.target.value) })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.expert}
                      onChange={(e) => setFormData({ ...formData, expert: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-bbs-accent"
                    />
                    <span className="text-bbs-text">Expert Mode (skip prompts and menus)</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-bbs-primary">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingUser(null);
                    resetForm();
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
