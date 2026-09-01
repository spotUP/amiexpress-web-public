/**
 * The form a door describes for itself.
 *
 * Every door but one used to be configurable through six fields and a raw
 * tooltype list; GWall looked different only because a page had been written
 * by hand for it (GlobalWallPage.tsx). A door that ships a
 * `door.settings.json` gets a real form here, and there is no door-specific
 * code in the admin to write for it: if a manifest cannot be rendered, the
 * manifest is wrong and the API says which setting is at fault.
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2 } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

export interface DoorSetting {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'choice';
  choices?: Array<{ value: string; label: string }>;
  default?: string | number | boolean;
  help?: string;
  min?: number;
  max?: number;
  secret?: boolean;
}

export interface DoorSettingsFormProps {
  command: string;
  /**
   * Handed a function that saves whatever the sysop has typed here, or null
   * when there is nothing unsaved.
   *
   * The dialog this sits in has its own Update Door button, and a sysop who
   * types an address and presses THAT loses it - two save buttons in one
   * dialog is a trap, and the first sysop to use this feature fell in it.
   * The page saves the settings alongside the door instead.
   */
  onPendingChange?: (save: (() => Promise<unknown>) | null) => void;
}

type Values = Record<string, string | number | boolean>;

export function DoorSettingsForm({ command, onPendingChange }: DoorSettingsFormProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();
  const [values, setValues] = useState<Values>({});
  const [dirty, setDirty] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['door-settings', command],
    queryFn: () => apiClient.getDoorSettings(command),
  });

  const view = settingsQuery.data?.data as
    | { manifest: { settings: DoorSetting[] }; values: Values; secretsSet: string[] }
    | undefined;

  // The server's values are the starting point, and stay it until the sysop
  // types: re-seeding on every render would fight the keyboard.
  useEffect(() => {
    if (view && !dirty) setValues(view.values ?? {});
  }, [view, dirty]);

  const saveMutation = useMutation({
    mutationFn: () => apiClient.saveDoorSettings(command, values),
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['door-settings', command] });
      showSuccess(`${command} settings saved`);
    },
    // The message names the setting - "Port must be at most 65535", "Not a
    // setting this door declares: nosuchkey" - so it is worth showing whole.
    onError: (error: Error) => showError(error.message),
  });

  // Tell the page whether there is anything to save, and how.
  useEffect(() => {
    if (!onPendingChange) return;
    onPendingChange(dirty ? () => saveMutation.mutateAsync() : null);
    return () => onPendingChange(null);
  }, [dirty, onPendingChange, saveMutation]);

  if (settingsQuery.isLoading) {
    return <div className="p-4 text-content-secondary text-sm">Reading what this door declares...</div>;
  }

  if (!view) {
    return (
      <div className="p-4 text-content-secondary text-sm">
        This door declares no settings. A door describes its own in
        <code className="mx-1 text-content-primary">door.settings.json</code>
        beside its package.json.
      </div>
    );
  }

  const set = (key: string, value: string | number | boolean) => {
    setDirty(true);
    setValues(prev => ({ ...prev, [key]: value }));
  };

  return (
    // A div, not a form: this renders inside the Edit Door modal's form, and
    // nesting forms is invalid HTML - the browser discards the inner one, and
    // its submit button would then save the DOOR instead of its settings.
    <div className="space-y-4 p-1">
      {view.manifest.settings.map(setting => {
        const value = values[setting.key];
        const id = `door-setting-${setting.key}`;
        const secretIsSet = setting.secret && view.secretsSet?.includes(setting.key);

        return (
          <div key={setting.key} className="space-y-1">
            <label htmlFor={id} className="form-label">
              {setting.label}
            </label>

            {setting.type === 'boolean' ? (
              <input
                id={id}
                type="checkbox"
                checked={value === true}
                onChange={e => set(setting.key, e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
            ) : setting.type === 'choice' ? (
              <select
                id={id}
                value={String(value ?? '')}
                onChange={e => set(setting.key, e.target.value)}
                className="input-field w-full"
              >
                {(setting.choices ?? []).map(choice => (
                  <option key={choice.value} value={choice.value}>{choice.label}</option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={setting.secret ? 'password' : setting.type === 'number' ? 'number' : 'text'}
                value={String(value ?? '')}
                min={setting.min}
                max={setting.max}
                placeholder={secretIsSet ? 'Set - leave blank to keep it' : undefined}
                onChange={e => set(
                  setting.key,
                  setting.type === 'number' ? Number(e.target.value) : e.target.value
                )}
                className="input-field w-full font-mono"
              />
            )}

            {setting.help && (
              <p className="text-xs text-content-secondary">{setting.help}</p>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => saveMutation.mutate()}
        disabled={!dirty || saveMutation.isPending}
        className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
      >
        {saveMutation.isPending
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Save className="h-4 w-4" />}
        Save settings
      </button>
    </div>
  );
}
