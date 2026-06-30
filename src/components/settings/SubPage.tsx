import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** 设置子页通用外壳：返回 + 标题 */
export default function SubPage({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <Link
        to="/settings"
        className="glass inline-block rounded-full px-3 py-1.5 text-xs text-ink"
      >
        ← 设置
      </Link>
      <h2 className="headline text-2xl text-ink">
        {title.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').trim()}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}
