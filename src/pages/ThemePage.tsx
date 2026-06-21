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
        <p className="mt-1 text-sm text-muted">毛玻璃透视 · 高级感雾系配色</p>
      </div>

      <div className="space-y-3">
        {THEMES.map((t) => {
          const active = t.id === theme
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="glass w-full overflow-hidden rounded-3xl p-3 text-left"
              style={{ borderColor: active ? 'var(--accent)' : 'var(--card-border)' }}
            >
              {/* 配色预览条 */}
              <div
                className="relative h-20 w-full overflow-hidden rounded-2xl"
                style={{
                  background: `linear-gradient(120deg, ${t.swatches.join(', ')})`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5)',
                }}
              >
                {/* 玻璃小球示意 */}
                <span
                  className="absolute right-4 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full"
                  style={{
                    background: 'rgba(255,255,255,.28)',
                    border: '1px solid rgba(255,255,255,.6)',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.7)',
                  }}
                />
              </div>

              <div className="mt-3 flex items-center gap-3 px-1">
                <div className="flex gap-1">
                  {t.swatches.map((c) => (
                    <span
                      key={c}
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ backgroundColor: c, boxShadow: '0 1px 2px rgba(0,0,0,.12)' }}
                    />
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    {t.emoji} {t.name}
                  </span>
                  {active && <span className="text-accent">✓</span>}
                </div>
              </div>
              <p className="mt-1 px-1 text-[11px] text-muted">{t.desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
