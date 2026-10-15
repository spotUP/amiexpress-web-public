import { Copy, Download, PencilLine, Upload } from 'lucide-react';
import { slotAffordances, type ScreenSlotState, type SlotAction } from '../pages/screen-slot-state';

/**
 * What this slot is, in a sentence, and every way forward it permits.
 *
 * The line that was missing. An artist who could not draw had no way to find
 * out why - whether it was the theme, the missing file or the format - because
 * the dialog computed the answer four different ways and rendered none of it.
 * This renders the answer and nothing else.
 *
 * It is deliberately dumb: `slotAffordances` decides WHAT to offer, this
 * decides how it looks. A button appears here only if the caller passed a
 * handler for it, so an action the page cannot honour is never drawn - and
 * the state's own test guarantees the list is never empty to begin with.
 */
export interface ScreenSlotBannerProps {
  state: ScreenSlotState;
  onDraw?: () => void;
  onUpload?: () => void;
  onCopyBoard?: (from: string) => void;
  onRedrawIntoMine?: () => void;
  onDownload?: () => void;
  /** Named in the redraw button, because "redraw it where" is the question. */
  themeTitle: string;
  busy?: boolean;
}

const ICONS: Record<SlotAction, typeof Copy> = {
  draw: PencilLine,
  upload: Upload,
  'copy-board': Copy,
  'redraw-into-mine': Copy,
  download: Download,
};

export function ScreenSlotBanner({
  state, onDraw, onUpload, onCopyBoard, onRedrawIntoMine, onDownload, themeTitle, busy = false,
}: ScreenSlotBannerProps) {
  const { sentence, actions } = slotAffordances(state);

  const boardCopy = state.kind === 'yours-undrawn' ? state.boardCopy : undefined;

  const label: Record<SlotAction, string> = {
    draw: 'Draw one here',
    upload: 'Upload a drawing',
    'copy-board': "Start from the board's",
    'redraw-into-mine': `Redraw this in ${themeTitle}`,
    download: 'Download',
  };

  const handler: Record<SlotAction, (() => void) | undefined> = {
    draw: onDraw,
    upload: onUpload,
    'copy-board': boardCopy && onCopyBoard ? () => onCopyBoard(boardCopy) : undefined,
    'redraw-into-mine': onRedrawIntoMine,
    download: onDownload,
  };

  const offered = actions.filter(action => handler[action]);

  return (
    <div className="space-y-2" data-testid="screen-slot-banner">
      <p className="text-sm text-content-secondary" data-testid="screen-slot-sentence">
        {sentence}
      </p>
      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {offered.map(action => {
            const Icon = ICONS[action];
            return (
              <button
                key={action}
                type="button"
                disabled={busy}
                className="inline-flex items-center gap-1 px-2 py-1 border border-border text-sm"
                onClick={handler[action]}
              >
                <Icon size={14} /> {label[action]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
