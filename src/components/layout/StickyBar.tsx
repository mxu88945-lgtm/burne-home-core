import { Link } from 'react-router-dom'

/**
 * 设置页顶部固定横幅：返回键 + 标题，滚动时一直在顶上，不用滚回去找返回。
 * 贴在 main 滚动容器顶端；负外边距抵掉 main 的左右内边距和顶部安全区内边距。
 */
export default function StickyBar({ to, label, title }: { to: string; label: string; title: string }) {
  return (
    <div
      className="sticky top-0 z-20 -mx-5 mb-1 flex items-center gap-3 px-5 pb-2.5"
      style={{
        marginTop: 'calc(-1 * max(0.75rem, env(safe-area-inset-top)))',
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        background: 'var(--card-strong, rgba(255,255,255,0.85))',
        WebkitBackdropFilter: 'blur(14px)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--card-border)',
      }}
    >
      <Link to={to} className="glass inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs text-ink">
        ← {label}
      </Link>
      <span className="min-w-0 truncate text-[15px] font-semibold text-ink">{title}</span>
    </div>
  )
}
