import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import {
  Settings,
  Server,
  MessageSquare,
  DoorOpen,
  Languages,
  Download,
  History,
  LogOut,
  User,
  Shield,
  HardDrive,
  Monitor,
  Eye,
  FileCheck,
  ArrowUpDown,
  Activity,
  FileText,
  Network,
  FolderOpen,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const ADMIN_BASE = '/admin';

  const navLinks = [
    { to: `${ADMIN_BASE}/system`, icon: Settings, label: 'System Config' },
    { to: `${ADMIN_BASE}/health`, icon: Activity, label: 'Health Check' },
    { to: `${ADMIN_BASE}/operator-chat`, icon: MessageSquare, label: 'Operator Chat' },
    { to: `${ADMIN_BASE}/operator-chat-settings`, icon: Settings, label: 'Chat Settings' },
    { to: `${ADMIN_BASE}/nodes`, icon: Server, label: 'Nodes' },
    { to: `${ADMIN_BASE}/users`, icon: User, label: 'Users' },
    { to: `${ADMIN_BASE}/conferences`, icon: MessageSquare, label: 'Conferences' },
    { to: `${ADMIN_BASE}/doors`, icon: DoorOpen, label: 'Doors' },
    { to: `${ADMIN_BASE}/amixnet`, icon: Network, label: 'AmiXnet Network' },
    { to: `${ADMIN_BASE}/system-files`, icon: FolderOpen, label: 'System Files' },
    { to: `${ADMIN_BASE}/security`, icon: Shield, label: 'Security' },
    { to: `${ADMIN_BASE}/drives`, icon: HardDrive, label: 'Drives' },
    { to: `${ADMIN_BASE}/computers`, icon: Monitor, label: 'Computers' },
    { to: `${ADMIN_BASE}/screen-types`, icon: Eye, label: 'Screen Types' },
    { to: `${ADMIN_BASE}/file-checkers`, icon: FileCheck, label: 'File Checkers' },
    { to: `${ADMIN_BASE}/languages`, icon: Languages, label: 'Languages' },
    { to: `${ADMIN_BASE}/protocols`, icon: Download, label: 'Protocols' },
    { to: `${ADMIN_BASE}/batches`, icon: FileText, label: 'Batch Editor' },
    { to: `${ADMIN_BASE}/deployment`, icon: Activity, label: 'Deployment' },
    { to: `${ADMIN_BASE}/import-export`, icon: ArrowUpDown, label: 'Import/Export' },
    { to: `${ADMIN_BASE}/logs`, icon: FileText, label: 'System Logs' },
    { to: `${ADMIN_BASE}/session-logs`, icon: Activity, label: 'Session Logs' },
    { to: `${ADMIN_BASE}/audit`, icon: History, label: 'Audit Log' },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-bbs-surface border-r border-bbs-primary flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-bbs-primary">
          <h1 className="text-xl font-bold text-bbs-accent">AmiExpress</h1>
          <p className="text-sm text-bbs-muted">BBS Configuration</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-4 py-3 rounded transition-colors ${
                    isActive
                      ? 'bg-bbs-primary text-bbs-accent'
                      : 'text-bbs-muted hover:bg-bbs-primary/50 hover:text-bbs-text'
                  }`
                }
              >
                <Icon size={20} />
                <span>{link.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-bbs-primary">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-bbs-primary flex items-center justify-center">
              <User size={20} className="text-bbs-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.username}</p>
              <p className="text-xs text-bbs-muted">Sysop Level {user?.secLevel}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-bbs-primary hover:bg-bbs-primary/80 text-bbs-text rounded transition-colors"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
