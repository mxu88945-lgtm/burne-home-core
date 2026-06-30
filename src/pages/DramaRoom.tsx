import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDramaStore, dramaMsgId, type DramaChar } from '@/store/dramaStore'
import { useApiStore, type ApiChannel } from '@/store/apiStore'
import { useMemoryModelStore } from '@/store/memoryModelStore'
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
import DramaBg from '@/components/ui/DramaBg'
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
  const setSummaryAt = useDramaStore((s) => s.setSummaryAt)
  const setWorld = useDramaStore((s) => s.setWorld)
  const flat = useDramaStore((s) => s.flat)
  const setFlat = useDramaStore((s) => s.setFlat)
  const autoSummary = useDramaStore((s) => s.autoSummary)
  const autoSummaryEvery = useDramaStore((s) => s.autoSummaryEvery)
  const setAutoSummary = useDramaStore((s) => s.setAutoSummary)
  const setAutoSummaryEvery = useDramaStore((s) => s.setAutoSummaryEvery)

  const activeChannel = useApiStore((s) => s.getActive())
  const channels = useApiStore((s) => s.channels)
  const memModelCfg = useMemoryModelStore((s) => s.config)
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
  const [leftOpen, setLeftOpen] = useState(false) // 左☰：角色/剧场
  const [rightOpen, setRightOpen] = useState(false) // 右⚙：世界观/剧情摘要
  const [worldOpen, setWorldOpen] = useState(false) // 世界观框 折叠/展开
  const [summaryOpen, setSummaryOpen] = useState(false) // 剧情摘要框 折叠/展开
  const [plusOpen, setPlusOpen] = useState(false) // 输入栏 ＋ 菜单
  const [editing, setEditing] = useState<DramaChar | 'new' | null>(null)
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [menuMsgId, setMenuMsgId] = useState('') // 长按选中的消息
  const [editMsgId, setEditMsgId] = useState('') // 正在改写的消息
  const [editText, setEditText] = useState('')
  const [toast, setToast] = useState('') // 轻提示（复制成功等）
  const [transText, setTransText] = useState('') // 翻译结果（非空则弹层）
  const [transBusy, setTransBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  // 摘要/压缩用的渠道：开了「记忆模型」就用它(便宜)，否则回退主激活渠道
  const useMemModel = memModelCfg.enabled && memModelCfg.apiKey.trim() !== '' && memModelCfg.model.trim() !== ''
  const summaryChannel: ApiChannel | undefined = useMemModel
    ? { id: 'mem', name: '记忆模型', provider: 'openai', baseUrl: memModelCfg.baseUrl, apiKey: memModelCfg.apiKey, model: memModelCfg.model }
    : activeChannel
  // 输入框里正在打「@…」时，弹出可点名的角色列表
  const atMatch = draft.match(/@(\S*)$/)
  const atList = atMatch ? aiChars.filter((c) => c.name.includes(atMatch[1])) : []

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

  /** 发送：输入「@角色名」（单独）＝让该角色接话；否则当作「我」发言 */
  function onSend() {
    const t = draft.trim()
    const m = t.match(/^@(\S+)$/)
    if (m && !pendingImage) {
      const nm = m[1]
      const c = aiChars.find((x) => x.name === nm) || aiChars.find((x) => x.name.startsWith(nm))
      if (c) {
        setDraft('')
        void respond(c)
        return
      }
      setErr(`没找到角色「${nm}」，@后面填角色名`)
      return
    }
    sendMine()
  }

  /** 点 @ 弹层里的角色：清掉输入框里的 @词，直接让 TA 接话 */
  function pickAt(c: DramaChar) {
    setDraft((d) => d.replace(/@(\S*)$/, ''))
    void respond(c)
  }

  /** 让某角色用开场白出场（把开场白作为一条消息发出来） */
  function openWith(char: DramaChar) {
    const g = (char.greeting || '').trim()
    if (!g) {
      setErr(`${char.name} 还没填开场白`)
      return
    }
    addMessage(sc.id, { id: dramaMsgId(), who: char.id, text: g, at: now() })
  }

  /** 点名某角色，让 TA 接话 */
  async function respond(char: DramaChar) {
    if (busyChar) return
    // 该角色独立渠道（不填＝跟随当前激活渠道）
    const ch = (char.apiChannelId && channels.find((c) => c.id === char.apiChannelId)) || activeChannel
    if (!ch && !workerUrl) {
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
      const world = (sc.world || '').trim()
      const sys =
        `你在一个多人角色扮演群聊里，只扮演角色【${char.name}】。\n` +
        (world ? `【世界观 / 背景设定（所有角色共同遵守）】\n${world}\n\n` : '') +
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
      if (ch) {
        const r = await chatComplete(ch, apiMsgs, sys, {
          workerUrl,
          syncKey: config.syncKey,
          maxTokens: 4096,
        })
        reply = r.text
        if (r.usage)
          addUsage({
            at: new Date().toISOString(),
            provider: ch.provider,
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
          maxTokens: 4096,
        })
      }
      reply = cleanReply(reply).trim()
      addMessage(sc.id, {
        id: dramaMsgId(),
        who: char.id,
        text: reply || '……',
        at: now(),
      })
      // 摘要自动更新（可在 ⚙ 里关/调频）：每攒够 N 条 AI 回复，后台静默增量刷新
      sinceSummaryRef.current += 1
      if (autoSummary && sinceSummaryRef.current >= autoSummaryEvery) {
        sinceSummaryRef.current = 0
        void genSummary(true)
      }
    } catch (e) {
      setErr(`${char.name} 没接上话：${(e as Error).message}`)
    } finally {
      setBusyChar('')
    }
  }

  // 摘要的结构化要求（让模型牢记剧情、不跑偏；可精简描写但别丢事实/别改设定）
  const SUMMARY_SYS =
    '你是角色扮演剧情记录助手。只输出摘要正文，按四节组织：【人物与关系】【已发生的关键剧情】【当前情境】【未解决的悬念/线索】。' +
    '保留所有关键事实与设定，可精简描写但不要丢事实、不要编造、不要擅自改变既定设定。控制在 600 字内。'

  /** 生成/更新剧情摘要（silent=自动更新，不弹提示/不展开）。
   *  自动且已有摘要时走「增量」：只读上次摘要之后的新对话来合并，省 token。 */
  async function genSummary(silent = false) {
    if (summaryBusy) return
    if (!summaryChannel && !workerUrl) {
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
      const total = sc.messages.length
      const at = Math.min(sc.summaryAt ?? 0, total)
      const old = sc.summary.trim()
      const incremental = silent && !!old && at < total
      const slice = incremental ? sc.messages.slice(at) : sc.messages
      const transcript = slice
        .map((m) => `${nameOf(m.who)}：${m.text}${m.image ? '［图片］' : ''}`)
        .join('\n')
      const ask = incremental
        ? `这是已有的剧情摘要：\n${old}\n\n以下是【新发生】的对话，请把新剧情合并进上面的摘要，输出【更新后的完整摘要】（沿用四节结构，旧的关键事实也要保留）：\n\n${transcript}`
        : `把下面这段多人角色扮演群聊整理成一份剧情摘要（四节结构）${old ? `，并与旧摘要合并。\n旧摘要：${old}\n` : '。'}\n\n群聊记录：\n${transcript}`
      let text = ''
      if (summaryChannel) {
        text = (
          await chatComplete(summaryChannel, [{ role: 'user', content: ask }], SUMMARY_SYS, {
            workerUrl,
            syncKey: config.syncKey,
            maxTokens: 1500,
          })
        ).text.trim()
      } else {
        text = (
          await sendChat({
            workerUrl: workerUrl!,
            syncKey: config.syncKey,
            messages: [{ role: 'user', content: ask }],
            system: SUMMARY_SYS,
            maxTokens: 1500,
          })
        ).trim()
      }
      if (text) {
        setSummary(sc.id, cleanReply(text).trim())
        setSummaryAt(sc.id, total)
        sinceSummaryRef.current = 0
        if (!silent) setRightOpen(true)
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
    if (!summaryChannel && !workerUrl) {
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
      const ask =
        `把下面这段角色扮演群聊整理并合并进「剧情摘要」（四节结构，交代角色关系、关键剧情、当前情境与未解决悬念，便于接着演不忘设定）。` +
        `${sc.summary.trim() ? `\n已有摘要（在其基础上更新合并、保留旧事实）：${sc.summary.trim()}` : ''}\n\n要压缩的较早对话：\n${transcript}`
      let text = ''
      if (summaryChannel) {
        text = (
          await chatComplete(summaryChannel, [{ role: 'user', content: ask }], SUMMARY_SYS, {
            workerUrl,
            syncKey: config.syncKey,
            maxTokens: 1500,
          })
        ).text.trim()
      } else {
        text = (
          await sendChat({
            workerUrl: workerUrl!,
            syncKey: config.syncKey,
            messages: [{ role: 'user', content: ask }],
            system: SUMMARY_SYS,
            maxTokens: 1500,
          })
        ).trim()
      }
      if (!text) throw new Error('摘要为空')
      setSummary(sc.id, cleanReply(text).trim())
      setMessages(sc.id, tail)
      setSummaryAt(sc.id, 0) // 留下的 tail 还没并入摘要，下次增量从头算
      sinceSummaryRef.current = 0
      setRightOpen(true)
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

  // 长按消息 → 弹操作菜单
  function pressStart(id: string) {
    pressTimer.current = setTimeout(() => setMenuMsgId(id), 480)
  }
  function pressEnd() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  function delMsg(id: string) {
    setMessages(sc.id, sc.messages.filter((m) => m.id !== id))
    setMenuMsgId('')
  }
  function flashToast(t: string) {
    setToast(t)
    setTimeout(() => setToast(''), 1500)
  }
  function copyMsg(id: string) {
    const m = sc.messages.find((x) => x.id === id)
    setMenuMsgId('')
    if (!m) return
    navigator.clipboard
      ?.writeText(m.text)
      .then(() => flashToast('已复制'))
      .catch(() => setErr('复制失败，可能浏览器不允许'))
  }
  /** 翻译这条：非中文→中文，本身是中文→英文；结果弹层显示 */
  async function translateMsg(id: string) {
    const m = sc.messages.find((x) => x.id === id)
    setMenuMsgId('')
    if (!m || !m.text.trim()) return
    if (!activeChannel && !workerUrl) {
      setErr('翻译需要先在「设置 → API / 模型」配置渠道')
      return
    }
    setTransText('')
    setTransBusy(true)
    try {
      const sys = '你是翻译助手，只输出译文本身，不要解释、不要加引号。'
      const ask = `把下面文本翻译成中文；如果它本身就是中文，则翻译成自然流畅的英文：\n\n${m.text}`
      let out = ''
      if (activeChannel) {
        out = (
          await chatComplete(activeChannel, [{ role: 'user', content: ask }], sys, {
            workerUrl,
            syncKey: config.syncKey,
            maxTokens: 2048,
          })
        ).text
      } else {
        out = await sendChat({
          workerUrl: workerUrl!,
          syncKey: config.syncKey,
          messages: [{ role: 'user', content: ask }],
          system: sys,
          maxTokens: 2048,
        })
      }
      setTransText(cleanReply(out).trim() || '（没翻译出内容）')
    } catch (e) {
      setErr(`翻译失败：${(e as Error).message}`)
    } finally {
      setTransBusy(false)
    }
  }
  /** 回溯：删掉这条及它之后的所有消息（回到这条之前重来） */
  function rollback(id: string) {
    const i = sc.messages.findIndex((m) => m.id === id)
    setMenuMsgId('')
    if (i < 0) return
    if (window.confirm('回溯：删除这条及之后的所有消息？（用于回到此处重来）')) {
      setMessages(sc.id, sc.messages.slice(0, i))
      setSummaryAt(sc.id, Math.min(sc.summaryAt ?? 0, i)) // 别让摘要"超前"于现存对话
    }
  }
  function startEdit(id: string) {
    const m = sc.messages.find((x) => x.id === id)
    setMenuMsgId('')
    if (!m) return
    setEditMsgId(id)
    setEditText(m.text)
  }
  function saveEdit() {
    const t = editText
    setMessages(sc.id, sc.messages.map((m) => (m.id === editMsgId ? { ...m, text: t } : m)))
    setEditMsgId('')
    setEditText('')
  }

  return (
    <div className="flex h-full flex-col">
      <DramaBg />
      {/* 顶栏：左 ☰(角色/剧场) · 中标题 · 右 ⚙(世界观/剧情) —— 收进两角，中间留干净 */}
      <div className="flex items-center gap-2 px-1 pb-2 pt-[max(0.25rem,env(safe-area-inset-top))]">
        <button
          onClick={() => { setLeftOpen((o) => !o); setRightOpen(false) }}
          aria-label="角色与剧场"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-muted hover:bg-white/40 hover:text-accent"
        >
          ☰
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="headline truncate text-lg leading-none text-ink">{sc.title}</div>
        </div>
        <button
          onClick={() => { setRightOpen((o) => !o); setLeftOpen(false) }}
          aria-label="世界观与剧情"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-muted hover:bg-white/40 hover:text-accent"
        >
          ⚙
        </button>
      </div>

      {/* 左侧面板：剧场列表 + 角色管理 */}
      {leftOpen && (
        <div className="glass-strong mb-2 space-y-2 rounded-2xl p-3">
          <button onClick={() => nav('/drama')} className="text-[12px] text-accent">← 剧场列表 / 主页</button>
          {sc.chars.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <Avatar img={c.avatarImg} emoji={c.avatar} className="h-8 w-8 rounded-full text-base" textCls="text-base" style={{ background: c.color + '33' }} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {c.name}
                {c.isMe && <span className="ml-1 text-[10px] text-accent">（我）</span>}
              </span>
              {!c.isMe && (c.greeting || '').trim() && (
                <button onClick={() => openWith(c)} className="px-1.5 text-[13px] text-accent hover:underline">▶开场</button>
              )}
              <button onClick={() => setEditing(c)} className="px-1.5 text-[13px] text-muted hover:text-accent">编辑</button>
              <button onClick={() => removeChar(sc.id, c.id)} className="px-1.5 text-[13px] text-muted hover:text-red-500">删</button>
            </div>
          ))}
          <button onClick={() => setEditing('new')} className="btn-primary w-full rounded-xl py-2 text-[13px]">
            ＋ 新角色卡
          </button>
          <p className="text-[10px] leading-relaxed text-muted">
            建一张勾「这是我」的女主卡（你来发言）；其余是 AI 角色（男主、NPC 等）。给角色填开场白可「▶开场」让 TA 先出场。
          </p>
        </div>
      )}

      {/* 右侧面板：显示样式 + 世界观 + 剧情摘要（更新/压缩） */}
      {rightOpen && (
        <div className="glass-strong mb-2 space-y-3 rounded-2xl p-3">
          <div className="flex items-center justify-between">
            <span className="label">显示样式</span>
            <div className="flex gap-2">
              <button
                onClick={() => setFlat(false)}
                className={`rounded-full px-3 py-1 text-[12px] ${!flat ? 'btn-primary' : 'glass text-muted'}`}
              >
                气泡式
              </button>
              <button
                onClick={() => setFlat(true)}
                className={`rounded-full px-3 py-1 text-[12px] ${flat ? 'btn-primary' : 'glass text-muted'}`}
              >
                平铺式
              </button>
            </div>
          </div>
          <div>
            <button
              onClick={() => setWorldOpen((o) => !o)}
              className="mb-1 flex w-full items-center gap-1 text-left"
            >
              <span className="text-[11px] text-muted">{worldOpen ? '▾' : '▸'}</span>
              <span className="label">世界观 · 背景（所有角色共用）</span>
              {!worldOpen && (sc.world || '').trim() && <span className="ml-1 truncate text-[10px] text-muted">· 已填</span>}
            </button>
            {worldOpen && (
              <textarea
                value={sc.world || ''}
                onChange={(e) => setWorld(sc.id, e.target.value)}
                rows={5}
                placeholder="整体世界观、背景、人物关系…（注入给本剧场所有角色，让大家认知一致）"
                className="w-full resize-none rounded-xl border border-line bg-white/40 px-3 py-2 text-[12px] text-ink outline-none focus:border-accent"
              />
            )}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <button onClick={() => setSummaryOpen((o) => !o)} className="flex min-w-0 items-center gap-1 text-left">
                <span className="text-[11px] text-muted">{summaryOpen ? '▾' : '▸'}</span>
                <span className="label">剧情摘要（独立记忆）</span>
                {!summaryOpen && sc.summary.trim() && <span className="ml-1 truncate text-[10px] text-muted">· 已有</span>}
              </button>
              <button onClick={() => genSummary()} disabled={summaryBusy} className="shrink-0 text-[12px] text-accent disabled:opacity-50">
                {summaryBusy ? '处理中…' : '✨ 更新'}
              </button>
            </div>
            {summaryOpen && (
              <textarea
                value={sc.summary}
                onChange={(e) => setSummary(sc.id, e.target.value)}
                rows={6}
                placeholder="点「✨ 更新」让 AI 整理，或手写。会注入给角色，防止跑久了忘剧情。"
                className="w-full resize-none rounded-xl border border-line bg-white/40 px-3 py-2 text-[12px] text-ink outline-none focus:border-accent"
              />
            )}
            {/* 自动摘要：开关 + 频率 + 用哪个模型 */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted">
              <label className="flex items-center gap-1.5 text-ink">
                <input
                  type="checkbox"
                  checked={autoSummary}
                  onChange={(e) => setAutoSummary(e.target.checked)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                自动更新
              </label>
              <span className="flex items-center gap-1">
                每
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={autoSummaryEvery}
                  disabled={!autoSummary}
                  onChange={(e) => setAutoSummaryEvery(Number(e.target.value))}
                  className="w-12 rounded-md border border-line bg-white/50 px-1.5 py-0.5 text-center text-ink outline-none focus:border-accent disabled:opacity-50"
                />
                条回复
              </span>
              <span className="text-[11px]">· 用{useMemModel ? '记忆模型' : '主渠道'}</span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">
              自动更新走「增量」——只读上次之后的新对话来合并，省 token；摘要保留人物/关系/关键剧情/悬念，帮角色不忘、不跑偏。
            </p>
          </div>
        </div>
      )}

      {err && <div className="mb-1 px-1 text-[11px] text-red-500">{err}</div>}

      {/* 群聊消息 */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-0.5 py-1">
        {messages.length === 0 ? (
          <div className="glass rounded-3xl px-6 py-10 text-center text-sm text-muted">
            建好角色后，在下面说一句开场，再点角色名让 TA 接话吧～
          </div>
        ) : (
          messages.map((m, i) => {
            const c = charById(m.who)
            const mine = !c || c.isMe
            const editingThis = editMsgId === m.id
            const longPress = {
              onContextMenu: (e: { preventDefault: () => void }) => {
                e.preventDefault()
                setMenuMsgId(m.id)
              },
              onTouchStart: () => pressStart(m.id),
              onTouchEnd: pressEnd,
              onTouchMove: pressEnd,
            }
            const ttsBtn =
              !mine && ttsEnabled && m.text.trim() ? (
                <button type="button" onClick={() => play(m.id, m.text)} aria-label="朗读" className="hover:text-accent">
                  {loadingId === m.id ? (
                    <span className="text-[11px]">⏳</span>
                  ) : playingId === m.id ? (
                    <StopIcon className="h-[13px] w-[13px]" />
                  ) : (
                    <SpeakerIcon className="h-[13px] w-[13px]" />
                  )}
                </button>
              ) : null
            const editArea = (
              <div className="mt-0.5 w-[80vw] max-w-full">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="min-h-[64px] w-full select-text rounded-xl border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none [-webkit-user-select:text] focus:border-accent"
                />
                <div className="mt-1 flex justify-end gap-2">
                  <button onClick={() => { setEditMsgId(''); setEditText('') }} className="glass rounded-full px-3 py-1 text-[12px] text-ink">取消</button>
                  <button onClick={saveEdit} className="btn-primary rounded-full px-3 py-1 text-[12px]">保存</button>
                </div>
              </div>
            )

            // 平铺式：无气泡、铺满、像小说
            if (flat) {
              return (
                <div key={m.id} className="select-none pb-1 [-webkit-touch-callout:none] [-webkit-user-select:none]" {...longPress}>
                  {i > 0 && (
                    <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-muted/50" aria-hidden>
                      <span className="h-px w-14 bg-gradient-to-r from-transparent to-line" />
                      <span>❖</span>
                      <span className="h-px w-14 bg-gradient-to-l from-transparent to-line" />
                    </div>
                  )}
                  <div className={`mb-1 flex items-center gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                    <Avatar
                      img={c?.avatarImg}
                      emoji={c?.avatar || '🙂'}
                      className="h-6 w-6 shrink-0 rounded-full text-[13px]"
                      textCls="text-[13px]"
                      style={{ background: (c?.color || '#999') + '33' }}
                    />
                    <span className="text-[12px] font-medium" style={{ color: c?.color || 'var(--accent)' }}>
                      {nameOf(m.who)}
                    </span>
                    <span className="text-[9px] text-muted">{m.at}</span>
                    {ttsBtn}
                  </div>
                  {m.image && <img src={m.image} alt="" className="mb-1 max-h-60 max-w-full rounded-xl object-cover" />}
                  {editingThis ? editArea : m.text && (
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink [overflow-wrap:anywhere]">{m.text}</div>
                  )}
                </div>
              )
            }

            // 气泡式
            return (
              <div key={m.id} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar
                  img={c?.avatarImg}
                  emoji={c?.avatar || '🙂'}
                  className="h-8 w-8 shrink-0 rounded-full text-base"
                  textCls="text-base"
                  style={{ background: (c?.color || '#999') + '33' }}
                />
                <div className={`flex min-w-0 max-w-[78%] flex-col select-none [-webkit-touch-callout:none] [-webkit-user-select:none] ${mine ? 'items-end' : 'items-start'}`} {...longPress}>
                  <span className="px-1 text-[10px] text-muted">{nameOf(m.who)}</span>
                  {m.image && (
                    <img src={m.image} alt="" className="mt-0.5 max-h-52 max-w-full rounded-2xl object-cover" />
                  )}
                  {editingThis ? editArea : m.text && (
                    <div
                      className="mt-0.5 whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm text-ink [overflow-wrap:anywhere]"
                      style={{ background: (c?.color || '#bb9af7') + (mine ? '40' : '22') }}
                    >
                      {m.text}
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-1 text-muted">
                    <span className="text-[9px]">{m.at}</span>
                    {ttsBtn}
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

      {/* 输入栏（你 = 女主） */}
      <div className="flex-none pt-2">
        {/* @ 点名弹层：输入「@」时浮出角色名，点一下让 TA 接话 */}
        {atMatch && aiChars.length > 0 && (
          <div className="glass-strong mb-2 flex flex-wrap gap-2 rounded-2xl p-2">
            {(atList.length ? atList : aiChars).map((c) => (
              <button
                key={c.id}
                onClick={() => pickAt(c)}
                disabled={!!busyChar}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] text-ink disabled:opacity-50"
                style={{ background: c.color + '33' }}
              >
                <Avatar img={c.avatarImg} emoji={c.avatar} className="h-5 w-5 rounded-full text-[11px]" textCls="text-[11px]" style={{ background: c.color + '44' }} />
                {c.name}
              </button>
            ))}
          </div>
        )}
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
          <div className="relative shrink-0">
            <button
              onClick={() => setPlusOpen((o) => !o)}
              aria-label="更多"
              className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-muted hover:bg-white/40 hover:text-ink"
            >
              ＋
            </button>
            {plusOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setPlusOpen(false)} />
                <div className="glass-strong absolute bottom-full left-0 z-30 mb-2 w-40 overflow-hidden rounded-2xl p-1.5 shadow-lg">
                  <button
                    onClick={() => { setPlusOpen(false); fileRef.current?.click() }}
                    className="block w-full rounded-xl px-3 py-2 text-left text-[13px] text-ink hover:bg-white/40"
                  >
                    🖼 发图片
                  </button>
                  <button
                    onClick={() => { setPlusOpen(false); void compress() }}
                    disabled={summaryBusy || !!busyChar}
                    className="block w-full rounded-xl px-3 py-2 text-left text-[13px] text-ink hover:bg-white/40 disabled:opacity-50"
                  >
                    🗜 压缩对话
                  </button>
                </div>
              </>
            )}
          </div>
          <textarea
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={meChar ? `以「${meChar.name}」说… 或 @角色名 让 TA 接话` : '@角色名 指定角色发言（建议先建「我」的角色卡）'}
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
            onClick={onSend}
            aria-label="发送"
            className="btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          >
            <SendIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* 长按消息 · 操作菜单 */}
      {menuMsgId && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => setMenuMsgId('')}>
          <div
            className="glass-strong w-full space-y-1 rounded-t-3xl p-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => startEdit(menuMsgId)} className="block w-full rounded-xl px-4 py-3 text-left text-sm text-ink hover:bg-white/40">
              ✏️ 改写
            </button>
            <button onClick={() => copyMsg(menuMsgId)} className="block w-full rounded-xl px-4 py-3 text-left text-sm text-ink hover:bg-white/40">
              📋 复制
            </button>
            <button onClick={() => translateMsg(menuMsgId)} className="block w-full rounded-xl px-4 py-3 text-left text-sm text-ink hover:bg-white/40">
              🌐 翻译
            </button>
            <button onClick={() => rollback(menuMsgId)} className="block w-full rounded-xl px-4 py-3 text-left text-sm text-ink hover:bg-white/40">
              ↩️ 回溯（删这条及之后，回到此处重来）
            </button>
            <button onClick={() => delMsg(menuMsgId)} className="block w-full rounded-xl px-4 py-3 text-left text-sm text-red-500 hover:bg-white/40">
              🗑 删除这条
            </button>
            <button onClick={() => setMenuMsgId('')} className="block w-full rounded-xl px-4 py-3 text-center text-sm text-muted">
              取消
            </button>
          </div>
        </div>
      )}

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

      {/* 轻提示（复制成功等） */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center">
          <div className="glass-strong rounded-full px-3.5 py-1.5 text-[12px] text-ink shadow">{toast}</div>
        </div>
      )}

      {/* 翻译结果弹层 */}
      {(transBusy || transText) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setTransText('')}>
          <div className="glass-strong max-h-[70vh] w-full max-w-sm space-y-3 overflow-y-auto rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="label">🌐 翻译</div>
            {transBusy ? (
              <div className="text-sm text-muted">翻译中…</div>
            ) : (
              <>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">{transText}</div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => navigator.clipboard?.writeText(transText).then(() => flashToast('已复制')).catch(() => {})}
                    className="glass rounded-full px-3 py-1.5 text-[12px] text-ink"
                  >
                    复制译文
                  </button>
                  <button onClick={() => setTransText('')} className="btn-primary rounded-full px-4 py-1.5 text-[12px]">关闭</button>
                </div>
              </>
            )}
          </div>
        </div>
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
  const [avatar] = useState(base?.avatar ?? '🎭')
  const [avatarImg, setAvatarImg] = useState<string | undefined>(base?.avatarImg)
  const [persona, setPersona] = useState(base?.persona ?? '')
  const [greeting, setGreeting] = useState(base?.greeting ?? '')
  const [color, setColor] = useState(base?.color ?? PRESET_COLORS[0])
  const [isMe, setIsMe] = useState(base?.isMe ?? false)
  const [apiChannelId, setApiChannelId] = useState<string | undefined>(base?.apiChannelId)
  const [personaOpen, setPersonaOpen] = useState(!base?.persona) // 有内容默认收起
  const [greetingOpen, setGreetingOpen] = useState(!base?.greeting)
  const [chanOpen, setChanOpen] = useState(false)
  const channels = useApiStore((s) => s.channels)
  const chanName = channels.find((c) => c.id === apiChannelId)?.name
  const imgRef = useRef<HTMLInputElement>(null)
  const inputCls =
    'w-full rounded-xl border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent'

  function save() {
    const patch = { name, avatar, avatarImg, persona, greeting, color, isMe, apiChannelId }
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

        <div>
          <button onClick={() => setPersonaOpen((o) => !o)} className="mb-1 flex w-full items-center gap-1 text-left text-[12px] text-muted">
            <span>{personaOpen ? '▾' : '▸'}</span>
            <span>角色设定 / 人设</span>
            {!personaOpen && persona.trim() && <span className="ml-1 truncate text-[11px] text-ink/60">{persona.trim().slice(0, 16)}…</span>}
          </button>
          {personaOpen && (
            <textarea
              className={inputCls}
              rows={6}
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="身份、性别、年龄、性格、说话风格、背景关系…（NPC 卡可写：负责扮演各路 NPC 与旁白）"
            />
          )}
        </div>

        <div>
          <button onClick={() => setGreetingOpen((o) => !o)} className="mb-1 flex w-full items-center gap-1 text-left text-[12px] text-muted">
            <span>{greetingOpen ? '▾' : '▸'}</span>
            <span>开场白（出场第一条 · 可留空）</span>
            {!greetingOpen && greeting.trim() && <span className="ml-1 truncate text-[11px] text-ink/60">{greeting.trim().slice(0, 16)}…</span>}
          </button>
          {greetingOpen && (
            <textarea
              className={inputCls}
              rows={3}
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="角色出场说的第一句/一段，用来开启剧情（如男主推门而入）。建好后在角色列表点「▶开场」发出。"
            />
          )}
        </div>

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

        <div>
          <div className="mb-1 text-[12px] text-muted">独立 API（这个角色单独用哪个模型）</div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setChanOpen((o) => !o)}
              className={inputCls + ' flex items-center justify-between text-left'}
            >
              <span className="truncate">{chanName || '跟随当前激活渠道'}</span>
              <span className="shrink-0 text-muted">▾</span>
            </button>
            {chanOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setChanOpen(false)} />
                <div className="glass-strong absolute left-0 top-full z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-2xl p-1.5 shadow-lg">
                  <button
                    type="button"
                    onClick={() => { setApiChannelId(undefined); setChanOpen(false) }}
                    className="block w-full rounded-xl px-3 py-1.5 text-left text-[12px] text-ink hover:bg-white/40"
                  >
                    跟随当前激活渠道{!apiChannelId ? ' ✓' : ''}
                  </button>
                  {channels.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setApiChannelId(c.id); setChanOpen(false) }}
                      className="block w-full truncate rounded-xl px-3 py-1.5 text-left text-[12px] text-ink hover:bg-white/40"
                    >
                      {c.name || c.model}{apiChannelId === c.id ? ' ✓' : ''}
                    </button>
                  ))}
                  {channels.length === 0 && (
                    <div className="px-3 py-1.5 text-[11px] text-muted">还没渠道，去「设置 → API / 模型」加</div>
                  )}
                </div>
              </>
            )}
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
