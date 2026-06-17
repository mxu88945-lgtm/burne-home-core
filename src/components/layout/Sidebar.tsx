import { NavLink } from 'react-router-dom'
import { APP_NAME } from '@/lib/constants'

const NAV = [
  { to: '/', label: '主屋', icon: '🏠', end: true },
  { to: '/memories', label: '记忆库', icon: '📔' },
  { to: '/search', label: '搜索回忆', icon: '🔍' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

export default function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-home-border bg-home-panel">
      <div className="px-5 py-6">
        <div className="text-lg font-semibold text-home-text">{APP_NAME}</div>
        <div className="mt-1 text-xs text-home-muted">长期记忆系统</div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                isActive
                  ? 'bg-home-card text-home-text shadow-soft'
                  : 'text-home-muted hover:bg-home-card/60 hover:text-home-text',
              ].join(' ')
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 text-[11px] leading-relaxed text-home-muted">
        本地优先 · 数据存在你自己的浏览器里 🤍
      </div>
    </aside>
  )
}
