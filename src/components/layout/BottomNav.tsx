import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/', label: '主屋', icon: '🏠', end: true },
  { to: '/memories', label: '记忆库', icon: '📔' },
  { to: '/search', label: '回忆', icon: '🔍' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="glass-strong flex items-center justify-around rounded-3xl px-2 py-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                'flex min-w-[58px] flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] transition',
                isActive
                  ? 'font-medium text-accent'
                  : 'text-muted hover:text-ink',
              ].join(' ')
            }
            style={({ isActive }) =>
              isActive
                ? { backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)' }
                : undefined
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
