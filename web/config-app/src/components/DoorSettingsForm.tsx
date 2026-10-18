/**
 * The form a door describes for itself.
 *
 * Every door but one used to be configurable through six fields and a raw
 * tooltype list; GWall looked different only because a page had been written
 * by hand for it. That page is gone - it wrote its config to a third path
 * that neither the door nor the board ever read. A door that ships a
 * `door.settings.json` gets a real form here, and there is no door-specific
 * code in the admin to write for it: if a manifest cannot be rendered, the
 * manifest is wrong and the API says which setting is at fault.
 */

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAutosave } from '../hooks/useAutosave';

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
  /** Group heading the form renders this setting under. */
  group?: string;
  /** Hidden from the generic form; a bespoke editor owns it. Still read/written by the API. */
  hidden?: boolean;
}

export interface DoorSettingsFormProps {
  command: string;
}

type Values = Record<string, string | number | boolean>;

/**
 * What one press of the arrow keys - and the browser's own validation - takes
 * a number setting to be.
 *
 * `<input type="number">` defaults to step=1, so a fractional value is
 * REFUSED by the browser before it can be saved: the sysop typing the Card
 * Lobby's declared 0.02 entry fee was told "the two nearest valid values are
 * 0 and 1". A setting whose own default, minimum or maximum is fractional is
 * a fractional setting, and takes any value in its range; the rest keep whole
 * numbers, which is the right guard for turns, chips and node counts.
 */
function stepFor(setting: DoorSetting): number | 'any' {
  const declared = [setting.default, setting.min, setting.max]
    .filter((v): v is number => typeof v === 'number');
  return declared.some(v => !Number.isInteger(v)) ? 'any' : 1;
}

export function DoorSettingsForm({ command }: DoorSettingsFormProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Values>({});
  /**
   * Which keys the sysop actually touched.
   *
   * Only these are sent. Sending the whole form writes the door's own
   * defaults into settings.json as if a sysop had chosen them - the first
   * board to use this had `maxNodes: 8` pinned that way, so raising the
   * door's default to 255 would not have reached it.
   */
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const dirty = touched.size > 0;

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

  /*
   * No save button: "i want no save buttons at all in the admin ui everything
   * should auto save" (sysop, 2026-09-14, repeated for the door dialog
   * 2026-10-19). The debounce covers typing an address; the hook shows the
   * board's refusal, which names the setting ("Port must be at most 65535").
   * Closing the dialog unmounts this form, and the hook writes what is pending
   * on the way out.
   */
  const autosave = useAutosave<Values>({
    save: async (changed) => {
      await apiClient.saveDoorSettings(command, changed);
      queryClient.invalidateQueries({ queryKey: ['door-settings', command] });
    },
    label: () => `${command} settings saved`,
  });

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
    const nextTouched = new Set(touched).add(key);
    const nextValues = { ...values, [key]: value };
    setTouched(nextTouched);
    setValues(nextValues);
    autosave.schedule(
      Object.fromEntries([...nextTouched].map(k => [k, nextValues[k]])) as Values,
      'settings',
    );
  };

  const artSections = (view.manifest as { artSections?: Array<{ label: string }> }).artSections ?? [];
  let lastGroup: string | null = null;

  return (
    // A div, not a form: this renders inside the Edit Door modal's form, and
    // nesting forms is invalid HTML - the browser discards the inner one, and
    // its submit button would then save the DOOR instead of its settings.
    <div className="space-y-4 p-1">
      {artSections.length > 0 && (
        <p className="text-xs text-content-secondary border border-border rounded p-2">
          Title art ({artSections.map(a => a.label).join(', ')}) is drawn in
          Screen Designer, under Door screens — a settings form
          is the wrong tool for art.
        </p>
      )}
      {view.manifest.settings.filter(setting => !setting.hidden).map(setting => {
        const value = values[setting.key];
        const id = `door-setting-${setting.key}`;
        const secretIsSet = setting.secret && view.secretsSet?.includes(setting.key);
        // Consecutive settings sharing a group render under one heading;
        // ungrouped settings render bare, exactly as before.
        const heading = setting.group && setting.group !== lastGroup ? setting.group : null;
        lastGroup = setting.group ?? lastGroup;

        return (
          <div key={setting.key}>
            {heading && (
              <h4 className="text-sm font-semibold text-content-primary border-b border-border pb-1 mb-2 mt-2">
                {heading}
              </h4>
            )}
          <div className="space-y-1">
            {(setting.type !== 'choice' || (setting.choices ?? []).length > 3) && (
            <label htmlFor={id} className="form-label">
              {setting.label}
            </label>
            )}

            {setting.type === 'boolean' ? (
              <input
                id={id}
                type="checkbox"
                checked={value === true}
                onChange={e => set(setting.key, e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
            ) : setting.type === 'choice' ? (
              (setting.choices ?? []).length <= 3 ? (
                // A Yes/No (or similarly small) set reads as radio buttons,
                // not a dropdown hiding the only other option. Longer lists
                // keep the select below.
                <fieldset>
                  <legend className="form-label">{setting.label}</legend>
                  <div className="flex flex-wrap gap-4">
                    {(setting.choices ?? []).map(choice => (
                      <label key={choice.value} className="inline-flex items-center gap-2 text-sm text-content-primary">
                        <input
                          type="radio"
                          name={id}
                          value={choice.value}
                          checked={String(value ?? '') === choice.value}
                          onChange={() => set(setting.key, choice.value)}
                          className="h-4 w-4 accent-accent"
                        />
                        {choice.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
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
              )
            ) : (
              <input
                id={id}
                type={setting.secret ? 'password' : setting.type === 'number' ? 'number' : 'text'}
                value={String(value ?? '')}
                min={setting.min}
                max={setting.max}
                step={setting.type === 'number' ? stepFor(setting) : undefined}
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
          </div>
        );
      })}
    </div>
  );
}
