import { useState } from 'react';
import type { MenuConfig } from '@bbs/screens/menu-config/menu-config';
import type { MenuEntryRow } from '../../api/client';
import {
  addC64Floor, addC64Key, addC64Section, c64KeyChoices, moveC64Key, moveC64Section, removeC64Floor, removeC64Key, removeC64Section, renameC64Section,
} from './menu-c64-edit';
import { BUTTON_CLASS, INPUT_CLASS } from './menu-styles';

type Update = (change: (c: MenuConfig) => MenuConfig) => void;

function KeyAdder({ floor, index, choices, update }: { floor: number; index: number; choices: string[]; update: Update }) {
  const [key, setKey] = useState('');
  return (
    <div className="flex items-center gap-2">
      <select aria-label={`Key to add to section ${index + 1} at level ${floor}`} className={`${INPUT_CLASS} !w-auto`} value={key} onChange={e => setKey(e.target.value)}>
        <option value="">Choose a command</option>
        {choices.map(k => <option key={k} value={k}>{k}</option>)}
      </select>
      <button className={BUTTON_CLASS} disabled={!key} aria-label={`Add key to section ${index + 1} at level ${floor}`}
        onClick={() => { update(c => addC64Key(c, floor, index, key)); setKey(''); }}>Add key</button>
    </div>
  );
}

/** A separate 40-column menu per level floor, built from the kind's own commands. */
export function MenuC64Builder({ config, rows, update }: { config: MenuConfig; rows: MenuEntryRow[]; update: Update }) {
  const [floorText, setFloorText] = useState('');
  const floors = Object.keys(config.c64Menus).map(Number).sort((a, b) => a - b);
  const allKeys = rows.map(r => r.key);
  return (
    <div className="space-y-4">
      <p className="text-xs text-content-secondary">
        Replaces the menu at 40 columns for callers at this level and above; commands the caller may not run are still left out.
      </p>
      <div className="flex items-center gap-2">
        <input aria-label="New C64 level floor" className={INPUT_CLASS} type="number" min={0} max={65535} value={floorText} onChange={e => setFloorText(e.target.value)} />
        <button className={`${BUTTON_CLASS} whitespace-nowrap`} disabled={floorText === ''} onClick={() => { update(c => addC64Floor(c, Number(floorText))); setFloorText(''); }}>
          Add C64 level
        </button>
      </div>
      {floors.map(floor => {
        const menu = config.c64Menus[String(floor)];
        const choices = c64KeyChoices(config, floor, allKeys);
        return (
          <fieldset key={floor} className="border border-border rounded p-3 space-y-3">
            <legend className="px-1 text-sm text-content-primary">Level {floor} and above</legend>
            {menu.sections.map((section, i) => (
              <div key={i} className="border border-border rounded p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <input aria-label={`Title of section ${i + 1} at level ${floor}`} className={INPUT_CLASS} value={section.title}
                    onChange={e => update(c => renameC64Section(c, floor, i, e.target.value))} />
                  <button className={BUTTON_CLASS} disabled={i === 0} aria-label={`Move section ${i + 1} up at level ${floor}`} onClick={() => update(c => moveC64Section(c, floor, i, -1))}>Move up</button>
                  <button className={BUTTON_CLASS} disabled={i === menu.sections.length - 1} aria-label={`Move section ${i + 1} down at level ${floor}`} onClick={() => update(c => moveC64Section(c, floor, i, 1))}>Move down</button>
                  <button className={BUTTON_CLASS} aria-label={`Remove section ${i + 1} at level ${floor}`} onClick={() => update(c => removeC64Section(c, floor, i))}>Remove</button>
                </div>
                <ol className="space-y-1">
                  {section.keys.map((k, ki) => (
                    <li key={k} className="flex items-center gap-2 text-sm text-content-primary">
                      <span className="font-mono w-20">{k}</span>
                      <span className="w-48 truncate">{rows.find(r => r.key === k)?.label ?? ''}</span>
                      <button className={BUTTON_CLASS} disabled={ki === 0} aria-label={`Move ${k} up`} onClick={() => update(c => moveC64Key(c, floor, i, ki, -1))}>Move up</button>
                      <button className={BUTTON_CLASS} disabled={ki === section.keys.length - 1} aria-label={`Move ${k} down`} onClick={() => update(c => moveC64Key(c, floor, i, ki, 1))}>Move down</button>
                      <button className={BUTTON_CLASS} aria-label={`Remove ${k} from section ${i + 1} at level ${floor}`} onClick={() => update(c => removeC64Key(c, floor, i, k))}>Remove</button>
                    </li>
                  ))}
                </ol>
                <KeyAdder floor={floor} index={i} choices={choices} update={update} />
              </div>
            ))}
            <div className="flex gap-2">
              <button className={BUTTON_CLASS} aria-label={`Add section to level ${floor}`} onClick={() => update(c => addC64Section(c, floor))}>Add section</button>
              <button className={BUTTON_CLASS} aria-label={`Remove C64 level ${floor}`} onClick={() => update(c => removeC64Floor(c, floor))}>Remove level</button>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
