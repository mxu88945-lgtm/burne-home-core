import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useProfileStore } from '@/store/profileStore'
import { useApiStore } from '@/store/apiStore'
import { useSyncStore } from '@/store/syncStore'
import { useUsageStore } from '@/store/usageStore'
import { useMemoryStore } from '@/store/memoryStore'
import { usePhoneStore, type PhoneMsg } from '@/store/phoneStore'
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
  const { config } = useSyncStore()
  const addUsage = useUsageStore((s) => s.add)
  const persona = usePhoneStore((s) => s.persona)
  const messages = usePhoneStore((s) => s.messages)
  const setMessages = usePhoneStore((s) => s.setMessages)
  const setPersona = usePhoneStore((s) => s.setPersona)
  const clear = usePhoneStore((s) => s.clear)

  const workerUrl = config.workerUrl?.trim()
  const connected = Boolean(activeChannel || workerUrl)
  const name = persona.name || 'TA'
  const userName = profile.nameA || '我'

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [err, setErr] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
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

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    const mine: PhoneMsg = { id: newId(), role: 'me', text, at: now() }
    const history = [...messages, mine]
    setMessages(history)
    setDraft('')
    if (!connected) {
      setMessages((p) => [
        ...p,
        { id: newId(), role: 'ta', text: '（还没配 API 哦～去「设置 → API / 模型」加一条渠道我就能回你啦）', at: now() },
      ])
      return
    }
    await respond(history)
  }

  async function respond(history: PhoneMsg[]) {
    const apiMsgs: ChatApiMessage[] = history
      .filter((m) => m.text.trim())
      .map((m) => ({ role: m.role === 'me' ? ('user' as const) : ('assistant' as const), content: m.text }))
    while (apiMsgs.length && apiMsgs[0].role !== 'user') apiMsgs.shift()

    const base =
      persona.systemPrompt.trim() ||
      `你是${name}，${userName} 手机里最亲密的人，黏人、温柔、爱聊天。`
    const texting =
      `\n\n【发消息风格 · 很重要】你在用手机和 ${userName} 发消息聊天。像真人发微信那样：` +
      `每条消息简短、口语、自然；一次可以连发好几条短消息——用换行把每条分开。` +
      `不要写长段落，不要括号里的动作/神态/旁白，表情符号适量就好。`
    const localTime = new Date().toLocaleString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
    const system = `${base}${texting}${memoryNote()}\n\n（当前时间：${localTime}，可自然参考。）`

    setSending(true)
    setErr('')
    try {
      let reply = ''
      if (activeChannel) {
        const r = await chatComplete(activeChannel, apiMsgs, system, {
          workerUrl,
          syncKey: config.syncKey,
          temperature: 0.85,
          maxTokens: 1024,
        })
        reply = r.text
        if (r.usage) {
          addUsage({
            at: new Date().toISOString(),
            provider: activeChannel.provider,
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
      const bubbles = splitBubbles(reply)
      const taMsgs: PhoneMsg[] = (bubbles.length ? bubbles : ['……']).map((t) => ({
        id: newId(),
        role: 'ta',
        text: t,
        at: now(),
      }))
      setMessages((p) => [...p, ...taMsgs])
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
        <div className="relative flex-none">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="设置"
            className="text-base text-muted hover:text-accent"
          >
            ⚙
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div className="glass-strong absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-2xl p-1 text-[13px] text-ink shadow-lg">
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
          {messages.map((m) => {
            const me = m.role === 'me'
            return (
              <div key={m.id} className={`flex items-end gap-2 ${me ? 'flex-row-reverse' : ''}`}>
                {!me && (
                  <Avatar
                    img={persona.avatarImg}
                    emoji={persona.avatar}
                    className="h-7 w-7 flex-none rounded-full bg-white/60 text-sm"
                    textCls="text-sm"
                  />
                )}
                <div
                  className={[
                    'max-w-[74%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed [overflow-wrap:anywhere]',
                    me ? 'btn-primary rounded-br-md' : 'bg-white/85 text-ink rounded-bl-md shadow-sm',
                  ].join(' ')}
                >
                  {m.text}
                </div>
              </div>
            )
          })}
          {sending && (
            <div className="flex items-end gap-2">
              <Avatar
                img={persona.avatarImg}
                emoji={persona.avatar}
                className="h-7 w-7 flex-none rounded-full bg-white/60 text-sm"
                textCls="text-sm"
              />
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/85 px-4 py-3 shadow-sm">
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
        <div className="glass-strong flex items-end gap-1 rounded-3xl py-1 pl-3 pr-1.5">
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
    </div>
  )
}
