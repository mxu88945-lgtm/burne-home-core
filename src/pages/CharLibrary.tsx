import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCharLibStore, type LibChar } from '@/store/charLibStore'
import { useDramaStore, type LoreEntry } from '@/store/dramaStore'
import { useProfileStore } from '@/store/profileStore'
import { useApiStore } from '@/store/apiStore'
import { parseCardFile } from '@/lib/charCard'
import { fileToDataUrl } from '@/lib/image'
import Avatar from '@/components/ui/Avatar'
import BackBar from '@/components/layout/BackBar'

const PRESET_COLORS = ['#7aa2f7', '#bb9af7', '#f7768e', '#73d39b', '#e0af68', '#ff9e64', '#2ac3de']

function uid(): string {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`
}
/** 复制世界书并换新 id（避免跨对话撞 id） */
function freshLore(lore?: LoreEntry[]): LoreEntry[] {
  return (lore || []).map((e) => ({ ...e, id: uid() }))
}

export default function CharLibrary() {
  const nav = useNavigate()
  const chars = useCharLibStore((s) => s.chars)
  const addLibChar = useCharLibStore((s) => s.addChar)
  const removeLibChar = useCharLibStore((s) => s.removeChar)
  const profile = useProfileStore((s) => s.profile)
  const createScene = useDramaStore((s) => s.createScene)
  const addChar = useDramaStore((s) => s.addChar)
  const addLore = useDramaStore((s) => s.addLore)

  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<LibChar | 'new' | null>(null)
  const [err, setErr] = useState('')

  async function onImport(file: File) {
    setErr('')
    try {
      const card = await parseCardFile(file)
      addLibChar({
        name: card.name,
        persona: card.persona,
        greeting: card.greeting,
        avatarImg: card.avatarImg,
        lore: card.lore,
      })
    } catch (e) {
      setErr(`导入角色卡失败：${(e as Error).message}`)
    }
  }

  /** 用这个角色开一个新的 1v1 对话（自动带「我」+ 这个角色 + 世界书） */
  function startChat(lc: LibChar) {
    const scene = createScene(lc.name)
    addChar(scene.id, {
      name: profile.nameA || '我',
      avatar: profile.avatarA || '🙂',
      avatarImg: profile.avatarAImg,
      isMe: true,
    })
    addChar(scene.id, {
      name: lc.name,
      avatar: lc.avatar,
      avatarImg: lc.avatarImg,
      persona: lc.persona,
      greeting: lc.greeting,
      color: lc.color,
      apiChannelId: lc.apiChannelId,
    })
    if (lc.lore?.length) addLore(scene.id, freshLore(lc.lore))
    nav('/drama/room')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <BackBar />
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => setEditing('new')} className="btn-primary rounded-full px-4 py-2 text-sm">
            ＋ 新建
          </button>
          <button onClick={() => fileRef.current?.click()} className="glass rounded-full px-3.5 py-2 text-[13px] text-ink">
            导入角色卡
          </button>
        </div>
      </div>
      <div className="px-1">
        <h2 className="headline text-2xl text-ink">角色库</h2>
        <p className="mt-1 text-xs text-muted">独立角色卡仓库 · 选一个开 1v1 · 进对话后可加成员拉群</p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.png,application/json,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onImport(f)
        }}
      />
      {err && <div className="px-1 text-[12px] text-red-500">{err}</div>}

      {chars.length === 0 ? (
        <div className="glass rounded-3xl px-6 py-12 text-center">
          <p className="text-sm text-muted">角色库还是空的～</p>
          <p className="mt-1 text-[11px] text-muted">「导入角色卡」支持 Tavern V1/V2/V3 的 JSON 或 PNG（连世界书一起进）</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {chars.map((c) => (
            <div key={c.id} className="glass flex items-center gap-3 rounded-2xl px-3.5 py-3">
              <Avatar img={c.avatarImg} emoji={c.avatar} className="h-12 w-12 shrink-0 rounded-full text-xl" textCls="text-xl" style={{ background: c.color + '33' }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{c.name}</div>
                <div className="truncate text-[11px] text-muted">
                  {(c.persona || '').replace(/\s+/g, ' ').trim().slice(0, 28) || '（没填人设）'}
                  {c.lore?.length ? ` · 世界书 ${c.lore.length}` : ''}
                </div>
              </div>
              <button onClick={() => startChat(c)} className="btn-primary shrink-0 rounded-full px-3.5 py-1.5 text-[12px]">
                开始对话
              </button>
              <button onClick={() => setEditing(c)} className="shrink-0 px-1 text-[12px] text-muted hover:text-accent">编辑</button>
              <button
                onClick={() => {
                  if (window.confirm(`从角色库删除「${c.name}」？（不影响已建的对话）`)) removeLibChar(c.id)
                }}
                className="shrink-0 px-1 text-[12px] text-muted hover:text-red-500"
              >
                删
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="pb-2 text-center text-[11px] text-muted">只存在你本机 · 不上传 ♡</p>

      {editing && <LibCharEditor target={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** 角色库的角色编辑（全屏整页） */
function LibCharEditor({ target, onClose }: { target: LibChar | 'new'; onClose: () => void }) {
  const addLibChar = useCharLibStore((s) => s.addChar)
  const updateLibChar = useCharLibStore((s) => s.updateChar)
  const channels = useApiStore((s) => s.channels)
  const isNew = target === 'new'
  const base = isNew ? null : (target as LibChar)
  const [name, setName] = useState(base?.name ?? '')
  const [avatar] = useState(base?.avatar ?? '🎭')
  const [avatarImg, setAvatarImg] = useState<string | undefined>(base?.avatarImg)
  const [persona, setPersona] = useState(base?.persona ?? '')
  const [greeting, setGreeting] = useState(base?.greeting ?? '')
  const [color, setColor] = useState(base?.color ?? PRESET_COLORS[0])
  const [apiChannelId, setApiChannelId] = useState<string | undefined>(base?.apiChannelId)
  const [chanOpen, setChanOpen] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)
  const chanName = channels.find((c) => c.id === apiChannelId)?.name
  const inputCls = 'w-full rounded-xl border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent'

  function save() {
    const patch = { name, avatar, avatarImg, persona, greeting, color, apiChannelId }
    if (isNew) addLibChar(patch)
    else updateLibChar((target as LibChar).id, patch)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-to, #f7f1f4)' }}>
      <div className="glass-bar flex items-center justify-between gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="px-2 py-1.5 text-sm text-muted">取消</button>
        <div className="headline text-base text-ink">{isNew ? '新建角色' : '编辑角色'}</div>
        <button onClick={save} className="btn-primary rounded-full px-5 py-1.5 text-sm">保存</button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-3">
          <Avatar img={avatarImg} emoji={avatar} className="h-16 w-16 rounded-full text-2xl" textCls="text-2xl" style={{ background: color + '33' }} />
          <input
            ref={imgRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) setAvatarImg(await fileToDataUrl(f, 256))
            }}
          />
          <button onClick={() => imgRef.current?.click()} className="glass rounded-lg px-3 py-1.5 text-xs text-ink">上传头像</button>
          {avatarImg && (
            <button onClick={() => setAvatarImg(undefined)} className="text-[11px] text-muted hover:text-accent">移除</button>
          )}
        </div>
        <div>
          <div className="mb-1 text-[12px] text-muted">角色名字</div>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="如 沈衍辰" />
        </div>
        <div>
          <div className="mb-1 text-[12px] text-muted">角色设定 / 人设</div>
          <textarea className={inputCls + ' min-h-[220px] leading-relaxed'} rows={12} value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="身份、性别、年龄、性格、说话风格、背景关系…" />
        </div>
        <div>
          <div className="mb-1 text-[12px] text-muted">开场白（开 1v1 时的出场第一条 · 可留空）</div>
          <textarea className={inputCls + ' min-h-[120px] leading-relaxed'} rows={6} value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="角色出场说的第一句/一段" />
        </div>
        <div>
          <div className="mb-1 text-[12px] text-muted">气泡颜色</div>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-accent ring-offset-1' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[12px] text-muted">独立 API（这个角色单独用哪个模型）</div>
          <button type="button" onClick={() => setChanOpen((o) => !o)} className={inputCls + ' flex items-center justify-between text-left'}>
            <span className="truncate">{chanName || '跟随当前激活渠道'}</span>
            <span className="shrink-0 text-muted">{chanOpen ? '▴' : '▾'}</span>
          </button>
          {chanOpen && (
            <div className="mt-1 max-h-60 overflow-y-auto rounded-2xl border border-line bg-white/70 p-1.5">
              <button type="button" onClick={() => { setApiChannelId(undefined); setChanOpen(false) }} className="block w-full rounded-xl px-3 py-2 text-left text-[13px] text-ink hover:bg-white/50">
                跟随当前激活渠道{!apiChannelId ? ' ✓' : ''}
              </button>
              {channels.map((c) => (
                <button key={c.id} type="button" onClick={() => { setApiChannelId(c.id); setChanOpen(false) }} className="block w-full truncate rounded-xl px-3 py-2 text-left text-[13px] text-ink hover:bg-white/50">
                  {c.name || c.model}{apiChannelId === c.id ? ' ✓' : ''}
                </button>
              ))}
              {channels.length === 0 && <div className="px-3 py-1.5 text-[11px] text-muted">还没渠道，去「设置 → API / 模型」加</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
