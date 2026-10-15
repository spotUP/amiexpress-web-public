import { useCallback, useEffect, useState } from 'react';
import { LOGO_FILE_RE, type LogoPosition, type LogoRule, type MenuConfig, type MenuKind, type WidthClass } from '@bbs/screens/menu-config/menu-config';
import { apiClient, ApiError, type MenuLogoFile } from '../../api/client';
import { useNotification } from '../../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { ArtUploadButton } from '../ArtUploadButton';
import { ScreenEditor } from '../ScreenEditor';
import { createSurface, type EditorSurface } from '../../pages/screen-editor-state';
import { screenToCanvas } from '../../pages/screen-bytes';
import {
  addLogoFile, addLogoSet, logoOffers, logoSlotConflict, logoWidthWarnings, moveLogoFile, positionWidths, removeLogoFile, removeLogoSet,
  setLogoAfterSection, setLogoFloor, setLogoRule, usedByText,
} from './menu-logo-edit';
import { BUTTON_CLASS, INPUT_CLASS } from './menu-styles';

type Update = (change: (c: MenuConfig) => MenuConfig) => void;

const WIDTH_WORDS: Record<WidthClass, string> = { c64: 'C64', standard: 'Standard', wide: 'Wide' };
const RULE_WORDS: Record<LogoRule, string> = { fixed: 'One fixed logo', rotate: 'Rotate in order', random: 'Random each time' };
const POSITIONS: Array<{ position: LogoPosition; title: string; note?: string }> = [
  { position: 'header', title: 'Header' },
  { position: 'footer', title: 'Footer' },
  { position: 'side', title: 'Side panel', note: 'Wide screens only' },
  { position: 'between', title: 'Between sections' },
];
const logoPath = (kind: MenuKind, file: string) => `Screens/menus/${kind.toLowerCase()}/logos/${file}`;
const alphabetWord = (f: MenuLogoFile) => ((f.alphabet ?? (f.file.toLowerCase().endsWith('.seq') ? 'petscii' : 'ansi')) === 'petscii' ? 'PETSCII' : 'Amiga ANSI');

/** An existing Amiga ANSI logo, opened in the same editor the screens use; Save writes it back through the logo route. */
function LogoStudio({ kind, file, onClose, onSaved }: { kind: MenuKind; file: string; onClose: () => void; onSaved: () => void }) {
  const [surface, setSurface] = useState<EditorSurface | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiClient.getScreenFile(logoPath(kind, file)).then(async res => {
      const content = (res as { data?: { content?: string } }).data?.content ?? '';
      const canvas = await screenToCanvas(content, undefined, file);
      if (live) setSurface(createSurface(canvas));
    }).catch((e: unknown) => { if (live) setStatus(`Error: ${e instanceof Error ? e.message : 'Failed to open the logo'}`); });
    return () => { live = false; };
  }, [kind, file]);

  const save = async (base64: string) => {
    try {
      await apiClient.uploadMenuLogo(kind, file, base64);
      onSaved();
      onClose();
    } catch (e: unknown) { setStatus(`Error: ${e instanceof Error ? e.message : 'Save failed'}`); }
  };

  return (
    <Modal open onClose={onClose} title={file} showHeader={false} maxWidth="max-w-3xl">
      <div className="p-4 space-y-3">
        <h3 className="text-lg font-semibold text-content-primary font-mono">{file}</h3>
        {status && <p className="text-sm text-status-danger">{status}</p>}
        {surface ? <ScreenEditor surface={surface} mci={[]} filePath={logoPath(kind, file)} onChange={setSurface} onSave={save} onCancel={onClose} />
          : !status && <p className="text-sm text-content-secondary">Loading...</p>}
      </div>
    </Modal>
  );
}

function FilesPanel({ kind, files, loading, error, reload }: { kind: MenuKind; files: MenuLogoFile[]; loading: boolean; error: Error | null; reload: () => void }) {
  const { confirm } = useNotification();
  const [note, setNote] = useState<string | null>(null);
  const [studio, setStudio] = useState<string | null>(null);

  const upload = async (base64: string, chosen: File) => {
    setNote(null);
    if (!LOGO_FILE_RE.test(chosen.name)) { setNote('A logo file name is letters, digits, - and _, then .txt or .seq.'); return; }
    try { await apiClient.uploadMenuLogo(kind, chosen.name, base64); reload(); }
    catch (e: unknown) { setNote(e instanceof Error ? e.message : 'Failed to save the logo'); }
  };

  const remove = async (file: string) => {
    setNote(null);
    const ok = await confirm({ title: `Delete ${file}?`, message: 'The file is removed from the board.', confirmText: 'Delete' });
    if (!ok) return;
    try { await apiClient.deleteMenuLogo(kind, file); reload(); }
    catch (e: unknown) {
      const usedBy = e instanceof ApiError ? (e.data as { usedBy?: unknown } | undefined)?.usedBy : undefined;
      setNote(usedBy ? usedByText(usedBy) : e instanceof Error ? e.message : 'Failed to delete the logo');
    }
  };

  const columns: DataTableColumn<MenuLogoFile>[] = [
    { id: 'file', header: 'File', value: f => f.file, mono: true },
    { id: 'size', header: 'Size', value: f => f.rows * f.cols, cell: f => `${f.rows} x ${f.cols}` },
    { id: 'alphabet', header: 'Alphabet', value: f => alphabetWord(f) },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <ArtUploadButton label="Upload a logo" accept=".txt,.seq" onPick={upload} />
        <span className="text-xs text-content-secondary">Amiga ANSI as .txt for 80 columns and wider, PETSCII as .seq for the C64. The name is letters, digits, - and _.</span>
      </div>
      {note && <p role="alert" className="text-sm text-status-danger">{note}</p>}
      <DataTable
        columns={columns}
        rows={files}
        getRowId={f => f.file}
        isLoading={loading}
        error={error}
        onRetry={reload}
        emptyMessage="No logo files yet. Upload one to use it in a logo set."
        rowActions={f => (
          <>
            {f.file.toLowerCase().endsWith('.txt') && (
              <button className={BUTTON_CLASS} onClick={() => setStudio(f.file)} aria-label={`Open ${f.file} in the ANSI Studio`}>Open in the ANSI Studio</button>
            )}
            <button className={BUTTON_CLASS} onClick={() => remove(f.file)} aria-label={`Delete ${f.file}`}>Delete</button>
          </>
        )}
      />
      {studio && <LogoStudio kind={kind} file={studio} onClose={() => setStudio(null)} onSaved={reload} />}
    </div>
  );
}

function NewSetRow({ position, config, files, update }: { position: LogoPosition; config: MenuConfig; files: MenuLogoFile[]; update: Update }) {
  const widths = positionWidths(position);
  const [cls, setCls] = useState<WidthClass>(widths[0]);
  const [file, setFile] = useState('');
  const offers = logoOffers(files, cls);
  const conflict = logoSlotConflict(config, position, cls, 0);
  const name = position === 'between' ? 'between sections' : position === 'side' ? 'side panel' : position;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={`Width for a new ${name} set`} className={`${INPUT_CLASS} !w-auto`} value={cls} onChange={e => { setCls(e.target.value as WidthClass); setFile(''); }}>
        {widths.map(w => <option key={w} value={w}>{WIDTH_WORDS[w]}</option>)}
      </select>
      <select aria-label={`File for a new ${name} set`} className={`${INPUT_CLASS} !w-auto`} value={file} onChange={e => setFile(e.target.value)}>
        <option value="">Choose a file</option>
        {offers.map(o => <option key={o.file} value={o.file} disabled={!o.fits}>{o.file}{o.fits ? '' : ` - ${o.note}`}</option>)}
      </select>
      <button className={BUTTON_CLASS} disabled={!file || !!conflict} aria-label={`Add ${name} set`} onClick={() => { update(c => addLogoSet(c, files, position, cls, file)); setFile(''); }}>Add set</button>
      {conflict && <p role="alert" className="w-full text-xs text-status-danger">{conflict}</p>}
    </div>
  );
}

function SetRow({ index, config, files, update }: { index: number; config: MenuConfig; files: MenuLogoFile[]; update: Update }) {
  const set = config.logos[index];
  const [floorNote, setFloorNote] = useState<string | null>(null);
  const addable = logoOffers(files, set.widthClass).filter(o => !set.files.includes(o.file));
  return (
    <div className="border border-border rounded p-2 space-y-2 text-sm text-content-primary">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20">{WIDTH_WORDS[set.widthClass]}</span>
        <label className="flex items-center gap-1">From level
          <input aria-label={`From level of ${set.position} set ${index + 1}`} className={`${INPUT_CLASS} !w-24`} type="number" min={0} max={65535}
            value={set.levelFloor} onChange={e => {
              const floor = Number(e.target.value);
              const reason = logoSlotConflict(config, set.position, set.widthClass, floor, index);
              setFloorNote(reason);
              if (!reason) update(c => setLogoFloor(c, index, floor));
            }} />
        </label>
        <select aria-label={`Rule of ${set.position} set ${index + 1}`} className={`${INPUT_CLASS} !w-auto`} value={set.rule}
          onChange={e => update(c => setLogoRule(c, index, e.target.value as LogoRule))}>
          {(Object.keys(RULE_WORDS) as LogoRule[]).map(r => <option key={r} value={r}>{RULE_WORDS[r]}</option>)}
        </select>
        {set.position === 'between' && (
          <select aria-label={`After the section for set ${index + 1}`} className={`${INPUT_CLASS} !w-auto`} value={set.afterSection}
            onChange={e => update(c => setLogoAfterSection(c, index, Number(e.target.value)))}>
            {config.sections.map((s, i) => <option key={s.id} value={i}>After the section {s.title}</option>)}
          </select>
        )}
        <button className={BUTTON_CLASS} onClick={() => update(c => removeLogoSet(c, index))}>Remove set</button>
      </div>
      {floorNote && <p role="alert" className="text-xs text-status-danger">{floorNote}</p>}
      <ol className="space-y-1">
        {set.files.map((f, i) => (
          <li key={f} className="flex items-center gap-2">
            <span className="font-mono w-48 truncate">{f}</span>
            <button className={BUTTON_CLASS} disabled={i === 0} aria-label={`Move ${f} up`} onClick={() => update(c => moveLogoFile(c, index, i, -1))}>Move up</button>
            <button className={BUTTON_CLASS} disabled={i === set.files.length - 1} aria-label={`Move ${f} down`} onClick={() => update(c => moveLogoFile(c, index, i, 1))}>Move down</button>
            <button className={BUTTON_CLASS} disabled={set.files.length < 2} aria-label={`Remove ${f}`} onClick={() => update(c => removeLogoFile(c, index, f))}>Remove</button>
          </li>
        ))}
      </ol>
      <select aria-label={`Add a file to ${set.position} set ${index + 1}`} className={`${INPUT_CLASS} !w-auto`} value=""
        onChange={e => e.target.value && update(c => addLogoFile(c, files, index, e.target.value))}>
        <option value="">Add a file</option>
        {addable.map(o => <option key={o.file} value={o.file} disabled={!o.fits}>{o.file}{o.fits ? '' : ` - ${o.note}`}</option>)}
      </select>
    </div>
  );
}

/** The kind's logo files, then the logo sets: where each logo shows, for which screen width and caller level. */
export function MenuLogosEditor({ kind, config, update }: { kind: MenuKind; config: MenuConfig; update: Update }) {
  const [files, setFiles] = useState<MenuLogoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient.listMenuLogos(kind).then(setFiles, (e: unknown) => setError(e instanceof Error ? e : new Error('Failed to list the logos'))).finally(() => setLoading(false));
  }, [kind]);
  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <FilesPanel kind={kind} files={files} loading={loading} error={error} reload={load} />
      <p className="text-xs text-content-secondary">
        A logo set says which logos a position shows for one screen width and for callers at a level and above. A logo wider than the narrowest screen of its width (40, 80 or 120 columns) is never drawn, so it cannot be added.
      </p>
      {logoWidthWarnings(config, files).map(w => <p key={w} role="alert" className="text-sm text-status-danger">{w}</p>)}
      {POSITIONS.map(({ position, title, note }) => (
        <fieldset key={position} className="border border-border rounded p-3 space-y-2">
          <legend className="px-1 text-sm text-content-primary">{title}{note ? ` - ${note.toLowerCase()}` : ''}</legend>
          {config.logos.map((s, i) => (s.position === position ? <SetRow key={i} index={i} config={config} files={files} update={update} /> : null))}
          <NewSetRow position={position} config={config} files={files} update={update} />
        </fieldset>
      ))}
    </div>
  );
}
