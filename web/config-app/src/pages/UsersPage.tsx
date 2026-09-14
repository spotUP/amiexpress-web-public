import { useMemo, useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, X, Search, Unlock } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { formatCount } from '../lib/format';

interface BbsUser {
  id: string;
  username: string;
  realname?: string;
  location?: string;
  phone?: string;
  email?: string;
  secLevel: number;
  timeLimit: number;
  /**
   * Whether the board will actually let them stay - the
   * `ACS.OVERRIDE_TIMELIMIT` permission on their access level, answered by
   * the server because only it can read `Access/ACS.<level>.info`. Absent
   * on an older backend, which reads as "not unlimited" and shows the
   * number instead of claiming something untrue.
   */
  unlimitedTime?: boolean;
  /** Their conference access: an area name, or the `X`/`_` flag string. */
  confAccess?: string;
  ratio: number;
  uploads: number;
  downloads: number;
  calls: number;
  expert: boolean;
  ansi: boolean;
  lastLogin?: Date;
  firstLogin: Date;
  // Lockout state off user.misc (express.e userMisc). Absent on rows the
  // backend served before it exposed them — treat as unlocked.
  accountLocked?: number;
  invalidAttempts?: number;
  forcePwdReset?: number;
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
  /**
   * Blocked, in the dialog rather than only as a row action.
   *
   * Unlocking lived on a button that appears only when the row is ALREADY
   * locked, so there was nowhere to block anybody and nowhere to look when
   * you wanted to know. A sysop editing an account expects to find it there.
   */
  accountLocked: boolean;
  /**
   * Which conferences they may join, exactly as express.e:8499-8512 reads it:
   * an AREA NAME, or the `X`/`_` flag string. The SHAPE of the value decides
   * which (express.e:458-465), so it is carried verbatim and never normalised
   * here - and the two can never be mixed on one account.
   */
  confAccess: string;
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [search, setSearch] = useState('');
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
    timeLimit: 3600,
    expert: false,
    accountLocked: false,
    confAccess: '',
  });

  /*
   * The areas a user can be put IN. Read here rather than typed by hand: an
   * access field naming an area that does not exist grants NO conference at
   * all (checkToolTypeExists on a missing file is false for every one), so a
   * free-text box would be a way to lock somebody out with a typo.
   */
  const areasQuery = useQuery({
    queryKey: ['access-areas'],
    queryFn: () => apiClient.getAccessAreas(),
  });
  const areaNames: string[] = (areasQuery.data?.data?.areas ?? []).map(
    (a: { name: string }) => a.name,
  );

  const { data, isLoading, error, refetch } = useQuery({
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
    mutationFn: ({ id, updates }: {
      id: string;
      // accountLocked is a BOOLEAN on the form and a byte on the wire, so the
      // form's version is omitted rather than intersected - the two meanings
      // cannot both be called accountLocked in one type.
      updates: Omit<Partial<UserFormData>, 'accountLocked'> & { accountLocked?: number; invalidAttempts?: number };
    }) => apiClient.updateUser(id, updates),
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
      timeLimit: 3600,
      expert: false,
      accountLocked: false,
      confAccess: '',
    });
  };

  /** Escape, the backdrop and the header's close button all end it the same way. */
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    resetForm();
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
      accountLocked: Boolean(user.accountLocked),
      confAccess: user.confAccess ?? '',
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

    // The board stores the block as a byte in user.misc, and unblocking clears
    // the failure count with it - the same pair the row's Unlock button sends,
    // so the two ways of doing it cannot disagree.
    const { accountLocked, ...rest } = submitData as typeof submitData & { accountLocked: boolean };
    const locked = accountLocked
      ? { accountLocked: 1 }
      : { accountLocked: 0, invalidAttempts: 0 };

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, updates: { ...rest, ...locked } });
    } else {
      createMutation.mutate(rest as typeof submitData);
    }
  };

  const handleDelete = async (user: BbsUser) => {
    const confirmed = await confirm({
      title: 'Delete User',
      message: `Deleting ${user.username} removes the account and its record on this board. This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      requireTypedConfirmation: user.username
    });
    if (confirmed) {
      deleteMutation.mutate(user.id);
    }
  };

  // express.e eduser page 1, C/D: clear the lock and the count that caused
  // it. Unlocking never touches anything else on the record.
  const handleUnlock = async (user: BbsUser) => {
    const confirmed = await confirm({
      title: 'Unlock account',
      message: `${user.username} is locked out${user.invalidAttempts ? ` after ${user.invalidAttempts} failed password ${user.invalidAttempts === 1 ? 'attempt' : 'attempts'}` : ''}. Unlocking clears the lock and the count; the password is unchanged.`,
      confirmText: 'Unlock',
      cancelText: 'Cancel',
    });
    if (confirmed) {
      updateMutation.mutate({ id: user.id, updates: { accountLocked: 0, invalidAttempts: 0 } });
    }
  };

  const getSecurityLevelColor = (level: number) => {
    if (level >= 255) return 'text-status-danger';
    if (level >= 200) return 'text-status-warn';
    if (level >= 100) return 'text-status-warn';
    if (level >= 50) return 'text-status-ok';
    return 'text-content-secondary';
  };

  // Use stable reference for empty fallback to prevent infinite re-renders
  const users = (data?.data ?? EMPTY_USERS) as BbsUser[];

  // Filtering stays here; the table owns sorting.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(term) ||
        (u.realname || '').toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term)
    );
  }, [users, search]);


  const columns: DataTableColumn<BbsUser>[] = [
    {
      id: 'username',
      header: 'Username',
      value: (user) => user.username,
      mono: true,
      cell: (user) => <span className="text-content-primary">{user.username}</span>,
    },
    {
      id: 'secLevel',
      header: 'Level',
      value: (user) => user.secLevel,
      align: 'right',
      mono: true,
      width: '5rem',
      cell: (user) => <span className={getSecurityLevelColor(user.secLevel)}>{user.secLevel}</span>,
    },
    {
      id: 'realname',
      header: 'Real name',
      value: (user) => user.realname ?? '',
      cell: (user) => <span className="text-content-secondary">{user.realname || '-'}</span>,
    },
    {
      id: 'email',
      header: 'Email',
      value: (user) => user.email ?? '',
      cell: (user) => <span className="truncate text-content-secondary">{user.email || '-'}</span>,
    },
    {
      id: 'calls',
      header: 'Calls',
      value: (user) => user.calls,
      align: 'right',
      mono: true,
      width: '6rem',
      cell: (user) => formatCount(user.calls),
    },
    {
      id: 'transfers',
      header: 'Up / down',
      value: (user) => user.uploads + user.downloads,
      align: 'right',
      mono: true,
      width: '8rem',
      cell: (user) => `${formatCount(user.uploads)} / ${formatCount(user.downloads)}`,
    },
    {
      id: 'timeLimit',
      header: 'Time limit',
      value: (user) => user.timeLimit,
      align: 'right',
      mono: true,
      width: '8rem',
      /*
       * TWO THINGS THIS GOT WRONG, and the sysop acted on both.
       *
       * "UNLIMITED" IS NOT A NUMBER. express.e:556-562 runs the countdown for
       * everybody and disconnects on `timeLimit<0` unless the access level
       * grants `ACS_OVERRIDE_TIMELIMIT`. A negative `timeLimit` is not
       * unlimited - `time-tracking.util.ts` coerces anything <= 0 straight
       * back to 3600 - so this row said Unlimited over a caller who had sixty
       * minutes. On this board NO level granted the permission, so the answer
       * was wrong for every account it was shown for. `unlimitedTime` is
       * computed server-side, where Access/ACS.<level>.info can be read.
       *
       * AND THE UNITS ARE SECONDS. `timeLimit` is seconds (express.e:7684
       * defaults it to 3600, and express.e:5345 divides by 60 to print it),
       * so `3600 min` was an hour shown as two and a half days.
       */
      cell: (user) => {
        if (user.unlimitedTime) return 'Unlimited';
        const seconds = user.timeLimit > 0 ? user.timeLimit : 3600;
        return `${Math.round(seconds / 60)} min`;
      },
    },
    {
      id: 'lockout',
      header: 'Lockout',
      value: (user) => (user.accountLocked ? 1 : 0),
      width: '9rem',
      // Quiet when clean: most accounts never fail a password. A lock reads
      // as a badge; a bare count reads as a count.
      cell: (user) =>
        user.accountLocked ? (
          <span className="rounded-sm bg-status-danger/20 px-1 text-status-danger">Locked</span>
        ) : (user.invalidAttempts ?? 0) > 0 ? (
          <span className="text-content-secondary">{user.invalidAttempts} fails</span>
        ) : (
          <span className="text-content-muted">-</span>
        ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-control items-center rounded border border-border bg-surface-0 px-2">
            <Search size={14} className="text-content-muted" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search username, real name or email"
              aria-label="Search users"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 bg-transparent px-2 text-sm text-content-primary placeholder:text-content-muted focus:outline-none"
            />
          </div>
          <button onClick={handleAdd} className="btn-primary flex h-control items-center gap-2 py-0 text-sm">
            <Plus size={14} aria-hidden="true" />
            <span>Add user</span>
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(user) => user.id}
        initialSort={[{ id: 'username', desc: false }]}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage={search ? 'No user matches that search.' : 'No users yet.'}
        // The whole row opens the account, not just the pencil: this is a list
        // people come to in order to change somebody, and the actions at the
        // end stop the click themselves.
        onRowClick={handleEdit}
        rowActions={(user) => (
          <>
            {(user.accountLocked || (user.invalidAttempts ?? 0) > 0) && (
              <button
                type="button"
                onClick={() => handleUnlock(user)}
                aria-label={`Unlock ${user.username}`}
                title="Clear the lock and the failure count"
                className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
              >
                <Unlock size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => handleEdit(user)}
              aria-label={`Edit ${user.username}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(user)}
              aria-label={`Delete ${user.username}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-status-danger/20 hover:text-status-danger"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      />

      <p className="mt-2 text-xs text-content-muted">
        {filtered.length === users.length
          ? `${users.length} users`
          : `${filtered.length} of ${users.length} users`}
      </p>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <Modal
          open={isModalOpen}
          title={editingUser ? 'Edit User' : 'Add User'}
          onClose={closeModal}
          maxWidth="max-w-2xl"
          showHeader={false}
        >
            <div className="sticky top-0 bg-surface-0 border-b border-border p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-accent">
                {editingUser ? 'Edit User' : 'Add User'}
              </h2>
              <button
                onClick={closeModal}
                className="text-content-secondary hover:text-content-primary transition-colors"
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
                    maxLength={31}
                  />
                  {editingUser && (
                    <p className="text-xs text-status-warn mt-1">
                      Renaming changes the account. It does NOT rewrite history:
                      messages, the callers log and file uploaders keep the name
                      they were written with.
                    </p>
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
                    <p className="text-xs text-status-danger mt-1">The passwords do not match</p>
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
                    onChange={(e) => {
                      // parseInt('') is NaN: clearing the field to type a new
                      // level must not put NaN into state and have the browser
                      // reject its own value.
                      const parsed = parseInt(e.target.value, 10);
                      setFormData({ ...formData, secLevel: Number.isNaN(parsed) ? 0 : parsed });
                    }}
                    className="input-field w-full"
                    required
                  />
                  <p className="text-xs text-content-secondary mt-1">
                    0-255 (255=Sysop, 200=Co-Sysop, 100=Privileged)
                  </p>
                </div>

                <div>
                  <label htmlFor="timeLimit" className="label">
                    Daily time limit (seconds) *
                  </label>
                  <input
                    id="timeLimit"
                    type="number"
                    // 0 is allowed and means "use the 3600 default"; there is
                    // no magic negative any more, because unlimited lives on
                    // the access level rather than in this field.
                    min="0"
                    value={formData.timeLimit}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      setFormData({ ...formData, timeLimit: Number.isNaN(parsed) ? 0 : parsed });
                    }}
                    className="input-field w-full"
                    required
                  />
                  <p className="text-xs text-content-secondary mt-1">
                    Seconds, as the BBS stores it - 3600 is one hour. Unlimited
                    time is not set here: it is the ACS.OVERRIDE_TIMELIMIT
                    permission on the access level (Security), because
                    express.e checks that, not this number. A value of 0 or
                    less is treated as 3600 when the caller logs on.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="confAccess" className="label">
                    Conference access
                  </label>
                  <select
                    id="confAccess"
                    className="input-field w-full"
                    value={areaNames.includes(formData.confAccess) ? formData.confAccess : '__other__'}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v !== '__other__') setFormData({ ...formData, confAccess: v });
                    }}
                  >
                    {areaNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    {/*
                      An account on a flag string, or on an area that no longer
                      exists, must not be silently rewritten by opening its
                      form. It shows what it actually holds and stays there
                      until the sysop picks an area on purpose.
                    */}
                    <option value="__other__">
                      {formData.confAccess
                        ? `Leave as "${formData.confAccess}"`
                        : 'Not set'}
                    </option>
                  </select>
                  <p className="text-xs text-content-secondary mt-1">
                    Which conferences they may join. Areas are defined under
                    Conferences → Access areas. An account whose value is an
                    X/_ string uses the old per-user flags instead, and keeping
                    it here is deliberate — the two cannot be mixed.
                  </p>
                </div>

                {/* Blocked, where a sysop editing an account looks for it.
                    Unblocking clears the failure count too, exactly as the
                    row's Unlock button does. */}
                {editingUser && (
                  <div className="md:col-span-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.accountLocked}
                        onChange={(e) => setFormData({ ...formData, accountLocked: e.target.checked })}
                        className="form-checkbox h-5 w-5 text-accent"
                      />
                      <span className="text-content-primary">
                        Blocked (cannot log in)
                        {!formData.accountLocked && (editingUser.invalidAttempts ?? 0) > 0 && (
                          <span className="text-content-secondary">
                            {' '}- clears {editingUser.invalidAttempts} failed password
                            {editingUser.invalidAttempts === 1 ? ' attempt' : ' attempts'}
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                )}

                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.expert}
                      onChange={(e) => setFormData({ ...formData, expert: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Expert Mode (skip prompts and menus)</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-border">
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
        </Modal>
      )}
    </div>
  );
}
