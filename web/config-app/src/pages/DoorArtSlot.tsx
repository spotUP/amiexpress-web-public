/**
 * One art slot whose body is a whole FILE the door's setting names.
 *
 * The other kind of slot is a section cut out of a door's config file, and it
 * is drawn inline on the door-art tab: it has a fixed `file` and `[section]`,
 * and there is nothing to choose. This kind has a choice - REQUESTS ships
 * twenty alternate bulletin headers beside the one it uses - and the choice is
 * the SETTING, so picking one writes exactly what the admin's settings form
 * writes. No second place records which file the door draws.
 *
 * Its own component rather than more JSX in ScreenFilesPage, which is 2,289
 * lines: rendering that page in a test needs the whole screen index, and what
 * wants testing here is which value the picker saves.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

export interface DoorArtSlotShape {
  section: string;
  file: string;
  label: string;
  lines: number;
  maxLines: number;
  maxLineLength: number;
  /** The setting names a file that is not there. */
  missing?: boolean;
  /** The art this door ships, as the picker's options. */
  choices?: Array<{ file: string; lines: number }>;
}

export interface DoorArtSlotProps {
  command: string;
  slot: DoorArtSlotShape;
  onOpen: (slot: DoorArtSlotShape) => void;
}

/** `setting:bulletinHeader` is how a slot is addressed, not what it is called. */
export const settingKeyOf = (section: string): string | null =>
  section.startsWith('setting:') ? section.slice('setting:'.length) : null;

export function DoorArtSlot({ command, slot, onOpen }: DoorArtSlotProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();
  const [saving, setSaving] = useState(false);
  const key = settingKeyOf(slot.section);

  const choose = async (file: string) => {
    if (!key || file === slot.file) return;
    setSaving(true);
    try {
      await apiClient.saveDoorSettings(command, { [key]: file });
      showSuccess(`${slot.label}: ${file}`);
      // The slot's file, its row count and whether it is missing all come from
      // the door-art listing, so the listing is what has to be refetched -
      // the settings query alone would leave the card showing the old file.
      queryClient.invalidateQueries({ queryKey: ['door-art'] });
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Could not change the art');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pl-2">
      <span className="text-content-primary">{slot.label}</span>
      {/* Two spans, not one: the FILE is the thing a sysop reads and copies,
          and a row count welded onto it makes the name unselectable and the
          markup untestable by its own text. */}
      <span className="font-mono text-xs text-content-secondary">{slot.file}</span>
      <span className="text-xs text-content-secondary">
        {slot.missing ? 'not there any more' : `${slot.lines} rows`}
      </span>

      {!slot.missing && (
        <button
          onClick={() => onOpen(slot)}
          className="px-2 py-1 text-accent hover:underline text-sm"
        >
          Open in ANSI editor
        </button>
      )}

      {(slot.choices?.length ?? 0) > 1 && (
        <label className="text-xs text-content-secondary flex items-center gap-1">
          Choose another
          <select
            aria-label="Choose another"
            disabled={saving}
            value={slot.file}
            onChange={(event) => void choose(event.target.value)}
            className="bg-surface-2 border border-border rounded px-1 py-0.5 text-xs"
          >
            {/* The file the setting names may itself be gone; keep it listed
                so the control has a value and the sysop can see what broke. */}
            {slot.missing && <option value={slot.file}>{slot.file} (missing)</option>}
            {slot.choices?.map((choice) => (
              <option key={choice.file} value={choice.file}>
                {choice.file} — {choice.lines} rows
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
