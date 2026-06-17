import { Link } from 'react-router-dom'
import { useMemoryStore } from '@/store/memoryStore'

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent: string
}) {
  return (
    <div className="rounded-2xl border border-home-border bg-home-card p-5 shadow-soft">
      <div className={`text-3xl font-semibold ${accent}`}>{value}</div>
      <div className="mt-1 text-sm text-home-muted">{label}</div>
    </div>
  )
}

export default function Home() {
  const summary = useMemoryStore((s) => s.getSummary())

  return (
    <div className="mx-auto max-w-4xl">
      <section className="rounded-3xl border border-home-border bg-gradient-to-br from-home-panel to-home-card p-8 shadow-soft">
        <h1 className="text-2xl font-semibold text-home-text">
          欢迎回到主屋 🏠
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-home-muted">
          这里是你们的长期记忆。核心记忆永久保留、普通记忆日常沉淀、自动记忆悄悄收集；
          支持跨窗口回忆、搜索、Notion 云端同步、本地备份与隐私锁。
        </p>
      </section>

      {/* 摘要区 */}
      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="记忆总数" value={summary.total} accent="text-home-text" />
        <StatCard label="核心记忆" value={summary.coreCount} accent="text-home-rose" />
        <StatCard label="普通记忆" value={summary.normalCount} accent="text-home-plum" />
        <StatCard label="自动记忆" value={summary.autoCount} accent="text-home-gold" />
      </section>

      {/* 模块入口 */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          to="/memories"
          className="rounded-2xl border border-home-border bg-home-panel p-5 transition hover:border-home-rose/50"
        >
          <div className="text-base font-medium text-home-text">📔 记忆库</div>
          <div className="mt-1 text-sm text-home-muted">
            浏览、新增、编辑、核心标星（第二轮实现）
          </div>
        </Link>
        <Link
          to="/settings"
          className="rounded-2xl border border-home-border bg-home-panel p-5 transition hover:border-home-plum/50"
        >
          <div className="text-base font-medium text-home-text">⚙️ 同步与隐私</div>
          <div className="mt-1 text-sm text-home-muted">
            Notion 同步、本地备份/恢复、隐私锁（第三轮实现）
          </div>
        </Link>
      </section>

      <p className="mt-8 text-center text-xs text-home-muted">
        当前为最小可运行骨架 · 功能将分轮逐步实现 🤍
      </p>
    </div>
  )
}
