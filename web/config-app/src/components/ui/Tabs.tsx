/**
 * Tabs for the merged screens, on Radix.
 *
 * The active tab lives in the URL as `?tab=`, not in component state, so a
 * bookmark, a link in a runbook and the browser's back button all keep
 * working. Every legacy path that was folded into a tab redirects to its tab
 * through this parameter - see the route table in App.tsx.
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export interface TabDefinition {
  id: string;
  label: string;
  /** Lazily rendered: a tab that is not open mounts nothing. */
  render: () => ReactNode;
  /**
   * Keep the tab mounted while another one is open.
   *
   * For anything holding live state - an operator chat in progress, a
   * terminal - unmounting on a tab change would drop it. Such a tab is
   * hidden rather than removed.
   */
  keepMounted?: boolean;
}

interface TabbedWorkspaceProps {
  tabs: TabDefinition[];
  /** Falls back to the first tab when the URL names one that does not exist. */
  defaultTab?: string;
  /** Rendered on the right of the tab strip - a count, a status, an action. */
  aside?: ReactNode;
}

export function useTabParam(tabs: TabDefinition[], defaultTab?: string): [string, (id: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const known = tabs.some((tab) => tab.id === requested);
  const active = known && requested ? requested : defaultTab ?? tabs[0]?.id ?? '';

  const setActive = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', id);
      // Replace rather than push: flipping between tabs should not fill the
      // back button with steps a sysop has to walk out of.
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return [active, setActive];
}

export function TabbedWorkspace({ tabs, defaultTab, aside }: TabbedWorkspaceProps) {
  const [active, setActive] = useTabParam(tabs, defaultTab);

  return (
    <TabsPrimitive.Root value={active} onValueChange={setActive}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <TabsPrimitive.List className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <TabsPrimitive.Trigger
              key={tab.id}
              value={tab.id}
              className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-content-secondary transition-colors hover:text-content-primary data-[state=active]:border-accent data-[state=active]:text-content-primary"
            >
              {tab.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        {aside}
      </div>

      {tabs.map((tab) =>
        tab.keepMounted ? (
          <TabsPrimitive.Content
            key={tab.id}
            value={tab.id}
            forceMount
            className="focus:outline-none data-[state=inactive]:hidden"
          >
            {tab.render()}
          </TabsPrimitive.Content>
        ) : (
          <TabsPrimitive.Content key={tab.id} value={tab.id} className="focus:outline-none">
            {/* Everything else mounts only while it is open, so a screen that
                polls does not poll out of view. */}
            {active === tab.id && tab.render()}
          </TabsPrimitive.Content>
        )
      )}
    </TabsPrimitive.Root>
  );
}
