/**
 * Every door's art, as one list that opens in the door-art dialog.
 *
 * Door art is board-wide: the API (`/api/door-art`) is keyed by door command,
 * not by theme, and is mounted on the level-100 artist lane. This is the one
 * place that lists it, so Screen Health (sysop audit) and the Screen Designer
 * (where the people who draw it work) show the same rows by the same rules.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../api/client';
import { DoorArtDialog } from './DoorArtDialog';
import { DoorArtSlot, settingKeyOf } from './DoorArtSlot';

interface DoorArtEntry {
  command: string;
  name: string;
  sections: Array<{
    file: string; section: string; label: string; lines: number;
    maxLines: number; maxLineLength: number;
    // A slot backed by a whole FILE the door's setting names, rather than
    // a section of its config: it can be missing, and it has alternates.
    missing?: boolean;
    choices?: Array<{ file: string; lines: number }>;
  }>;
}

interface OpenArt {
  command: string; doorName: string; file: string; section: string;
  label: string; maxLines: number; maxLineLength: number;
}

export interface DoorArtListProps {
  /** Narrows the list to doors, slots or files containing this text. */
  query?: string;
}

export function DoorArtList({ query = '' }: DoorArtListProps) {
  /**
   * Art blocks living inside door config files. Small and few (doors declare
   * them in their manifests), so loaded with the page.
   */
  const { data: doorArt } = useQuery({
    queryKey: ['door-art'],
    queryFn: async () => (await apiClient.listDoorArt()).data as DoorArtEntry[],
  });
  /**
   * A door's art block living inside its config file (Bulls' Title logo in
   * Bulls.CFG) has no screen path, so the file dialog cannot open it. It
   * opens in the door-art dialog on the same canvas instead.
   */
  const [openArt, setOpenArt] = useState<OpenArt | null>(null);

  const needle = query.trim().toLowerCase();
  const doors = (Array.isArray(doorArt) ? doorArt : []).filter(door =>
    !needle
    || door.command.toLowerCase().includes(needle)
    || door.name.toLowerCase().includes(needle)
    || door.sections.some(section =>
      section.label.toLowerCase().includes(needle) || section.file.toLowerCase().includes(needle)));

  return (
    <div className="space-y-2 text-sm">
      {doors.map(door => (
        <div key={door.command} className="border border-border rounded p-2 space-y-1">
          <p className="text-content-primary">
            <span className="font-mono">{door.command}</span>
            <span className="text-content-secondary"> — {door.name}</span>
          </p>
          {door.sections.map(section => settingKeyOf(section.section) !== null ? (
            <DoorArtSlot
              key={`${section.file}#${section.section}`}
              command={door.command}
              slot={section}
              onOpen={slot => setOpenArt({
                command: door.command, doorName: door.name,
                file: slot.file, section: slot.section, label: slot.label,
                maxLines: slot.maxLines, maxLineLength: slot.maxLineLength,
              })}
            />
          ) : (
            <div key={`${section.file}#${section.section}`} className="flex flex-wrap items-center gap-2 pl-2">
              <span className="text-content-primary">{section.label}</span>
              <span className="font-mono text-xs text-content-secondary">
                {section.file} [{section.section}] — {section.lines} of {section.maxLines} lines
              </span>
              <button
                onClick={() => setOpenArt({
                  command: door.command, doorName: door.name,
                  file: section.file, section: section.section, label: section.label,
                  maxLines: section.maxLines, maxLineLength: section.maxLineLength,
                })}
                className="btn-small btn-secondary"
              >
                Open in ANSI editor
              </button>
            </div>
          ))}
        </div>
      ))}
      {openArt && (
        <DoorArtDialog
          command={openArt.command}
          doorName={openArt.doorName}
          file={openArt.file}
          section={openArt.section}
          label={openArt.label}
          maxLines={openArt.maxLines}
          maxLineLength={openArt.maxLineLength}
          onClose={() => setOpenArt(null)}
        />
      )}
    </div>
  );
}
