import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useProfileStore } from '@/store/profileStore'
import { usePersonaStore } from '@/store/personaStore'
import { useSyncStore } from '@/store/syncStore'
import { useApiStore } from '@/store/apiStore'
import { sendChat, type ChatApiMessage } from '@/api/chat'
import { chatComplete } from '@/api/llm'

interface Msg {
  id: string
  role: 'me' | 'companion'
  text: string
  at: string
}

function newId() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `msg-${Date.now()}`
}
function now() {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Chat() {
  const { profile } = useProfileStore()
  const { persona } = usePersonaStore()
  const { config } = useSyncStore()
  const activeChannel = useApiStore((s) => s.getActive())
  const workerUrl = config.workerUrl?.trim()
  const connected = Boolean(activeChannel || workerUrl)

  const name = persona.name || profile.nameB || 'TA'

  const [messages, setMessages] = useState<Msg[]>([
    { id: newId(), role: 'companion', text: '欢迎回家呀～有什么想跟我说的吗？♡', at: now() },
  ])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    const mine: Msg = { id: newId(), role: 'me', text, at: now() }
    const history = [...messages, mine]
    setMessages(history)
    setDraft('')

    if (!connected) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'companion',
          text: '（还没配 API 哦～去「设置 → API / 模型」加一条渠道，我就能真的回你啦 ♡）',
          at: now(),
        },
      ])
      return
    }

    const apiMsgs: ChatApiMessage[] = history.map((m) => ({
      role: m.role === 'me' ? 'user' : 'assistant',
      content: m.text,
    }))
    while (apiMsgs.length && apiMsgs[0].role !== 'user') apiMsgs.shift()

    const system =
      persona.systemPrompt.trim() ||
      `你是 ${name}，${profile.nameA} 最亲密的恋人与陪伴。用中文、口语化、亲昵温柔地回应，语气有情感温度，回复简洁自然，不要太长。`

    setSending(true)
    try {
      const reply = activeChannel
        ? await chatComplete(activeChannel, apiMsgs, system, {
            workerUrl,
            syncKey: config.syncKey,
            temperature: persona.temperature,
            maxTokens: persona.maxTokens,
          })
        : await sendChat({
            workerUrl: workerUrl!,
            syncKey: config.syncKey,
            messages: apiMsgs,
            system,
            provider: config.chatProvider || undefined,
            model: config.chatModel || undefined,
            temperature: persona.temperature,
            maxTokens: persona.maxTokens,
          })
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'companion', text: reply || '……', at: now() },
      ])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'companion', text: `（消息没送到：${(e as Error).message}）`, at: now() },
      ])
    } finally {
      setSending(false)
    }
  }

  const modelLabel = activeChannel?.model || config.chatModel || (connected ? '默认' : '未连接')

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col">
      {/* 角色头部 */}
      <div className="flex items-center justify-between pb-2">
        <Link to="/" className="glass rounded-full px-3 py-1.5 text-[11px] text-ink">
          ← 主屋
        </Link>
        <div className="text-center">
          <div className="headline text-xl leading-none text-ink">{name}</div>
          <div className="mt-0.5 text-[11px] text-muted">
            {connected ? persona.status : '未连接 API'}
          </div>
        </div>
        <Link to="/persona" className="glass rounded-full px-3 py-1.5 text-[11px] text-ink">
          人设
        </Link>
      </div>

      {/* 消息列表 */}
      <div className="mt-2 flex-1 space-y-4 pb-36">
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'me' ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
            <span className="mb-1 px-1 text-[10px] text-muted">{m.at}</span>
            <div
              className={[
                'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                m.role === 'me'
                  ? 'btn-primary rounded-br-md'
                  : 'glass rounded-bl-md text-ink',
              ].join(' ')}
            >
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex flex-col items-start">
            <span className="mb-1 px-1 text-[10px] text-muted">{persona.status}</span>
            <div className="glass rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-muted">
              {name} 正在输入…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 输入栏 + 模型条 */}
      <div className="fixed inset-x-0 bottom-[5.25rem] z-20 mx-auto max-w-md px-5">
        <div className="glass-strong flex items-center gap-2 rounded-full p-1.5 pl-4">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
            }}
            placeholder={`say something to ${name}…`}
            className="headline flex-1 bg-transparent text-sm not-italic text-ink outline-none placeholder:italic placeholder:text-muted"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="btn-primary rounded-full px-5 py-2 text-sm disabled:opacity-60"
          >
            发送
          </button>
        </div>
        <div className="mt-1.5 text-center">
          <Link to="/settings" className="text-[10px] text-muted hover:text-accent">
            模型：{modelLabel} ▾
          </Link>
        </div>
      </div>
    </div>
  )
}
