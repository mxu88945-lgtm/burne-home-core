import { useMemoryStore } from '@/store/memoryStore'

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl px-4 py-4 text-center">
      <div className="text-2xl font-semibold text-accent">{value}</div>
      <div className="label mt-1">{label}</div>
    </div>
  )
}

export default function MemoryLibrary() {
  const summary = useMemoryStore((s) => s.getSummary())

  return (
    <div className="space-y-5">
      <div className="px-1">
        <h2 className="headline text-2xl text-ink">记忆库 📔</h2>
        <p className="mt-1 text-sm text-muted">我们一起珍藏的所有记忆。</p>
      </div>

      {/* 摘要区 */}
      <section className="glass-strong rounded-3xl px-6 py-6 text-center">
        <div className="text-5xl font-semibold text-accent">{summary.total}</div>
        <div className="label mt-1">珍藏的记忆</div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Core" value={summary.coreCount} />
        <StatCard label="Normal" value={summary.normalCount} />
        <StatCard label="Auto" value={summary.autoCount} />
      </section>

      {/* 列表与编辑功能（第二轮实现） */}
      <section className="glass rounded-3xl p-5">
        <div className="flex items-center gap-2 text-accent">
          <span>🚧</span>
          <span className="text-sm font-medium">条目列表与编辑 · 第二轮实现</span>
        </div>
        <ul className="mt-4 space-y-2.5 text-sm text-muted">
          {[
            '条目列表：核心 / 普通 / 自动 分类浏览',
            '搜索：关键词 + 标签过滤',
            '新增 / 编辑：手动录入记忆',
            '核心标星：长按或点星标提升为核心',
            '本地保存：已接入 localStorage',
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <span className="text-accent-2">♡</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
