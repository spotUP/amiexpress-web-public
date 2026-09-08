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
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';

import { apiClient, type ApiError } from '../api/client';
import { Modal } from '../components/ui/Modal';
import { ScreenEditor } from '../components/ScreenEditor';
import { RipScreenEditor } from '../components/RipScreenEditor';
import { PetsciiScreenPreview } from '../components/PetsciiScreenPreview';
import { SkeletonRows } from '../components/ui/states';
import { useNotification } from '../contexts/NotificationContext';
import { screenToCanvas } from './screen-bytes';
import { blankCanvas, createSurface, type EditorSurface } from './screen-editor-state';
import type { ArtistTheme } from './use-my-theme';
import type { MciReferenceShape, ScreenIndexShape } from './screen-index-view';

interface ScreenFilePayload {
  content: string;
  format: 'ansi' | 'text' | 'petscii' | 'rip' | 'binary';
  bytes: number;
  mci?: MciReferenceShape[];
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
  const { showSuccess, showError } = useNotification();
  const [editing, setEditing] = useState<EditorSurface | null>(null);
  /** Set when the bytes cannot be read as a screen at all. */
  const [undrawable, setUndrawable] = useState<string | null>(null);

  // The same key the gallery card draws its thumbnail from, so a save repaints
  // the card rather than leaving yesterday's art on it.
  // The PAYLOAD, unwrapped here - ScreenFilesPage caches this key the same
  // way, and one key holding two shapes is how the New theme button vanished.
  const { data: file, isLoading } = useQuery({
    queryKey: ['screen-file', path],
    queryFn: async () => (await apiClient.getScreenFile(path as string)).data as ScreenFilePayload,
    enabled: !!path && !isNew,
  });

  /** Mine to change: the file sits inside this theme's own directory - or it
   *  does not exist yet and this theme is where it is about to. */
  const mine = isNew || (!!path && index?.files?.[path]?.theme === theme.slug);

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

  const save = useMutation({
    mutationFn: (base64: string) => apiClient.putScreenFile(path as string, base64, [path as string], { carryCodes: 'above' }),
    onSuccess: async () => {
      showSuccess('Saved');
      await queryClient.invalidateQueries({ queryKey: ['screen-index'] });
      await queryClient.invalidateQueries({ queryKey: ['screen-file', path] });
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
    </Modal>
  );
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
