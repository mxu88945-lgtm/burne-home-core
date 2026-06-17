interface PlaceholderProps {
  title: string
  subtitle?: string
  /** 这一轮还没实现的功能点，列出来给后续轮次做 */
  todos?: string[]
  round?: string
}

/** 通用「待实现」占位卡片 —— 骨架阶段用，后续逐页替换成真实功能 */
export default function Placeholder({
  title,
  subtitle,
  todos,
  round,
}: PlaceholderProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-home-text">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-home-muted">{subtitle}</p>}

      <div className="mt-6 rounded-2xl border border-dashed border-home-border bg-home-panel/50 p-6">
        <div className="flex items-center gap-2 text-home-gold">
          <span>🚧</span>
          <span className="text-sm font-medium">
            本页为骨架占位{round ? ` · ${round}实现` : ''}
          </span>
        </div>
        {todos && todos.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm text-home-muted">
            {todos.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-home-plum">◦</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
