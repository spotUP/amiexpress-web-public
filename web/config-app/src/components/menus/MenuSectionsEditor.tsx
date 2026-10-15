import { useState } from 'react';
import type { MenuConfig } from '@bbs/screens/menu-config/menu-config';
import type { MenuEntryRow } from '../../api/client';
import { addSection, moveSection, removeSection, renameSection, sectionIsEmpty } from './menu-edit';
import { BUTTON_CLASS, INPUT_CLASS } from './menu-styles';

interface Props {
  config: MenuConfig;
  rows: MenuEntryRow[];
  /** False while the entries load or when loading failed: then no section can be known to be empty. */
  rowsReady: boolean;
  update: (change: (c: MenuConfig) => MenuConfig) => void;
}

/** Keeps what is being typed locally so the title can be cleared on the way to a new one; only a non-empty title is written. */
function TitleInput({ title, label, onCommit }: { title: string; label: string; onCommit: (t: string) => void }) {
  const [draft, setDraft] = useState(title);
  const blank = !draft.trim();
  return (
    <div className="flex-1">
      <input
        aria-label={label}
        className={INPUT_CLASS}
        value={draft}
        onChange={e => { setDraft(e.target.value); if (e.target.value.trim()) onCommit(e.target.value); }}
        onBlur={() => setDraft(title)}
      />
      {blank && <p className="text-xs text-status-danger mt-1">A section needs a title; the previous one is kept.</p>}
    </div>
  );
}

export function MenuSectionsEditor({ config, rows, rowsReady, update }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-content-secondary">
        The headings the menu groups commands under, in the order the caller sees them.
        A section can be removed once no command is placed in it.
      </p>
      {config.sections.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <TitleInput title={s.title} label={`Title of section ${i + 1}`} onCommit={t => update(c => renameSection(c, s.id, t))} />
          <button className={BUTTON_CLASS} disabled={i === 0} onClick={() => update(c => moveSection(c, i, -1))}>Move up</button>
          <button className={BUTTON_CLASS} disabled={i === config.sections.length - 1} onClick={() => update(c => moveSection(c, i, 1))}>Move down</button>
          <button
            className={BUTTON_CLASS}
            disabled={!sectionIsEmpty(config, rows, s.id, rowsReady)}
            title={sectionIsEmpty(config, rows, s.id, rowsReady) ? undefined : rowsReady ? 'Move its commands to another section first' : 'The commands have not loaded, so it cannot be known to be empty'}
            onClick={() => update(c => removeSection(c, rows, s.id, rowsReady))}
          >
            Remove
          </button>
        </div>
      ))}
      <button className={BUTTON_CLASS} onClick={() => update(addSection)}>Add section</button>
    </div>
  );
}
