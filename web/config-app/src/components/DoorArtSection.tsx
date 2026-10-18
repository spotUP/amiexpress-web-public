import { DoorArtList } from '../pages/DoorArtList';
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
  return (
    <div className="border-t border-border pt-6 space-y-3">
      <div>
        <h3 className="text-lg text-accent mb-1">Door art</h3>
        <p className="text-content-secondary text-sm">
          The screens and logos this door draws. Edited here and in the Screen Designer.
        </p>
      </div>
      <DoorArtList command={command} />
      {menuKind && <MenuLogosOfDoor kind={menuKind} />}
    </div>
  );
}
