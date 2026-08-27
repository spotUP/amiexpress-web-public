/**
 * Grouped navigation.
 *
 * Red is the identity colour here and nowhere else: the wordmark and the bar
 * beside the active destination. Action lives in blue.
 */

import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ADMIN_BASE, NAV_GROUPS, groupForPath } from './nav-config';

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // A collapsed group opens itself when the current page lives inside it, so
  // you are never looking at a sidebar that hides where you are.
  const activeGroupTitle = groupForPath(location.pathname)?.title;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      NAV_GROUPS.filter((group) => group.collapsedByDefault).map((group) => [group.title, true])
    )
  );

  const handleLogout = () => {
    logout();
    navigate(`${ADMIN_BASE}/login`);
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface-2">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <span className="text-base font-semibold tracking-tight text-brand">AmiExpress</span>
        <span className="text-2xs uppercase tracking-widest text-content-muted">Sysop</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => {
          const isCollapsed = collapsed[group.title] && group.title !== activeGroupTitle;

          return (
            <div key={group.title} className="mb-3">
              <button
                type="button"
                onClick={() =>
                  setCollapsed((current) => ({ ...current, [group.title]: !current[group.title] }))
                }
                className="flex w-full items-center justify-between rounded px-2 py-1 text-2xs font-semibold uppercase tracking-widest text-content-muted transition-colors hover:text-content-secondary"
                aria-expanded={!isCollapsed}
              >
                {group.title}
                <ChevronDown
                  size={12}
                  className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {!isCollapsed && (
                <ul className="mt-1 space-y-px">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const to = item.path ? `${ADMIN_BASE}/${item.path}` : ADMIN_BASE;

                    return (
                      <li key={to}>
                        <NavLink
                          to={to}
                          end={item.path === ''}
                          className={({ isActive }) =>
                            `group relative flex h-control items-center gap-2 rounded px-2 text-sm transition-colors ${
                              isActive
                                ? 'bg-surface-3 text-content-primary'
                                : 'text-content-secondary hover:bg-surface-3 hover:text-content-primary'
                            }`
                          }
                        >
                          {({ isActive }) => (
                            <>
                              {isActive && (
                                <span
                                  className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-brand"
                                  aria-hidden="true"
                                />
                              )}
                              <Icon size={15} className="shrink-0" aria-hidden="true" />
                              <span className="truncate">{item.label}</span>
                            </>
                          )}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-3 text-content-secondary">
            <User size={14} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-sm text-content-primary">{user?.username}</span>
            <span className="block text-2xs text-content-muted">Level {user?.secLevel}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex h-control w-full items-center justify-center gap-2 rounded border border-border bg-surface-1 text-sm text-content-secondary transition-colors hover:bg-surface-3 hover:text-content-primary"
        >
          <LogOut size={14} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
