import { Link } from 'react-router-dom'
import { THEMES, useThemeStore } from '@/store/themeStore'

export default function ThemePage() {
  const { theme, setTheme } = useThemeStore()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/settings" className="glass rounded-full px-3 py-1.5 text-xs text-ink">
          ← 设置
        </Link>
      </div>
      <div className="px-1">
        <h2 className="headline text-2xl text-ink">主题 🎨</h2>
        <p className="mt-1 text-sm text-muted">挑一个你喜欢的氛围</p>
      </div>

      <div className="space-y-3">
        {THEMES.map((t) => {
          const active = t.id === theme
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="glass flex w-full items-center gap-3 rounded-2xl p-4"
              style={{ borderColor: active ? 'var(--accent)' : 'var(--card-border)' }}
            >
              <span
                className="h-6 w-6 rounded-full"
                style={{ backgroundColor: t.dot, boxShadow: '0 1px 3px rgba(0,0,0,.15)' }}
              />
              <span className="text-sm font-medium text-ink">
                {t.emoji} {t.name}
              </span>
              {active && <span className="ml-auto text-accent">✓ 当前</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
