import type { MenuConfig } from '@bbs/screens/menu-config/menu-config';
import type { MenuEntryRow } from '../../api/client';
import { addSection, moveSection, removeSection, renameSection, sectionIsEmpty } from './menu-edit';
import { BUTTON_CLASS, INPUT_CLASS } from './menu-styles';

interface Props {
  config: MenuConfig;
  rows: MenuEntryRow[];
  update: (change: (c: MenuConfig) => MenuConfig) => void;
}

export function MenuSectionsEditor({ config, rows, update }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-content-secondary">
        The headings the menu groups commands under, in the order the caller sees them.
        A section can be removed once no command is placed in it.
      </p>
      {config.sections.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <input
            aria-label={`Title of section ${i + 1}`}
            className={INPUT_CLASS}
            value={s.title}
            onChange={e => update(c => renameSection(c, s.id, e.target.value))}
          />
          <button className={BUTTON_CLASS} disabled={i === 0} onClick={() => update(c => moveSection(c, i, -1))}>Move up</button>
          <button className={BUTTON_CLASS} disabled={i === config.sections.length - 1} onClick={() => update(c => moveSection(c, i, 1))}>Move down</button>
          <button
            className={BUTTON_CLASS}
            disabled={!sectionIsEmpty(config, rows, s.id)}
            title={sectionIsEmpty(config, rows, s.id) ? undefined : 'Move its commands to another section first'}
            onClick={() => update(c => removeSection(c, rows, s.id))}
          >
            Remove
          </button>
        </div>
      ))}
      <button className={BUTTON_CLASS} onClick={() => update(addSection)}>Add section</button>
    </div>
  );
}
