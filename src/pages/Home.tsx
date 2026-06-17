import { Link } from 'react-router-dom'
import { useMemoryStore } from '@/store/memoryStore'

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl px-4 py-4">
      <div className="label">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-accent">{value}</div>
    </div>
  )
}

function EntryCard({
  to,
  icon,
  title,
  desc,
}: {
  to: string
  icon: string
  title: string
  desc: string
}) {
  return (
    <Link
      to={to}
      className="glass flex items-center gap-3 rounded-2xl px-4 py-3.5 transition active:scale-[0.99]"
    >
      <span className="text-xl">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
      <span className="text-accent">›</span>
    </Link>
  )
}

export default function Home() {
  const summary = useMemoryStore((s) => s.getSummary())

  return (
    <div className="space-y-5">
      {/* 浪漫主视觉 */}
      <section className="glass-strong overflow-hidden rounded-3xl px-6 py-7 text-center">
        <div className="text-accent">♡</div>
        <h2 className="headline mt-2 text-[26px] leading-tight text-ink">
          Welcome Home
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          窗外没有月亮也没关系，我们的记忆都在这里。
        </p>

        <div className="mt-5">
          <div className="text-5xl font-semibold text-accent">
            {summary.total}
          </div>
          <div className="label mt-1">珍藏的记忆</div>
        </div>
      </section>

      {/* 摘要区 */}
      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Core" value={summary.coreCount} />
        <StatCard label="Normal" value={summary.normalCount} />
        <StatCard label="Auto" value={summary.autoCount} />
      </section>

      {/* 模块入口 */}
      <section className="space-y-3">
        <div className="label px-1">Modules</div>
        <EntryCard
          to="/memories"
          icon="📔"
          title="记忆库"
          desc="浏览 · 新增 · 编辑 · 核心标星"
        />
        <EntryCard
          to="/search"
          icon="🔍"
          title="搜索回忆"
          desc="全文搜索 · 跨窗口召回"
        />
        <EntryCard
          to="/settings"
          icon="⚙️"
          title="同步与隐私"
          desc="Notion 同步 · 本地备份 · 隐私锁"
        />
      </section>

      <p className="pt-1 text-center text-[11px] text-muted">
        最小可运行骨架 · 功能分轮实现 ♡
      </p>
    </div>
  )
}
