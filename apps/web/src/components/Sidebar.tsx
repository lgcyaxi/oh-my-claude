import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon },
  { to: '/sessions', label: 'Sessions', icon: SessionsIcon },
  { to: '/models', label: 'Models', icon: ModelsIcon },
  { to: '/providers', label: 'Providers', icon: ProvidersIcon },
  { to: '/switch', label: 'Switch', icon: SwitchIcon },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-bg-secondary flex flex-col">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-white font-bold text-sm">omc</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary leading-tight">
              oh-my-claude
            </div>
            <div className="text-[10px] text-text-tertiary leading-tight">
              Dashboard
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
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
      <div className="px-4 py-3 border-t border-border">
        <div className="text-[10px] text-text-tertiary">
          Control: localhost:18911
        </div>
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
