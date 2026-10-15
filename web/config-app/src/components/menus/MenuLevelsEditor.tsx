import { useState } from 'react';
import type { MenuConfig } from '@bbs/screens/menu-config/menu-config';
import type { MenuEntryRow } from '../../api/client';
import {
  addLevel, addOrderKey, filterKeys, removeLevel, removeOrderKey, removeRename, reorderKeys, setRename, toggleHidden,
} from './menu-edit';
import { BUTTON_CLASS, INPUT_CLASS } from './menu-styles';

interface Props {
  config: MenuConfig;
  rows: MenuEntryRow[];
  update: (change: (c: MenuConfig) => MenuConfig) => void;
}

/** A search box over a scrollable checked list, so a level with ~200 commands stays usable. */
function HiddenPicker({ floor, keys, hidden, onToggle }: { floor: number; keys: string[]; hidden: string[]; onToggle: (key: string) => void }) {
  const [query, setQuery] = useState('');
  return (
    <div>
      <div className="text-sm text-content-secondary mb-1">Hidden ({hidden.length} of {keys.length})</div>
      <input aria-label={`Find a command to hide at level ${floor}`} className={INPUT_CLASS} placeholder="Find a command..." value={query} onChange={e => setQuery(e.target.value)} />
      <div className="mt-1 max-h-40 overflow-y-auto flex flex-wrap gap-x-3 gap-y-1">
        {filterKeys(keys, query).map(k => (
          <label key={k} className="flex items-center gap-1 text-sm text-content-primary">
            <input type="checkbox" aria-label={`Hide ${k} at level ${floor}`} checked={hidden.includes(k)} onChange={() => onToggle(k)} />
            <span className="font-mono">{k}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function MenuLevelsEditor({ config, rows, update }: Props) {
  const [floorText, setFloorText] = useState('');
  const floors = Object.keys(config.levels).map(Number).sort((a, b) => a - b);
  const keys = rows.map(r => r.key);

  return (
    <div className="space-y-4">
      <p className="text-xs text-content-secondary">
        Exceptions to the menu the board derives. A level applies to callers at this level and above, up to the next level listed.
      </p>
      <div className="flex items-center gap-2">
        <input
          aria-label="New level floor"
          className={INPUT_CLASS}
          type="number" min={0} max={65535}
          value={floorText}
          onChange={e => setFloorText(e.target.value)}
        />
        <button
          className={`${BUTTON_CLASS} whitespace-nowrap`}
          disabled={floorText === ''}
          onClick={() => { update(c => addLevel(c, Number(floorText))); setFloorText(''); }}
        >
          Add level
        </button>
      </div>

      {floors.map(floor => {
        const level = config.levels[String(floor)];
        const unnamed = keys.filter(k => !(k in level.rename));
        const unordered = keys.filter(k => !level.order.includes(k));
        return (
          <fieldset key={floor} className="border border-border rounded p-3 space-y-3">
            <legend className="px-1 text-sm text-content-primary">Level {floor} and above</legend>

            <div>
                            <HiddenPicker floor={floor} keys={keys} hidden={level.hide} onToggle={k => update(c => toggleHidden(c, floor, k))} />
            </div>

            <div>
              <div className="text-sm text-content-secondary mb-1">Renamed</div>
              {Object.entries(level.rename).map(([k, label]) => (
                <div key={k} className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm text-content-primary w-20">{k}</span>
                  <input aria-label={`New label for ${k} at level ${floor}`} className={INPUT_CLASS} value={label} onChange={e => update(c => setRename(c, floor, k, e.target.value))} />
                  <button className={BUTTON_CLASS} onClick={() => update(c => removeRename(c, floor, k))}>Remove</button>
                </div>
              ))}
              <select
                aria-label={`Rename a command at level ${floor}`}
                className={INPUT_CLASS}
                value=""
                onChange={e => { const k = e.target.value; if (k) update(c => setRename(c, floor, k, rows.find(r => r.key === k)?.label ?? k)); }}
              >
                <option value="">Rename a command...</option>
                {unnamed.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <div>
              <div className="text-sm text-content-secondary mb-1">Order</div>
              {level.order.map((k, i) => (
                <div key={k} className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm text-content-primary w-20">{k}</span>
                  <button className={BUTTON_CLASS} disabled={i === 0} aria-label={`Move ${k} up at level ${floor}`} onClick={() => update(c => reorderKeys(c, floor, i, -1))}>Move up</button>
                  <button className={BUTTON_CLASS} disabled={i === level.order.length - 1} aria-label={`Move ${k} down at level ${floor}`} onClick={() => update(c => reorderKeys(c, floor, i, 1))}>Move down</button>
                  <button className={BUTTON_CLASS} onClick={() => update(c => removeOrderKey(c, floor, k))}>Remove</button>
                </div>
              ))}
              <select
                aria-label={`Put a command first at level ${floor}`}
                className={INPUT_CLASS}
                value=""
                onChange={e => { if (e.target.value) update(c => addOrderKey(c, floor, e.target.value)); }}
              >
                <option value="">Add a command to the order...</option>
                {unordered.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <button className={BUTTON_CLASS} onClick={() => update(c => removeLevel(c, floor))}>Remove level {floor}</button>
          </fieldset>
        );
      })}
    </div>
  );
}
