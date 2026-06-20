import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/', label: '首页', icon: '🏠', end: true },
  { to: '/memories', label: '记忆库', icon: '📔' },
  { to: '/chat', label: '聊天', icon: '💬' },
  { to: '/search', label: '回忆', icon: '🔍' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

export default function BottomNav() {
  return (
    <nav className="flex-none px-4 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
      <div className="glass-strong flex items-center justify-around rounded-3xl px-2 py-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                'flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10.5px] transition',
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
