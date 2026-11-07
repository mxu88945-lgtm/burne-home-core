import type { ReactNode } from 'react'
import StickyBar from '@/components/layout/StickyBar'

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
      <StickyBar
        to="/settings"
        label="设置"
        title={title.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').trim()}
      />
      <div className="space-y-3">{children}</div>
    </div>
  )
}
