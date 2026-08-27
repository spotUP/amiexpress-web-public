/**
 * The application frame: fixed sidebar, fixed header, scrolling content.
 *
 * Replaces the old Layout, which centred every page in a `container mx-auto`
 * with 32 px of padding - on a wide screen that left a data tool rendering
 * tables in a narrow column with empty space either side.
 */

import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-5">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
