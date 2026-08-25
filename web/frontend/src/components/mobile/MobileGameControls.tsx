import { useRef, useCallback } from 'react';
import { layoutControls, type GameControlCluster, type GameControlDef, type GameControlPad } from './game-controls';
import { useHeldButtons } from './use-held-buttons';
import './MobileGameControls.css';

interface MobileGameControlsProps {
  layout: GameControlPad;
  /** Press: must emit a game-mode key-down. */
  onPress: (key: string, code: string) => void;
  /** Release: must emit the matching key-up. */
  onRelease: (key: string, code: string) => void;
}

const ACTIVE_CLASS = 'mobile-game-controls__key--active';

/**
 * Game-specific on-screen pad, shown instead of the generic BBS keyboard while
 * a door with a `pad` layout is running.
 *
 * Which thumb gets which cluster is the layout's call, not this component's:
 * it renders `layout.left` first and `layout.right` second and never assumes
 * movement is on either particular side.
 */
export function MobileGameControls({ layout, onPress, onRelease }: MobileGameControlsProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<GameControlDef[]>(layoutControls(layout));
  controlsRef.current = layoutControls(layout);

  const resolve = useCallback((target: EventTarget | null): GameControlDef | null => {
    const button = (target as HTMLElement | null)?.closest?.<HTMLButtonElement>('button[data-control-id]');
    if (!button) return null;
    return controlsRef.current.find(c => c.id === button.dataset.controlId) ?? null;
  }, []);

  const handlePress = useCallback(
    (control: GameControlDef) => onPress(control.key, control.code),
    [onPress],
  );
  const handleRelease = useCallback(
    (control: GameControlDef) => onRelease(control.key, control.code),
    [onRelease],
  );

  useHeldButtons(containerRef, {
    resolve,
    onPress: handlePress,
    onRelease: handleRelease,
    activeClass: ACTIVE_CLASS,
  });

  const renderKey = (control: GameControlDef) => (
    <button
      key={control.id}
      type="button"
      className="mobile-game-controls__key"
      data-control-id={control.id}
      aria-label={control.ariaLabel ?? control.label}
    >
      {control.label}
    </button>
  );

  const renderCluster = (cluster: GameControlCluster, side: 'left' | 'right') => (
    <div
      className={`mobile-game-controls__cluster mobile-game-controls__cluster--${side} mobile-game-controls__cluster--${cluster.role}`}
      data-cluster-side={side}
    >
      {cluster.keys.map(renderKey)}
    </div>
  );

  return (
    <div className="mobile-game-controls" ref={containerRef}>
      <div className="mobile-game-controls__title">{layout.title}</div>
      <div className="mobile-game-controls__pads">
        {renderCluster(layout.left, 'left')}
        {renderCluster(layout.right, 'right')}
      </div>
    </div>
  );
}
