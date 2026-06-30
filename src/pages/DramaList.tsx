import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDramaStore } from '@/store/dramaStore'
import { parseDramaTxt, type ParsedDrama } from '@/lib/dramaImport'
import BackBar from '@/components/layout/BackBar'
import DramaBg from '@/components/ui/DramaBg'
import { GearIcon } from '@/components/ui/navIcons'

export default function DramaList() {
  const scenes = useDramaStore((s) => s.scenes)
  const createScene = useDramaStore((s) => s.createScene)
  const removeScene = useDramaStore((s) => s.removeScene)
  const renameScene = useDramaStore((s) => s.renameScene)
  const setActive = useDramaStore((s) => s.setActive)
  const importScene = useDramaStore((s) => s.importScene)
  const setFlat = useDramaStore((s) => s.setFlat)
  const nav = useNavigate()

  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedDrama | null>(null)
  const [impTitle, setImpTitle] = useState('')
  const [meName, setMeName] = useState('')
  const [impErr, setImpErr] = useState('')

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

  async function onFile(file: File) {
    setImpErr('')
    try {
      const raw = await file.text()
      const data = parseDramaTxt(raw)
      if (!data.turns.length) {
        setImpErr('没解析到对话内容，确认是「名字: 内容」这样的 TXT')
        return
      }
      setParsed(data)
      setImpTitle(file.name.replace(/\.[^.]+$/, '') || '导入的剧场')
      // 默认把出现最多、且不是旁白「.」的角色当「我」（多半是女主自己）
      const guess = [...data.speakers]
        .filter((s) => s.name !== '.')
        .sort((a, b) => b.count - a.count)[0]
      setMeName(guess?.name ?? '')
    } catch (e) {
      setImpErr(`读取失败：${(e as Error).message}`)
    }
  }

  function doImport() {
    if (!parsed) return
    const speakers = parsed.speakers.map((s) => ({
      name: s.name,
      isMe: s.name === meName,
      avatar: s.name === '.' ? '📖' : undefined,
    }))
    const scene = importScene({ title: impTitle, speakers, turns: parsed.turns })
    setFlat(true) // 导入的小说式记录，默认平铺阅读
    setParsed(null)
    setActive(scene.id)
    nav('/drama/room')
  }

  return (
    <div className="space-y-4">
      <DramaBg />
      {/* 顶行：返回 · 操作（新剧场/导入/设置）都收到上面 */}
      <div className="flex items-center justify-between gap-2">
        <BackBar />
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={create} className="btn-primary rounded-full px-4 py-2 text-sm">
            ＋ 新剧场
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="glass rounded-full px-3.5 py-2 text-[13px] text-ink"
          >
            导入 TXT
          </button>
          <button
            onClick={() => nav('/settings')}
            aria-label="设置"
            className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-accent"
          >
            <GearIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="px-1">
        <h2 className="headline text-2xl text-ink">戏剧</h2>
        <p className="mt-1 text-xs text-muted">多角色群聊 · 角色扮演 · 每个剧场独立剧情</p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
      {impErr && <div className="px-1 text-[12px] text-red-500">{impErr}</div>}

      {scenes.length === 0 ? (
        <div className="glass rounded-3xl px-6 py-12 text-center">
          <p className="mt-1 text-sm text-muted">还没有剧场～建一个，加上角色就能群聊啦</p>
          <p className="mt-1 text-[11px] text-muted">也可以「导入 TXT」把旧的对话记录搬进来</p>
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

      {/* 导入预览弹层：确认剧场名 + 谁是「我」 */}
      {parsed && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" onClick={() => setParsed(null)}>
          <div
            className="glass-strong max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="headline text-lg text-ink">导入对话 · 共 {parsed.turns.length} 条</div>

            <div>
              <div className="mb-1 text-[12px] text-muted">剧场名字</div>
              <input
                value={impTitle}
                onChange={(e) => setImpTitle(e.target.value)}
                className="w-full rounded-xl border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </div>

            <div>
              <div className="mb-1 text-[12px] text-muted">识别到的角色（点一个标成「我 / 女主」，由你发言）</div>
              <div className="space-y-1.5">
                {parsed.speakers.map((sp) => (
                  <button
                    key={sp.name}
                    onClick={() => setMeName(sp.name === meName ? '' : sp.name)}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                      sp.name === meName ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-white/40 text-ink'
                    }`}
                  >
                    <span className="truncate">
                      {sp.name === '.' ? '📖 旁白（.）' : sp.name}
                      <span className="ml-2 text-[11px] text-muted">{sp.count} 条</span>
                    </span>
                    {sp.name === meName && <span className="shrink-0 text-[12px] text-accent">这是我 ✓</span>}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                其余角色都会建成 AI 角色卡（人设留空，你可以进去补）。导入后默认平铺阅读，像小说一样。
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setParsed(null)} className="glass rounded-full px-4 py-2 text-sm text-ink">取消</button>
              <button onClick={doImport} className="btn-primary rounded-full px-5 py-2 text-sm">导入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
