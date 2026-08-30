import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { DataGrid, type DataGridColumn } from '../components/DataGrid';

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

// Stable empty array reference to prevent infinite re-renders
const EMPTY_USERS: BbsUser[] = [];

interface UserFormData {
  username: string;
  password: string;
  /**
   * Typed a second time, and never sent anywhere.
   *
   * A sysop setting someone else's password cannot see what they typed and
   * will not be the one who finds out it was wrong - the user will, when
   * they cannot log in.
   */
  confirmPassword: string;
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
  const { showSuccess, showError, confirm } = useNotification();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'username' | 'secLevel' | 'calls' | 'uploads' | 'downloads'>('username');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<BbsUser | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    password: '',
    confirmPassword: '',
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
      showSuccess('User created successfully');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to create user: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<UserFormData> }) =>
      apiClient.updateUser(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showSuccess('User updated successfully');
      setIsModalOpen(false);
      setEditingUser(null);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to update user: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showSuccess('User deleted successfully');
    },
    onError: (error: Error) => {
      showError(`Failed to delete user: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      confirmPassword: '',
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
      confirmPassword: '',
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
      showError('Password is required for new users');
      return;
    }

    // A typo here locks somebody out of their own account, and the person
    // typing it is not the person who finds out.
    if (formData.password && formData.password !== formData.confirmPassword) {
      showError('The passwords do not match');
      return;
    }

    const submitData = { ...formData };
    // The confirmation never leaves this form.
    delete (submitData as any).confirmPassword;
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

  const handleDelete = async (user: BbsUser) => {
    const confirmed = await confirm({
      title: 'Delete User',
      message: `Are you sure you want to delete user "${user.username}"?\n\nThis action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(user.id);
    }
  };

  const getSecurityLevelColor = (level: number) => {
    if (level >= 255) return 'text-status-danger';
    if (level >= 200) return 'text-status-warn';
    if (level >= 100) return 'text-status-warn';
    if (level >= 50) return 'text-status-ok';
    return 'text-bbs-muted';
  };

  // Use stable reference for empty fallback to prevent infinite re-renders
  const users = (data?.data ?? EMPTY_USERS) as BbsUser[];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = users;
    if (term) {
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(term) ||
          (u.realname || '').toLowerCase().includes(term) ||
          (u.email || '').toLowerCase().includes(term)
      );
    }
    list = [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'secLevel':
          return (a.secLevel - b.secLevel) * dir;
        case 'calls':
          return (a.calls - b.calls) * dir;
        case 'uploads':
          return (a.uploads - b.uploads) * dir;
        case 'downloads':
          return (a.downloads - b.downloads) * dir;
        default:
          return a.username.localeCompare(b.username) * dir;
      }
    });
    return list;
  }, [users, search, sortKey, sortDir]);

  if (isLoading) {
    return <div className="text-bbs-text">Loading users...</div>;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageUsers = filtered.slice((page - 1) * pageSize, page * pageSize);

  const columns: DataGridColumn<BbsUser>[] = [
    {
      key: 'username',
      header: 'Username',
      sortable: true,
      render: (user) => <span className="text-bbs-text font-mono">{user.username}</span>,
    },
    {
      key: 'secLevel',
      header: 'SecLvl',
      sortable: true,
      render: (user) => <span className={getSecurityLevelColor(user.secLevel)}>{user.secLevel}</span>,
    },
    {
      key: 'realname',
      header: 'Real Name',
      render: (user) => <span className="text-bbs-text truncate">{user.realname || '—'}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      render: (user) => <span className="text-bbs-text truncate">{user.email || '—'}</span>,
    },
    {
      key: 'calls',
      header: 'Calls',
      sortable: true,
      render: (user) => <span className="text-bbs-text">{user.calls}</span>,
    },
    {
      key: 'files',
      header: 'Files (U/D)',
      className: 'text-sm',
      render: (user) => (
        <span className="text-bbs-text">
          {user.uploads} / {user.downloads}
        </span>
      ),
    },
    {
      key: 'time',
      header: 'Time',
      // -1 is this project's "unlimited" (see database/types.ts), and showing
      // it raw reads as a bug rather than as a setting.
      render: (user) => (
        <span className="text-bbs-text">
          {user.timeLimit < 0 ? 'Unlimited' : `${user.timeLimit} min`}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (user) => (
        <div className="flex space-x-2">
          <button
            onClick={() => handleEdit(user)}
            className="btn-secondary px-2 py-1 text-xs flex items-center space-x-1"
          >
            <Edit2 size={14} />
            <span>Edit</span>
          </button>
          <button
            onClick={() => handleDelete(user)}
            className="bg-bbs-accent hover:bg-bbs-accent/90 text-content-inverse px-2 py-1 rounded text-xs flex items-center space-x-1"
          >
            <Trash2 size={14} />
            <span>Del</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-bbs-background border border-bbs-border rounded px-2">
            <Search size={16} className="text-bbs-muted" />
            <input
              type="text"
              placeholder="Search username, real name, email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="bg-transparent focus:outline-none px-2 py-1 text-sm text-bbs-text"
            />
          </div>
          <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
            <Plus size={20} />
            <span>Add User</span>
          </button>
        </div>
      </div>

      <DataGrid
        columns={columns}
        rows={pageUsers}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={(key) => {
          setSortKey(key as typeof sortKey);
          setSortDir(sortKey === key && sortDir === 'asc' ? 'desc' : 'asc');
        }}
        emptyMessage="No users found."
        getRowKey={(row) => row.id}
      />

      <div className="flex justify-between items-center mt-4">
        <div className="text-sm text-bbs-muted">
          Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of{' '}
          {filtered.length}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary px-3 py-1 disabled:opacity-50"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm text-bbs-text">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-secondary px-3 py-1 disabled:opacity-50"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-bg border-2 border-bbs-accent rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-bbs-bg border-b border-bbs-primary p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-accent">
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
                  <label htmlFor="username" className="label">
                    Username *
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="input-field w-full font-mono"
                    required
                    disabled={!!editingUser}
                  />
                  {editingUser && (
                    <p className="text-xs text-bbs-muted mt-1">Username cannot be changed</p>
                  )}
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
                  <label htmlFor="confirmPassword" className="label">
                    Confirm Password {!editingUser && '*'}
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="input-field w-full"
                    required={!editingUser}
                    placeholder={editingUser ? 'Repeat the new password' : ''}
                  />
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="text-xs text-bbs-error mt-1">The passwords do not match</p>
                  )}
                </div>

                <div>
                  <label htmlFor="realname" className="label">
                    Real Name
                  </label>
                  <input
                    id="realname"
                    type="text"
                    value={formData.realname}
                    onChange={(e) => setFormData({ ...formData, realname: e.target.value })}
                    className="input-field w-full"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="label">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input-field w-full"
                  />
                </div>

                <div>
                  <label htmlFor="location" className="label">
                    Location
                  </label>
                  <input
                    id="location"
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="input-field w-full"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="label">
                    Phone
                  </label>
                  <input
                    id="phone"
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="input-field w-full"
                  />
                </div>

                <div>
                  <label htmlFor="secLevel" className="label">
                    Security Level *
                  </label>
                  <input
                    id="secLevel"
                    type="number"
                    min="0"
                    max="255"
                    value={formData.secLevel}
                    onChange={(e) =>
                      setFormData({ ...formData, secLevel: parseInt(e.target.value, 10) })
                    }
                    className="input-field w-full"
                    required
                  />
                  <p className="text-xs text-bbs-muted mt-1">
                    0-255 (255=Sysop, 200=Co-Sysop, 100=Privileged)
                  </p>
                </div>

                <div>
                  <label htmlFor="timeLimit" className="label">
                    Time Limit (min) *
                  </label>
                  <input
                    id="timeLimit"
                    type="number"
                    // -1 is unlimited, so the field must accept it; min="0"
                    // made the browser reject the value the BBS itself uses.
                    min="-1"
                    value={formData.timeLimit}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      setFormData({ ...formData, timeLimit: Number.isNaN(parsed) ? 0 : parsed });
                    }}
                    className="input-field w-full"
                    required
                  />
                  <p className="text-xs text-bbs-muted mt-1">
                    -1 for unlimited time.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.expert}
                      onChange={(e) => setFormData({ ...formData, expert: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
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
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingUser
                      ? 'Update User'
                      : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
