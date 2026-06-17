import { THEMES, useThemeStore } from '@/store/themeStore'

/** 三个小圆点的主题切换器 */
export default function ThemeSwitcher() {
  const { theme, setTheme } = useThemeStore()

  return (
    <div className="glass flex items-center gap-1.5 rounded-full px-2 py-1.5">
      {THEMES.map((t) => {
        const active = t.id === theme
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            aria-label={`切换到${t.name}主题`}
            title={`${t.emoji} ${t.name}`}
            className={[
              'h-5 w-5 rounded-full transition',
              active
                ? 'ring-2 ring-offset-1 ring-accent'
                : 'opacity-70 hover:opacity-100',
            ].join(' ')}
            style={{ backgroundColor: t.dot, boxShadow: '0 1px 3px rgba(0,0,0,.15)' }}
          />
        )
      })}
    </div>
  )
}
