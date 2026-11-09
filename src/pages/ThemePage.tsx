import { Link } from 'react-router-dom'
import { THEMES, useChatFontStore, useThemeStore } from '@/store/themeStore'

export default function ThemePage() {
  const { theme, setTheme } = useThemeStore()
  const { chatFont, setChatFont, resetChatFont } = useChatFontStore()
  const shownSize = chatFont.size || 15
  const shownWeight = chatFont.weight || 400

  return (
    <div className="space-y-4">
      {/* 整条顶栏吸顶：横跨全宽、盖住刘海，滚动时「← 设置」和标题一起固定。
          负边距抵消 main 的左右/顶部内边距，再用同样的内边距把内容放回原位。 */}
      <div
        className="sticky z-20 -mx-5 px-5 pb-2"
        style={{
          // WebKit 的 sticky 以 main 的内容区为准（已让出刘海），这里上移同样距离贴到屏幕顶。
          top: 'calc(-1 * max(0.75rem, env(safe-area-inset-top)))',
          marginTop: 'calc(-1 * max(0.75rem, env(safe-area-inset-top)))',
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          background: 'linear-gradient(var(--card-strong), var(--card-strong)), var(--bg-to)',
          borderBottom: '1px solid var(--card-border)',
        }}
      >
        <div className="relative flex h-10 items-center justify-center">
          <Link to="/settings" className="absolute left-0 flex h-10 items-center pr-3 text-sm text-ink">
            ← 设置
          </Link>
          <h2 className="text-[17px] font-semibold text-ink">主题</h2>
        </div>
      </div>
      <p className="px-1 text-sm text-muted">毛玻璃透视 · 高级感雾系配色</p>

      <div className="glass space-y-3 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">聊天文字<span className="ml-1 text-[11px] font-normal text-muted">只改当前主题</span></span>
          <button type="button" onClick={resetChatFont} className="text-[12px] text-muted">
            跟随主题
          </button>
        </div>
        <div
          className="rounded-xl bg-white/40 px-3 py-2 text-ink"
          style={{ fontSize: shownSize, fontWeight: shownWeight, lineHeight: 1.8 }}
        >
          （他终于等到你回来。）“我一直在这里。”
        </div>
        <label className="block">
          <div className="flex justify-between text-[12px] text-muted">
            <span>正文字号</span>
            <span className="flex items-center gap-2">
              <button type="button" aria-label="小 0.5" onClick={(e) => { e.preventDefault(); setChatFont({ size: Math.max(12, shownSize - 0.5) }) }} className="glass rounded-md px-2 leading-5 text-ink">−</button>
              <span className="min-w-[52px] text-center">{chatFont.size ? `${chatFont.size}px` : '跟随主题'}</span>
              <button type="button" aria-label="大 0.5" onClick={(e) => { e.preventDefault(); setChatFont({ size: Math.min(24, shownSize + 0.5) }) }} className="glass rounded-md px-2 leading-5 text-ink">＋</button>
            </span>
          </div>
          <input
            type="range" min={12} max={24} step={0.5} value={shownSize}
            onChange={(e) => setChatFont({ size: Number(e.target.value) })}
            className="w-full accent-[var(--accent)]"
          />
        </label>
        <label className="block">
          <div className="flex justify-between text-[12px] text-muted">
            <span>正文字重</span>
            <span>{chatFont.weight ? chatFont.weight : '跟随主题'}</span>
          </div>
          <input
            type="range" min={300} max={700} step={100} value={shownWeight}
            onChange={(e) => setChatFont({ weight: Number(e.target.value) })}
            className="w-full accent-[var(--accent)]"
          />
        </label>
      </div>

      <div className="space-y-3">
        {THEMES.map((t) => {
          const active = t.id === theme
          const previewBackground = t.bgImage
            ? `linear-gradient(rgba(255,255,255,.18), rgba(255,255,255,.18)), url(${t.bgImage})`
            : `linear-gradient(120deg, ${t.swatches.join(', ')})`

          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="glass w-full overflow-hidden rounded-3xl p-3 text-left"
              style={{ borderColor: active ? 'var(--accent)' : 'var(--card-border)' }}
            >
              {/* 配色预览条：用 CSS 背景承载壁纸，避免 iOS/PWA 把 dataURL img 画成坏图标。 */}
              <div
                className="relative h-20 w-full overflow-hidden rounded-2xl"
                style={{
                  background: previewBackground,
                  backgroundSize: t.bgImage ? 'cover' : undefined,
                  backgroundPosition: t.bgImage ? 'center' : undefined,
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
                  <span className="text-sm font-medium text-ink">{t.name}</span>
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
