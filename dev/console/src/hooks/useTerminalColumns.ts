import { useEffect, useState } from 'react';

/**
 * The terminal's current width, updated when it changes.
 *
 * Ink gives the stream but not its resizes, and the console is normally a
 * tmux pane: zooming it (Ctrl+B z) or resizing the window changes how much
 * room the content has. Anything that decides what fits has to see that.
 */
export function useTerminalColumns(): number | undefined {
  const [columns, setColumns] = useState<number | undefined>(process.stdout.columns);

  useEffect(() => {
    const onResize = () => setColumns(process.stdout.columns);
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  return columns;
}
