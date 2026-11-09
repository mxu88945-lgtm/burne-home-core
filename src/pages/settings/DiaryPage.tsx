import SubPage from '@/components/settings/SubPage'
import { useDiaryStore } from '@/store/diaryStore'

function when(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function DiaryPage() {
  const entries = useDiaryStore((s) => s.entries)
  const removeEntry = useDiaryStore((s) => s.removeEntry)
  const list = [...entries].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <SubPage title="私人日记">
      <p className="px-1 text-[12px] text-muted">他在心里有起伏时写下的。之后聊天会带上最近的几页。</p>
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">他还没有写过日记</p>
      ) : (
        list.map((e) => (
          <div key={e.id} className="glass rounded-2xl px-4 py-3">
            <div className="flex items-center">
              <span className="flex-1 text-[11px] text-muted">{when(e.createdAt)}</span>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('删除这一页？')) removeEntry(e.id)
                }}
                className="text-[11px] text-muted"
              >
                删除
              </button>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{e.text}</p>
          </div>
        ))
      )}
    </SubPage>
  )
}
