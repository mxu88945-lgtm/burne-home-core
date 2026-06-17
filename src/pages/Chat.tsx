import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useProfileStore } from '@/store/profileStore'
import { useSyncStore } from '@/store/syncStore'
import { sendChat, type ChatApiMessage } from '@/api/chat'

interface Msg {
  id: string
  role: 'me' | 'companion'
  text: string
}

function newId() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `msg-${Date.now()}`
}

export default function Chat() {
  const { profile } = useProfileStore()
  const { config } = useSyncStore()
  const workerUrl = config.workerUrl?.trim()

  const [messages, setMessages] = useState<Msg[]>([
    {
      id: newId(),
      role: 'companion',
      text: '欢迎回家呀～有什么想跟我说的吗？♡',
    },
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
    const mine: Msg = { id: newId(), role: 'me', text }
    const history = [...messages, mine]
    setMessages(history)
    setDraft('')

    // 没配后端：温柔提示，先把话存着
    if (!workerUrl) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'companion',
          text: '（还没连上后端哦～去「设置 → 多端同步」填上 Worker 地址，我就能真的回你啦 ♡）',
        },
      ])
      return
    }

    // 组装 API 消息：me→user，companion→assistant，并保证首条为 user
    const apiMsgs: ChatApiMessage[] = history.map((m) => ({
      role: m.role === 'me' ? 'user' : 'assistant',
      content: m.text,
    }))
    while (apiMsgs.length && apiMsgs[0].role !== 'user') apiMsgs.shift()

    const system = `你是 ${profile.nameB}，${profile.nameA} 最亲密的恋人与陪伴。用中文、口语化、亲昵温柔地回应，语气有情感温度，回复简洁自然，不要太长。`

    setSending(true)
    try {
      const reply = await sendChat({
        workerUrl,
        syncKey: config.syncKey,
        messages: apiMsgs,
        system,
        provider: config.chatProvider || undefined,
        model: config.chatModel || undefined,
      })
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'companion', text: reply || '……' },
      ])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'companion',
          text: `（消息没送到：${(e as Error).message}）`,
        },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col">
      <div className="px-1">
        <h2 className="headline text-2xl text-ink">和 {profile.nameB} 聊聊 💬</h2>
        <p className="mt-1 text-[11px] text-muted">
          {workerUrl ? (
            '已连接后端'
          ) : (
            <>
              未连接后端 ·{' '}
              <Link to="/settings" className="text-accent underline-offset-2 hover:underline">
                去设置
              </Link>
            </>
          )}
        </p>
      </div>

      {/* 消息列表 */}
      <div className="mt-4 flex-1 space-y-3 pb-32">
        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === 'me' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={[
                'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                m.role === 'me' ? 'btn-primary' : 'glass text-ink',
              ].join(' ')}
            >
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="glass rounded-2xl px-4 py-2.5 text-sm text-muted">
              {profile.nameB} 正在输入…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 输入栏 */}
      <div className="fixed inset-x-0 bottom-[5.5rem] z-20 mx-auto max-w-md px-5">
        <div className="glass-strong flex items-center gap-2 rounded-full p-1.5 pl-4">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
            }}
            placeholder="说点什么吧…"
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
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
      </div>
    </div>
  )
}
