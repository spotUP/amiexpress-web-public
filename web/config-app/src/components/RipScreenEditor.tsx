import { useEffect, useMemo, useRef, useState } from 'react';
import { MousePointerClick, Plus, Save, Trash2, X } from 'lucide-react';
import { RIPRenderer, RIP_HEIGHT, RIP_WIDTH, EGA_PALETTE, type RIPRendererRef } from '@amiexpress/terminal/rip';
import {
  parseRipDocument,
  serializeRipDocument,
  readRipHotspots,
  writeRipHotspot,
  removeRipHotspot,
  addRipButton,
  readRipButtonStyle,
  writeRipButtonStyle,
  type RipButtonStyle,
  addRipMouseField,
  type RipDocument,
  type RipHotspot,
} from '@bbs/screens/rip-document';
import { base64ToLatin1, latin1ToBase64 } from '../pages/screen-bytes';
import { apiClient } from '../api/client';

/**
 * The board's most-used built-in commands, so a sysop picks an action instead
 * of guessing a letter. Verified against handlers/command.handler.ts (each
 * carries its express.e line there); the fifty rarer internal commands stay
 * reachable through "Custom keystrokes".
 */
const COMMON_ACTIONS: { command: string; label: string }[] = [
  { command: 'F', label: 'File listings' },
  { command: 'N', label: 'New files' },
  { command: 'R', label: 'Read messages' },
  { command: 'E', label: 'Enter a message' },
  { command: 'J', label: 'Join a conference' },
  { command: 'B', label: 'Read bulletins' },
  { command: 'C', label: 'Comment to the sysop' },
  { command: 'O', label: 'Page the sysop' },
  { command: 'G', label: 'Log off' },
];

interface DoorOption { command: string; name: string; }

/** The four corners a resize handle can drag. */
export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

/** The smallest box a region may be shrunk to, in RIP units - matches the
 * "wide enough to be real" test the drawing tool uses. */
const RESIZE_MIN = 4;

/**
 * Move one corner of a region to `point`, keeping the box a valid rectangle:
 * a corner cannot cross its opposite (a minimum size is preserved) and stays
 * inside the RIP picture. Pure, so the geometry is tested without a layout.
 */
export function resizeCorner(
  spot: { x0: number; y0: number; x1: number; y1: number },
  corner: ResizeCorner,
  point: { x: number; y: number },
  bounds: { w: number; h: number } = { w: RIP_WIDTH, h: RIP_HEIGHT },
): { x0?: number; y0?: number; x1?: number; y1?: number } {
  const px = Math.max(0, Math.min(bounds.w - 1, Math.round(point.x)));
  const py = Math.max(0, Math.min(bounds.h - 1, Math.round(point.y)));
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';
  const out: { x0?: number; y0?: number; x1?: number; y1?: number } = {};
  if (west) out.x0 = Math.min(px, spot.x1 - RESIZE_MIN);
  else out.x1 = Math.max(px, spot.x0 + RESIZE_MIN);
  if (north) out.y0 = Math.min(py, spot.y1 - RESIZE_MIN);
  else out.y1 = Math.max(py, spot.y0 + RESIZE_MIN);
  return out;
}

/** What a region sends, in the words a sysop reads rather than a bare letter. */
function describeCommand(command: string, doors: DoorOption[]): string {
  if (!command) return 'sends nothing';
  const preset = COMMON_ACTIONS.find(a => a.command === command);
  if (preset) return `${preset.label} (${command})`;
  const door = doors.find(d => d.command === command);
  if (door) return `runs the ${door.name} door`;
  return `sends ${command}`;
}

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
  /** A save is in flight: the button disables and says so (see ScreenEditor). */
  saving?: boolean;
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
  content, filePath, readOnly = false, onSave, onCancel, saving = false,
}: RipScreenEditorProps) {
  const [doc, setDoc] = useState<RipDocument>(() => parseRipDocument(base64ToLatin1(content)));
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingRegion | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [doors, setDoors] = useState<DoorOption[]>([]);
  // Whether the raw "keystrokes" field is open for the selected region. STICKY
  // state, not derived from the command: while a sysop types JOIN 7, the value
  // passes through "J" (a known command), and re-deriving would snap the field
  // shut mid-word. Set when a region is selected and when a picker choice is
  // made; never on a keystroke.
  const [showCustom, setShowCustom] = useState(false);
  /** What the next dragged rectangle becomes. See `commitRegion`. */
  const [newKind, setNewKind] = useState<'mouse' | 'button'>('mouse');
  const [resizing, setResizing] = useState<ResizeCorner | null>(null);

  // The board's doors, for the "Run a door" group. A failure here is not fatal:
  // the picker still has the common actions and the custom field.
  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    apiClient.getDoors()
      .then(res => {
        const list = (res?.data as Array<{ door_name?: string; door_command?: string }> | undefined) ?? [];
        if (cancelled) return;
        setDoors(list
          .filter(d => d.door_command)
          .map(d => ({ command: d.door_command as string, name: d.door_name || (d.door_command as string) })));
      })
      .catch(() => { /* no doors: common actions and custom still work */ });
    return () => { cancelled = true; };
  }, [readOnly]);

  const isKnownCommand = (command: string) =>
    COMMON_ACTIONS.some(a => a.command === command) || doors.some(d => d.command === command);

  /**
   * Select a region and decide, ONCE, whether its command needs the raw field:
   * an empty or unrecognised command opens Custom, a known one shows the picker.
   */
  const selectRegion = (index: number | null) => {
    setSelected(index);
    const command = index !== null ? (spots[index]?.command ?? '') : '';
    setShowCustom(index !== null && !isKnownCommand(command));
  };

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

  /**
   * The style every button on this screen is drawn with (`1B`).
   *
   * It lives in the FILE, so a screen carries its own look wherever it is
   * opened - this board's browser draws it with the design system, and a RIP
   * terminal draws the same colours as a BGI bevel. The defaults below are
   * only used when a screen sets no style at all.
   */
  const style: RipButtonStyle = readRipButtonStyle(doc) ?? {
    width: 0, height: 0, orientation: 0, flags: 0, bevelSize: 1,
    labelColour: 15, labelShadowColour: 0, brightColour: 15, darkColour: 8,
    surfaceColour: 7, group: 0, flags2: 0, underlineColour: 15, cornerColour: 0,
  };

  const updateStyle = (patch: Partial<RipButtonStyle>) => {
    try {
      setDoc(writeRipButtonStyle(doc, { ...style, ...patch }));
      setProblem(null);
    } catch (error) {
      setProblem((error as Error).message);
    }
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
    const box = {
      x0: Math.min(region.x0, region.x1),
      y0: Math.min(region.y0, region.y1),
      x1: Math.max(region.x0, region.x1),
      y1: Math.max(region.y0, region.y1),
    };
    /*
     * TWO THINGS TO DRAW HERE, and the difference is who owns the look.
     *
     * A region is invisible: the art carries the picture and the region only
     * says where the clicking happens. That is what a screen drawn in
     * Illustrator wants, and it is the default for that reason - "drawing is
     * not a gap it will be done in illustrator" (sysop, 2026-09-14).
     *
     * A button is drawn BY RIP from the current button style, label and all,
     * which is what you want where there is no art behind it.
     */
    const next = newKind === 'button'
      ? addRipButton(doc, { ...box, command: '', label: '' })
      : addRipMouseField(doc, { ...box, command: '' });
    setDoc(next);
    setSelected(readRipHotspots(next).length - 1);
    setShowCustom(true); // a fresh region has no command yet
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
              className="btn-primary disabled:opacity-50"
              disabled={saving}
              onClick={() => onSave?.(latin1ToBase64(serializeRipDocument(doc)))}
            >
              <Save size={14} className="mr-1 inline" /> {saving ? 'Saving…' : 'Save'}
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
            // Dragging a corner handle takes priority over drawing a new box.
            if (resizing && chosen) { update(resizeCorner(chosen, resizing, toRip(event))); return; }
            if (!dragFrom.current) return;
            const at = toRip(event);
            setPending({ x0: dragFrom.current.x, y0: dragFrom.current.y, x1: at.x, y1: at.y });
          }}
          onPointerUp={() => {
            if (resizing) { setResizing(null); return; }
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
              aria-label={`${describeHotspot(spot)}, ${describeCommand(spot.command, doors)}`}
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
                selectRegion(index);
              }}
            />
          ))}

          {/* Corner handles for the selected region: drag to resize, instead
              of typing the four numbers. */}
          {chosen && !readOnly && (['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map(corner => {
            const left = corner === 'nw' || corner === 'sw' ? Math.min(chosen.x0, chosen.x1) : Math.max(chosen.x0, chosen.x1);
            const top = corner === 'nw' || corner === 'ne' ? Math.min(chosen.y0, chosen.y1) : Math.max(chosen.y0, chosen.y1);
            return (
              <div
                key={corner}
                role="button"
                aria-label={`Resize ${corner} corner`}
                data-testid="rip-resize-handle"
                className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize border border-white bg-accent"
                style={{ left: `${(left / RIP_WIDTH) * 100}%`, top: `${(top / RIP_HEIGHT) * 100}%` }}
                onPointerDown={event => { event.stopPropagation(); setResizing(corner); }}
              />
            );
          })}

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
                  onClick={() => selectRegion(index)}
                >
                  <MousePointerClick size={14} className="shrink-0 text-content-muted" />
                  <span className="text-content-primary">{describeHotspot(spot)}</span>
                  <span className="text-content-secondary">
                    {describeCommand(spot.command, doors)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {chosen && !readOnly && (() => {
            const currentKey =
              COMMON_ACTIONS.some(a => a.command === chosen.command) ? `cmd:${chosen.command}`
              : doors.some(d => d.command === chosen.command) ? `door:${chosen.command}`
              : 'custom';
            const pick = (key: string) => {
              if (key === 'custom') { setShowCustom(true); return; }
              setShowCustom(false);
              update({ command: key.startsWith('cmd:') ? key.slice(4) : key.slice(5) });
            };
            return (
            <div className="card space-y-3">
              <label className="block">
                <span className="label">When a caller clicks here</span>
                <select
                  className="input-field w-full"
                  aria-label="When a caller clicks here"
                  value={showCustom ? 'custom' : currentKey}
                  onChange={event => pick(event.target.value)}
                >
                  <optgroup label="Common actions">
                    {COMMON_ACTIONS.map(a => (
                      <option key={a.command} value={`cmd:${a.command}`}>{a.label} ({a.command})</option>
                    ))}
                  </optgroup>
                  {doors.length > 0 && (
                    <optgroup label="Run a door">
                      {doors.map(d => (
                        <option key={d.command} value={`door:${d.command}`}>{d.name}</option>
                      ))}
                    </optgroup>
                  )}
                  <option value="custom">Custom keystrokes&hellip;</option>
                </select>
              </label>
              {showCustom && (
                <label className="block">
                  <span className="label">What a click sends to the board</span>
                  <input
                    className="input-field w-full"
                    aria-label="What a click sends to the board"
                    value={chosen.command}
                    onChange={event => update({ command: event.target.value })}
                  />
                </label>
              )}

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
                className="btn-small btn-danger"
                onClick={() => {
                  setDoc(removeRipHotspot(doc, chosen));
                  setSelected(null);
                }}
              >
                <Trash2 size={14} /> Remove this region
              </button>
            </div>
            );
          })()}

          {/*
            HOW THE BUTTONS LOOK, for the whole screen.
            `1B` is in force for every button after it, so this is a property
            of the screen rather than of each button. It lives in the file, so
            the look travels with the art: a RIP terminal draws these colours
            as a bevel, and this board's browser draws them as a modern
            button. Only shown when there is a button to style.
          */}
          {!readOnly && spots.some(s => s.kind === 'button') && (
            <div className="card space-y-3">
              <p className="label">How the buttons look</p>
              {([
                ['surfaceColour', 'Face'],
                ['labelColour', 'Label'],
                ['brightColour', 'Top edge'],
                ['darkColour', 'Bottom edge'],
              ] as const).map(([field, label]) => (
                <label key={field} className="block">
                  <span className="label">{label}</span>
                  <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
                    {EGA_PALETTE.map((css, index) => (
                      <button
                        key={index}
                        type="button"
                        aria-label={`${label} colour ${index}`}
                        aria-pressed={style[field] === index}
                        onClick={() => updateStyle({ [field]: index } as Partial<RipButtonStyle>)}
                        className={`h-6 w-6 rounded border ${
                          style[field] === index ? 'border-accent ring-1 ring-accent' : 'border-border'
                        }`}
                        style={{ backgroundColor: css }}
                      />
                    ))}
                  </div>
                </label>
              ))}
              <label className="block">
                <span className="label">Edge thickness</span>
                <input
                  type="number"
                  className="input-field w-24"
                  aria-label="Edge thickness"
                  min={0}
                  max={9}
                  value={style.bevelSize}
                  onChange={event => updateStyle({ bevelSize: Number(event.target.value) || 0 })}
                />
              </label>
            </div>
          )}

          {!readOnly && (
            <label className="block">
              <span className="label">Dragging on the picture makes</span>
              <select
                className="input-field w-full"
                aria-label="Dragging on the picture makes"
                value={newKind}
                onChange={event => setNewKind(event.target.value as 'mouse' | 'button')}
              >
                {/* The art is authoritative by default: a region leaves the
                    picture to say what it looks like. */}
                <option value="mouse">A clickable region, over your own art</option>
                <option value="button">A button RIP draws, with a label</option>
              </select>
            </label>
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
