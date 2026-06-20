import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useProfileStore } from '@/store/profileStore'
import { usePersonaStore } from '@/store/personaStore'
import { useSyncStore } from '@/store/syncStore'
import { useApiStore } from '@/store/apiStore'
import { useUsageStore } from '@/store/usageStore'
import { sendChat, type ChatApiMessage } from '@/api/chat'
import { chatComplete } from '@/api/llm'
import { useTtsStore } from '@/store/ttsStore'
import { useTtsPlayback } from '@/lib/useTtsPlayback'
import { useAppearanceStore } from '@/store/appearanceStore'
import { useChatStore, type ChatMsg as Msg } from '@/store/chatStore'
import { fileToDataUrl } from '@/lib/image'
import Avatar from '@/components/ui/Avatar'

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
  const addUsage = useUsageStore((s) => s.add)
  const ttsEnabled = useTtsStore((s) => s.config.enabled)
  const { chatBg, chatBgDim } = useAppearanceStore((s) => s.appearance)
  const { play, playingId, loadingId, error: ttsError } = useTtsPlayback()
  const workerUrl = config.workerUrl?.trim()
  const connected = Boolean(activeChannel || workerUrl)

  const name = persona.name || profile.nameB || 'TA'

  const { messages, setMessages, clear } = useChatStore()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [lightbox, setLightbox] = useState('')
  const [imgErr, setImgErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  async function sendImage(file: File) {
    setPlusOpen(false)
    setImgErr('')
    try {
      const image = await fileToDataUrl(file, 1280, 0.8)
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'me', text: '', at: now(), image },
      ])
    } catch (e) {
      setImgErr((e as Error).message)
    }
  }

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

    const apiMsgs: ChatApiMessage[] = history
      .filter((m) => m.text.trim()) // 图片消息无文本，不进 AI 上下文（暂不识图）
      .map((m) => ({
        role: m.role === 'me' ? 'user' : 'assistant',
        content: m.text,
      }))
    while (apiMsgs.length && apiMsgs[0].role !== 'user') apiMsgs.shift()

    const system =
      persona.systemPrompt.trim() ||
      `你是 ${name}，${profile.nameA} 最亲密的恋人与陪伴。用中文、口语化、亲昵温柔地回应，语气有情感温度，回复简洁自然，不要太长。`

    setSending(true)
    try {
      let reply = ''
      if (activeChannel) {
        const r = await chatComplete(activeChannel, apiMsgs, system, {
          workerUrl,
          syncKey: config.syncKey,
          temperature: persona.temperature,
          maxTokens: persona.maxTokens,
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
          provider: config.chatProvider || undefined,
          model: config.chatModel || undefined,
          temperature: persona.temperature,
          maxTokens: persona.maxTokens,
        })
      }
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
    <div className="relative flex h-full flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* 聊天背景图 + 变暗层（在内容之下） */}
      {chatBg && (
        <>
          <div
            className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center"
            style={{ backgroundImage: `url(${chatBg})` }}
          />
          <div
            className="pointer-events-none absolute inset-0 -z-10 bg-black"
            style={{ opacity: chatBgDim }}
          />
        </>
      )}
      {/* 角色头部（钉在顶部，不滚） */}
      <div className="flex flex-none items-center justify-between gap-2 pb-2">
        <div className="flex flex-none items-center gap-3">
          <Link to="/" className="text-[12px] text-muted hover:text-accent">
            ← Back
          </Link>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('清空当前对话？（不可恢复）')) clear()
            }}
            className="text-[12px] text-muted hover:text-accent"
          >
            清空
          </button>
        </div>
        <div className="min-w-0 text-center">
          <div className="headline text-lg leading-none text-ink">{name}</div>
          <div className="mt-0.5 text-[10px] text-muted">
            {connected ? persona.status : '未连接 API'}
          </div>
        </div>
        <Link
          to="/settings/api"
          className="max-w-[96px] truncate rounded-full bg-white/40 px-2.5 py-1 text-[10px] text-muted"
        >
          {modelLabel} ▾
        </Link>
      </div>

      {/* 消息列表（仅此区域滚动） */}
      <div className="mt-2 min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
        {messages.map((m) => {
          const me = m.role === 'me'
          return (
            <div key={m.id} className={`flex items-start gap-2 ${me ? 'flex-row-reverse' : ''}`}>
              <Avatar
                img={me ? profile.avatarAImg : profile.avatarBImg}
                emoji={me ? profile.avatarA : profile.avatarB}
                className="h-7 w-7 shrink-0 rounded-full bg-white/50 text-sm"
                textCls="text-sm"
              />
              <div className={`flex max-w-[78%] flex-col ${me ? 'items-end' : 'items-start'}`}>
                {m.image && (
                  <img
                    src={m.image}
                    alt="图片"
                    onClick={() => setLightbox(m.image!)}
                    className="max-h-60 max-w-full cursor-pointer rounded-2xl object-cover"
                  />
                )}
                {m.text && (
                  <div
                    className={[
                      'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      m.image ? 'mt-1' : '',
                      me ? 'btn-primary rounded-br-md' : 'glass rounded-bl-md text-ink',
                    ].join(' ')}
                  >
                    {m.text}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-2 px-1">
                  <span className="text-[10px] text-muted">{m.at}</span>
                  {!me && ttsEnabled && m.text.trim() && (
                    <button
                      type="button"
                      onClick={() => play(m.id, m.text)}
                      aria-label="朗读"
                      className="text-[12px] text-muted hover:text-accent disabled:opacity-50"
                    >
                      {loadingId === m.id ? '⏳' : playingId === m.id ? '⏹' : '🔊'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {sending && (
          <div className="flex items-start gap-2">
            <Avatar
              img={profile.avatarBImg}
              emoji={profile.avatarB}
              className="h-7 w-7 shrink-0 rounded-full bg-white/50 text-sm"
              textCls="text-sm"
            />
            <div className="glass rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-muted">
              {name} 正在输入…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 输入栏 + 模型条（钉在底部，不滚） */}
      <div className="flex-none pt-2">
        {ttsError && (
          <div className="mb-1 px-2 text-center text-[11px] text-red-500">
            朗读失败：{ttsError}
          </div>
        )}
        {imgErr && (
          <div className="mb-1 px-2 text-center text-[11px] text-red-500">
            发送图片失败：{imgErr}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) sendImage(f)
          }}
        />
        <div className="relative flex items-center gap-2">
          {/* ＋ 菜单 */}
          {plusOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setPlusOpen(false)}
              />
              <div className="glass-strong absolute bottom-12 left-0 z-20 w-36 overflow-hidden rounded-2xl p-1 text-sm text-ink">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  🖼 图片
                </button>
                <div className="px-3 py-2 text-left text-[11px] text-muted">📎 文件（下轮）</div>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setPlusOpen((o) => !o)}
            aria-label="添加"
            className="glass-strong flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-ink"
          >
            ＋
          </button>
          <div className="glass-strong flex flex-1 items-center gap-2 rounded-full p-1.5 pl-5">
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
            aria-label="发送"
            className="btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base disabled:opacity-50"
          >
            ↑
          </button>
          </div>
        </div>
      </div>

      {/* 图片大图预览 */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox('')}
        >
          <img src={lightbox} alt="大图" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>
  )
}
