import { useState } from 'react';
import { DoorArtList, type DoorArtTarget } from '../pages/DoorArtList';
import { DoorArtEditor } from '../pages/DoorArtDialog';
import { MenuLogosEditor } from './menus/MenuLogosEditor';
import { useMenuConfig } from './menus/useMenuConfig';
import { SkeletonRows } from './ui/states';
import type { MenuKind } from '@bbs/screens/menu-config/menu-config';

export interface DoorArtSectionProps {
  /** The door's registered command. */
  command: string;
  /** The menu this command is the door of, when it is one. */
  menuKind?: MenuKind | null;
}

/** The menu's logo files and placement rules; mounted only for the door that owns the menu. */
function MenuLogosOfDoor({ kind }: { kind: MenuKind }) {
  const { config, update, placeLogo, status } = useMenuConfig(kind);
  if (!config) return status ? <p className="text-sm text-status-danger">{status}</p> : <SkeletonRows rows={3} />;
  return <MenuLogosEditor kind={kind} config={config} update={update} placeLogo={placeLogo} />;
}

/**
 * Everything a door draws, in the door's own dialog: its screens and logos
 * (the same list the Screen Designer shows artists) and, for the main menu
 * and bulletins doors, that menu's logos.
 */
export function DoorArtSection({ command, menuKind }: DoorArtSectionProps) {
  /*
    The slot list, THEN the editor for the picked slot, in the same tab
    body. A dialog over the door dialog was a box in a box, both cramped
    ("tab the door dialogs and make them bigger", sysop, 2026-10-19); the
    editor's Cancel brings the list back.
  */
  const [open, setOpen] = useState<DoorArtTarget | null>(null);
  if (open) return <DoorArtEditor {...open} embedded onClose={() => setOpen(null)} />;
  return (
    <div className="space-y-3">
      <p className="text-content-secondary text-sm">
        The screens and logos this door draws. Edited here and in the Screen Designer.
      </p>
      <DoorArtList command={command} onOpen={setOpen} />
      {menuKind && <MenuLogosOfDoor kind={menuKind} />}
    </div>
  );
}
