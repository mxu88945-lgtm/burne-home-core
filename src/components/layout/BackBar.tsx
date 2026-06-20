import { Link } from 'react-router-dom'

/** 通用返回条：默认回主页 */
export default function BackBar({
  to = '/',
  label = '主页',
}: {
  to?: string
  label?: string
}) {
  return (
    <Link
      to={to}
      className="glass mb-3 inline-flex items-center rounded-full px-3 py-1.5 text-xs text-ink"
    >
      ← {label}
    </Link>
  )
}
