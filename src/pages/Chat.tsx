import { useState, useRef, useEffect } from 'react'
import { useProfileStore } from '@/store/profileStore'

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
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: newId(),
      role: 'companion',
      text: `欢迎回家呀～有什么想跟我说的吗？♡`,
    },
  ])
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function send() {
    const text = draft.trim()
    if (!text) return
    setMessages((prev) => [...prev, { id: newId(), role: 'me', text }])
    setDraft('')
  }

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col">
      <div className="px-1">
        <h2 className="headline text-2xl text-ink">
          和 {profile.nameB} 聊聊 💬
        </h2>
        <p className="mt-1 text-[11px] text-muted">
          UI 预览 · 聊天后端尚未接入
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
        <div ref={endRef} />
      </div>

      {/* 输入栏（浮在底部 Tab 之上） */}
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
            className="btn-primary rounded-full px-5 py-2 text-sm"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
