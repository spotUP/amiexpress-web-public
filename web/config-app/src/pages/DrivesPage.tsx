import { useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Edit2,
  Trash2,
  Plus,
  X,
  KeyRound,
  PlugZap,
  FolderOpen,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { StatusDot } from '../components/ui/StatusDot';
import { StatTile } from '../components/ui/StatTile';
import { formatBytes, formatCount } from '../lib/format';

/** A stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_DRIVES: DriveConfig[] = [];
const EMPTY_CONTENTS: FileEntryRow[] = [];

type VolumeClass = 'FREE' | 'PAID';
type EgressPosture = 'FREE' | 'METERED' | '3X';

interface DriveConfig {
  id: number;
  drive_number: number;
  drive_path: string;
  enabled: boolean;
  description?: string;
  created_at: Date;
  updated_at: Date;
  kind: 'local' | 's3';
  quotaBytes?: number;
  usedBytes: number;
  volumeClass: VolumeClass;
  egress: EgressPosture;
  retentionDays?: number;
  keyId?: string;
  requestBudget?: number;
  requestsThisMonth?: number;
  /** False means no usable secret is on file - the drive is unreachable regardless of `degraded`. */
  secretConfigured: boolean;
  /** Undefined when no live process context exists yet to ask (Task 12). */
  inPool?: boolean;
  degraded: boolean;
  outOfRequests: boolean;
}

interface FileEntryRow {
  id: number;
  filename: string;
  size: number;
  uploader: string;
  downloads: number;
}

interface ParkedFileRow {
  driveNumber: number;
  /** A display label, not the pool object's key - see FileCache.discardParked. */
  label: string;
  localPath: string;
  sizeBytes: number;
}

interface PoolStatus {
  cacheActive: boolean;
  overBudgetBytes: number;
  evictionDisabled: boolean;
  parkedFiles: ParkedFileRow[];
  /** Every complaint the board's own usableRemoteAreasFor would emit, verbatim. */
  brokenAreas: string[];
  /**
   * Non-null when the LAST build/refresh attempt failed - never set merely
   * because no bucket is configured. Two shapes, told apart by
   * `cacheActive`: false+set means the pool has never built successfully;
   * true+set means a LATER refresh (a conference save, a Drives.info write)
   * failed but the board is still serving the last configuration that did.
   */
  bootError: string | null;
  /** Staged uploads FileCache still owes the pool right now. Undefined with no live context. */
  pendingUploads?: number;
}

interface DriveFormData {
  drive_number: number;
  drive_path: string;
  description: string;
  enabled: boolean;
}

const EMPTY_PARKED: ParkedFileRow[] = [];
const EMPTY_BROKEN: string[] = [];

export function DrivesPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDrive, setEditingDrive] = useState<DriveConfig | null>(null);
  const [formData, setFormData] = useState<DriveFormData>({
    drive_number: 0,
    drive_path: '',
    description: '',
    enabled: true,
  });
  const [secretDrive, setSecretDrive] = useState<DriveConfig | null>(null);
  const [secretValue, setSecretValue] = useState('');
  const [contentsDrive, setContentsDrive] = useState<DriveConfig | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['drives'],
    queryFn: () => apiClient.getDrives(),
  });

  const poolStatusQuery = useQuery({
    queryKey: ['drives', 'pool-status'],
    queryFn: () => apiClient.getDrivePoolStatus(),
  });

  const contentsQuery = useQuery({
    queryKey: ['drives', 'contents', contentsDrive?.drive_number],
    queryFn: () => apiClient.getDriveContents(contentsDrive!.drive_number),
    enabled: contentsDrive !== null,
  });

  const createMutation = useMutation({
    mutationFn: (drive: DriveFormData) => apiClient.createDrive(drive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drives'] });
      showSuccess('Drive created successfully');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to create drive: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<DriveFormData> }) =>
      apiClient.updateDrive(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drives'] });
      showSuccess('Drive updated successfully');
      setIsModalOpen(false);
      setEditingDrive(null);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to update drive: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteDrive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drives'] });
      showSuccess('Drive deleted successfully');
    },
    onError: (error: Error) => {
      showError(`Failed to delete drive: ${error.message}`);
    },
  });

  const secretMutation = useMutation({
    mutationFn: ({ driveNumber, secret }: { driveNumber: number; secret: string }) =>
      apiClient.writeDriveSecret(driveNumber, secret),
    onSuccess: () => {
      showSuccess('Secret saved');
      setSecretDrive(null);
      setSecretValue('');
    },
    onError: (error: Error) => {
      showError(`Failed to save secret: ${error.message}`);
    },
  });

  const testMutation = useMutation({
    mutationFn: (driveNumber: number) => apiClient.testDrive(driveNumber),
    onSuccess: (res: any) => {
      const result = res?.data;
      if (result?.reachable) {
        showSuccess('Drive is reachable');
      } else {
        showError(`Drive is not reachable: ${result?.error ?? 'unknown error'}`);
      }
    },
    onError: (error: Error) => {
      showError(`Test failed: ${error.message}`);
    },
  });

  const discardMutation = useMutation({
    mutationFn: (localPath: string) => apiClient.discardParkedFile(localPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drives', 'pool-status'] });
      showSuccess('Parked file discarded');
    },
    onError: (error: Error) => {
      showError(`Failed to discard: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      drive_number: 0,
      drive_path: '',
      description: '',
      enabled: true,
    });
  };

  /** Escape, the backdrop and the header's close button all end it the same way. */
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDrive(null);
    resetForm();
  };

  const handleAdd = () => {
    resetForm();
    setEditingDrive(null);
    setIsModalOpen(true);
  };

  const handleEdit = (drive: DriveConfig) => {
    setFormData({
      drive_number: drive.drive_number,
      drive_path: drive.drive_path,
      description: drive.description || '',
      enabled: drive.enabled,
    });
    setEditingDrive(drive);
    setIsModalOpen(true);
  };

  /**
   * A confirm-dialog message naming what an action actually orphans, using
   * the row's own `usedBytes` plus a live file count from `/contents` - the
   * same two numbers the page already fetches for the Contents modal. Falls
   * back to the plain `whatHappens` sentence for a local drive (nothing
   * pooled to orphan) or if the contents fetch itself fails - a failed
   * warning must never block the confirm dialog from appearing at all.
   */
  const orphanImpactMessage = async (drive: DriveConfig, whatHappens: string): Promise<string> => {
    if (drive.kind !== 's3') return whatHappens;
    try {
      const res = await apiClient.getDriveContents(drive.drive_number);
      const files = (res?.data ?? []) as FileEntryRow[];
      if (files.length === 0) return whatHappens;
      return (
        `Drive ${drive.drive_number} holds ${files.length} file${files.length === 1 ? '' : 's'} ` +
        `(${formatBytes(drive.usedBytes)}). ${whatHappens}`
      );
    } catch {
      return whatHappens;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDrive) {
      if (editingDrive.kind === 's3' && formData.drive_path !== editingDrive.drive_path) {
        const message = await orphanImpactMessage(
          editingDrive,
          `Changing this drive's path points every read and write at a different bucket - the files ` +
            `already there become unreachable through this drive until you point it back.`
        );
        const confirmed = await confirm({
          title: 'Change Drive Path',
          message,
          confirmText: 'Change Path',
          cancelText: 'Cancel',
          type: 'danger',
        });
        if (!confirmed) return;
      }
      updateMutation.mutate({ id: editingDrive.id, updates: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = async (drive: DriveConfig) => {
    const message = await orphanImpactMessage(
      drive,
      `Deleting drive ${drive.drive_number} (${drive.drive_path}) makes every one of them unreachable ` +
        `until you re-add the drive.`
    );
    const confirmed = await confirm({
      title: 'Delete Drive',
      message,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(drive.id);
    }
  };

  const handleSecretSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretDrive || secretValue.trim() === '') return;
    secretMutation.mutate({ driveNumber: secretDrive.drive_number, secret: secretValue });
  };

  const handleDiscardParked = async (file: ParkedFileRow) => {
    const confirmed = await confirm({
      title: 'Discard Parked File',
      message: `Permanently delete the quarantined bytes at ${file.localPath}? This cannot be undone. There is no promotion path: recover the file yourself first if you need it.`,
      confirmText: 'Discard',
      cancelText: 'Cancel',
      type: 'danger',
    });
    if (confirmed) {
      discardMutation.mutate(file.localPath);
    }
  };

  const drives = (data?.data ?? EMPTY_DRIVES) as DriveConfig[];
  const poolStatus = poolStatusQuery.data?.data as PoolStatus | undefined;
  const parkedFiles = poolStatus?.parkedFiles ?? EMPTY_PARKED;
  const brokenAreas = poolStatus?.brokenAreas ?? EMPTY_BROKEN;
  const contents = (contentsQuery.data?.data ?? EMPTY_CONTENTS) as FileEntryRow[];

  const columns: DataTableColumn<DriveConfig>[] = [
    {
      id: 'status',
      header: 'Status',
      // Ordered worst-first so a sort brings the drive that needs attention
      // to the top. A missing secret or a drive VolumeSet dropped at
      // construction ranks above `degraded`/`outOfRequests`, which can only
      // ever be true for a drive that made it INTO the pool in the first
      // place - `secretConfigured`/`inPool` are the checks that catch the
      // drive neither of those two flags can see at all.
      value: (drive) => {
        if (drive.kind !== 's3') return 0;
        if (!drive.secretConfigured) return 5;
        if (drive.inPool === false) return 4;
        if (drive.degraded) return 4;
        if (drive.outOfRequests) return 3;
        if (drive.inPool === undefined) return 1;
        return 0;
      },
      width: '11rem',
      cell: (drive) => {
        if (drive.kind !== 's3') return <StatusDot tone="neutral" label="Local" />;
        // A missing secret is a disk fact, true with or without a live
        // process - the drive is unreachable regardless of what `degraded`
        // says, because `degraded`/`outOfRequests` only exist on a
        // VolumeState this drive was never admitted into.
        if (!drive.secretConfigured) return <StatusDot tone="danger" label="No secret" />;
        // Has a secret but VolumeSet.fromBoard still dropped it (bad KEYID,
        // bad ENDPOINT, an s3://bucket/prefix target) - a live context is the
        // only way to know this, and it says so plainly rather than the
        // silent "OK" a drive left out of the pool used to render.
        if (drive.inPool === false) return <StatusDot tone="danger" label="Disabled (misconfigured)" />;
        if (drive.degraded) return <StatusDot tone="danger" label="Degraded" />;
        if (drive.outOfRequests) return <StatusDot tone="warn" label="Out of requests" />;
        // No live context to ask at all (Task 12 has not booted one yet) -
        // hollow reads as "unknown", never as "healthy".
        if (drive.inPool === undefined) return <StatusDot tone="hollow" label="Unknown" />;
        return <StatusDot tone="ok" label="OK" />;
      },
    },
    {
      id: 'drive_number',
      header: 'Drive',
      value: (drive) => drive.drive_number,
      align: 'right',
      mono: true,
      width: '5rem',
    },
    {
      id: 'kind',
      header: 'Kind',
      value: (drive) => drive.kind,
      width: '5rem',
      cell: (drive) => <span className="text-content-secondary">{drive.kind === 's3' ? 'S3' : 'Local'}</span>,
    },
    {
      id: 'drive_path',
      header: 'Path',
      value: (drive) => drive.drive_path,
      mono: true,
      cell: (drive) => (
        <span className="block max-w-xs truncate text-content-secondary" title={drive.drive_path}>{drive.drive_path}</span>
      ),
    },
    {
      id: 'volumeClass',
      header: 'Class',
      value: (drive) => (drive.kind === 's3' ? drive.volumeClass : ''),
      width: '5rem',
      cell: (drive) => (drive.kind === 's3' ? <span className="text-content-secondary">{drive.volumeClass}</span> : null),
    },
    {
      id: 'egress',
      header: 'Egress',
      value: (drive) => (drive.kind === 's3' ? drive.egress : ''),
      width: '6rem',
      cell: (drive) => (drive.kind === 's3' ? <span className="text-content-secondary">{drive.egress}</span> : null),
    },
    {
      id: 'usage',
      header: 'Used / Quota',
      value: (drive) => drive.usedBytes,
      align: 'right',
      width: '12rem',
      cell: (drive) => {
        if (drive.kind !== 's3') return null;
        const used = formatBytes(drive.usedBytes);
        if (drive.quotaBytes === undefined) {
          return <span className="text-content-secondary">{used} (no quota)</span>;
        }
        const quota = formatBytes(drive.quotaBytes);
        const pct = drive.quotaBytes > 0 ? Math.min(100, (drive.usedBytes / drive.quotaBytes) * 100) : 0;
        return (
          <div className="flex flex-col gap-1">
            <span className="text-content-secondary">{used} of {quota}</span>
            <div className="h-1 w-full rounded-full bg-surface-3">
              <div
                className={`h-1 rounded-full ${pct >= 90 ? 'bg-status-danger' : pct >= 70 ? 'bg-status-warn' : 'bg-accent'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      id: 'retentionDays',
      header: 'Retention',
      value: (drive) => drive.retentionDays ?? -1,
      align: 'right',
      width: '6rem',
      cell: (drive) => (
        <span className="text-content-secondary">
          {drive.retentionDays === undefined ? '-' : `${drive.retentionDays}d`}
        </span>
      ),
    },
    {
      id: 'requestBudget',
      header: 'Requests',
      value: (drive) => drive.requestBudget ?? -1,
      align: 'right',
      width: '9rem',
      cell: (drive) => {
        if (drive.requestBudget === undefined) return <span className="text-content-muted">-</span>;
        const used = drive.requestsThisMonth ?? 0;
        return (
          <span className={drive.outOfRequests ? 'text-status-danger' : 'text-content-secondary'}>
            {formatCount(used)} / {formatCount(drive.requestBudget)}
          </span>
        );
      },
    },
    {
      id: 'description',
      header: 'Description',
      value: (drive) => drive.description ?? '',
      cell: (drive) => (
        <span className="block max-w-sm truncate text-content-secondary">{drive.description || '-'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4 flex justify-between items-center">
          <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
            <Plus size={20} />
            <span>Add Drive</span>
          </button>
        </div>

        <DataTable
          columns={columns}
          rows={drives}
          getRowId={(drive) => String(drive.id)}
          initialSort={[{ id: 'drive_number', desc: false }]}
          isLoading={isLoading}
          error={error as Error | null}
          onRetry={() => refetch()}
          emptyMessage="No drives configured. Add drive mappings to define BBS storage locations."
          rowActions={(drive) => (
            <>
              <button
                type="button"
                onClick={() => setContentsDrive(drive)}
                aria-label={`Contents of drive ${drive.drive_number}`}
                title="Contents"
                className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
              >
                <FolderOpen size={14} />
              </button>
              {drive.kind === 's3' && (
                <>
                  <button
                    type="button"
                    onClick={() => testMutation.mutate(drive.drive_number)}
                    aria-label={`Test drive ${drive.drive_number}`}
                    title="Test connectivity"
                    className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
                  >
                    <PlugZap size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSecretDrive(drive); setSecretValue(''); }}
                    aria-label={`Set secret for drive ${drive.drive_number}`}
                    title="Set secret key"
                    className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
                  >
                    <KeyRound size={14} />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => handleEdit(drive)}
                aria-label={`Edit drive ${drive.drive_number}`}
                className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
              >
                <Edit2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(drive)}
                aria-label={`Delete drive ${drive.drive_number}`}
                className="rounded p-1 text-content-secondary transition-colors hover:bg-status-danger/20 hover:text-status-danger"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        />
      </div>

      {/* Pool status: parked files, eviction shortfall, broken areas. */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-content-muted">Pool Status</h2>

        {!poolStatusQuery.isLoading && poolStatus && !poolStatus.cacheActive && poolStatus.bootError && (
          <div className="space-y-2 rounded border border-status-danger/40 bg-status-danger/10 p-3">
            <div className="flex items-center gap-2 text-status-danger">
              <AlertTriangle size={16} aria-hidden="true" />
              <span className="text-sm font-medium">The storage pool failed to build</span>
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-content-secondary">
              {poolStatus.bootError}
            </pre>
          </div>
        )}

        {!poolStatusQuery.isLoading && poolStatus && !poolStatus.cacheActive && !poolStatus.bootError && (
          <p className="text-sm text-content-muted">
            The storage cache is not active on this process. Parked-file and eviction status will appear here once it is.
          </p>
        )}

        {poolStatus && poolStatus.cacheActive && poolStatus.bootError && (
          <div className="space-y-2 rounded border border-status-warn/40 bg-status-warn/10 p-3">
            <div className="flex items-center gap-2 text-status-warn">
              <AlertTriangle size={16} aria-hidden="true" />
              <span className="text-sm font-medium">
                The last refresh failed - still running the previous configuration
              </span>
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-content-secondary">
              {poolStatus.bootError}
            </pre>
          </div>
        )}

        {poolStatus && poolStatus.cacheActive && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatTile label="Parked Files" value={String(parkedFiles.length)} />
            <StatTile
              label="Pending Uploads"
              value={String(poolStatus.pendingUploads ?? 0)}
              tone={(poolStatus.pendingUploads ?? 0) > 0 ? 'warn' : 'ok'}
            />
            <StatTile
              label="Over Budget"
              value={formatBytes(poolStatus.overBudgetBytes)}
              tone={poolStatus.overBudgetBytes > 0 ? 'danger' : 'ok'}
            />
            <StatTile
              label="Eviction"
              value={poolStatus.evictionDisabled ? 'Disabled' : 'Running'}
              tone={poolStatus.evictionDisabled ? 'danger' : 'ok'}
            />
          </div>
        )}

        {brokenAreas.length > 0 && (
          <div className="space-y-2 rounded border border-status-danger/40 bg-status-danger/10 p-3">
            <div className="flex items-center gap-2 text-status-danger">
              <AlertTriangle size={16} aria-hidden="true" />
              <span className="text-sm font-medium">
                {brokenAreas.length} area{brokenAreas.length === 1 ? '' : 's'} broken - treated as local disk until fixed
              </span>
            </div>
            <div className="divide-y divide-border">
              {brokenAreas.map((message) => (
                <div key={message} className="py-1.5 text-sm text-content-secondary">
                  {message}
                </div>
              ))}
            </div>
          </div>
        )}

        {poolStatus && poolStatus.cacheActive && parkedFiles.length > 0 && (
          <div className="space-y-2 rounded border border-status-warn/40 bg-status-warn/10 p-3">
            <p className="text-sm text-content-secondary">
              Quarantined files nobody has vouched for. Resolution is manual: recover the bytes yourself and
              re-upload if you need them, or discard them below. There is no promotion path.
            </p>
            <div className="divide-y divide-border">
              {parkedFiles.map((f) => (
                <div key={f.localPath} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate font-mono text-content-secondary" title={f.localPath}>
                    Drive {f.driveNumber}: {f.label}
                  </span>
                  <span className="shrink-0 font-mono text-content-muted">{formatBytes(f.sizeBytes)}</span>
                  <button
                    type="button"
                    onClick={() => handleDiscardParked(f)}
                    aria-label={`Discard parked file ${f.label}`}
                    className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-status-danger transition-colors hover:bg-status-danger/20"
                  >
                    <Ban size={12} aria-hidden="true" />
                    Discard
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <Modal
          open={isModalOpen}
          title={editingDrive ? 'Edit Drive' : 'Add Drive'}
          onClose={closeModal}
          maxWidth="max-w-md"
          showHeader={false}
        >
            <div className="border-b border-border p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-accent">
                {editingDrive ? 'Edit Drive' : 'Add Drive'}
              </h2>
              <button
                onClick={closeModal}
                className="text-content-secondary hover:text-content-primary transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label htmlFor="drive_number" className="label">Drive Number *</label>
                <input
                  id="drive_number"
                  type="number"
                  min="0"
                  max="255"
                  value={formData.drive_number}
                  onChange={(e) => setFormData({ ...formData, drive_number: parseInt(e.target.value) })}
                  className="input-field w-full"
                  required
                  disabled={editingDrive?.kind === 's3'}
                />
                {editingDrive?.kind === 's3' && (
                  <p className="mt-1 text-xs text-content-muted">
                    Renumbering a pooled drive would strand its QUOTA/KEYID/ENDPOINT sub-keys under the old
                    number and leave the new number with no credentials. Delete and re-add it instead.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="drive_path" className="label">Drive Path *</label>
                <input
                  id="drive_path"
                  type="text"
                  value={formData.drive_path}
                  onChange={(e) => setFormData({ ...formData, drive_path: e.target.value })}
                  className="input-field w-full font-mono"
                  placeholder="/path/to/drive or s3://bucket"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="label">Description</label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input-field w-full"
                  rows={3}
                  placeholder="Optional description..."
                />
              </div>

              {editingDrive ? (
                // No checkbox here. Unchecking it used to write `enabled: false`,
                // which made writeDrivesInfoFile OMIT the DRIVE.n line entirely -
                // a full removal from Drives.info, silently, with no confirmation
                // and no impact message. Removing a drive is what Delete is for;
                // it now says what that orphans (see handleDelete).
                <p className="text-xs text-content-muted">
                  To remove this drive, close this dialog and use Delete instead - it will tell you what that
                  orphans.
                </p>
              ) : (
                <div>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Enabled</span>
                  </label>
                </div>
              )}

              <p className="text-xs text-content-muted">
                Quota, class, egress, retention, key id and request budget are read from the DRIVE.n.* sub-keys
                in Drives.info. Edit those by hand for now; this form manages the base path only.
              </p>

              <div className="flex justify-end space-x-4 pt-6 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingDrive(null);
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
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingDrive ? 'Update Drive' : 'Create Drive'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* Secret modal - write-only. The value is never populated from a GET. */}
      {secretDrive && (
        <Modal
          open={secretDrive !== null}
          title={`Set Secret Key - Drive ${secretDrive.drive_number}`}
          onClose={() => { setSecretDrive(null); setSecretValue(''); }}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSecretSubmit} className="space-y-4">
            <p className="text-sm text-content-secondary">
              Writes Storage/{secretDrive.drive_number}.key at 0600. The current secret, if any, is never shown
              here or returned by the API - this field is write-only.
            </p>
            <div>
              <label htmlFor="secret-key" className="label">Secret Key *</label>
              <input
                id="secret-key"
                type="password"
                autoComplete="new-password"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                className="input-field w-full font-mono"
                placeholder="Enter secret key"
                required
              />
            </div>
            <div className="flex justify-end space-x-4 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => { setSecretDrive(null); setSecretValue(''); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={secretMutation.isPending || secretValue.trim() === ''}
              >
                {secretMutation.isPending ? 'Saving...' : 'Save Secret'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Contents modal - "what would be lost if this volume disappeared". */}
      {contentsDrive && (
        <Modal
          open={contentsDrive !== null}
          title={`Contents - Drive ${contentsDrive.drive_number}`}
          onClose={() => setContentsDrive(null)}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            {contentsDrive.retentionDays !== undefined && (
              <p className="rounded border border-status-warn/40 bg-status-warn/10 p-3 text-sm text-content-secondary">
                This drive has a minimum retention of {contentsDrive.retentionDays} days. A file removed from the
                catalog may still be billed for that long before the provider actually deletes it.
              </p>
            )}
            <DataTable
              columns={[
                { id: 'filename', header: 'Filename', value: (r: FileEntryRow) => r.filename, mono: true },
                {
                  id: 'size',
                  header: 'Size',
                  value: (r: FileEntryRow) => r.size,
                  align: 'right',
                  mono: true,
                  width: '8rem',
                  cell: (r: FileEntryRow) => <span>{formatBytes(r.size)}</span>,
                },
                { id: 'uploader', header: 'Uploader', value: (r: FileEntryRow) => r.uploader, width: '10rem' },
                {
                  id: 'downloads',
                  header: 'Downloads',
                  value: (r: FileEntryRow) => r.downloads,
                  align: 'right',
                  width: '8rem',
                },
              ]}
              rows={contents}
              getRowId={(r: FileEntryRow) => String(r.id)}
              isLoading={contentsQuery.isLoading}
              error={contentsQuery.error as Error | null}
              emptyMessage="No files on this drive."
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
