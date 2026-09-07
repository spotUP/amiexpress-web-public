import { useEffect, useMemo, useRef, useState } from 'react';
import { MousePointerClick, Plus, Save, Trash2, X } from 'lucide-react';
import { RIPRenderer, RIP_HEIGHT, RIP_WIDTH, type RIPRendererRef } from '@amiexpress/terminal/rip';
import {
  parseRipDocument,
  serializeRipDocument,
  readRipHotspots,
  writeRipHotspot,
  removeRipHotspot,
  addRipMouseField,
  type RipDocument,
  type RipHotspot,
} from '@bbs/screens/rip-document';
import { base64ToLatin1, latin1ToBase64 } from '../pages/screen-bytes';

/**
 * A RIP screen, editable - without being a drawing program.
 *
 * A .rip file is a vector PROGRAM: the picture is a few hundred drawing
 * commands, and the parts a sysop actually needs to change are the clickable
 * ones - the mouse fields and buttons that send a command to the board when a
 * caller clicks them. Drawing tools would be a second art package; binding
 * the interactivity is a small bounded job, and it is the job that goes
 * stale when a conference moves or a door is renamed.
 *
 * So: the artwork is rendered by the same RIPtermJS the caller's terminal
 * draws with, the clickable regions are drawn over it, and only those are
 * edited. Everything else in the file is copied through byte for byte -
 * see web/backend/src/screens/rip-document.ts for why that matters and what
 * it cost to establish.
 */
export interface RipScreenEditorProps {
  /** The file's bytes, base64 as the API sends them. */
  content: string;
  /** The path being edited, shown so the sysop knows what they are changing. */
  filePath?: string;
  /**
   * Show the screen and its regions without offering to change them.
   *
   * The file panel's preview and the editor are the SAME component in two
   * modes rather than two components: a viewer and an editor that draw a file
   * differently is the bug this page has been bitten by before.
   */
  readOnly?: boolean;
  /** The edited screen as base64 - the shape an uploaded file arrives in. */
  onSave?: (base64: string) => void;
  onCancel?: () => void;
}

/** A rectangle being dragged out on the picture, in RIP coordinates. */
interface PendingRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function describeHotspot(spot: RipHotspot): string {
  if (spot.kind === 'button') return spot.label || spot.icon || 'A button';
  return `Mouse field ${spot.num ?? ''}`.trim();
}

export function RipScreenEditor({
  content, filePath, readOnly = false, onSave, onCancel,
}: RipScreenEditorProps) {
  const [doc, setDoc] = useState<RipDocument>(() => parseRipDocument(base64ToLatin1(content)));
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingRegion | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const rip = useRef<RIPRendererRef>(null);
  const surface = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);

  const text = useMemo(() => serializeRipDocument(doc), [doc]);
  const spots = useMemo(() => readRipHotspots(doc), [doc]);

  // A new picture, not a new session: reset() runs RIPscrip's own '*' and
  // leaves the renderer's stream alive. Redrawing on every edit is what makes
  // a coordinate change visible where the artwork is, rather than in a form.
  useEffect(() => {
    rip.current?.reset();
    rip.current?.render(text);
  }, [text]);

  // A file replaced under the editor (a fan-out write, a restored revision)
  // is a different screen, not an edit of this one.
  useEffect(() => {
    setDoc(parseRipDocument(base64ToLatin1(content)));
    setSelected(null);
  }, [content]);

  const chosen = selected !== null ? spots[selected] : undefined;

  /** Where a pointer event lands in RIP's own 640x350 coordinates. */
  const toRip = (event: { clientX: number; clientY: number }) => {
    const box = surface.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(RIP_WIDTH - 1, Math.round(((event.clientX - box.left) / box.width) * RIP_WIDTH))),
      y: Math.max(0, Math.min(RIP_HEIGHT - 1, Math.round(((event.clientY - box.top) / box.height) * RIP_HEIGHT))),
    };
  };

  const update = (patch: Partial<RipHotspot>) => {
    if (!chosen) return;
    try {
      setDoc(writeRipHotspot(doc, { ...chosen, ...patch }));
      setProblem(null);
    } catch (error) {
      // A coordinate past what two MegaNum digits hold would overrun the next
      // field; the document model refuses rather than corrupting the file.
      setProblem((error as Error).message);
    }
  };

  const commitRegion = (region: PendingRegion) => {
    const wide = Math.abs(region.x1 - region.x0) > 4 && Math.abs(region.y1 - region.y0) > 4;
    if (!wide) return;
    const next = addRipMouseField(doc, {
      x0: Math.min(region.x0, region.x1),
      y0: Math.min(region.y0, region.y1),
      x1: Math.max(region.x0, region.x1),
      y1: Math.max(region.y0, region.y1),
      command: '',
    });
    setDoc(next);
    setSelected(readRipHotspots(next).length - 1);
  };

  return (
    <section className="space-y-3 p-4" data-testid="rip-screen-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-content-secondary">
          {filePath ? `${filePath} - ` : ''}
          RIP graphics.{readOnly ? ' The clickable regions are outlined.' : ` The picture is left exactly as
          it is; what you can change here is where a caller can click and what
          that click sends to the board.`}
        </p>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => onCancel?.()}>
              <X size={14} className="mr-1 inline" /> Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => onSave?.(latin1ToBase64(serializeRipDocument(doc)))}
            >
              <Save size={14} className="mr-1 inline" /> Save
            </button>
          </div>
        )}
      </div>

      {problem && <p className="text-sm text-status-danger">{problem}</p>}

      <div className="flex flex-wrap gap-4">
        <div
          ref={surface}
          data-testid="rip-surface"
          className="relative w-[640px] max-w-full select-none bg-black"
          onPointerDown={event => {
            if (readOnly) return;
            const at = toRip(event);
            dragFrom.current = at;
            setPending({ x0: at.x, y0: at.y, x1: at.x, y1: at.y });
          }}
          onPointerMove={event => {
            if (!dragFrom.current) return;
            const at = toRip(event);
            setPending({ x0: dragFrom.current.x, y0: dragFrom.current.y, x1: at.x, y1: at.y });
          }}
          onPointerUp={() => {
            const region = pending;
            dragFrom.current = null;
            setPending(null);
            if (region) commitRegion(region);
          }}
        >
          <RIPRenderer ref={rip} width={RIP_WIDTH} height={RIP_HEIGHT} />

          {/* The clickable regions, drawn where the caller meets them. */}
          {spots.map((spot, index) => (
            <button
              key={`${spot.line}:${spot.index}`}
              type="button"
              data-testid="rip-hotspot"
              aria-label={`${describeHotspot(spot)}, sends ${spot.command || 'nothing'}`}
              className={`absolute border-2 ${
                index === selected ? 'border-accent' : 'border-status-info'
              }`}
              style={{
                left: `${(Math.min(spot.x0, spot.x1) / RIP_WIDTH) * 100}%`,
                top: `${(Math.min(spot.y0, spot.y1) / RIP_HEIGHT) * 100}%`,
                width: `${(Math.abs(spot.x1 - spot.x0) / RIP_WIDTH) * 100}%`,
                height: `${(Math.abs(spot.y1 - spot.y0) / RIP_HEIGHT) * 100}%`,
              }}
              onPointerDown={event => {
                event.stopPropagation();
                setSelected(index);
              }}
            />
          ))}

          {pending && (
            <div
              data-testid="rip-pending-region"
              className="pointer-events-none absolute border-2 border-dashed border-accent"
              style={{
                left: `${(Math.min(pending.x0, pending.x1) / RIP_WIDTH) * 100}%`,
                top: `${(Math.min(pending.y0, pending.y1) / RIP_HEIGHT) * 100}%`,
                width: `${(Math.abs(pending.x1 - pending.x0) / RIP_WIDTH) * 100}%`,
                height: `${(Math.abs(pending.y1 - pending.y0) / RIP_HEIGHT) * 100}%`,
              }}
            />
          )}
        </div>

        <div className="min-w-[18rem] flex-1 space-y-3">
          <div>
            <h4 className="text-content-primary">
              {spots.length === 0
                ? 'Nothing on this screen is clickable yet'
                : `${spots.length} clickable region${spots.length === 1 ? '' : 's'}`}
            </h4>
            {!readOnly && (
              <p className="text-sm text-content-secondary">
                Drag a rectangle on the picture to add one.
              </p>
            )}
          </div>

          <ul className="space-y-1">
            {spots.map((spot, index) => (
              <li key={`${spot.line}:${spot.index}`}>
                <button
                  type="button"
                  data-testid="rip-region-row"
                  className={`flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-sm ${
                    index === selected ? 'bg-surface-3' : 'hover:bg-surface-2'
                  }`}
                  onClick={() => setSelected(index)}
                >
                  <MousePointerClick size={14} className="shrink-0 text-content-muted" />
                  <span className="text-content-primary">{describeHotspot(spot)}</span>
                  <span className="text-content-secondary">
                    {spot.command ? `sends ${spot.command}` : 'sends nothing'}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {chosen && !readOnly && (
            <div className="card space-y-3">
              <label className="block">
                <span className="label">What a click sends to the board</span>
                <input
                  className="input-field w-full"
                  aria-label="What a click sends to the board"
                  value={chosen.command}
                  onChange={event => update({ command: event.target.value })}
                />
              </label>

              {chosen.kind === 'button' && (
                <label className="block">
                  <span className="label">Label on the button</span>
                  <input
                    className="input-field w-full"
                    aria-label="Label on the button"
                    value={chosen.label ?? ''}
                    onChange={event => update({ label: event.target.value })}
                  />
                </label>
              )}

              <div className="grid grid-cols-2 gap-2">
                {(['x0', 'y0', 'x1', 'y1'] as const).map(field => (
                  <label key={field} className="block">
                    <span className="label">
                      {{ x0: 'Left', y0: 'Top', x1: 'Right', y1: 'Bottom' }[field]}
                    </span>
                    <input
                      type="number"
                      className="input-field w-full"
                      aria-label={{ x0: 'Left', y0: 'Top', x1: 'Right', y1: 'Bottom' }[field]}
                      value={chosen[field]}
                      onChange={event => update({ [field]: Number(event.target.value) })}
                    />
                  </label>
                ))}
              </div>

              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm underline text-status-danger"
                onClick={() => {
                  setDoc(removeRipHotspot(doc, chosen));
                  setSelected(null);
                }}
              >
                <Trash2 size={14} /> Remove this region
              </button>
            </div>
          )}

          {!chosen && !readOnly && spots.length > 0 && (
            <p className="text-sm text-content-secondary">
              <Plus size={14} className="mr-1 inline" />
              Pick a region above, or on the picture, to change what it sends.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
