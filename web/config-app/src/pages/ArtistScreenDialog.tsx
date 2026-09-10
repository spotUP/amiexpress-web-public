/**
 * One screen, opened by the artist who may or may not own it yet.
 *
 * Deliberately NOT the sysop's file dialog. That one carries a fan-out picker
 * because the board has seventy-one copies of `Node<n>/BBSTITLE.txt` and a
 * write has to choose between them; a theme collapses those to one
 * `Node/BBSTITLE.txt`, so there is one target and no choice to make. It also
 * carries Replace, Delete, the art/runtime flag and the share planner - every
 * one of which the sandbox refuses to an artist anyway.
 *
 * The board's own art opens read-only with one way forward: redraw it into the
 * theme, which copies the screen (and its security variants, and its .seq and
 * .rip twins) and reopens on the copy, editable.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, History, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';

import { apiClient, type ApiError } from '../api/client';
import { Modal } from '../components/ui/Modal';
import { ScreenEditor } from '../components/ScreenEditor';
import { RipScreenEditor } from '../components/RipScreenEditor';
import { PetsciiScreenPreview } from '../components/PetsciiScreenPreview';
import { fanOutOptions } from './screen-write-plan';
import { SkeletonRows } from '../components/ui/states';
import { useNotification } from '../contexts/NotificationContext';
import { screenToCanvas } from './screen-bytes';
import { blankCanvas, createSurface, type EditorSurface } from './screen-editor-state';
import type { ArtistTheme } from './use-my-theme';
import { describeProblem, missingFormats, type MciReferenceShape, type ScreenIndexShape } from './screen-index-view';
import { ScreenRevisionsPanel } from './ScreenRevisionsPanel';
import { CodeChip } from '../components/CodeChip';

interface ScreenFilePayload {
  content: string;
  format: 'ansi' | 'text' | 'petscii' | 'rip' | 'binary';
  bytes: number;
  mci?: MciReferenceShape[];
  /** What the board thinks is wrong with these bytes, if anything. */
  problems?: string[];
}

export interface ArtistScreenDialogProps {
  /** Board-relative path of the open screen, or null when the dialog is shut. */
  path: string | null;
  /**
   * The theme has no file here yet - the artist picked it off the checklist.
   * There is nothing to fetch and nothing to read-only; open a blank screen
   * and let Save create it.
   */
  isNew?: boolean;
  /** What this slot is for, shown while the canvas is still empty. */
  newDescription?: string;
  theme: ArtistTheme;
  index: ScreenIndexShape | undefined;
  onClose: () => void;
  /** Reopen on another path - how a redraw lands the artist on their copy. */
  onOpenPath: (path: string) => void;
}

export function ArtistScreenDialog({ path, theme, index, onClose, onOpenPath, isNew = false, newDescription }: ArtistScreenDialogProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [editing, setEditing] = useState<EditorSurface | null>(null);
  /** Set when the bytes cannot be read as a screen at all. */
  const [undrawable, setUndrawable] = useState<string | null>(null);
  const replaceInput = useRef<HTMLInputElement | null>(null);
  const addFormatInput = useRef<HTMLInputElement | null>(null);
  const ansiUploadInput = useRef<HTMLInputElement | null>(null);
  /** Which format the artist is about to add, once they pick a file. */
  const [addingFormat, setAddingFormat] = useState<{ ext: string; label: string; path: string } | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);
  /**
   * What replacing this screen would do to its codes, from the board's own dry
   * run, and what the artist chose about it.
   *
   * A screen is a program: `~CC_` runs a door, `~SS_` pulls in a logo. An ANSI
   * editor writes none of them, so dropping a fresh drawing over a screen used
   * to silently delete every code in it - the art painted and the keys stopped
   * working. The board answers what would be carried; the artist decides.
   */
  const [carryVerdict, setCarryVerdict] = useState<{ carried: string[]; lost: string[]; uploadHasCodes?: boolean } | null>(null);
  const [carryCodes, setCarryCodes] = useState<'none' | 'above' | 'below'>('above');
  const [pendingUpload, setPendingUpload] = useState<{ bytes: string; name: string } | null>(null);

  // The same key the gallery card draws its thumbnail from, so a save repaints
  // the card rather than leaving yesterday's art on it.
  // The PAYLOAD, unwrapped here - ScreenFilesPage caches this key the same
  // way, and one key holding two shapes is how the New theme button vanished.
  const { data: file, isLoading } = useQuery({
    queryKey: ['screen-file', path, theme.slug],
    queryFn: async () => (await apiClient.getScreenFile(path as string, theme.slug)).data as ScreenFilePayload,
    enabled: !!path && !isNew,
  });

  /** Mine to change: the file sits inside this theme's own directory - or it
   *  does not exist yet and this theme is where it is about to. */
  /*
   * Whether this file is the one THIS theme owns.
   *
   * For `default` - the board's own screens - the file to edit is the board's,
   * which carries no theme at all. Comparing it to the slug called every board
   * screen "somebody else's" and offered "Redraw this in The board's own
   * screens", which would have copied the board's art into a theme that IS the
   * board. Whoever may open `default` may edit its files: the sandbox decides
   * that, and it refuses the write if they may not.
   */
  const mine = isNew
    || (!!path && (theme.slug === 'default'
      ? !index?.files?.[path]?.theme
      : index?.files?.[path]?.theme === theme.slug));

  useEffect(() => {
    // Cleared FIRST, before any early return. Cleared only on the decoding
    // path, one screen the browser could not read left the message set for
    // every screen opened after it.
    setUndrawable(null);

    // A slot the theme has not drawn yet opens as an empty 80x25 canvas -
    // which is what the artist asked for by clicking it on the checklist.
    if (isNew) {
      setEditing(createSurface(blankCanvas()));
      return;
    }

    if (!file || !mine || file.format === 'rip' || file.format === 'petscii') {
      setEditing(null);
      return;
    }
    let live = true;
    screenToCanvas(file.content)
      .then(canvas => { if (live) setEditing(createSurface(canvas)); })
      // A screen the browser cannot decode is a screen, not a crash: say so
      // and leave the artist their way out. Without the catch this was an
      // unhandled rejection and a dialog that stayed blank for ever.
      .catch(() => { if (live) setUndrawable('These bytes cannot be read as ANSI art.'); });
    return () => { live = false; };
  }, [file, mine, path, isNew]);

  const redraw = useMutation({
    mutationFn: () => apiClient.copyScreenIntoTheme(theme.slug, path as string),
    onSuccess: async (answer: { data?: { to?: string }; message?: string }) => {
      if (answer.message) showSuccess(answer.message);
      await queryClient.invalidateQueries({ queryKey: ['screen-index'] });
      await queryClient.invalidateQueries({ queryKey: ['screen-themes'] });
      await queryClient.invalidateQueries({ queryKey: ['screen-theme-validation', theme.slug] });
      if (answer.data?.to) onOpenPath(answer.data.to);
    },
    onError: (error: ApiError) => {
      // 409 is "you already redrew this" - the artist wanted to edit it, so
      // take them there rather than making them find it themselves.
      if (error.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['screen-index'] });
        showSuccess(error.message);
        return;
      }
      showError(error.message);
    },
  });

  /*
   * EVERY COPY THIS CARD STANDS FOR.
   *
   * A screen exists once per node, and this board keeps 41 separate
   * `BBSTITLE.SEQ` files. The gallery shows one card for all of them - it
   * dedupes by content and says "and 40 identical copies" - but this dialog
   * wrote the ONE path behind that card. The sysop uploaded a PETSCII title,
   * the write landed on `Node0/BBSTITLE.SEQ`, and the caller on node 1 was
   * served `Node1/BBSTITLE.SEQ` from November: "i uploaded a petscii bbs
   * title now but it doesnt display the ansi displays".
   *
   * `fanOutOptions` is the sysop page's own rule, and its `same-content`
   * option is the honest default here: writing bytes that are already
   * identical everywhere changes nothing that was not already the same.
   *
   * SCOPED TO WHAT THIS ACCOUNT MAY WRITE. An artist's twins are inside their
   * theme; the board's copies are the sysop's. Sending a target the sandbox
   * refuses would fail the whole write, so they are filtered here rather than
   * discovered as a 403.
   */
  const writeTargets = useMemo((): string[] => {
    if (!path) return [];
    if (!index) return [path];
    const screen = index.files?.[path]?.readBy?.[0]?.screen ?? '';
    const options = fanOutOptions(index, screen, path);

    /*
     * EVERY COPY OF THE SCREEN, not only the ones that still match this file.
     *
     * `same-content` covers the copies that are byte-identical to the one
     * being edited - which is exactly wrong once a copy has DIVERGED. The
     * sysop uploaded a PETSCII title, it landed on `Node0/BBSTITLE.SEQ`, and
     * from then on that file matched nothing: the next upload fanned out to
     * itself alone, and the board went on serving the other 46 copies. He
     * said it twice - "the bbs still reads the old bbs title petscii".
     *
     * So the target set is the union: every file the SCREEN resolves to (what
     * the board actually reads, per node and conference) plus every file that
     * is still identical to this one (the copies no resolution names, like a
     * `Conf<n>/Screens/` twin). Re-converging a screen is the point of
     * editing it here.
     */
    const identical = [...new Set([
      path,
      ...(options.find(option => option.choice === 'all-copies')?.targets ?? []),
      ...(options.find(option => option.choice === 'same-content')?.targets ?? []),
    ])];

    const themeRoot = `themes/${theme.slug.toLowerCase()}/`;
    const mineToWrite = (rel: string) => (theme.slug === 'default'
      // The board's own screens: every copy that is already this file.
      ? !rel.toLowerCase().startsWith('themes/')
      : rel.toLowerCase().startsWith(themeRoot));

    const scoped = identical.filter(mineToWrite);
    return scoped.includes(path) ? scoped : [path];
  }, [path, index, theme.slug]);

  /**
   * The file is not there YET.
   *
   * A format strip lists the versions a screen could have, and one of them is
   * often missing - a bulletin with `.txt` and no `.seq`. Opening it asked the
   * board for a file that does not exist and showed nothing at all, because
   * the route answered a refusal rather than "not found" and the dialog had
   * nowhere to put either. Now it says so, and points at the way to make one.
   */
  const missingFile = !isLoading && !file && !isNew && !!path;

  const save = useMutation({
    mutationFn: (base64: string) =>
      apiClient.putScreenFile(path as string, base64, writeTargets, { carryCodes: 'above' }),
    onSuccess: async () => {
      showSuccess(writeTargets.length > 1 ? `Saved ${writeTargets.length} copies` : 'Saved');
      await queryClient.invalidateQueries({ queryKey: ['screen-index'] });
      await queryClient.invalidateQueries({ queryKey: ['screen-file', path] });
    },
    onError: (error: Error) => showError(error.message),
  });

  /**
   * The screen's other formats, and the ones it does not have.
   *
   * A caller is served by EXTENSION - the loader looks for `<stem>.rip` on a
   * RIP terminal, `<stem>.seq` on a C64 and the text file otherwise - so a
   * theme with only `.txt` shows the board's own art to two thirds of the
   * board. An artist has to be able to draw all three, which is why these
   * controls are here and not only on the sysop's page.
   */
  const siblings = useMemo(() => {
    if (!path || !index?.files) return [];
    const dir = path.slice(0, path.lastIndexOf('/') + 1);
    const stem = (path.slice(path.lastIndexOf('/') + 1)).replace(/\.(txt|seq|rip|gr|ibm|ans)$/i, '').toLowerCase();
    return Object.keys(index.files).filter(rel => {
      if (!rel.toLowerCase().startsWith(dir.toLowerCase())) return false;
      const name = rel.slice(rel.lastIndexOf('/') + 1);
      return name.replace(/\.(txt|seq|rip|gr|ibm|ans)$/i, '').toLowerCase() === stem;
    });
  }, [path, index]);

  const missing = useMemo(() => {
    // A blank slot draws its ANSI on the canvas; the other formats arrive
    // by upload. Before, an empty slot offered neither - "i cant upload
    // screens to this one" - because the whole strip was gated on !isNew.
    if (isNew) return missingFormats(path, []);
    return missingFormats(path, siblings);
  }, [path, siblings, isNew]);

  /** Bytes, never text, all the way through. */
  const readAsBase64 = (chosen: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.readAsDataURL(chosen);
    });

  const writeBytes = useMutation({
    mutationFn: ({ target, bytes, carry }: { target: string; bytes: string; carry?: 'none' | 'above' | 'below' }) =>
      apiClient.putScreenFile(target, bytes, target === path ? writeTargets : [target], { carryCodes: carry ?? 'above' }),
    onSuccess: async (_answer, { target }) => {
      setPendingUpload(null);
      setCarryVerdict(null);
      showSuccess(target === path && writeTargets.length > 1
        ? `Saved ${target.split('/').pop()} - ${writeTargets.length} copies`
        : `Saved ${target.split('/').pop()}`);
      await queryClient.invalidateQueries({ queryKey: ['screen-index'] });
      await queryClient.invalidateQueries({ queryKey: ['screen-file', target] });
      await queryClient.invalidateQueries({ queryKey: ['screen-themes'] });
      if (target !== path) onOpenPath(target);
    },
    onError: (error: Error) => showError(error.message),
  });

  const title = path ? path.split('/').pop() ?? path : '';

  return (
    <Modal open={!!path} title={title} onClose={onClose} maxWidth="max-w-4xl">
      {isLoading && <SkeletonRows rows={4} />}

      {isNew && (
        <p className="text-sm text-content-secondary">
          Nothing has been drawn here yet.{newDescription ? ` ${newDescription}.` : ''} Save
          when you are happy and it becomes part of {theme.title}.
        </p>
      )}

      {missingFile && (
        <p className="text-sm text-content-secondary" data-testid="screen-not-there">
          Nothing is drawn at <span className="font-mono">{path}</span> yet. Use
          &ldquo;Upload a drawing&rdquo; on the version that does exist, or the
          format buttons above, to make one.
        </p>
      )}

      {file && !mine && (
        <div className="space-y-3">
          <p className="text-sm text-content-secondary">
            The board&apos;s own screen. Redraw it to make a copy in{' '}
            <span className="text-content-primary">{theme.title}</span> - callers wearing your
            theme see yours, everybody else keeps this one.
          </p>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            disabled={redraw.isPending}
            onClick={() => redraw.mutate()}
          >
            <Copy size={16} /> Redraw this in {theme.title}
          </button>
        </div>
      )}

      {/* Every format this screen has, and the ones it does not. A caller is
          served by extension, so this is the difference between a theme that
          covers the board and one that covers a third of it. */}
      {!isNew && (file || siblings.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {siblings.map(sibling => (
            <button
              key={sibling}
              type="button"
              aria-pressed={sibling === path}
              className={`px-2 py-1 border ${sibling === path
                ? 'border-border-strong text-content-primary'
                : 'border-border text-content-secondary'}`}
              onClick={() => onOpenPath(sibling)}
            >
              {formatLabel(sibling)}
            </button>
          ))}
          {mine && missing.map(gap => (
            <button
              key={gap.ext}
              type="button"
              className="px-2 py-1 border border-dashed border-border text-content-secondary"
              onClick={() => { setAddingFormat(gap); addFormatInput.current?.click(); }}
            >
              + {gap.label}
            </button>
          ))}
          <input
            ref={addFormatInput}
            type="file"
            aria-label="Add a format"
            className="hidden"
            onChange={async event => {
              const chosen = event.target.files?.[0];
              event.target.value = '';
              if (!chosen || !addingFormat) return;
              writeBytes.mutate({ target: addingFormat.path, bytes: await readAsBase64(chosen) });
              setAddingFormat(null);
            }}
          />
        </div>
      )}
      {isNew && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-content-secondary">ANSI draws on the canvas below. Bring the rest:</span>
          <button
            type="button"
            className="px-2 py-1 border border-dashed border-border text-content-secondary"
            onClick={() => ansiUploadInput.current?.click()}
          >
            + ANSI drawing
          </button>
          {missing.map(gap => (
            <button
              key={gap.ext}
              type="button"
              className="px-2 py-1 border border-dashed border-border text-content-secondary"
              onClick={() => { setAddingFormat(gap); addFormatInput.current?.click(); }}
            >
              + {gap.label}
            </button>
          ))}
          <input
            ref={ansiUploadInput}
            type="file"
            aria-label="Upload ANSI drawing"
            className="hidden"
            onChange={async event => {
              const chosen = event.target.files?.[0];
              event.target.value = '';
              if (!chosen || !path) return;
              // Fresh file: nothing to carry over. The write invalidates
              // the index, the slot flips to drawn, and the dialog shows
              // the uploaded art.
              writeBytes.mutate({ target: path, bytes: await readAsBase64(chosen) });
            }}
          />
          <input
            ref={addFormatInput}
            type="file"
            aria-label="Add a format"
            className="hidden"
            onChange={async event => {
              const chosen = event.target.files?.[0];
              event.target.value = '';
              if (!chosen || !addingFormat) return;
              writeBytes.mutate({ target: addingFormat.path, bytes: await readAsBase64(chosen) });
              setAddingFormat(null);
            }}
          />
        </div>
      )}

      {(file || isNew) && (
        <div className="mt-3">
          {file?.format === 'rip' ? (
            <RipScreenEditor
              content={file?.content ?? ''}
              filePath={path ?? undefined}
              readOnly={!mine}
              onSave={mine ? bytes => save.mutate(bytes) : undefined}
              onCancel={onClose}
            />
          ) : file?.format === 'petscii' ? (
            <PetsciiScreenPreview content={file.content} />
          ) : undrawable ? (
            <p className="text-sm text-status-warn">{undrawable}</p>
          ) : editing ? (
            <ScreenEditor
              surface={editing}
              mci={file?.mci ?? []}
              filePath={path ?? undefined}
              onChange={setEditing}
              onSave={base64 => save.mutate(base64)}
              onCancel={onClose}
            />
          ) : (
            <ReadOnlyArt content={file?.content ?? ''} mci={file?.mci ?? []} filePath={path} onClose={onClose} />
          )}
        </div>
      )}

      {!isNew && file && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {mine && (
            <>
              {/* Most ANSI artists draw in PabloDraw or Moebius and bring the
                  file in. Without this the studio could only edit what it
                  could draw itself. */}
              <button
                type="button"
                className="inline-flex items-center gap-1 underline"
                onClick={() => replaceInput.current?.click()}
              >
                <Upload size={14} /> Upload a drawing
              </button>
              <input
                ref={replaceInput}
                type="file"
                aria-label="Upload a drawing"
                className="hidden"
                onChange={async event => {
                  const chosen = event.target.files?.[0];
                  event.target.value = '';
                  if (!chosen || !path) return;
                  const bytes = await readAsBase64(chosen);
                  setPendingUpload({ bytes, name: chosen.name });
                  // A dry run: the board answers what it would carry and
                  // writes nothing, so it is safe the moment a file is picked.
                  try {
                    const res = await apiClient.putScreenFile(path, bytes, writeTargets, { carryCodes: 'above', dryRun: true });
                    setCarryVerdict(((res.data?.targets ?? [])[0] ?? null) as typeof carryVerdict);
                  } catch {
                    // A verdict is an aid, not a gate.
                    setCarryVerdict(null);
                  }
                }}
              />
            </>
          )}
          {/* Through the API CLIENT, never an <a href>: these endpoints are
              behind the same auth as everything else and a link cannot carry
              an Authorization header, which is why Download once answered
              {"error":"Access token required"}. */}
          <button
            type="button"
            className="inline-flex items-center gap-1 underline"
            onClick={async () => {
              if (!path) return;
              try {
                await apiClient.downloadFile(
                  `/api/screens/file?path=${encodeURIComponent(path)}&download=1`,
                  path.split('/').pop() ?? 'screen',
                );
              } catch (error) {
                showError(`Download failed: ${(error as Error).message}`);
              }
            }}
          >
            <Download size={14} /> Download
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1 underline"
            onClick={() => setShowRevisions(open => !open)}
          >
            <History size={14} /> {showRevisions ? 'Hide history' : 'History'}
          </button>

          {mine && (
            /* An artist may drop their own version so the board's art shows
               again. It is their file, inside their theme, and the sandbox
               already allows it - refusing here would be this page inventing
               a rule the board does not have. */
            <button
              type="button"
              className="inline-flex items-center gap-1 underline text-status-danger"
              onClick={async () => {
                if (!path) return;
                const ok = await confirm({
                  title: 'Drop your version of this screen?',
                  message: `${path.split('/').pop()} is backed up beside itself, then removed. Callers wearing ${theme.title} go back to the board's own art.`,
                  confirmText: 'Drop it',
                });
                if (!ok) return;
                try {
                  await apiClient.deleteScreenFile(path);
                  showSuccess('Dropped. The board\'s art shows again.');
                  await queryClient.invalidateQueries({ queryKey: ['screen-index'] });
                  await queryClient.invalidateQueries({ queryKey: ['screen-themes'] });
                  onClose();
                } catch (error) {
                  showError((error as Error).message);
                }
              }}
            >
              <Trash2 size={14} /> Drop mine
            </button>
          )}
        </div>
      )}

      {/* What a replacement would do to the screen's codes, before it happens. */}
      {pendingUpload && (
        <div className="mt-3 space-y-2 border border-border p-3 text-sm">
          <p className="text-content-primary">Replace with {pendingUpload.name}?</p>
          {carryVerdict && (carryVerdict.carried.length > 0 || carryVerdict.lost.length > 0) && (
            <>
              <p className="text-content-secondary">
                This screen carries codes the board runs. Your drawing has none of its own.
              </p>
              {carryVerdict.carried.length > 0 && (
                <p>Kept: {carryVerdict.carried.map(code => <CodeChip key={code}>{code}</CodeChip>)}</p>
              )}
              {carryVerdict.lost.length > 0 && (
                <p className="text-status-warn">
                  Lost unless you keep them: {carryVerdict.lost.map(code => <CodeChip key={code}>{code}</CodeChip>)}
                </p>
              )}
              <label className="flex items-center gap-2">
                <span className="text-content-secondary">Keep these codes</span>
                <select
                  className="input-field"
                  aria-label="Keep these codes"
                  value={carryCodes}
                  onChange={event => setCarryCodes(event.target.value as 'none' | 'above' | 'below')}
                >
                  <option value="above">above the art</option>
                  <option value="below">below the art</option>
                  <option value="none">not at all</option>
                </select>
              </label>
            </>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-primary"
              onClick={() => path && writeBytes.mutate({ target: path, bytes: pendingUpload.bytes, carry: carryCodes })}
            >
              Write it
            </button>
            <button
              type="button"
              className="underline text-content-secondary"
              onClick={() => { setPendingUpload(null); setCarryVerdict(null); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* The codes in this screen, and whether each still points at something. */}
      {file?.mci && file.mci.length > 0 && (
        <div className="mt-3 space-y-1 text-sm">
          <h3 className="text-content-primary">Codes in this screen</h3>
          <ul className="space-y-1">
            {file.mci.map((ref, index) => (
              <li key={`${ref.code}-${index}`} className="flex flex-wrap items-center gap-2">
                <CodeChip>{`~${ref.code}_${ref.target ?? ''}`}</CodeChip>
                {ref.resolves === false && <span className="text-status-danger">points at nothing</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {file?.problems && file.problems.length > 0 && (
        <p className="mt-3 text-sm text-status-warn">
          {file.problems.map(describeProblem).join('; ')}
        </p>
      )}

      {showRevisions && path && (
        <ScreenRevisionsPanel path={path} onClose={() => setShowRevisions(false)} />
      )}
    </Modal>
  );
}

/** `BBSTITLE.SEQ` -> `PETSCII`, for a tab an artist can read. */
function formatLabel(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.seq')) return 'PETSCII';
  if (lower.endsWith('.rip')) return 'RIP';
  if (lower.endsWith('.gr')) return 'Amiga ANSI';
  return 'ANSI / text';
}

/**
 * The board's art, drawn by the editor with every tool taken away.
 *
 * The same component the artist will draw in the moment they press redraw, so
 * what they are looking at is what they will be editing - a separate viewer
 * drifts from the editor and the artist redraws the wrong thing.
 */
function ReadOnlyArt(
  { content, mci, filePath, onClose }:
  { content: string; mci: MciReferenceShape[]; filePath: string | null; onClose: () => void },
) {
  const [surface, setSurface] = useState<EditorSurface | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    screenToCanvas(content)
      .then(canvas => { if (live) setSurface(createSurface(canvas)); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [content]);

  if (failed) return <p className="text-sm text-status-warn">These bytes cannot be read as ANSI art.</p>;
  if (!surface) return <SkeletonRows rows={3} />;
  return (
    <ScreenEditor
      surface={surface}
      mci={mci}
      filePath={filePath ?? undefined}
      readOnly
      onCancel={onClose}
      onDownload={undefined}
    />
  );
}
