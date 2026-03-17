import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon },
  { to: '/sessions', label: 'Sessions', icon: SessionsIcon },
  { to: '/memory', label: 'OMC Mem', icon: MemoryIcon },
  { to: '/cc-memory', label: 'Memory', icon: CcMemoryIcon },
  { to: '/models', label: 'Models', icon: ModelsIcon },
  { to: '/providers', label: 'Providers', icon: ProvidersIcon },
  { to: '/switch', label: 'Switch', icon: SwitchIcon },
  { to: '/preferences', label: 'Prefs', icon: PreferencesIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

type Theme = 'dark' | 'light' | 'auto';

function getInitialTheme(): Theme {
  return (localStorage.getItem('omc-theme') as Theme) || 'auto';
}

function applyTheme(theme: Theme) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem('omc-theme', theme);
}

export default function Sidebar() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function cycleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : t === 'light' ? 'auto' : 'dark'));
  }

  return (
    <aside className="w-48 shrink-0 border-r border-border bg-bg-secondary flex flex-col">
      {/* Brand */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-white font-bold text-xs">omc</span>
          </div>
          <div>
            <div className="text-xs font-semibold text-text-primary leading-tight">
              oh-my-claude
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 px-2.5 py-1.5 rounded text-[13px] transition-colors ${
                isActive
                  ? 'bg-accent-muted text-accent-hover font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`
            }
          >
            <Icon active={false} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border flex items-center justify-between">
        <div className="text-[9px] text-text-tertiary">
          :18920
        </div>
        <button
          onClick={cycleTheme}
          className="text-text-tertiary hover:text-text-primary transition-colors p-1"
          title={`Theme: ${theme}`}
        >
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1v1M8 14v1M14 8h1M1 8h1M12.5 3.5l-.7.7M4.2 11.8l-.7.7M12.5 12.5l-.7-.7M4.2 4.2l-.7-.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2"/></svg>
          ) : theme === 'light' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13 9.5A5.5 5.5 0 016.5 3 5.5 5.5 0 1013 9.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 2.5v11" stroke="currentColor" strokeWidth="1.2"/><path d="M8 2.5A5.5 5.5 0 008 13.5" fill="currentColor" opacity="0.3"/></svg>
          )}
        </button>
      </div>
    </aside>
  );
}

/* Minimal SVG icons */
function DashboardIcon({ active: _ }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ModelsIcon({ active: _ }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ProvidersIcon({ active: _ }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SessionsIcon({ active: _ }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M3 3h10v2H3zM3 7h10v2H3zM3 11h7v2H3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SwitchIcon({ active: _ }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M4 6l4-4 4 4M4 10l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CcMemoryIcon({ active: _ }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M4 2h8l2 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V5l2-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MemoryIcon({ active: _ }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 5h4M6 8h4M6 11h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function PreferencesIcon({ active: _ }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M2 4h8M12 4h2M2 8h3M7 8h7M2 12h5M9 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="11" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SettingsIcon({ active: _ }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
