import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Code2,
  BookOpen,
  Zap,
  History,
  Bookmark,
  RotateCcw,
  BarChart3,
  User,
  Settings,
  Search,
  Menu,
  X,
  LogOut,
  Terminal,
  LogIn,
  Bug,
  Eye,
  Map as MapIcon,
  Timer,
  Briefcase,
  StickyNote,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_GROUPS = [
  {
    heading: 'Practice',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/problems', label: 'Python Problems', icon: Code2, end: false },
      { to: '/debugging', label: 'Debugging Lab', icon: Bug, end: false },
      { to: '/output-prediction', label: 'Output Prediction', icon: Eye, end: false },
      { to: '/practice', label: 'Practice Arena', icon: Zap, end: false },
      { to: '/concepts', label: 'Python Concepts', icon: BookOpen, end: false },
    ],
  },
  {
    heading: 'Mastery & Prep',
    items: [
      { to: '/roadmap', label: 'Personal Roadmap', icon: MapIcon, end: false },
      { to: '/mock-interview', label: 'Mock Interview', icon: Timer, end: false },
      { to: '/interview-prep', label: 'Interview Prep', icon: Briefcase, end: false },
      { to: '/revisions', label: 'Revision Tracker', icon: RotateCcw, end: false },
      { to: '/notes', label: 'Personal Notes', icon: StickyNote, end: false },
      { to: '/submissions', label: 'My Submissions', icon: History, end: false },
      { to: '/bookmarks', label: 'Bookmarks', icon: Bookmark, end: false },
      { to: '/analytics', label: 'Analytics', icon: BarChart3, end: false },
      { to: '/profile', label: 'Profile', icon: User, end: false },
      { to: '/settings', label: 'Settings', icon: Settings, end: false },
    ],
  },
];

export function Layout({
  children,
  fullBleed = false,
}: {
  children: React.ReactNode;
  fullBleed?: boolean;
}) {
  const { user, openAuthModal, demoLogin, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const navigate = useNavigate();

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchValue.trim();
    if (trimmed) {
      navigate(`/problems?q=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/problems');
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0D11] text-zinc-100 flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 border-r border-zinc-800/80 bg-[#0F1218] z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-xs bg-[#0F1218] border-r border-zinc-800 flex flex-col z-10">
            <div className="flex items-center justify-end p-2 border-b border-zinc-800">
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b border-zinc-800/80 bg-[#0F1218]/90 backdrop-blur-sm sticky top-0 z-20 px-4 lg:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 shrink-0"
            >
              <Menu className="h-4 w-4" />
            </button>

            <form onSubmit={handleGlobalSearch} className="relative w-full max-w-sm">
              <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search Python problems, concepts, #number..."
                className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
              />
            </form>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              to="/practice"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-[#14171D] hover:border-zinc-700 hover:text-white px-3 py-1.5 text-xs font-medium text-zinc-300 whitespace-nowrap shrink-0 transition-colors"
            >
              <Zap className="h-3.5 w-3.5 text-blue-400" />
              Quick Drill
            </Link>

            {user ? (
              <div className="flex items-center gap-2.5">
                <Link
                  to="/profile"
                  className="flex items-center gap-2 rounded-md border border-zinc-800 bg-[#14171D] hover:border-zinc-700 px-2.5 py-1 transition-colors whitespace-nowrap shrink-0"
                >
                  <img
                    src={user.avatar_url || '/src/assets/images/avatar_python_engineer_1794809909403.jpg'}
                    alt={user.full_name}
                    className="h-5 w-5 rounded-full object-cover bg-zinc-800"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <span className="text-xs font-medium text-zinc-200 max-w-[120px] truncate">
                    {user.username}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  title="Sign out"
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-[#14171D] hover:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 whitespace-nowrap shrink-0 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void demoLogin()}
                  className="hidden sm:inline-flex items-center rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0 transition-colors"
                >
                  Demo Sign In
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal('login')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap shrink-0 transition-colors"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Sign In
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page Body */}
        <main className={fullBleed ? 'flex-1 min-h-0 flex flex-col' : 'flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto'}>
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="h-14 px-4 flex items-center gap-2.5 border-b border-zinc-800/80 shrink-0">
        <div className="h-7 w-7 rounded-md bg-blue-600 flex items-center justify-center text-white shrink-0">
          <Terminal className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-white truncate">Python Mastery</div>
          <div className="text-[11px] text-zinc-500 truncate">Learn. Practice. Master.</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="space-y-1">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {group.heading}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border border-transparent'
                    }`
                  }
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-zinc-800/80 text-[11px] text-zinc-500">
        <div className="flex items-center justify-between">
          <span>Runtime</span>
          <span className="font-mono text-zinc-300">Pyodide WASM</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span>Curriculum</span>
          <span className="font-mono text-zinc-300 tabular-nums">21 Tracks · 318 Qs</span>
        </div>
      </div>
    </div>
  );
}
