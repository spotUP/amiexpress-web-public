import { useMemo, useRef, useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { DoorSettingsForm } from '../components/DoorSettingsForm';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, X, FileCode, Save, Power, PowerOff, Search, Upload, SlidersHorizontal } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Door } from '../types';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';

/** A stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_DOORS: Door[] = [];

/**
 * Per-command flags express.e's runCommand() reads straight off the
 * command's own BBSCmd/SysCmd tooltype (express.e:4732-4804). These are
 * boolean: presence on the icon is the "on" state, whatever value is
 * stored - the same rule the raw tooltype table below already follows for
 * every other flag on a door's .info.
 */
const COMMAND_FLAG_TOOLTYPES: Array<{ key: string; label: string; help: string }> = [
  { key: 'SILENT', label: 'Silent', help: "Suppresses the command's normal banner and status output." },
  { key: 'EXPERT_MODE', label: 'Expert Mode Only', help: 'Offered only to callers who have expert mode switched on.' },
  { key: 'LOG_INPUTS', label: 'Log Inputs', help: "Logs this command's keystrokes." },
  { key: 'QUICKMODE', label: 'Quick Mode', help: "Skipped when the caller's own quick flag (Q) is set." },
  { key: 'TRAPON', label: 'Trap On', help: 'Traps errors and Ctrl-C while the command runs.' },
  { key: 'SCRIPTCHECK', label: 'Script Check', help: 'Marks the command file as a script. Only takes effect for SIM/TIM/IIM/SUP doors.' },
];

/**
 * What the form can actually change.
 *
 * `description`, `runtime_env` and `time_limit` were on it and are not here.
 * A door is defined by its .info tooltypes and none of the three has one -
 * DOOR_FIELD_TOOLTYPES says so, and inventing keys would put values in a
 * door's icon that AmiExpress never reads. The API DERIVES runtime_env from
 * the door type and serves time_limit as a hardcoded 30, so both read back
 * wrong whatever was typed, and description comes from a TypeScript door's
 * package.json. All three are still shown in the list; none of them is a
 * control any more.
 */
interface DoorFormData {
  door_name: string;
  door_command: string;
  door_type: string;
  door_path: string;
  min_security_level: number;
  enabled: boolean;
}

interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
  originalLine: string;
}

export function DoorsPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoor, setEditingDoor] = useState<Door | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [search, setSearch] = useState('');
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<DoorFormData>({
    door_name: '',
    door_command: '',
    door_type: 'XIM',
    door_path: '',
    min_security_level: 0,
    enabled: true,
  });

  // Info editor modal state
  const [isInfoEditorOpen, setIsInfoEditorOpen] = useState(false);
  const [editingInfoDoor, setEditingInfoDoor] = useState<Door | null>(null);
  const [tooltypes, setTooltypes] = useState<Tooltype[]>([]);
  const [infoDirty, setInfoDirty] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['doors'],
    queryFn: () => apiClient.getDoors(),
  });

  const createMutation = useMutation({
    mutationFn: (door: DoorFormData) => apiClient.createDoor(door),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doors'] });
      showSuccess('Door created successfully');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to create door: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: {
      id: number;
      // original_command is not a form field: it is the name the dialog opened
      // on, which is how the server finds the door when the Command box holds
      // a new one.
      updates: Partial<DoorFormData> & { original_command?: string };
    }) => apiClient.updateDoor(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doors'] });
      showSuccess('Door updated successfully');
      setIsModalOpen(false);
      setEditingDoor(null);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to update door: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (command: string) => apiClient.deleteDoor(command),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doors'] });
      showSuccess('Door deleted successfully');
    },
    onError: (error: Error) => {
      showError(`Failed to delete door: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      door_name: '',
      door_command: '',
      door_type: 'XIM',
      door_path: '',
      min_security_level: 0,
      enabled: true,
    });
  };

  /** Escape, the backdrop and the header's close button all end it the same way. */
  const closeDoorModal = () => {
    setIsModalOpen(false);
    setEditingDoor(null);
    resetForm();
  };

  /** The .info editor asks before throwing away unsaved tooltypes. */
  const closeInfoEditor = () => {
    if (infoDirty) {
      if (window.confirm('You have unsaved changes. Discard them?')) {
        setIsInfoEditorOpen(false);
        setEditingInfoDoor(null);
        setInfoDirty(false);
      }
    } else {
      setIsInfoEditorOpen(false);
      setEditingInfoDoor(null);
    }
  };

  const handleAdd = () => {
    resetForm();
    setEditingDoor(null);
    setIsModalOpen(true);
  };

  const handleEdit = (door: Door) => {
    setFormData({
      door_name: door.door_name,
      door_command: door.door_command,
      door_type: door.door_type,
      door_path: door.door_path,
      min_security_level: door.min_security_level,
      enabled: door.enabled,
    });
    setEditingDoor(door);
    setIsModalOpen(true);
  };

  /**
   * Whatever the door-settings section has unsaved, if anything.
   *
   * The dialog has two save buttons - Update Door for the registration, Save
   * settings for the door's own settings - and the first sysop to use the
   * feature typed an address, pressed Update Door, and lost it. Update Door
   * saves both now; the settings button stays for saving those alone.
   */
  const pendingSettingsSave = useRef<(() => Promise<unknown>) | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Settings first: if they fail, the message names the setting, and the
    // door's own fields have not been touched yet.
    const saveSettings = pendingSettingsSave.current;
    if (saveSettings) {
      try {
        await saveSettings();
      } catch {
        return; // The form has already reported which setting the API refused.
      }
    }

    if (editingDoor) {
      // The command the dialog opened on identifies the door on disk, so the
      // Command box is free to hold a new name: without this the save looked
      // the door up by what was just typed, and renaming a command reported
      // the new name as a door that does not exist.
      updateMutation.mutate({
        id: editingDoor.id,
        updates: { ...formData, original_command: editingDoor.door_command },
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = async (door: Door) => {
    const confirmed = await confirm({
      title: 'Delete door',
      message: `Deleting ${door.door_name} removes its entry from Commands/BBSCmd/${door.door_command}.info. Callers lose the command immediately.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      // A door removed by mistake takes its tooltypes with it. Type the
      // command back before this goes ahead.
      requireTypedConfirmation: door.door_command
    });
    if (confirmed) {
      deleteMutation.mutate(door.door_command);
    }
  };

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleUploadChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const uploadResult = await apiClient.uploadDoorArchive(file);
      const archivePath = uploadResult.data?.path;
      const filename = uploadResult.data?.filename || uploadResult.data?.originalname;

      const installResult = await apiClient.installDoorArchive({
        path: archivePath,
        filename,
      });

      showSuccess(installResult.message || 'Door archive installed successfully');
      queryClient.invalidateQueries({ queryKey: ['doors'] });
    } catch (error) {
      showError(`Door upload failed: ${(error as Error).message}`);
    } finally {
      setIsUploading(false);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
    }
  };

  const handleEditInfo = async (door: Door) => {
    try {
      // Load the door's .info file from Commands/BBSCmd/{command}.info
      const infoPath = `Commands/BBSCmd/${door.door_command}.info`;
      const response = await apiClient.getInfoFile(infoPath);

      setTooltypes(response.data?.tooltypes || []);
      setEditingInfoDoor(door);
      setInfoDirty(false);
      setIsInfoEditorOpen(true);
    } catch (error) {
      showError(`Failed to load .info file: ${(error as Error).message}`);
    }
  };

  const handleInfoSave = async () => {
    if (!editingInfoDoor) return;

    try {
      const infoPath = `Commands/BBSCmd/${editingInfoDoor.door_command}.info`;
      await apiClient.updateInfoFile(infoPath, tooltypes);

      showSuccess('Door .info file saved successfully');
      setInfoDirty(false);
      setIsInfoEditorOpen(false);
      setEditingInfoDoor(null);
      queryClient.invalidateQueries({ queryKey: ['doors'] });
    } catch (error) {
      showError(`Failed to save .info file: ${(error as Error).message}`);
    }
  };

  const handleTooltypeToggle = (index: number) => {
    const updated = [...tooltypes];
    updated[index] = { ...updated[index], commented: !updated[index].commented };
    setTooltypes(updated);
    setInfoDirty(true);
  };

  const handleTooltypeUpdate = (index: number, field: 'key' | 'value', newValue: string) => {
    const updated = [...tooltypes];
    updated[index] = { ...updated[index], [field]: newValue };
    setTooltypes(updated);
    setInfoDirty(true);
  };

  const handleTooltypeAdd = () => {
    setTooltypes([...tooltypes, { key: '', value: '', commented: false, originalLine: '' }]);
    setInfoDirty(true);
  };

  const handleTooltypeRemove = (index: number) => {
    setTooltypes(tooltypes.filter((_, i) => i !== index));
    setInfoDirty(true);
  };

  /**
   * The named command flags read and write the SAME tooltype list the raw
   * table below edits - there is no second path to the .info file. A flag is
   * "on" when its key is present and not commented out; turning it off
   * removes the row entirely, matching how the boolean tooltypes in
   * bbsConfig.info are stored (presence, not a value).
   */
  const findCommandFlagIndex = (key: string) =>
    tooltypes.findIndex((t) => t.key.toUpperCase() === key);

  const isCommandFlagSet = (key: string): boolean => {
    const idx = findCommandFlagIndex(key);
    return idx !== -1 && !tooltypes[idx].commented;
  };

  const setCommandFlag = (key: string, checked: boolean) => {
    const idx = findCommandFlagIndex(key);
    if (checked) {
      if (idx !== -1 && !tooltypes[idx].commented) return;
      if (idx !== -1) {
        const updated = [...tooltypes];
        updated[idx] = { ...updated[idx], commented: false };
        setTooltypes(updated);
      } else {
        setTooltypes([...tooltypes, { key, value: '', commented: false, originalLine: `${key}=` }]);
      }
    } else {
      if (idx === -1) return;
      setTooltypes(tooltypes.filter((_, i) => i !== idx));
    }
    setInfoDirty(true);
  };

  /** PASS_PARAMETERS and MIMICVER carry a real value, not just presence. */
  const getCommandFlagValue = (key: string): string => {
    const idx = findCommandFlagIndex(key);
    return idx !== -1 ? tooltypes[idx].value : '';
  };

  const setCommandFlagValue = (key: string, value: string) => {
    const idx = findCommandFlagIndex(key);
    if (!value) {
      if (idx === -1) return;
      setTooltypes(tooltypes.filter((_, i) => i !== idx));
      setInfoDirty(true);
      return;
    }
    if (idx === -1) {
      setTooltypes([...tooltypes, { key, value, commented: false, originalLine: `${key}=${value}` }]);
    } else {
      const updated = [...tooltypes];
      updated[idx] = { ...updated[idx], value, commented: false };
      setTooltypes(updated);
    }
    setInfoDirty(true);
  };

  const doors: Door[] = data?.data ?? EMPTY_DOORS;

  // Filtering stays here; the table owns sorting. A board runs dozens of
  // doors, and the sysop looking for one knows its command or its name - or
  // only that it is a 68K door, which is what the type and runtime fields
  // answer.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return doors;
    return doors.filter((door) =>
      [
        door.door_name,
        door.door_command,
        door.door_type,
        door.runtime_env,
        door.door_path,
        door.enabled ? 'enabled' : 'disabled',
      ].some((field) => String(field ?? '').toLowerCase().includes(term))
    );
  }, [doors, search]);

  const columns: DataTableColumn<Door>[] = [
    {
      id: 'enabled',
      header: 'Status',
      value: (door) => (door.enabled ? 1 : 0),
      width: '9rem',
      cell: (door) =>
        door.enabled ? (
          <span className="inline-flex items-center gap-1 rounded bg-status-ok/20 px-2 py-0.5 text-xs text-status-ok">
            <Power size={11} aria-hidden="true" /> Enabled
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-2 py-0.5 text-xs text-content-muted">
            <PowerOff size={11} aria-hidden="true" /> Disabled
          </span>
        ),
    },
    {
      id: 'door_name',
      header: 'Name',
      value: (door) => door.door_name,
      cell: (door) => (
        <span className="inline-flex items-center gap-2">
          <span className="text-content-primary">{door.door_name}</span>
          {/*
            This door describes what it can be configured with, so the .info
            editor shows a form for it. Without the badge the list gives a
            sysop no way to tell which doors those are short of opening each
            one - the API has said so all along and nothing read it.
          */}
          {door.has_settings && (
            <span
              className="inline-flex items-center gap-1 rounded bg-surface-3 px-2 py-0.5 text-xs text-content-secondary"
              title="This door describes its own settings - open the .info editor to change them"
            >
              <SlidersHorizontal size={11} aria-hidden="true" /> Settings
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'door_command',
      header: 'Command',
      value: (door) => door.door_command,
      mono: true,
      width: '10rem',
      cell: (door) => <span className="text-content-primary">{door.door_command}</span>,
    },
    {
      id: 'description',
      header: 'Description',
      value: (door) => door.description ?? '',
      cell: (door) => (
        <span className="block max-w-md truncate text-content-secondary" title={door.description}>
          {door.description}
        </span>
      ),
    },
    {
      id: 'door_type',
      header: 'Type',
      value: (door) => door.door_type,
      mono: true,
      width: '7rem',
    },
    {
      id: 'runtime_env',
      header: 'Runtime',
      value: (door) => door.runtime_env,
      mono: true,
      width: '8rem',
    },
    {
      id: 'min_security_level',
      header: 'Min level',
      value: (door) => door.min_security_level,
      align: 'right',
      mono: true,
      width: '7rem',
    },
    {
      // LOCATION, which is what the board hands the runtime. A door that
      // misbehaves is usually a door whose registration says something the
      // sysop cannot see: CARDLOBBY ran as a 68K door out of a TypeScript
      // directory on 2026-09-08 and the list showed nothing about it.
      id: 'door_path',
      header: 'Path',
      value: (door) => door.door_path ?? '',
      mono: true,
      cell: (door) => (
        <span className="block max-w-xs truncate text-content-secondary" title={door.door_path}>
          {door.door_path}
        </span>
      ),
    },
    {
      id: 'multi_node',
      header: 'Multi-node',
      value: (door) => (door.multi_node === false ? 0 : 1),
      width: '8rem',
      cell: (door) =>
        door.multi_node === false ? (
          <span className="text-content-muted" title="One caller at a time">Single</span>
        ) : (
          <span className="text-content-secondary" title="A second caller may open it too">Multi</span>
        ),
    },
    {
      id: 'priority',
      header: 'Priority',
      value: (door) => door.priority ?? '',
      mono: true,
      width: '6rem',
    },
    {
      id: 'has_settings',
      header: 'Settings',
      value: (door) => (door.has_settings ? 1 : 0),
      width: '7rem',
      cell: (door) =>
        door.has_settings ? (
          <span className="text-content-secondary">Yes</span>
        ) : (
          <span className="text-content-muted">-</span>
        ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
        <div className="flex h-control items-center rounded border border-border bg-surface-0 px-2">
          <Search size={14} className="text-content-muted" aria-hidden="true" />
          <input
            type="search"
            placeholder="Filter by name, command, type or path"
            aria-label="Filter doors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 bg-transparent px-2 text-sm text-content-primary placeholder:text-content-muted focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={uploadInputRef}
            type="file"
            accept=".zip,.lha,.lzh,.lzx"
            className="hidden"
            onChange={handleUploadChange}
          />
          <button
            onClick={handleUploadClick}
            className="btn-secondary flex items-center space-x-2"
            disabled={isUploading}
          >
            <Upload size={20} />
            <span>{isUploading ? 'Uploading...' : 'Upload Door'}</span>
          </button>
          <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
            <Plus size={20} />
            <span>Add Door</span>
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(door) => String(door.id)}
        initialSort={[{ id: 'door_name', desc: false }]}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage={
          search.trim()
            ? `No door matches "${search.trim()}".`
            : 'No doors configured. Doors are the external programs and games on the command menu.'
        }
        rowActions={(door) => (
          <>
            <button
              type="button"
              onClick={() => handleEdit(door)}
              aria-label={`Edit ${door.door_name}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleEditInfo(door)}
              aria-label={`Edit the .info file for ${door.door_name}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <FileCode size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(door)}
              aria-label={`Delete ${door.door_name}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-status-danger/20 hover:text-status-danger"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      />

      <p className="mt-2 text-xs text-content-muted">
        {filtered.length === doors.length
          ? `${doors.length} doors`
          : `${filtered.length} of ${doors.length} doors`}
      </p>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <Modal
          open={isModalOpen}
          title={editingDoor ? 'Edit Door' : 'Add Door'}
          onClose={closeDoorModal}
          maxWidth="max-w-2xl"
          showHeader={false}
        >
            <div className="sticky top-0 bg-surface-0 border-b border-border p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-accent">
                {editingDoor ? 'Edit Door' : 'Add Door'}
              </h2>
              <button
                onClick={closeDoorModal}
                className="text-content-secondary hover:text-content-primary transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="door_name" className="label">Door Name *</label>
                  <input
                    id="door_name"
                    type="text"
                    value={formData.door_name}
                    onChange={(e) => setFormData({ ...formData, door_name: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="door_command" className="label">Command *</label>
                  <input
                    id="door_command"
                    type="text"
                    value={formData.door_command}
                    onChange={(e) => setFormData({ ...formData, door_command: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="door_type" className="label">Door Type *</label>
                  <select
                    id="door_type"
                    value={formData.door_type}
                    onChange={(e) => setFormData({ ...formData, door_type: e.target.value })}
                    className="input-field w-full"
                    required
                  >
                    {/* The values the BBS actually uses - see
                        web/backend/src/constants/door-types.ts. The old list
                        (68K/JS/TS/EXEC) matched nothing the server serves or
                        accepts, so an XIM door had no entry to display and
                        saving it changed its type. */}
                    <option value="XIM">XIM (Amiga 68K door)</option>
                    <option value="AIM">AIM (Amiga 68K door)</option>
                    <option value="SIM">SIM (Amiga 68K door)</option>
                    <option value="TIM">TIM (Amiga 68K door)</option>
                    <option value="IIM">IIM (Amiga 68K door)</option>
                    <option value="FIM">FIM (FAME door port)</option>
                    <option value="DD">DD (DayDream door)</option>
                    <option value="typescript">TypeScript</option>
                    <option value="SYSCMD">SYSCMD (system command)</option>
                    <option value="BBSCMD">BBSCMD (BBS command)</option>
                    <option value="INTERNAL">INTERNAL</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="door_path" className="label">Path *</label>
                  <input
                    id="door_path"
                    type="text"
                    value={formData.door_path}
                    onChange={(e) => setFormData({ ...formData, door_path: e.target.value })}
                    className="input-field w-full"
                    placeholder="BBS:Doors/MyDoor/MyDoor"
                    required
                  />
                  <p className="text-sm text-content-secondary mt-2">
                    Written to the door's LOCATION tooltype, which is how
                    AmiExpress finds the program to run. The form had no field
                    for it and DoorSchema requires it, so Create Door could
                    never succeed.
                  </p>
                </div>

                <div>
                  <label htmlFor="min_security_level" className="label">Min Security Level *</label>
                  <input
                    id="min_security_level"
                    type="number"
                    min="0"
                    max="255"
                    value={formData.min_security_level}
                    onChange={(e) => setFormData({ ...formData, min_security_level: parseInt(e.target.value, 10) || 0 })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Enabled</span>
                  </label>
                  <p className="text-sm text-content-secondary mt-2">
                    AmiExpress has no on/off switch for a command, so turning a
                    door off parks its access level out of reach and remembers
                    the old level, restoring it when you switch the door back
                    on. The parking level is 32767 rather than 255, because a
                    level-255 sysop can still run a door parked at 255.
                    DOORREPO does the same thing to the same door.
                  </p>
                </div>
              </div>

              {/*
                The door's OWN settings, above the buttons rather than below
                them: the modal is capped at 90vh and scrolls, so a section
                after the footer is off-screen for a door with a full form -
                which is how the first attempt at this shipped and showed a
                sysop nothing.

                Everything above is the door's REGISTRATION - command, path,
                access level, what AmiExpress reads from the .info file. What
                the door itself can be told is a separate file it ships
                (door.settings.json) with its own save button, so a door that
                declares none sees no change here at all.
              */}
              {editingDoor?.has_settings && (
                <div className="border-t border-border pt-6">
                  <h3 className="text-lg text-accent mb-1">Door settings</h3>
                  <p className="text-content-secondary text-sm">
                    What this door says it can be configured with. Saved to the door, not to its registration.
                  </p>
                  <DoorSettingsForm
                    command={editingDoor.door_command}
                    onPendingChange={save => { pendingSettingsSave.current = save; }}
                  />
                </div>
              )}

              {/*
                THE WAY TO THE TOOLTYPES, from the dialog a sysop actually
                opens. The .info editor has always existed - it is the second
                icon on the row - and a sysop looking for a door flag opens
                Edit, finds six fields, and concludes the admin cannot do it
                ("i dont see a way to edit tooltypes for the doors in the
                admin ui when i click edit on gwall", 2026-09-07). Twice this
                year a door flag (C64_ADAPT, then C64_DROP_OLDEST) has been
                hand-edited on the live volume for want of this line.

                A pointer, not a second editor: the tooltype table below is
                the one that writes the file, and two of them would be two
                ways to disagree about it.
              */}
              {editingDoor && (
                <div className="pt-6 border-t border-border">
                  <p className="text-content-secondary text-sm">
                    Tooltypes - what AmiExpress itself reads, including flags
                    like <code>C64_ADAPT</code> - live in this door's{' '}
                    <code>{editingDoor.door_command}.info</code>.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingDoor(null);
                      resetForm();
                      void handleEditInfo(editingDoor);
                    }}
                    className="btn-secondary mt-2 flex items-center space-x-1 text-sm"
                  >
                    <FileCode size={16} />
                    <span>Edit tooltypes (.info file)</span>
                  </button>
                </div>
              )}

              <div className="flex justify-end space-x-4 pt-6 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingDoor(null);
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
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingDoor ? 'Update Door' : 'Create Door'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* Info Editor Modal */}
      {isInfoEditorOpen && editingInfoDoor && (
        <Modal
          open={Boolean(isInfoEditorOpen && editingInfoDoor)}
          title="Edit .info File"
          onClose={closeInfoEditor}
          maxWidth="max-w-4xl"
          showHeader={false}
        >
            <div className="sticky top-0 bg-surface-0 border-b border-border p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-accent">Edit .info File</h2>
                <p className="text-content-secondary text-sm mt-1">
                  {editingInfoDoor.door_name} ({editingInfoDoor.door_command}.info)
                </p>
              </div>
              <button
                onClick={closeInfoEditor}
                className="text-content-secondary hover:text-content-primary transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {/*
                What the DOOR says it can be configured with, when it says
                anything - Doors/<door>/door.settings.json. Renders nothing for
                a door that declares none, which is most of them. Above the
                tooltypes because a door's own settings are what a sysop is
                usually looking for; the tooltypes underneath are what
                AmiExpress reads.
              */}
              <div className="mb-6 border-b border-border/40 pb-6">
                <h3 className="text-lg text-accent mb-1">Door settings</h3>
                <DoorSettingsForm command={editingInfoDoor.door_command} />
              </div>

              {/*
                AmiExpress's own per-command switches (express.e:4732-4804
                runCommand()) - SILENT, EXPERT_MODE, LOG_INPUTS, QUICKMODE,
                TRAPON, SCRIPTCHECK, PASS_PARAMETERS, MIMICVER. These read and
                write the SAME tooltype list as the raw table below; a sysop
                used to have to know the exact tooltype spelling to set any of
                them by hand.
              */}
              <div className="mb-6 border-b border-border/40 pb-6">
                <h3 className="text-lg text-accent mb-1">Command Flags</h3>
                <p className="text-content-secondary text-sm mb-4">
                  Per-command switches AmiExpress reads from this command's own tooltypes.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {COMMAND_FLAG_TOOLTYPES.map((flag) => (
                    <label key={flag.key} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isCommandFlagSet(flag.key)}
                        onChange={(e) => setCommandFlag(flag.key, e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-accent"
                      />
                      <span>
                        <span className="block text-content-primary text-sm">{flag.label}</span>
                        <span className="block text-content-secondary text-xs">{flag.help}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label htmlFor="door-flag-pass-params" className="label">Pass Parameters</label>
                    <input
                      id="door-flag-pass-params"
                      type="number"
                      value={getCommandFlagValue('PASS_PARAMETERS')}
                      onChange={(e) => setCommandFlagValue('PASS_PARAMETERS', e.target.value)}
                      className="input-field w-full"
                      placeholder="blank = not set"
                    />
                    <p className="text-xs text-content-secondary mt-1">
                      Only takes effect when INTERNAL is also set on this icon. 1 skips
                      running the command entirely; any value above 0 also appends the
                      caller's own command-line parameters.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="door-flag-mimic-version" className="label">Mimic Version</label>
                    <input
                      id="door-flag-mimic-version"
                      type="text"
                      value={getCommandFlagValue('MIMICVER')}
                      onChange={(e) => setCommandFlagValue('MIMICVER', e.target.value)}
                      className="input-field w-full"
                      placeholder="blank = not set"
                    />
                    <p className="text-xs text-content-secondary mt-1">
                      The AmiExpress version this command reports itself as.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-4 flex justify-between items-center">
                <p className="text-content-secondary text-sm">
                  Edit tooltypes for this door. Changes are saved back to the .info file.
                </p>
                <button
                  onClick={handleTooltypeAdd}
                  className="btn-secondary text-sm flex items-center space-x-1"
                >
                  <Plus size={16} />
                  <span>Add Tooltype</span>
                </button>
              </div>

              <div className="border border-border rounded overflow-hidden">
                <table className="w-full">
                  <thead className="bg-border">
                    <tr>
                      <th className="text-left p-3 text-content-primary font-semibold w-12">Active</th>
                      <th className="text-left p-3 text-content-primary font-semibold">Key</th>
                      <th className="text-left p-3 text-content-primary font-semibold">Value</th>
                      <th className="text-left p-3 text-content-primary font-semibold w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tooltypes.map((tt, index) => (
                      <tr
                        key={index}
                        className={`border-t border-border ${
                          tt.commented ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="p-3">
                          <button
                            onClick={() => handleTooltypeToggle(index)}
                            className={`p-1 rounded transition-colors ${
                              tt.commented
                                ? 'text-content-secondary hover:text-content-primary'
                                : 'text-status-ok hover:text-status-ok'
                            }`}
                            title={tt.commented ? 'Enable this tooltype' : 'Disable this tooltype'}
                          >
                            {tt.commented ? <PowerOff size={20} /> : <Power size={20} />}
                          </button>
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={tt.key}
                            onChange={(e) => handleTooltypeUpdate(index, 'key', e.target.value)}
                            className="input-field w-full font-mono text-sm"
                            placeholder="KEY"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={tt.value}
                            onChange={(e) => handleTooltypeUpdate(index, 'value', e.target.value)}
                            className="input-field w-full font-mono text-sm"
                            placeholder="value"
                          />
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => handleTooltypeRemove(index)}
                            className="text-accent hover:text-accent/90 transition-colors"
                            title="Remove this tooltype"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {tooltypes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-content-secondary">
                          No tooltypes defined. Click "Add Tooltype" to create one.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-border mt-6">
                <button
                  onClick={() => {
                    if (infoDirty) {
                      if (window.confirm('You have unsaved changes. Discard them?')) {
                        setIsInfoEditorOpen(false);
                        setEditingInfoDoor(null);
                        setInfoDirty(false);
                      }
                    } else {
                      setIsInfoEditorOpen(false);
                      setEditingInfoDoor(null);
                    }
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInfoSave}
                  className="btn-primary flex items-center space-x-2"
                  disabled={!infoDirty}
                >
                  <Save size={16} />
                  <span>{infoDirty ? 'Save Changes' : 'No Changes'}</span>
                </button>
              </div>
            </div>
        </Modal>
      )}
    </div>
  );
}
