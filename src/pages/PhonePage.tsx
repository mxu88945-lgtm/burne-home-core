import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useProfileStore } from '@/store/profileStore'
import { useApiStore } from '@/store/apiStore'
import { useSyncStore } from '@/store/syncStore'
import { useUsageStore } from '@/store/usageStore'
import { useMemoryStore } from '@/store/memoryStore'
import { useTtsStore } from '@/store/ttsStore'
import { useTtsPlayback } from '@/lib/useTtsPlayback'
import { usePhoneStore, type PhoneMsg } from '@/store/phoneStore'
import { useStickerStore, type Sticker } from '@/store/stickerStore'
import { chatComplete } from '@/api/llm'
import { sendChat, type ChatApiMessage } from '@/api/chat'
import { fileToDataUrl } from '@/lib/image'
import Avatar from '@/components/ui/Avatar'

function newId() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `pm-${Date.now()}-${Math.random()}`
}
function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/** 把模型回复切成「连发的几条短消息」：先按换行，长句再按句末标点切（不用 lookbehind，兼容老 Safari） */
function splitBubbles(text: string): string[] {
  const enders = '。！？!?～~…'
  const bySentence = (line: string): string[] => {
    const out: string[] = []
    let buf = ''
    for (const ch of line) {
      buf += ch
      if (enders.includes(ch)) {
        out.push(buf.trim())
        buf = ''
      }
    }
    if (buf.trim()) out.push(buf.trim())
    return out.filter(Boolean)
  }
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((line) => (line.length <= 38 ? [line] : bySentence(line)))
    .filter(Boolean)
    .slice(0, 14)
}

/** 共用记忆库：把记忆概览 + 长期记忆注入到 TA 的 system，让小手机也「记得」 */
function memoryNote(): string {
  const mem = useMemoryStore.getState()
  let note = ''
  if (mem.overview?.trim()) note += `\n\n【你们的记忆概览】\n${mem.overview.trim()}`
  const longs = mem.memories.filter((m) => m.kind === 'long')
  if (longs.length) {
    const lines = longs
      .slice(0, 40)
      .map((m) => `· ${m.title}：${m.content}`)
      .join('\n')
    note += `\n\n【长期记忆（请记得）】\n${lines}`
  }
  return note.length > 2000 ? note.slice(0, 2000) + '…' : note
}

export default function PhonePage() {
  const { profile } = useProfileStore()
  const activeChannel = useApiStore((s) => s.getActive())
  const channels = useApiStore((s) => s.channels)
  const { config } = useSyncStore()
  const addUsage = useUsageStore((s) => s.add)
  const addMemory = useMemoryStore((s) => s.addMemory)
  const ttsEnabled = useTtsStore((s) => s.config.enabled)
  const { play, playingId, loadingId } = useTtsPlayback()
  const persona = usePhoneStore((s) => s.persona)
  const sessions = usePhoneStore((s) => s.sessions)
  const activeId = usePhoneStore((s) => s.activeId)
  const setMessages = usePhoneStore((s) => s.setMessages)
  const setPersona = usePhoneStore((s) => s.setPersona)
  const createSession = usePhoneStore((s) => s.createSession)
  const switchSession = usePhoneStore((s) => s.switchSession)
  const removeSession = usePhoneStore((s) => s.removeSession)
  const renameSession = usePhoneStore((s) => s.renameSession)
  const autoTitle = usePhoneStore((s) => s.autoTitle)
  const clear = usePhoneStore((s) => s.clear)
  const active = sessions.find((s) => s.id === activeId)
  const messages = active?.messages ?? []

  // 小手机可以选自己的渠道；没选就用主聊天激活的
  const phoneChannel =
    (persona.apiChannelId && channels.find((c) => c.id === persona.apiChannelId)) || activeChannel
  const [modelOpen, setModelOpen] = useState(false)

  const workerUrl = config.workerUrl?.trim()
  const connected = Boolean(phoneChannel || workerUrl)
  const name = persona.name || 'TA'
  const userName = profile.nameA || '我'

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [err, setErr] = useState('')
  const [pendingImage, setPendingImage] = useState('')
  const [lightbox, setLightbox] = useState('')
  const [stickerOpen, setStickerOpen] = useState(false)
  const stickers = useStickerStore((s) => s.stickers)
  const addSticker = useStickerStore((s) => s.add)
  const removeSticker = useStickerStore((s) => s.remove)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const picRef = useRef<HTMLInputElement>(null)
  const stickerFileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isTouch =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  function autoGrow() {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }
  useEffect(() => {
    autoGrow()
  }, [draft])

  function editName() {
    const v = window.prompt('TA 的名字', persona.name)
    if (v != null && v.trim()) setPersona({ name: v.trim() })
  }
  function editSignature() {
    const v = window.prompt('个性签名 / 状态（顶部那行小字）', persona.signature)
    if (v != null) setPersona({ signature: v.trim() })
  }
  function editEmoji() {
    const v = window.prompt('头像 emoji（也可以点头像上传图片）', persona.avatar)
    if (v != null && v.trim()) setPersona({ avatar: v.trim() })
  }
  function editPrompt() {
    const v = window.prompt(
      'TA 的灵魂设定（留空用默认）。例：你是我养的小狗，黏人、爱撒娇、说话短',
      persona.systemPrompt,
    )
    if (v != null) setPersona({ systemPrompt: v.trim() })
  }
  async function pickAvatar(file: File) {
    try {
      setPersona({ avatarImg: await fileToDataUrl(file, 256, 0.85) })
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  async function pickImage(file: File) {
    setErr('')
    try {
      setPendingImage(await fileToDataUrl(file, 1280, 0.8))
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  async function sendSticker(s: Sticker) {
    if (sending) return
    setStickerOpen(false)
    const mine: PhoneMsg = {
      id: newId(),
      role: 'me',
      text: '',
      at: now(),
      sticker: { emoji: s.emoji, img: s.img, name: s.name },
    }
    const history = [...messages, mine]
    setMessages(history)
    if (connected) await respond(history)
  }
  async function addStickerImage(file: File) {
    setErr('')
    try {
      const url = await fileToDataUrl(file, 320, 0.85)
      const nm = (window.prompt('给这个贴纸起个名字（TA 会按名字挑着发）', '贴纸') || '').trim()
      addSticker({ name: nm || '贴纸', img: url })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function send() {
    const text = draft.trim()
    if ((!text && !pendingImage) || sending) return
    const mine: PhoneMsg = {
      id: newId(),
      role: 'me',
      text,
      at: now(),
      ...(pendingImage ? { image: pendingImage } : {}),
    }
    const history = [...messages, mine]
    setMessages(history)
    if (text) autoTitle(text)
    setDraft('')
    setPendingImage('')
    if (!connected) {
      setMessages((p) => [
        ...p,
        { id: newId(), role: 'ta', text: '（还没配 API 哦～去「设置 → API / 模型」加一条渠道我就能回你啦）', at: now() },
      ])
      return
    }
    await respond(history)
  }

  /** 自动沉淀记忆：让模型判断有没有值得长期记住的，写进共用记忆库（高门槛 / 或用户明确要求时必存） */
  async function extractMemories(history: PhoneMsg[], force: boolean) {
    if (!phoneChannel && !workerUrl) return
    const transcript = history
      .slice(-8)
      .map((m) => `${m.role === 'me' ? '用户' : 'TA'}：${m.text}`)
      .join('\n')
    const sys = '你是记忆管理助手，只输出 JSON，不要任何多余文字。'
    const ask =
      `判断下面对话里有没有【值得长期记住】的重要信息：用户或角色的设定、背景、关键事实、偏好、承诺、重要事件等。` +
      `严格标准、宁缺毋滥：忽略寒暄、日常闲聊、临时情绪、一次性内容。` +
      (force ? '用户已明确要求记住，请务必提取其指向的内容。' : '') +
      `\n只输出 JSON：{"items":[{"title":"简短标题","content":"要记住的内容"}]}，没有就 {"items":[]}。\n\n对话：\n${transcript}`
    try {
      let text = ''
      if (phoneChannel) {
        text = (
          await chatComplete(phoneChannel, [{ role: 'user', content: ask }], sys, {
            workerUrl,
            syncKey: config.syncKey,
            maxTokens: 600,
          })
        ).text
      } else {
        text = await sendChat({
          workerUrl: workerUrl!,
          syncKey: config.syncKey,
          messages: [{ role: 'user', content: ask }],
          system: sys,
          maxTokens: 600,
        })
      }
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return
      const items = (JSON.parse(match[0]).items || []) as { title?: string; content?: string }[]
      const existing = useMemoryStore.getState().memories
      let added = 0
      for (const it of items) {
        const content = (it.content || '').trim()
        const title = (it.title || '').trim()
        if (!content) continue
        if (existing.some((m) => m.content.trim() === content || (title && m.title.trim() === title)))
          continue
        addMemory({ title: title || content.slice(0, 16), content, kind: 'long', source: 'auto' })
        added++
      }
      if (added > 0) {
        setMessages((p) => [
          ...p,
          { id: newId(), role: 'ta', text: `🧠 已记到记忆库（${added} 条）`, at: now() },
        ])
      }
    } catch {
      // 静默失败，不打扰对话
    }
  }

  async function respond(history: PhoneMsg[]) {
    const apiMsgs: ChatApiMessage[] = history
      .filter((m) => m.text.trim() || m.image || m.sticker)
      .map((m) => {
        const role = m.role === 'me' ? ('user' as const) : ('assistant' as const)
        if (m.image) {
          const parts: Exclude<ChatApiMessage['content'], string> = []
          if (m.text.trim()) parts.push({ type: 'text', text: m.text.trim() })
          parts.push({ type: 'image_url', image_url: { url: m.image } })
          return { role, content: parts }
        }
        if (m.sticker) {
          return { role, content: `（发了一个表情贴纸：${m.sticker.name || m.sticker.emoji || '表情'}）` }
        }
        return { role, content: m.text }
      })
    while (apiMsgs.length && apiMsgs[0].role !== 'user') apiMsgs.shift()

    const base =
      persona.systemPrompt.trim() ||
      `你是${name}，${userName} 手机里最亲密的人，黏人、温柔、爱聊天。`
    const texting =
      `\n\n【发消息风格 · 很重要】你在用手机和 ${userName} 发消息聊天。像真人发微信那样：` +
      `每条消息简短、口语、自然；一次可以连发好几条短消息——用换行把每条分开。` +
      `不要写长段落，不要括号里的动作/神态/旁白，表情符号适量就好。`
    const stickerNames = stickers.map((s) => s.name).filter(Boolean)
    const stickerNote = stickerNames.length
      ? `\n\n【表情贴纸 · 可选】聊到合适的时候你可以发一个表情贴纸表达情绪——在回复里【单独一行】输出 [[sticker|名字]]，名字只能从这个清单里选：${stickerNames.join('、')}。别每条都发，偶尔点缀就好。`
      : ''
    const localTime = new Date().toLocaleString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
    const system = `${base}${texting}${memoryNote()}${stickerNote}\n\n（当前时间：${localTime}，可自然参考。）`

    setSending(true)
    setErr('')
    try {
      let reply = ''
      if (phoneChannel) {
        const r = await chatComplete(phoneChannel, apiMsgs, system, {
          workerUrl,
          syncKey: config.syncKey,
          temperature: 0.85,
          maxTokens: 1024,
        })
        reply = r.text
        if (r.usage) {
          addUsage({
            at: new Date().toISOString(),
            provider: phoneChannel.provider,
            model: r.usage.model,
            promptTokens: r.usage.promptTokens,
            completionTokens: r.usage.completionTokens,
            totalTokens: r.usage.totalTokens,
            cost: r.usage.cost,
          })
        }
      } else {
        reply = await sendChat({
          workerUrl: workerUrl!,
          syncKey: config.syncKey,
          messages: apiMsgs,
          system,
          temperature: 0.85,
          maxTokens: 1024,
        })
      }
      // 解析 TA 挑的表情贴纸 [[sticker|名字]]，从正文移除标记
      const picked: string[] = []
      reply = reply.replace(/\[\[sticker\|([^\]|]+)\]\]/g, (_m, n) => {
        picked.push(String(n).trim())
        return '\n'
      })
      const stickerMsgs: PhoneMsg[] = []
      for (const nm of picked) {
        const s =
          stickers.find((x) => x.name === nm) ||
          stickers.find((x) => x.name && (nm.includes(x.name) || x.name.includes(nm)))
        if (s) {
          stickerMsgs.push({
            id: newId(),
            role: 'ta',
            text: '',
            at: now(),
            sticker: { emoji: s.emoji, img: s.img, name: s.name },
          })
        }
      }
      const bubbles = splitBubbles(reply)
      const taMsgs: PhoneMsg[] = (bubbles.length ? bubbles : stickerMsgs.length ? [] : ['……']).map(
        (t) => ({ id: newId(), role: 'ta' as const, text: t, at: now() }),
      )
      setMessages((p) => [...p, ...taMsgs, ...stickerMsgs])
      // 往共用记忆库写：开了自动记忆每轮判断；或用户明确说「记一下」时必存
      const lastUser = [...history].reverse().find((m) => m.role === 'me')
      const force = !!lastUser && /记住|记一下|记下来|记下|记录|存一下|帮我记|记到/.test(lastUser.text)
      if (reply && (persona.autoMemory !== false || force)) {
        void extractMemories([...history, { id: 'tmp', role: 'ta', text: reply, at: '' }], force)
      }
    } catch (e) {
      setMessages((p) => [...p, { id: newId(), role: 'ta', text: `（没发出去：${(e as Error).message}）`, at: now() }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="relative flex h-full flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* 干净一点的「小手机」底：在主题背景上盖一层柔白，更像一块手机屏 */}
      <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: 'rgba(255,255,255,0.5)' }} />

      {/* 顶部：头像 + 名字 + 个性签名 + 菜单 */}
      <div className="glass-bar sticky top-0 z-20 flex items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <input
          ref={avatarRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) pickAvatar(f)
          }}
        />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="对话列表"
          className="flex-none text-base text-muted hover:text-accent"
        >
          ☰
        </button>
        <button type="button" onClick={() => avatarRef.current?.click()} aria-label="换头像" className="flex-none">
          <Avatar
            img={persona.avatarImg}
            emoji={persona.avatar}
            className="h-11 w-11 rounded-2xl bg-white/60 text-2xl"
            textCls="text-2xl"
          />
        </button>
        <div className="min-w-0 flex-1" onClick={editName}>
          <div className="headline truncate text-lg not-italic font-semibold leading-tight text-ink">{name}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted">{persona.signature || '点这里写个性签名'}</div>
        </div>
        <div className="relative flex flex-none items-center gap-2">
          {/* 模型：小手机可单独选渠道（不填跟随主聊天） */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              setModelOpen((o) => !o)
            }}
            className="flex max-w-[34vw] items-center gap-1 rounded-full bg-white/40 px-2.5 py-1 text-[10px] text-muted"
          >
            <span className="truncate">{phoneChannel?.model || '默认模型'}</span>
            <span className="shrink-0">▾</span>
          </button>
          {modelOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setModelOpen(false)} />
              <div className="glass-strong absolute right-0 top-full z-30 mt-1 w-56 max-w-[74vw] overflow-hidden rounded-2xl p-1.5 text-left shadow-lg">
                <div className="px-2 py-1 text-[10px] text-muted">小手机用哪个模型</div>
                <button
                  type="button"
                  onClick={() => {
                    setPersona({ apiChannelId: undefined })
                    setModelOpen(false)
                  }}
                  className="block w-full rounded-xl px-3 py-1.5 text-left text-[12px] text-ink hover:bg-white/40"
                >
                  跟随主聊天{!persona.apiChannelId ? ' ✓' : ''}
                </button>
                {channels.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setPersona({ apiChannelId: c.id })
                      setModelOpen(false)
                    }}
                    className="block w-full truncate rounded-xl px-3 py-1.5 text-left text-[12px] text-ink hover:bg-white/40"
                  >
                    {c.name || c.model}
                    {persona.apiChannelId === c.id ? ' ✓' : ''}
                  </button>
                ))}
                {channels.length === 0 && (
                  <div className="px-3 py-1.5 text-[11px] text-muted">还没渠道，去「设置 → API / 模型」加</div>
                )}
              </div>
            </>
          )}
          {/* ⚙ 设置菜单 */}
          <button
            type="button"
            onClick={() => {
              setModelOpen(false)
              setMenuOpen((o) => !o)
            }}
            aria-label="设置"
            className="text-base text-muted hover:text-accent"
          >
            ⚙
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div className="glass-strong absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-2xl p-1 text-[13px] text-ink shadow-lg">
                {[
                  ['改名字', editName],
                  ['改个性签名', editSignature],
                  ['改头像 emoji', editEmoji],
                  ['改灵魂设定', editPrompt],
                ].map(([label, fn]) => (
                  <button
                    key={label as string}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      ;(fn as () => void)()
                    }}
                    className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/40"
                  >
                    {label as string}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    avatarRef.current?.click()
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  上传头像图片
                </button>
                <button
                  type="button"
                  onClick={() => setPersona({ autoMemory: persona.autoMemory === false })}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  <span>自动记到记忆库</span>
                  <span className={persona.autoMemory !== false ? 'text-accent' : 'text-muted'}>
                    {persona.autoMemory !== false ? '开' : '关'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    if (window.confirm('清空和 TA 的聊天记录？')) clear()
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left text-red-500 hover:bg-white/40"
                >
                  清空聊天
                </button>
                <Link
                  to="/"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full rounded-xl px-3 py-2 text-left text-muted hover:bg-white/40"
                >
                  ← 回主页
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="mt-10 text-center text-[12px] text-muted">
            给 {name} 发条消息吧～像发微信一样
          </div>
        )}
        <div className="space-y-2">
          {messages.map((m, i) => {
            const me = m.role === 'me'
            // 连发多条只在「这一串的第一条」显示头像，其余用占位对齐
            const firstOfRun = !me && (i === 0 || messages[i - 1].role !== 'ta')
            const canSpeak = !me && ttsEnabled && m.text.trim()
            return (
              <div key={m.id} className={`flex items-end gap-2 ${me ? 'flex-row-reverse' : ''}`}>
                {!me &&
                  (firstOfRun ? (
                    <Avatar
                      img={persona.avatarImg}
                      emoji={persona.avatar}
                      className="h-7 w-7 flex-none rounded-full bg-white/60 text-sm"
                      textCls="text-sm"
                    />
                  ) : (
                    <div className="h-7 w-7 flex-none" aria-hidden />
                  ))}
                <div className={`flex max-w-[74%] flex-col gap-1 ${me ? 'items-end' : 'items-start'}`}>
                  {m.sticker &&
                    (m.sticker.img ? (
                      <img
                        src={m.sticker.img}
                        alt={m.sticker.name || '贴纸'}
                        onClick={() => setLightbox(m.sticker!.img!)}
                        className="h-24 w-24 cursor-pointer object-contain"
                      />
                    ) : (
                      <span className="text-[52px] leading-none">{m.sticker.emoji}</span>
                    ))}
                  {m.image && (
                    <img
                      src={m.image}
                      alt="图片"
                      onClick={() => setLightbox(m.image!)}
                      className="max-h-56 max-w-full cursor-pointer rounded-2xl object-cover"
                    />
                  )}
                  {m.text.trim() && (
                    <div
                      onClick={canSpeak ? () => play(m.id, m.text) : undefined}
                      className={[
                        'max-w-full whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed [overflow-wrap:anywhere]',
                        me ? 'btn-primary rounded-br-md' : 'rounded-bl-md text-ink shadow-sm',
                        canSpeak ? 'cursor-pointer' : '',
                      ].join(' ')}
                      style={me ? undefined : { background: 'rgba(120,120,128,0.14)' }}
                    >
                      {!me && (loadingId === m.id || playingId === m.id) && (
                        <span className="mr-1 text-[12px]">{loadingId === m.id ? '⏳' : '🔊'}</span>
                      )}
                      {m.text}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {sending && (
            <div className="flex items-end gap-2">
              {messages.length > 0 && messages[messages.length - 1].role === 'ta' ? (
                <div className="h-7 w-7 flex-none" aria-hidden />
              ) : (
                <Avatar
                  img={persona.avatarImg}
                  emoji={persona.avatar}
                  className="h-7 w-7 flex-none rounded-full bg-white/60 text-sm"
                  textCls="text-sm"
                />
              )}
              <div
                className="flex items-center gap-1 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm"
                style={{ background: 'rgba(120,120,128,0.14)' }}
              >
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current text-muted" style={{ animationDelay: '0ms' }} />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current text-muted" style={{ animationDelay: '200ms' }} />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current text-muted" style={{ animationDelay: '400ms' }} />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* 输入栏 */}
      <div className="flex-none px-3 pb-1 pt-2">
        {err && <div className="mb-1 px-2 text-center text-[11px] text-red-500">{err}</div>}
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2 px-2">
            <div className="relative">
              <img src={pendingImage} alt="待发送" className="h-16 w-16 rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => setPendingImage('')}
                aria-label="移除图片"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] text-white"
              >
                ✕
              </button>
            </div>
            <span className="text-[11px] text-muted">图片已就绪，可一起发文字</span>
          </div>
        )}
        <input
          ref={picRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) pickImage(f)
          }}
        />
        <input
          ref={stickerFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) addStickerImage(f)
          }}
        />
        {/* 表情贴纸面板 */}
        {stickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setStickerOpen(false)} />
            <div className="glass-strong absolute inset-x-3 bottom-16 z-20 max-h-60 overflow-y-auto rounded-2xl p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] text-muted">表情贴纸（点发送）</span>
                <button
                  type="button"
                  onClick={() => stickerFileRef.current?.click()}
                  className="rounded-full bg-white/50 px-2.5 py-1 text-[11px] text-ink"
                >
                  ＋ 上传贴纸
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {stickers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => sendSticker(s)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      if (window.confirm(`删除贴纸「${s.name}」？`)) removeSticker(s.id)
                    }}
                    title={s.name}
                    className="flex aspect-square items-center justify-center rounded-xl bg-white/40 active:scale-95"
                  >
                    {s.img ? (
                      <img src={s.img} alt={s.name} className="h-full w-full rounded-xl object-contain p-0.5" />
                    ) : (
                      <span className="text-2xl">{s.emoji}</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-center text-[10px] text-muted">长按贴纸可删除</div>
            </div>
          </>
        )}
        <div className="glass-strong flex items-end gap-1 rounded-3xl py-1 pl-2 pr-1.5">
          <button
            type="button"
            onClick={() => picRef.current?.click()}
            aria-label="发图片"
            className="mb-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full text-xl text-muted hover:bg-white/40 hover:text-ink"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={() => setStickerOpen((o) => !o)}
            aria-label="表情贴纸"
            className="mb-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full text-lg text-muted hover:bg-white/40 hover:text-ink"
          >
            😀
          </button>
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => {
              setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 300)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isTouch) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="发消息…"
            className="min-h-[34px] max-h-[120px] min-w-0 flex-1 resize-none self-center bg-transparent py-1.5 text-sm leading-snug text-ink outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending}
            aria-label="发送"
            className="btn-primary mb-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full text-base disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </div>

      {/* 会话侧栏（多对话） */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setDrawerOpen(false)}>
          <div
            className="glass-strong flex h-full w-72 max-w-[80%] flex-col gap-2 p-3 pt-[max(1rem,env(safe-area-inset-top))]"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              to="/"
              onClick={() => setDrawerOpen(false)}
              className="mb-1 inline-flex items-center gap-1 px-1 text-[12px] text-muted hover:text-accent"
            >
              ← 主页
            </Link>
            <div className="flex items-center justify-between px-1">
              <span className="headline text-base text-ink">{name} · 对话</span>
              <button
                type="button"
                onClick={() => {
                  createSession()
                  setDrawerOpen(false)
                }}
                className="btn-primary rounded-full px-3 py-1 text-[12px]"
              >
                ＋ 新对话
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {sessions.map((s) => {
                const on = s.id === activeId
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      switchSession(s.id)
                      setDrawerOpen(false)
                    }}
                    className={[
                      'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm',
                      on ? 'bg-white/50 text-ink' : 'text-ink hover:bg-white/30',
                    ].join(' ')}
                  >
                    <span className="flex-1 truncate">{s.title}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const t = window.prompt('重命名对话', s.title)
                        if (t) renameSession(s.id, t)
                      }}
                      aria-label="重命名"
                      className="text-[12px] text-muted hover:text-accent"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(`删除对话「${s.title}」？`)) removeSession(s.id)
                      }}
                      aria-label="删除"
                      className="text-[12px] text-muted hover:text-accent"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 图片大图预览 */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
          onClick={() => setLightbox('')}
        >
          <img src={lightbox} alt="大图" className="max-h-[85%] max-w-full rounded-xl" />
          <span className="text-[12px] text-white/80">长按图片可保存 · 点击空白关闭</span>
        </div>
      )}
    </div>
  )
}
