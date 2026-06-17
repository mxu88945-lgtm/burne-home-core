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
    <div className="space-y-4">
      <div className="px-1">
        <h2 className="headline text-2xl text-ink">{title}</h2>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>

      <div className="glass rounded-3xl p-5">
        <div className="flex items-center gap-2 text-accent">
          <span>🚧</span>
          <span className="text-sm font-medium">
            本页为骨架占位{round ? ` · ${round}实现` : ''}
          </span>
        </div>
        {todos && todos.length > 0 && (
          <ul className="mt-4 space-y-2.5 text-sm text-muted">
            {todos.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-accent-2">♡</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
