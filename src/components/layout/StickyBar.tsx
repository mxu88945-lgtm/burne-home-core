import { Link } from 'react-router-dom'

/**
 * 设置页顶部固定横幅：返回键 + 标题，滚动时一直在顶上，不用滚回去找返回。
 * 贴在 main 滚动容器顶端；设置路由下 main 不留顶部内边距，安全区由这里的 paddingTop 留。
 */
export default function StickyBar({ to, label, title }: { to: string; label: string; title: string }) {
  return (
    <div
      className="sticky top-0 z-20 -mx-5 flex items-center gap-2.5 px-5 pb-2"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        background: 'var(--card-strong, rgba(255,255,255,0.85))',
        WebkitBackdropFilter: 'blur(14px)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <Link to={to} className="glass inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs text-ink">
        ← {label}
      </Link>
      <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{title}</span>
    </div>
  )
}
