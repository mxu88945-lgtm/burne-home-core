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
import { isTextFile, readAsDataUrl, readAsText, humanSize } from '@/lib/file'
import Avatar from '@/components/ui/Avatar'

type PendingFile = NonNullable<Msg['file']>
const MAX_FILE = 1.5 * 1024 * 1024 // 1.5MB（dataURL 存 localStorage，避免超额）

/** 给 Promise 加超时，避免某些环境下 PDF worker 卡住拖死发送 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('解析超时')), ms)),
  ])
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
  const [pendingImage, setPendingImage] = useState('')
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)
  const [lightbox, setLightbox] = useState('')
  const [imgErr, setImgErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  /** 选图：不立即发送，挂到输入框上方作待发预览 */
  async function pickImage(file: File) {
    setPlusOpen(false)
    setImgErr('')
    try {
      setPendingFile(null)
      setPendingImage(await fileToDataUrl(file, 1280, 0.8))
    } catch (e) {
      setImgErr((e as Error).message)
    }
  }

  /** 选文件：文本类读出内容（一起给模型），其余只存可下载；挂作待发预览 */
  async function pickFile(file: File) {
    setPlusOpen(false)
    setImgErr('')
    if (file.size > MAX_FILE) {
      setImgErr(`文件太大（${humanSize(file.size)}），上限 1.5MB`)
      return
    }
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    let url: string
    try {
      url = await readAsDataUrl(file)
    } catch {
      setImgErr('读不到这个文件（若来自 iCloud，请先在「文件」App 里下载到本机再选）')
      return
    }
    // 先挂上，确保随时能发送
    setPendingImage('')
    setPendingFile({ name: file.name, size: file.size, url })

    // 后台读取内容（文本/PDF），成功则补上 text；失败/超时不影响发送
    try {
      let text: string | undefined
      if (isTextFile(file)) {
        text = await readAsText(file)
      } else if (isPdf) {
        const { extractPdfText } = await import('@/lib/pdf')
        text = (await withTimeout(extractPdfText(file), 15000)) || undefined
        if (!text) setImgErr('这个 PDF 没提取到文字（可能是扫描件/图片型），仍可作为附件发送')
      }
      if (text) {
        setPendingFile((prev) => (prev && prev.name === file.name ? { ...prev, text } : prev))
      }
    } catch (e) {
      setImgErr(`文件内容解析失败：${(e as Error).message}；仍可作为附件发送`)
    }
  }

  async function send() {
    const text = draft.trim()
    if ((!text && !pendingImage && !pendingFile) || sending) return
    const mine: Msg = {
      id: newId(),
      role: 'me',
      text,
      at: now(),
      ...(pendingImage ? { image: pendingImage } : {}),
      ...(pendingFile ? { file: pendingFile } : {}),
    }
    const history = [...messages, mine]
    setMessages(history)
    setDraft('')
    setPendingImage('')
    setPendingFile(null)

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
    await respond(history)
  }

  /** 用当前历史调用模型并把回复加入对话（图片按 vision 格式发送） */
  async function respond(history: Msg[]) {
    const apiMsgs: ChatApiMessage[] = history
      .filter((m) => m.text.trim() || m.image || m.file)
      .map((m) => {
        const role = m.role === 'me' ? ('user' as const) : ('assistant' as const)
        // 文本（含文件信息：文本文件带内容，二进制只附说明）
        let textPart = m.text.trim()
        if (m.file) {
          textPart += m.file.text
            ? `\n\n[文件 ${m.file.name} 的内容]：\n${m.file.text}`
            : `\n\n[用户发送了文件：${m.file.name}（${humanSize(m.file.size)}，无法读取内容）]`
          textPart = textPart.trim()
        }
        if (m.image) {
          const parts: Exclude<ChatApiMessage['content'], string> = []
          if (textPart) parts.push({ type: 'text', text: textPart })
          parts.push({ type: 'image_url', image_url: { url: m.image } })
          return { role, content: parts }
        }
        return { role, content: textPart }
      })
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
                {m.file && (
                  <a
                    href={m.file.url}
                    download={m.file.name}
                    className={`glass flex items-center gap-2 rounded-2xl px-3 py-2 ${m.image ? 'mt-1' : ''}`}
                  >
                    <span className="text-base">📄</span>
                    <span className="max-w-[180px] truncate text-[12px] text-ink">{m.file.name}</span>
                    <span className="text-[10px] text-muted">{humanSize(m.file.size)}</span>
                  </a>
                )}
                {m.text && (
                  <div
                    className={[
                      'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      m.image || m.file ? 'mt-1' : '',
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
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2 px-2">
            <div className="relative">
              <img
                src={pendingImage}
                alt="待发送"
                className="h-16 w-16 rounded-xl object-cover"
              />
              <button
                type="button"
                onClick={() => setPendingImage('')}
                aria-label="移除图片"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] text-white"
              >
                ✕
              </button>
            </div>
            <span className="text-[11px] text-muted">图片已就绪，可一起发送文字</span>
          </div>
        )}
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2 px-2">
            <div className="glass flex items-center gap-2 rounded-xl px-3 py-2">
              <span className="text-base">📄</span>
              <span className="max-w-[160px] truncate text-[12px] text-ink">{pendingFile.name}</span>
              <span className="text-[10px] text-muted">{humanSize(pendingFile.size)}</span>
              <button
                type="button"
                onClick={() => setPendingFile(null)}
                aria-label="移除文件"
                className="text-[12px] text-muted hover:text-accent"
              >
                ✕
              </button>
            </div>
            <span className="text-[11px] text-muted">
              {pendingFile.text ? '可读取内容' : '仅作附件'}
            </span>
          </div>
        )}
        {imgErr && (
          <div className="mb-1 px-2 text-center text-[11px] text-red-500">{imgErr}</div>
        )}
        <input
          ref={fileRef}
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
          ref={docRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) pickFile(f)
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
              <div className="glass-strong absolute bottom-12 left-0 z-20 w-32 overflow-hidden rounded-2xl p-1 text-sm text-ink">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  图片
                </button>
                <button
                  type="button"
                  onClick={() => docRef.current?.click()}
                  className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  文件
                </button>
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
