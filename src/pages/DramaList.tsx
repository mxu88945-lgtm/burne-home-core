import { useNavigate } from 'react-router-dom'
import { useDramaStore } from '@/store/dramaStore'
import BackBar from '@/components/layout/BackBar'

export default function DramaList() {
  const scenes = useDramaStore((s) => s.scenes)
  const createScene = useDramaStore((s) => s.createScene)
  const removeScene = useDramaStore((s) => s.removeScene)
  const renameScene = useDramaStore((s) => s.renameScene)
  const setActive = useDramaStore((s) => s.setActive)
  const nav = useNavigate()

  function open(id: string) {
    setActive(id)
    nav('/drama/room')
  }
  function create() {
    const t = window.prompt('剧场名字，如「校园群聊」「江湖客栈」')
    if (t && t.trim()) {
      createScene(t.trim())
      nav('/drama/room')
    }
  }

  return (
    <div className="space-y-4">
      <BackBar />
      <div className="flex items-end justify-between px-1">
        <div>
          <h2 className="headline text-2xl text-ink">戏剧 🎭</h2>
          <p className="mt-1 text-xs text-muted">多角色群聊 · 角色扮演 · 每个剧场独立剧情</p>
        </div>
        <button onClick={create} className="btn-primary rounded-full px-4 py-2 text-sm">
          ＋ 新剧场
        </button>
      </div>

      {scenes.length === 0 ? (
        <div className="glass rounded-3xl px-6 py-12 text-center">
          <div className="text-3xl">🎭</div>
          <p className="mt-3 text-sm text-muted">还没有剧场～建一个，加上角色就能群聊啦</p>
          <button onClick={create} className="btn-primary mt-4 rounded-full px-5 py-2 text-sm">
            建第一个剧场
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {scenes.map((s) => (
            <div
              key={s.id}
              onClick={() => open(s.id)}
              className="glass flex items-center gap-3 rounded-2xl px-4 py-4 transition active:scale-[0.99]"
            >
              <span className="text-2xl">🎭</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{s.title}</div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {s.chars.length} 个角色 · {s.messages.length} 条对话
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  const t = window.prompt('重命名剧场', s.title)
                  if (t) renameScene(s.id, t)
                }}
                className="px-1.5 text-base text-muted hover:text-accent"
                aria-label="重命名"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(`删除剧场「${s.title}」？里面的角色和对话都会删除。`))
                    removeScene(s.id)
                }}
                className="px-1.5 text-base text-muted hover:text-red-500"
                aria-label="删除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="pb-2 text-center text-[11px] text-muted">只存在你本机 · 不上传 ♡</p>
    </div>
  )
}
