import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDramaStore, dramaMsgId, type DramaChar } from '@/store/dramaStore'
import { useApiStore } from '@/store/apiStore'
import { useSyncStore } from '@/store/syncStore'
import { useUsageStore } from '@/store/usageStore'
import { chatComplete } from '@/api/llm'
import { sendChat, type ChatApiMessage } from '@/api/chat'
import { cleanReply } from '@/lib/cleanReply'
import { fileToDataUrl } from '@/lib/image'
import { useSttStore } from '@/store/sttStore'
import { transcribe } from '@/api/stt'
import { useTtsStore } from '@/store/ttsStore'
import { useTtsPlayback } from '@/lib/useTtsPlayback'
import Avatar from '@/components/ui/Avatar'
import BackBar from '@/components/layout/BackBar'
import { SendIcon, SpeakerIcon, StopIcon, MicIcon } from '@/components/ui/icons'

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const PRESET_COLORS = ['#7aa2f7', '#bb9af7', '#f7768e', '#73d39b', '#e0af68', '#ff9e64', '#2ac3de']

export default function DramaRoom() {
  const nav = useNavigate()
  const scenes = useDramaStore((s) => s.scenes)
  const activeId = useDramaStore((s) => s.activeId)
  const addChar = useDramaStore((s) => s.addChar)
  const updateChar = useDramaStore((s) => s.updateChar)
  const removeChar = useDramaStore((s) => s.removeChar)
  const addMessage = useDramaStore((s) => s.addMessage)
  const setMessages = useDramaStore((s) => s.setMessages)
  const setSummary = useDramaStore((s) => s.setSummary)

  const activeChannel = useApiStore((s) => s.getActive())
  const { config } = useSyncStore()
  const addUsage = useUsageStore((s) => s.add)
  const workerUrl = config.workerUrl?.trim()
  const sttCfg = useSttStore((s) => s.config)
  const ttsEnabled = useTtsStore((s) => s.config.enabled)
  const { play, playingId, loadingId } = useTtsPlayback()

  const scene = scenes.find((s) => s.id === activeId)

  const [draft, setDraft] = useState('')
  const [pendingImage, setPendingImage] = useState('')
  const [busyChar, setBusyChar] = useState('') // 正在生成回复的角色 id
  const [err, setErr] = useState('')
  const [charsOpen, setCharsOpen] = useState(false)
  const [editing, setEditing] = useState<DramaChar | 'new' | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const sinceSummaryRef = useRef(0) // 距上次摘要的 AI 回复数，攒够自动更新

  const messages = scene?.messages ?? []
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, busyChar])

  if (!scene) {
    return (
      <div className="space-y-4">
        <BackBar />
        <div className="glass rounded-3xl px-6 py-12 text-center">
          <p className="text-sm text-muted">还没选剧场～</p>
          <button onClick={() => nav('/drama')} className="btn-primary mt-4 rounded-full px-5 py-2 text-sm">
            去剧场列表
          </button>
        </div>
      </div>
    )
  }

  const sc = scene // 已过 !scene 守卫，给闭包一个确定非空的引用
  const meChar = sc.chars.find((c) => c.isMe)
  const aiChars = sc.chars.filter((c) => !c.isMe)
  const charById = (id: string) => sc.chars.find((c) => c.id === id)
  const nameOf = (id: string) => charById(id)?.name ?? '我'
  const connected = Boolean(activeChannel || workerUrl)

  /** 发送我（女主）的一条 */
  function sendMine() {
    const text = draft.trim()
    if (!text && !pendingImage) return
    addMessage(sc.id, {
      id: dramaMsgId(),
      who: meChar?.id ?? '__me__',
      text,
      ...(pendingImage ? { image: pendingImage } : {}),
      at: now(),
    })
    setDraft('')
    setPendingImage('')
  }

  /** 点名某角色，让 TA 接话 */
  async function respond(char: DramaChar) {
    if (busyChar) return
    if (!connected) {
      setErr('还没配 API 哦～去「设置 → API / 模型」加一条渠道')
      return
    }
    setErr('')
    setBusyChar(char.id)
    try {
      const others = sc.chars
        .filter((c) => c.id !== char.id)
        .map((c) => (c.isMe ? `${c.name}（用户本人/女主）` : c.name))
        .join('、')
      const sys =
        `你在一个多人角色扮演群聊里，只扮演角色【${char.name}】。\n` +
        `【${char.name}的人设】\n${char.persona || '（未填，请贴合名字与剧情合理发挥）'}\n` +
        (others ? `\n群里其他人：${others}。\n` : '') +
        (sc.summary.trim() ? `\n【到目前为止的剧情摘要】\n${sc.summary.trim()}\n` : '') +
        `\n规则：只输出【${char.name}】这一条的发言/动作，第一人称、贴合人设与当前剧情、自然推进剧情；` +
        `这是角色扮演，可以有动作/神态/对话描写。不要替别人说话、不要写成剧本去标注别人的台词、不要复述以上摘要。简洁自然，别太长。`

      const recent = sc.messages.slice(-24)
      const transcript =
        recent.map((m) => `${nameOf(m.who)}：${m.text}${m.image ? '［图片］' : ''}`).join('\n') ||
        '（还没人说话，由你开场）'
      const textPart = `【最近对话】\n${transcript}\n\n请现在以【${char.name}】的身份回复下一句。`
      const imgs = recent.filter((m) => m.image).slice(-2).map((m) => m.image!)
      const content: ChatApiMessage['content'] = imgs.length
        ? [
            { type: 'text', text: textPart },
            ...imgs.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ]
        : textPart
      const apiMsgs: ChatApiMessage[] = [{ role: 'user', content }]

      let reply = ''
      if (activeChannel) {
        const r = await chatComplete(activeChannel, apiMsgs, sys, {
          workerUrl,
          syncKey: config.syncKey,
          maxTokens: 800,
        })
        reply = r.text
        if (r.usage)
          addUsage({
            at: new Date().toISOString(),
            provider: activeChannel.provider,
            model: r.usage.model,
            promptTokens: r.usage.promptTokens,
            completionTokens: r.usage.completionTokens,
            totalTokens: r.usage.totalTokens,
            cost: r.usage.cost,
          })
      } else {
        reply = await sendChat({
          workerUrl: workerUrl!,
          syncKey: config.syncKey,
          messages: apiMsgs,
          system: sys,
          maxTokens: 800,
        })
      }
      reply = cleanReply(reply).trim()
      addMessage(sc.id, {
        id: dramaMsgId(),
        who: char.id,
        text: reply || '……',
        at: now(),
      })
      // 摘要自动更新：每攒够 8 条 AI 回复，后台静默刷新一次剧情摘要
      sinceSummaryRef.current += 1
      if (sinceSummaryRef.current >= 8) {
        sinceSummaryRef.current = 0
        void genSummary(true)
      }
    } catch (e) {
      setErr(`${char.name} 没接上话：${(e as Error).message}`)
    } finally {
      setBusyChar('')
    }
  }

  /** 生成/更新剧情摘要（silent=自动更新，不弹提示/不展开） */
  async function genSummary(silent = false) {
    if (summaryBusy) return
    if (!connected) {
      if (!silent) setErr('请先在「设置 → API / 模型」配置渠道')
      return
    }
    if (sc.messages.length === 0) {
      if (!silent) setErr('还没有对话可以总结')
      return
    }
    if (!silent) setErr('')
    setSummaryBusy(true)
    try {
      const transcript = sc.messages
        .map((m) => `${nameOf(m.who)}：${m.text}${m.image ? '［图片］' : ''}`)
        .join('\n')
      const sys = '你是剧情记录助手，只输出摘要正文，不要寒暄。'
      const ask =
        `把下面这段多人角色扮演的群聊整理成一份「剧情摘要」（300字以内）：` +
        `交代清楚有哪些角色、各自身份关系、已经发生的关键剧情和当前所处情境，` +
        `便于后续接着演不忘设定。${sc.summary.trim() ? `\n（已有旧摘要，请在其基础上更新合并）旧摘要：${sc.summary.trim()}` : ''}\n\n群聊记录：\n${transcript}`
      let text = ''
      if (activeChannel) {
        text = (
          await chatComplete(activeChannel, [{ role: 'user', content: ask }], sys, {
            workerUrl,
            syncKey: config.syncKey,
            maxTokens: 800,
          })
        ).text.trim()
      } else {
        text = (
          await sendChat({
            workerUrl: workerUrl!,
            syncKey: config.syncKey,
            messages: [{ role: 'user', content: ask }],
            system: sys,
            maxTokens: 800,
          })
        ).trim()
      }
      if (text) {
        setSummary(sc.id, cleanReply(text).trim())
        sinceSummaryRef.current = 0
        if (!silent) setSummaryOpen(true)
      }
    } catch (e) {
      if (!silent) setErr(`生成摘要失败：${(e as Error).message}`)
    } finally {
      setSummaryBusy(false)
    }
  }

  /** 压缩对话：把较早的对话并进剧情摘要，只留最近几条，省 token、防忘 */
  async function compress() {
    if (busyChar || summaryBusy) return
    const keep = 6
    if (sc.messages.length <= keep + 2) {
      setErr('对话还短，先不用压缩～')
      return
    }
    if (!connected) {
      setErr('请先在「设置 → API / 模型」配置渠道')
      return
    }
    if (!window.confirm('把较早的对话压缩进「剧情摘要」？只保留最近几条，不可恢复。')) return
    setErr('')
    setSummaryBusy(true)
    try {
      const head = sc.messages.slice(0, sc.messages.length - keep)
      const tail = sc.messages.slice(sc.messages.length - keep)
      const transcript = head
        .map((m) => `${nameOf(m.who)}：${m.text}${m.image ? '［图片］' : ''}`)
        .join('\n')
      const sys = '你是剧情记录助手，只输出摘要正文，不要寒暄。'
      const ask =
        `把下面这段角色扮演群聊整理并合并进「剧情摘要」（350字以内，交代角色、关系、关键剧情与当前情境，便于接着演不忘设定）。` +
        `${sc.summary.trim() ? `\n已有摘要（在其基础上更新合并）：${sc.summary.trim()}` : ''}\n\n要压缩的较早对话：\n${transcript}`
      let text = ''
      if (activeChannel) {
        text = (
          await chatComplete(activeChannel, [{ role: 'user', content: ask }], sys, {
            workerUrl,
            syncKey: config.syncKey,
            maxTokens: 900,
          })
        ).text.trim()
      } else {
        text = (
          await sendChat({
            workerUrl: workerUrl!,
            syncKey: config.syncKey,
            messages: [{ role: 'user', content: ask }],
            system: sys,
            maxTokens: 900,
          })
        ).trim()
      }
      if (!text) throw new Error('摘要为空')
      setSummary(sc.id, cleanReply(text).trim())
      setMessages(sc.id, tail)
      sinceSummaryRef.current = 0
      setSummaryOpen(true)
    } catch (e) {
      setErr(`压缩失败：${(e as Error).message}`)
    } finally {
      setSummaryBusy(false)
    }
  }

  /** 语音输入：录音 → 转文字填进输入框 */
  async function toggleRec() {
    if (transcribing) return
    if (recording) {
      mediaRecRef.current?.stop()
      return
    }
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        if (!blob.size) return
        setTranscribing(true)
        try {
          const cfg = { ...sttCfg, workerUrl: sttCfg.workerUrl.trim() || (workerUrl || '') }
          const t = await transcribe(cfg, blob, { syncKey: config.syncKey })
          if (t) setDraft((d) => (d ? `${d} ${t}` : t))
          else setErr('没识别到内容，再说一次试试')
        } catch (e) {
          setErr(`语音转文字失败：${(e as Error).message}`)
        } finally {
          setTranscribing(false)
        }
      }
      mediaRecRef.current = mr
      mr.start()
      setRecording(true)
    } catch (e) {
      setErr(`打不开麦克风：${(e as Error).message}`)
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

  return (
    <div className="flex h-full flex-col">
      <BackBar />
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="min-w-0">
          <h2 className="headline truncate text-xl text-ink">{sc.title} 🎭</h2>
          <button onClick={() => nav('/drama')} className="text-[11px] text-muted hover:text-accent">
            ← 剧场列表
          </button>
        </div>
        <button
          onClick={() => setCharsOpen((o) => !o)}
          className="glass rounded-full px-3 py-1.5 text-[12px] text-ink"
        >
          角色（{sc.chars.length}）{charsOpen ? '⌃' : '⌄'}
        </button>
      </div>

      {/* 角色卡管理 */}
      {charsOpen && (
        <div className="glass mb-2 space-y-2 rounded-2xl p-3">
          {sc.chars.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <Avatar img={c.avatarImg} emoji={c.avatar} className="h-8 w-8 rounded-full text-base" textCls="text-base" style={{ background: c.color + '33' }} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {c.name}
                {c.isMe && <span className="ml-1 text-[10px] text-accent">（我）</span>}
              </span>
              <button onClick={() => setEditing(c)} className="px-1.5 text-[13px] text-muted hover:text-accent">编辑</button>
              <button onClick={() => removeChar(sc.id, c.id)} className="px-1.5 text-[13px] text-muted hover:text-red-500">删</button>
            </div>
          ))}
          <button
            onClick={() => setEditing('new')}
            className="btn-primary w-full rounded-xl py-2 text-[13px]"
          >
            ＋ 新角色卡
          </button>
          <p className="text-[10px] leading-relaxed text-muted">
            建一张勾「这是我」的女主卡（你来发言）；其余是 AI 角色（男主、NPC 等）。发言后点下面角色名让 TA 接话。
          </p>
        </div>
      )}

      {/* 剧情摘要 */}
      <div className="glass mb-2 rounded-2xl px-3 py-2">
        <div className="flex items-center justify-between">
          <button onClick={() => setSummaryOpen((o) => !o)} className="flex items-center gap-1 text-[12px]">
            <span className="label">剧情摘要</span>
            <span className="text-[11px] text-accent">{summaryOpen ? '▲' : '▼'}</span>
          </button>
          <div className="flex items-center gap-3 text-[12px]">
            <button onClick={() => genSummary()} disabled={summaryBusy} className="text-accent disabled:opacity-50">
              {summaryBusy ? '处理中…' : '✨ 更新摘要'}
            </button>
            <button onClick={compress} disabled={summaryBusy || !!busyChar} className="text-muted hover:text-accent disabled:opacity-50">
              🗜 压缩
            </button>
          </div>
        </div>
        {summaryOpen && (
          <textarea
            value={sc.summary}
            onChange={(e) => setSummary(sc.id, e.target.value)}
            rows={3}
            placeholder="点「✨ 更新摘要」让 AI 整理，或手写。会注入给角色，防止跑久了忘剧情。"
            className="mt-2 w-full resize-none rounded-xl border border-line bg-white/40 px-3 py-2 text-[12px] text-ink outline-none focus:border-accent"
          />
        )}
      </div>

      {err && <div className="mb-1 px-1 text-[11px] text-red-500">{err}</div>}

      {/* 群聊消息 */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-0.5 py-1">
        {messages.length === 0 ? (
          <div className="glass rounded-3xl px-6 py-10 text-center text-sm text-muted">
            建好角色后，在下面说一句开场，再点角色名让 TA 接话吧～
          </div>
        ) : (
          messages.map((m) => {
            const c = charById(m.who)
            const mine = !c || c.isMe
            return (
              <div key={m.id} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar
                  img={c?.avatarImg}
                  emoji={c?.avatar || '🙂'}
                  className="h-8 w-8 shrink-0 rounded-full text-base"
                  textCls="text-base"
                  style={{ background: (c?.color || '#999') + '33' }}
                />
                <div className={`flex min-w-0 max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <span className="px-1 text-[10px] text-muted">{nameOf(m.who)}</span>
                  {m.image && (
                    <img src={m.image} alt="" className="mt-0.5 max-h-52 max-w-full rounded-2xl object-cover" />
                  )}
                  {m.text && (
                    <div
                      className={`mt-0.5 whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm [overflow-wrap:anywhere] ${mine ? 'text-ink' : 'text-ink'}`}
                      style={{ background: (c?.color || '#bb9af7') + (mine ? '40' : '22') }}
                    >
                      {m.text}
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-1 text-muted">
                    <span className="text-[9px]">{m.at}</span>
                    {!mine && ttsEnabled && m.text.trim() && (
                      <button
                        type="button"
                        onClick={() => play(m.id, m.text)}
                        aria-label="朗读"
                        className="hover:text-accent"
                      >
                        {loadingId === m.id ? (
                          <span className="text-[11px]">⏳</span>
                        ) : playingId === m.id ? (
                          <StopIcon className="h-[13px] w-[13px]" />
                        ) : (
                          <SpeakerIcon className="h-[13px] w-[13px]" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
        {busyChar && (
          <div className="flex items-center gap-2 px-1 text-[12px] text-muted">
            {nameOf(busyChar)} 正在输入…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 点名条 */}
      {aiChars.length > 0 && (
        <div className="flex flex-wrap gap-2 px-0.5 pt-2">
          {aiChars.map((c) => (
            <button
              key={c.id}
              onClick={() => respond(c)}
              disabled={!!busyChar}
              className="rounded-full px-3 py-1.5 text-[12px] text-ink disabled:opacity-50"
              style={{ background: c.color + '33' }}
            >
              {c.avatar} {c.name} 接话
            </button>
          ))}
        </div>
      )}

      {/* 输入栏（你 = 女主） */}
      <div className="flex-none pt-2">
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2 px-1">
            <div className="relative">
              <img src={pendingImage} alt="待发送" className="h-14 w-14 rounded-xl object-cover" />
              <button
                onClick={() => setPendingImage('')}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] text-white"
              >
                ✕
              </button>
            </div>
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
            if (f) pickImage(f)
          }}
        />
        <div className="glass-strong flex items-end gap-1 rounded-3xl py-1 pl-2 pr-1.5">
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="发图片"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-muted hover:bg-white/40 hover:text-ink"
          >
            ＋
          </button>
          <textarea
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={meChar ? `以「${meChar.name}」的身份说…` : '说点什么（建议先建一张「我」的角色卡）…'}
            className="max-h-[120px] min-h-[36px] min-w-0 flex-1 resize-none self-center bg-transparent py-1.5 text-sm leading-snug text-ink outline-none placeholder:text-muted"
          />
          {sttCfg.enabled && (
            <button
              onClick={toggleRec}
              disabled={transcribing}
              aria-label={recording ? '停止录音' : '语音输入'}
              className={[
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-50',
                recording ? 'animate-pulse bg-red-500 text-white' : 'bg-black/5 text-ink/70 hover:bg-black/10',
              ].join(' ')}
            >
              {transcribing ? (
                <span className="text-sm">⏳</span>
              ) : recording ? (
                <StopIcon className="h-[15px] w-[15px]" />
              ) : (
                <MicIcon className="h-[17px] w-[17px]" />
              )}
            </button>
          )}
          <button
            onClick={sendMine}
            aria-label="发送"
            className="btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          >
            <SendIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* 角色卡编辑器 */}
      {editing && (
        <CharEditor
          sceneId={sc.id}
          target={editing}
          existingMe={!!meChar}
          onClose={() => setEditing(null)}
          onAdd={addChar}
          onUpdate={updateChar}
        />
      )}
    </div>
  )
}

/** 角色卡编辑弹窗 */
function CharEditor({
  sceneId,
  target,
  existingMe,
  onClose,
  onAdd,
  onUpdate,
}: {
  sceneId: string
  target: DramaChar | 'new'
  existingMe: boolean
  onClose: () => void
  onAdd: (sceneId: string, c: Partial<DramaChar>) => void
  onUpdate: (sceneId: string, id: string, p: Partial<DramaChar>) => void
}) {
  const isNew = target === 'new'
  const base = isNew ? null : (target as DramaChar)
  const [name, setName] = useState(base?.name ?? '')
  const [avatar, setAvatar] = useState(base?.avatar ?? '🎭')
  const [avatarImg, setAvatarImg] = useState<string | undefined>(base?.avatarImg)
  const [persona, setPersona] = useState(base?.persona ?? '')
  const [color, setColor] = useState(base?.color ?? PRESET_COLORS[0])
  const [isMe, setIsMe] = useState(base?.isMe ?? false)
  const imgRef = useRef<HTMLInputElement>(null)
  const inputCls =
    'w-full rounded-xl border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent'

  function save() {
    const patch = { name, avatar, avatarImg, persona, color, isMe }
    if (isNew) onAdd(sceneId, patch)
    else onUpdate(sceneId, (target as DramaChar).id, patch)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" onClick={onClose}>
      <div
        className="glass-strong max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="headline text-lg text-ink">{isNew ? '新角色卡' : '编辑角色'}</div>

        <div className="flex items-center gap-3">
          <Avatar img={avatarImg} emoji={avatar} className="h-14 w-14 rounded-full text-2xl" textCls="text-2xl" style={{ background: color + '33' }} />
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={inputCls + ' w-20 text-center'}
              maxLength={4}
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="emoji"
            />
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
            <button onClick={() => imgRef.current?.click()} className="glass rounded-lg px-3 py-1.5 text-xs text-ink">
              上传头像
            </button>
            {avatarImg && (
              <button onClick={() => setAvatarImg(undefined)} className="text-[11px] text-muted hover:text-accent">
                移除
              </button>
            )}
          </div>
        </div>

        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="角色名字，如 伯恩 / 旁白NPC" />

        <textarea
          className={inputCls}
          rows={5}
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="人设/设定：身份、性格、说话风格、背景关系…（NPC 卡可写：负责扮演各路 NPC 与旁白）"
        />

        <div>
          <div className="mb-1 text-[12px] text-muted">气泡颜色</div>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-accent ring-offset-1' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={isMe}
            onChange={(e) => setIsMe(e.target.checked)}
            className="h-4 w-4 accent-accent"
            disabled={existingMe && !base?.isMe}
          />
          这是我（女主，由我发言）
          {existingMe && !base?.isMe && <span className="text-[10px] text-muted">已有「我」卡</span>}
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="glass rounded-full px-4 py-2 text-sm text-ink">取消</button>
          <button onClick={save} className="btn-primary rounded-full px-5 py-2 text-sm">保存</button>
        </div>
      </div>
    </div>
  )
}
