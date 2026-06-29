import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useProfileStore } from '@/store/profileStore'
import { usePersonaStore } from '@/store/personaStore'
import { useSyncStore } from '@/store/syncStore'
import { useApiStore } from '@/store/apiStore'
import { useUsageStore } from '@/store/usageStore'
import { sendChat, type ChatApiMessage } from '@/api/chat'
import { chatComplete, chatCompleteStream, canStream } from '@/api/llm'
import { useTtsStore } from '@/store/ttsStore'
import { useTtsPlayback } from '@/lib/useTtsPlayback'
import { useAppearanceStore } from '@/store/appearanceStore'
import { useChatStore, type ChatMsg as Msg } from '@/store/chatStore'
import chatCat from '@/assets/themes/chat-cat.jpg'
import { fileToDataUrl } from '@/lib/image'
import { isTextFile, readAsDataUrl, readAsText, humanSize } from '@/lib/file'
import { useImageGenStore } from '@/store/imageGenStore'
import { generateImage } from '@/api/imagegen'
import { useVisionStore } from '@/store/visionStore'
import { useChatPrefsStore } from '@/store/chatPrefsStore'
import { useMemoryStore } from '@/store/memoryStore'
import { useMemoryModelStore } from '@/store/memoryModelStore'
import { useSttStore } from '@/store/sttStore'
import { transcribe } from '@/api/stt'
import type { ApiChannel } from '@/store/apiStore'
import Avatar from '@/components/ui/Avatar'
import { CopyIcon, RegenIcon, EditIcon, SpeakerIcon, StopIcon, SendIcon } from '@/components/ui/icons'
import { renderRichText, stripLinks } from '@/lib/richText'
import { cleanReply } from '@/lib/cleanReply'
import { usePeriodStore } from '@/store/periodStore'
import { periodChatNote } from '@/lib/period'
import { parseTasks } from '@/store/taskStore'
import { useThemeStore } from '@/store/themeStore'
import {
  ImageIcon,
  FileIcon,
  ImageSparkIcon,
  CropIcon,
  CompressIcon,
} from '@/components/ui/navIcons'

type PendingFile = NonNullable<Msg['file']>
const MAX_FILE = 1.5 * 1024 * 1024 // 1.5MB（dataURL 存 localStorage，避免超额）

/** 等页面回到前台再继续（已在前台立即返回）。iOS 切后台会冻结 JS、掐断网络，靠它在回前台后重试 */
function waitUntilVisible(): Promise<void> {
  if (typeof document === 'undefined' || !document.hidden) return Promise.resolve()
  return new Promise((resolve) => {
    const on = () => {
      if (!document.hidden) {
        document.removeEventListener('visibilitychange', on)
        window.removeEventListener('focus', on)
        resolve()
      }
    }
    document.addEventListener('visibilitychange', on)
    window.addEventListener('focus', on)
  })
}

/** 看起来是「切后台导致连接被系统掐断」的错误（而非真正的 API 报错），这类应该回前台后自动重试 */
function looksBackgrounded(msg: string): boolean {
  return /load failed|networkerror|network error|failed to fetch|connection|aborted|abort|timed out|timeout|cancell?ed/i.test(
    msg,
  )
}

/** 给 Promise 加超时，避免某些环境下 PDF worker 卡住拖死发送 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('解析超时')), ms)),
  ])
}

/** 老 Safari 不支持 Promise.withResolvers（pdfjs 6 需要），加载 pdfjs 前补上 */
function ensureWithResolvers() {
  const P = Promise as unknown as { withResolvers?: unknown }
  if (typeof P.withResolvers === 'function') return
  P.withResolvers = function <T>() {
    let resolve!: (v: T) => void
    let reject!: (e?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
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
  const imgChannels = useImageGenStore((s) => s.channels)
  const imgActiveId = useImageGenStore((s) => s.activeId)
  const imageGenCfg = imgChannels.find((c) => c.id === imgActiveId) ?? imgChannels[0]
  const visionCfg = useVisionStore((s) => s.config)
  const webSearch = useChatPrefsStore((s) => s.webSearch)
  const autoMemory = useChatPrefsStore((s) => s.autoMemory)
  const flat = useChatPrefsStore((s) => s.chatStyle) === 'flat'
  const showLinks = useChatPrefsStore((s) => s.showLinks)
  const allowTasks = useChatPrefsStore((s) => s.allowTasks)
  const theme = useThemeStore((s) => s.theme)
  const [nowTs, setNowTs] = useState(Date.now())
  const addMemory = useMemoryStore((s) => s.addMemory)
  const removeMemory = useMemoryStore((s) => s.removeMemory)
  const updateMemory = useMemoryStore((s) => s.updateMemory)
  const memoriesRef = useMemoryStore((s) => s.memories)
  const memoryModelCfg = useMemoryModelStore((s) => s.config)
  const sttCfg = useSttStore((s) => s.config)
  // 自动记忆降频计数：每隔几轮才跑一次记忆维护（force 时立即跑），省 token
  const memTurnRef = useRef(0)
  const MEM_EVERY = 6
  // 语音输入（录音 → 转文字）
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // 实时语音通话（像打电话）：录音→转文字→自动发→回复自动念
  const [callMode, setCallMode] = useState(false)
  const callModeRef = useRef(false)
  useEffect(() => {
    callModeRef.current = callMode
  }, [callMode])
  // 通话里：AI 新回复出现且生成完，就自动朗读（记下已念过的，避免重复）
  const spokenRef = useRef('')
  const { chatBg, chatBgDim, chatBgOpacity, chatBgBlur, chatBgFit } = useAppearanceStore(
    (s) => s.appearance,
  )
  const { play, stop: stopTts, playingId, loadingId, error: ttsError } = useTtsPlayback()
  const workerUrl = config.workerUrl?.trim()
  const connected = Boolean(activeChannel || workerUrl)

  const name = persona.name || profile.nameB || 'TA'

  const sessions = useChatStore((s) => s.sessions)
  const activeId = useChatStore((s) => s.activeId)
  const setMessages = useChatStore((s) => s.setMessages)
  const createSession = useChatStore((s) => s.createSession)
  const switchSession = useChatStore((s) => s.switchSession)
  const removeSession = useChatStore((s) => s.removeSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const autoTitle = useChatStore((s) => s.autoTitle)
  const active = sessions.find((s) => s.id === activeId)
  const messages = active?.messages ?? []
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [pendingImage, setPendingImage] = useState('')
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)
  const [lightbox, setLightbox] = useState('')
  const [imgErr, setImgErr] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [editDraft, setEditDraft] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set())
  // 正在流式输出（思考/正文边收边显示）的消息 id
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set())
  // 各流式消息的思考起始时间戳（用于「深度思考 (x.xs)」实时计时）
  const thinkStartRef = useRef<Record<string, number>>({})
  // 记忆提示（飘一下就消失，不进对话正文）
  const [memToast, setMemToast] = useState('')
  const memToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showMemToast(msg: string) {
    setMemToast(msg)
    if (memToastTimer.current) clearTimeout(memToastTimer.current)
    memToastTimer.current = setTimeout(() => setMemToast(''), 2600)
  }
  // 右下角 ↑/↓ 悬浮键：平时隐藏，滚动时淡入，停 1.2s 后淡出
  const [showScrollBtns, setShowScrollBtns] = useState(false)
  // 触屏设备（手机）：回车键=换行，靠发送按钮发送；桌面：回车发送、Shift+回车换行
  const isTouch =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches

  function toggleReasoning(id: string) {
    setOpenReasoning((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 输入框随内容自动增高（1~约 4 行），发送后会回到一行 */
  function autoGrow() {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }
  useEffect(() => {
    autoGrow()
  }, [draft])

  // 滚动时显示右下角 ↑/↓ 悬浮键，停下 1.2s 后淡出
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      setShowScrollBtns(true)
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current)
      scrollHideTimer.current = setTimeout(() => setShowScrollBtns(false), 1200)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current)
    }
  }, [])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelect() {
    setSelectMode(false)
    setSelected(new Set())
  }

  /** 把选中的消息渲染成一张长图，弹出预览（iOS 长按可存相册） */
  async function exportSelected() {
    if (!selected.size || exporting) return
    setExporting(true)
    setImgErr('')
    try {
      const { default: html2canvas } = await import('html2canvas')
      const node = exportRef.current
      if (!node) throw new Error('导出容器不存在')
      const bg =
        getComputedStyle(document.documentElement).getPropertyValue('--bg-to').trim() || '#ffffff'
      const canvas = await html2canvas(node, { backgroundColor: bg, scale: 2, useCORS: true })
      setLightbox(canvas.toDataURL('image/png'))
      exitSelect()
    } catch (e) {
      setImgErr(`生成图片失败：${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  // 选中的消息（保持时间顺序）
  const selectedMsgs = messages.filter((m) => selected.has(m.id))

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  // 有进行中的任务时每秒刷新倒计时；切回前台立刻按本地真实时间同步
  const hasActiveTask = messages.some((m) => m.task?.status === 'active')
  useEffect(() => {
    if (!hasActiveTask) return
    const sync = () => setNowTs(Date.now())
    sync()
    const id = setInterval(sync, 1000)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [hasActiveTask])

  // 流式思考期间每 100ms 刷新一次，让「深度思考 (x.xs)」计时跑起来
  useEffect(() => {
    if (streamingIds.size === 0) return
    const id = setInterval(() => setNowTs(Date.now()), 100)
    return () => clearInterval(id)
  }, [streamingIds])

  // 通话模式：AI 回复生成完后自动朗读最新一条（每条只念一次）
  useEffect(() => {
    if (!callMode || !ttsEnabled) return
    if (sending || streamingIds.size > 0) return
    const last = messages[messages.length - 1]
    if (last && last.role === 'companion' && last.text.trim() && last.id !== spokenRef.current) {
      spokenRef.current = last.id
      play(last.id, last.text)
    }
  }, [callMode, ttsEnabled, sending, streamingIds, messages, play])

  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  function completeTask(id: string) {
    const updated = messages.map((m) =>
      m.id === id && m.task
        ? { ...m, task: { ...m.task, status: 'done' as const, doneAt: Date.now() } }
        : m,
    )
    setMessages(updated)
    if (connected && !sending) void respond(updated)
  }
  function cancelTask(id: string) {
    const updated = messages.map((m) =>
      m.id === id && m.task ? { ...m, task: { ...m.task, status: 'cancelled' as const } } : m,
    )
    setMessages(updated)
    if (connected && !sending) void respond(updated)
  }

  function copyText(id: string, text: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopiedId(id)
        setTimeout(() => setCopiedId(''), 1200)
      },
      () => setImgErr('复制失败')
    )
  }

  /** 重新生成某条 AI 回复：删掉它（及之后），用之前的历史重新请求 */
  async function regenerate(id: string) {
    if (sending || generating) return
    const idx = messages.findIndex((m) => m.id === id)
    if (idx < 0) return
    const history = messages.slice(0, idx)
    setMessages(history)
    if (connected) await respond(history)
  }

  function startEdit(m: Msg) {
    setEditingId(m.id)
    setEditDraft(m.text)
  }

  /** 保存编辑后的用户消息并重发（删除其后的所有消息，重新请求） */
  async function saveEdit(id: string) {
    const text = editDraft.trim()
    setEditingId('')
    if (!text) return
    const idx = messages.findIndex((m) => m.id === id)
    if (idx < 0) return
    const edited: Msg = { ...messages[idx], text }
    const history = [...messages.slice(0, idx), edited]
    setMessages(history)
    if (connected) await respond(history)
  }

  /** 压缩长对话：把较早的消息总结成「前情摘要」，只保留最近几条，省 token */
  async function compress() {
    setPlusOpen(false)
    if (sending || generating) return
    const keep = 4
    if (messages.length <= keep + 2) {
      setImgErr('对话还很短，暂时不用压缩')
      return
    }
    if (!activeChannel && !workerUrl) {
      setImgErr('压缩需要先配置聊天渠道')
      return
    }
    if (!window.confirm('把较早的对话压缩成一段摘要？（保留最近几条，不可恢复）')) return
    const head = messages.slice(0, messages.length - keep)
    const tail = messages.slice(messages.length - keep)
    const transcript = head
      .map((m) => {
        const who = m.role === 'me' ? '用户' : 'AI'
        const extra = `${m.image ? '［图片］' : ''}${m.file ? `［文件:${m.file.name}］` : ''}`
        return `${who}：${m.text}${extra}`
      })
      .join('\n')
    const sys = '你是对话摘要助手，只输出摘要正文，不要寒暄。'
    const ask = `请把下面这段对话压缩成简洁的「前情摘要」，保留关键信息、事实和情感脉络，用第三人称概述，不要遗漏重要细节：\n\n${transcript}`
    setSending(true)
    setImgErr('')
    try {
      let summary = ''
      if (activeChannel) {
        const r = await chatComplete(activeChannel, [{ role: 'user', content: ask }], sys, {
          workerUrl,
          syncKey: config.syncKey,
          maxTokens: persona.maxTokens,
        })
        summary = r.text.trim()
      } else {
        summary = (
          await sendChat({
            workerUrl: workerUrl!,
            syncKey: config.syncKey,
            messages: [{ role: 'user', content: ask }],
            system: sys,
            maxTokens: persona.maxTokens,
          })
        ).trim()
      }
      if (!summary) throw new Error('摘要为空')
      const summaryMsg: Msg = {
        id: newId(),
        role: 'companion',
        text: `【前情摘要】\n${summary}`,
        at: now(),
      }
      setMessages([summaryMsg, ...tail])
    } catch (e) {
      setImgErr(`压缩失败：${(e as Error).message}`)
    } finally {
      setSending(false)
    }
  }

  /** AI 生成图片：输入描述 → 调文生图渠道 → 作为一条消息插入 */
  async function genImage() {
    setPlusOpen(false)
    if (generating || sending) return
    const prompt = window.prompt('描述你想生成的图片，例如：粉色夕阳下的海边小屋')
    if (!prompt || !prompt.trim()) return
    if (!imageGenCfg || (!imageGenCfg.apiKey.trim() && !imageGenCfg.viaWorker)) {
      setImgErr('请先在「设置 → 生成图片」配置文生图渠道')
      return
    }
    const p = prompt.trim()
    setImgErr('')
    setMessages((prev) => [...prev, { id: newId(), role: 'me', text: `🎨 ${p}`, at: now() }])
    autoTitle(p)
    setGenerating(true)
    try {
      const cfg = {
        ...imageGenCfg,
        workerUrl: imageGenCfg.workerUrl.trim() || (config.workerUrl || '').trim(),
      }
      const img = await generateImage(cfg, p, { syncKey: config.syncKey })
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'companion', text: '', at: now(), image: img },
      ])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'companion', text: `（画不出来：${(e as Error).message}）`, at: now() },
      ])
    } finally {
      setGenerating(false)
    }
  }

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
        ensureWithResolvers() // 老 Safari 兼容（pdfjs 6 需要 Promise.withResolvers）
        const { extractPdfText } = await import('@/lib/pdf')
        text = (await withTimeout(extractPdfText(file), 15000)) || undefined
        if (!text) setImgErr('这个 PDF 没提取到文字（可能是扫描件/图片型），仍可作为附件发送')
      }
      if (text) {
        setPendingFile((prev) => (prev && prev.name === file.name ? { ...prev, text } : prev))
      }
    } catch (e) {
      setImgErr(
        isPdf
          ? 'PDF 已作为附件发送（这台设备无法在浏览器里解析 PDF 正文，AI 读不到内容）'
          : `文件内容解析失败：${(e as Error).message}；仍可作为附件发送`
      )
    }
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? draft).trim()
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
    if (text) autoTitle(text)
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

  /** 语音输入：开始录音 */
  async function startRec() {
    if (recording || transcribing) return
    setImgErr('')
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
          const cfg = {
            ...sttCfg,
            workerUrl: sttCfg.workerUrl.trim() || (config.workerUrl || '').trim(),
          }
          const text = await transcribe(cfg, blob, { syncKey: config.syncKey })
          if (!text) {
            setImgErr('没识别到内容，靠近麦克风再说一次试试')
          } else if (sttCfg.autoSend || callModeRef.current) {
            // 通话模式或开了自动发送：直接发出去
            await send(text)
          } else {
            setDraft((d) => (d ? `${d} ${text}` : text))
          }
        } catch (e) {
          setImgErr(`语音转文字失败：${(e as Error).message}`)
        } finally {
          setTranscribing(false)
        }
      }
      mediaRecRef.current = mr
      mr.start()
      setRecording(true)
    } catch (e) {
      setImgErr(`打不开麦克风：${(e as Error).message}（需允许麦克风权限，且页面是 https）`)
    }
  }

  /** 语音输入：停止录音并转写 */
  function stopRec() {
    mediaRecRef.current?.stop()
  }

  /**
   * 自动记忆维护：让 AI 当「记忆管家」，一次返回 新增/删除/改长短期 三类操作。
   * 省 token：非 force 时每隔 MEM_EVERY 轮才真正跑一次；force（用户说「记一下」）立即跑。
   */
  async function extractMemories(history: Msg[], force: boolean) {
    // 降频：攒够 MEM_EVERY 轮才跑；force 时立即跑并清零
    if (!force) {
      memTurnRef.current += 1
      if (memTurnRef.current < MEM_EVERY) return
    }
    memTurnRef.current = 0

    // 开了「记忆模型」就用它单独提炼（不占主聊天模型）；否则回退主渠道 / Worker
    const memChannel: ApiChannel | undefined =
      memoryModelCfg.enabled && memoryModelCfg.apiKey.trim() && memoryModelCfg.model.trim()
        ? {
            id: 'memory',
            name: '记忆',
            provider: 'openai',
            baseUrl: memoryModelCfg.baseUrl,
            apiKey: memoryModelCfg.apiKey,
            model: memoryModelCfg.model,
          }
        : activeChannel
    if (!memChannel && !workerUrl) return
    const memName = profile.nameA || '她'
    const recent = history.slice(-14)
    const transcript = recent
      .map((m) => `${m.role === 'me' ? memName : name}：${m.text}${m.image ? '［图片］' : ''}`)
      .join('\n')
    // 已有记忆（紧凑：id+长短+标题），最多 60 条，省 token
    const memList = memoriesRef.slice(0, 60)
    const memListText = memList.length
      ? memList
          .map((m) => `[${m.id}]（${m.kind === 'long' ? '长' : '短'}${m.starred ? '★' : ''}）${m.title}`)
          .join('\n')
      : '（空）'

    const sys = '你是记忆管理助手，只输出 JSON，不要任何多余文字。'
    const ask =
      `你在维护${memName}的长期记忆库。看【已有记忆】和【最近对话】，判断要不要：新增、删除（重复/过时/已被取代的）、改长短期。\n` +
      `⚠️ 高门槛、宁缺毋滥：日常闲聊/寒暄/一时情绪/临时小事都【不要】记；带★标星的【绝不能删】。多数情况三个数组都空。\n` +
      `长期(long)=人设/重要事实/长期偏好/郑重承诺/重大事件；短期(short)=有时效的近期安排等。称呼她用「${memName}」。\n` +
      (force ? `${memName}已明确要求记住，请务必在 add 里提取其指向的内容。\n` : '') +
      `只输出 JSON：{"add":[{"title":"简短标题","content":"内容","kind":"long"|"short"}],"delete":["要删的记忆id"],"update":[{"id":"记忆id","kind":"long"|"short"}]}\n\n` +
      `【已有记忆】\n${memListText}\n\n【最近对话】\n${transcript}`
    try {
      let text = ''
      if (memChannel) {
        text = (
          await chatComplete(memChannel, [{ role: 'user', content: ask }], sys, {
            workerUrl,
            syncKey: config.syncKey,
            maxTokens: 700,
          })
        ).text
      } else {
        text = await sendChat({
          workerUrl: workerUrl!,
          syncKey: config.syncKey,
          messages: [{ role: 'user', content: ask }],
          system: sys,
          maxTokens: 700,
        })
      }
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return
      const data = JSON.parse(match[0]) as {
        add?: { title?: string; content?: string; kind?: string }[]
        items?: { title?: string; content?: string; kind?: string }[] // 兼容旧格式
        delete?: string[]
        update?: { id?: string; kind?: string }[]
      }
      const byId = new Map(memoriesRef.map((m) => [m.id, m]))
      let added = 0
      let removed = 0
      let changed = 0

      // 新增（去重）
      for (const it of data.add || data.items || []) {
        const content = (it.content || '').trim()
        const title = (it.title || '').trim()
        if (!content) continue
        if (memoriesRef.some((m) => m.content.trim() === content || (title && m.title.trim() === title)))
          continue
        addMemory({
          title: title || content.slice(0, 16),
          content,
          kind: it.kind === 'short' ? 'short' : 'long',
          source: 'auto',
        })
        added++
      }
      // 删除（保护标星；id 必须真实存在）
      for (const id of data.delete || []) {
        const m = byId.get(id)
        if (m && !m.starred) {
          removeMemory(id)
          removed++
        }
      }
      // 改长短期
      for (const u of data.update || []) {
        const m = u.id ? byId.get(u.id) : undefined
        const kind = u.kind === 'long' || u.kind === 'short' ? u.kind : undefined
        if (m && kind && m.kind !== kind) {
          updateMemory(m.id, { kind })
          changed++
        }
      }

      const parts = []
      if (added) parts.push(`+${added}`)
      if (changed) parts.push(`改${changed}`)
      if (removed) parts.push(`删${removed}`)
      if (parts.length) showMemToast(`🧠 记忆已更新（${parts.join(' · ')}）`)
    } catch {
      // 静默失败，不打扰对话
    }
  }

  /** 用当前历史调用模型并把回复加入对话（图片按 vision 格式发送） */
  async function respond(history: Msg[]) {
    const apiMsgs: ChatApiMessage[] = history
      .filter((m) => m.text.trim() || m.image || m.file || m.task)
      .map((m) => {
        const role = m.role === 'me' ? ('user' as const) : ('assistant' as const)
        // 任务消息 → 以「我向 TA 汇报」的用户口吻表达，让模型自然接话
        if (m.task) {
          const tk = m.task
          let note = `（你给我下了任务：${tk.text}，限时${tk.minutes}分钟，我还在进行。）`
          if (tk.status === 'done' && tk.doneAt) {
            const used = Math.round((tk.doneAt - tk.startedAt) / 1000)
            const diff = Math.round((tk.deadline - tk.doneAt) / 1000)
            note = `（我完成了你下的任务：${tk.text}，用时${used}秒，${diff >= 0 ? `提前${diff}秒` : `超时${-diff}秒`}。）`
          } else if (tk.status === 'cancelled') {
            note = `（我取消了你下的任务：${tk.text}。）`
          }
          return { role: 'user' as const, content: note }
        }
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

    // 含图片且开了「读图模型」→ 这次用支持视觉的模型回复（主文本模型可能不支持图）
    const hasImage = apiMsgs.some((m) => Array.isArray(m.content))
    const useVision =
      hasImage && visionCfg.enabled && visionCfg.apiKey.trim() && visionCfg.model.trim()
    const channel: ApiChannel | undefined = useVision
      ? {
          id: 'vision',
          name: '读图',
          provider: 'openai',
          baseUrl: visionCfg.baseUrl,
          apiKey: visionCfg.apiKey,
          model: visionCfg.model,
        }
      : activeChannel

    const base =
      persona.systemPrompt.trim() ||
      `你是 ${name}，${profile.nameA} 最亲密的恋人与陪伴。用中文、口语化、亲昵温柔地回应，语气有情感温度，回复简洁自然，不要太长。`
    // 注入本地时间，让模型有「现在」的感知
    const localTime = new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
    let system = `${base}\n\n（当前用户本地时间：${localTime}，回应时可自然参考，不必刻意复述。）`
    const periodState = usePeriodStore.getState()
    if (periodState.inject) {
      const note = periodChatNote(periodState.days, profile.nameA || '她', periodState.periodLen)
      if (note) system += `\n\n${note}`
    }
    if (allowTasks) {
      system +=
        `\n\n【任务提醒功能 · 请理解并善用】\n` +
        `这个 App 支持你给${profile.nameA || '她'}下达带倒计时的小任务来关心/督促她（比如去喝水、起身活动、早点睡、按时吃饭、复盘工作）。\n` +
        `用法：在回复的最后另起一行，用严格格式输出 [[task|分钟数|任务内容]]，例如 [[task|2|去喝一杯水，不是奶茶不是咖啡，白水]]。\n` +
        `输出后，她的屏幕上会出现一张「指令」倒计时卡片（你下的任务内容 + 倒计时 + 完成/取消按钮）。\n` +
        `当她点「完成」或「取消」，系统会自动以她的口吻告诉你结果，例如「（我完成了你下的任务：去喝水，用时87秒，提前33秒）」——这条就是任务卡的回报，你要据此自然回应她（夸她乖、调侃她快/慢、继续关心或追加要求），别当成她自己打的字。\n` +
        `⚠️ 分寸（很重要）：绝大多数回复都【不要】下任务，正常聊天就好。只有在你真的觉得有必要时才下，比如：她说累了/困了/不舒服、很久没吃饭或没喝水、长时间盯屏幕或熬夜、情绪不好需要起身缓一缓，或你作为关心她的人判断此刻确实该提醒她照顾自己。没有明确理由就【绝对不要】下任务，别一直刷任务卡惹她烦。一次最多一个。标记本身不会显示在对话里，只会变成卡片。`
    }

    // 开了思考过程且渠道可流式（OpenAI 兼容直连）→ 走流式：思考链实时流动、思考完自动收起出正文
    const useStream = !!channel && canStream(channel) && persona.reasoning

    setSending(true)
    try {
      // ——— 流式分支：边收思考边显示，思考结束自动收起再流出正文 ———
      if (useStream) {
        const replyId = newId()
        const startedAt = Date.now()
        thinkStartRef.current[replyId] = startedAt
        let gotContent = false
        let anyDelta = false
        let replyForMem = ''
        // 先放占位气泡并展开思考框
        setMessages((prev) => [
          ...prev,
          { id: replyId, role: 'companion' as const, text: '', at: now(), reasoning: '' },
        ])
        setOpenReasoning((prev) => new Set(prev).add(replyId))
        setStreamingIds((prev) => new Set(prev).add(replyId))

        const patch = (fn: (m: Msg) => Msg) =>
          setMessages((prev) => prev.map((m) => (m.id === replyId ? fn(m) : m)))
        const collapseThink = () => {
          patch((m) => (m.thinkMs == null ? { ...m, thinkMs: Date.now() - startedAt } : m))
          setOpenReasoning((prev) => {
            const n = new Set(prev)
            n.delete(replyId)
            return n
          })
        }

        let attempt = 0
        while (true) {
          let hiddenDuringReq = typeof document !== 'undefined' && document.hidden
          const markHidden = () => {
            if (typeof document !== 'undefined' && document.hidden) hiddenDuringReq = true
          }
          document.addEventListener('visibilitychange', markHidden)
          try {
            const r = await chatCompleteStream(
              channel!,
              apiMsgs,
              system,
              {
                workerUrl,
                syncKey: config.syncKey,
                temperature: persona.temperature,
                maxTokens: persona.maxTokens,
                reasoning: persona.reasoning,
                webSearch,
              },
              {
                onReasoning: (d) => {
                  anyDelta = true
                  patch((m) => ({ ...m, reasoning: (m.reasoning || '') + d }))
                },
                onContent: (d) => {
                  anyDelta = true
                  if (!gotContent) {
                    gotContent = true
                    collapseThink() // 思考结束→出正文：记用时、自动收起思考框
                  }
                  patch((m) => ({ ...m, text: (m.text || '') + d }))
                },
              },
            )
            // 收尾：用量、清标签、解析任务标记
            if (r.usage) {
              addUsage({
                at: new Date().toISOString(),
                provider: channel!.provider,
                model: r.usage.model,
                promptTokens: r.usage.promptTokens,
                completionTokens: r.usage.completionTokens,
                totalTokens: r.usage.totalTokens,
                cost: r.usage.cost,
              })
            }
            collapseThink() // 万一没有正文增量也要确保收起
            let finalText = cleanReply(r.text)
            const taskMsgs: Msg[] = []
            if (allowTasks && finalText) {
              const { tasks: parsed, clean } = parseTasks(finalText)
              if (parsed.length) {
                finalText = clean
                for (const t of parsed) {
                  const mins = Math.max(1, Math.min(180, Math.round(t.minutes) || 5))
                  const s = Date.now()
                  taskMsgs.push({
                    id: newId(),
                    role: 'companion',
                    text: '',
                    at: now(),
                    task: { text: t.text, minutes: mins, startedAt: s, deadline: s + mins * 60000, status: 'active' },
                  })
                }
              }
            }
            replyForMem = finalText
            const tokens = r.usage?.totalTokens
            patch((m) => ({
              ...m,
              text: finalText || (taskMsgs.length ? '' : '……'),
              ...(tokens ? { tokens } : {}),
              ...(r.reasoning ? { reasoning: r.reasoning } : {}),
            }))
            if (taskMsgs.length) setMessages((prev) => [...prev, ...taskMsgs])
            break // 成功
          } catch (err) {
            const msg = (err as Error).message || ''
            const interrupted =
              (hiddenDuringReq || (typeof document !== 'undefined' && document.hidden)) &&
              looksBackgrounded(msg)
            if (interrupted && attempt < 4) {
              attempt++
              gotContent = false
              anyDelta = false
              patch((m) => ({ ...m, text: '', reasoning: '', thinkMs: undefined }))
              setOpenReasoning((prev) => new Set(prev).add(replyId))
              await waitUntilVisible() // 回前台重新流式
              continue
            }
            // 流式还没收到任何增量就失败 → 多半是端点不支持 SSE，回退非流式再试一次
            if (!anyDelta) {
              try {
                const r = await chatComplete(channel!, apiMsgs, system, {
                  workerUrl,
                  syncKey: config.syncKey,
                  temperature: persona.temperature,
                  maxTokens: persona.maxTokens,
                  reasoning: persona.reasoning,
                  webSearch,
                })
                if (r.usage) {
                  addUsage({
                    at: new Date().toISOString(),
                    provider: channel!.provider,
                    model: r.usage.model,
                    promptTokens: r.usage.promptTokens,
                    completionTokens: r.usage.completionTokens,
                    totalTokens: r.usage.totalTokens,
                    cost: r.usage.cost,
                  })
                }
                if (r.reasoning) patch((m) => ({ ...m, reasoning: r.reasoning }))
                collapseThink()
                let finalText = cleanReply(r.text)
                const taskMsgs: Msg[] = []
                if (allowTasks && finalText) {
                  const { tasks: parsed, clean } = parseTasks(finalText)
                  if (parsed.length) {
                    finalText = clean
                    for (const t of parsed) {
                      const mins = Math.max(1, Math.min(180, Math.round(t.minutes) || 5))
                      const s = Date.now()
                      taskMsgs.push({
                        id: newId(),
                        role: 'companion',
                        text: '',
                        at: now(),
                        task: { text: t.text, minutes: mins, startedAt: s, deadline: s + mins * 60000, status: 'active' },
                      })
                    }
                  }
                }
                replyForMem = finalText
                const tokens = r.usage?.totalTokens
                patch((m) => ({
                  ...m,
                  text: finalText || (taskMsgs.length ? '' : '……'),
                  ...(tokens ? { tokens } : {}),
                }))
                if (taskMsgs.length) setMessages((prev) => [...prev, ...taskMsgs])
                break
              } catch {
                // 回退也失败，落到下面统一报错
              }
            }
            patch((m) => ({ ...m, text: `（消息没送到：${msg}）`, reasoning: undefined }))
            setOpenReasoning((prev) => {
              const n = new Set(prev)
              n.delete(replyId)
              return n
            })
            break
          } finally {
            document.removeEventListener('visibilitychange', markHidden)
          }
        }

        setStreamingIds((prev) => {
          const n = new Set(prev)
          n.delete(replyId)
          return n
        })
        delete thinkStartRef.current[replyId]

        // 自动沉淀记忆
        const lastUser = [...history].reverse().find((m) => m.role === 'me')
        const force = !!lastUser && /记住|记一下|记下来|记下|记录|存一下|帮我记|记到/.test(lastUser.text)
        if (replyForMem && (autoMemory || force)) {
          void extractMemories([...history, { id: 'tmp', role: 'companion', text: replyForMem, at: '' }], force)
        }
        return
      }

      let reply = ''
      let tokens: number | undefined
      let reasoning: string | undefined

      // 后台中断自动重试：iOS 切后台会冻结 JS、掐断网络连接，导致这次请求失败、回复「断掉」。
      // 监听这次请求期间有没有切过后台，若失败且像是被系统掐断，就等回到前台再重试（最多 4 次），别丢回复。
      let attempt = 0
      while (true) {
        let hiddenDuringReq = typeof document !== 'undefined' && document.hidden
        const markHidden = () => {
          if (typeof document !== 'undefined' && document.hidden) hiddenDuringReq = true
        }
        document.addEventListener('visibilitychange', markHidden)
        try {
          if (channel) {
            const r = await chatComplete(channel, apiMsgs, system, {
              workerUrl,
              syncKey: config.syncKey,
              temperature: persona.temperature,
              maxTokens: persona.maxTokens,
              reasoning: persona.reasoning,
              webSearch,
            })
            reply = r.text
            reasoning = r.reasoning
            if (r.usage) {
              tokens = r.usage.totalTokens
              addUsage({
                at: new Date().toISOString(),
                provider: channel.provider,
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
          break // 成功
        } catch (err) {
          const m = (err as Error).message || ''
          const interrupted =
            (hiddenDuringReq || (typeof document !== 'undefined' && document.hidden)) &&
            looksBackgrounded(m)
          if (interrupted && attempt < 4) {
            attempt++
            await waitUntilVisible() // 回到前台再重试
            continue
          }
          throw err
        } finally {
          document.removeEventListener('visibilitychange', markHidden)
        }
      }
      // 清掉思考/工具调用模型漏出来的标签（<think>/<arg_value> 等）
      reply = cleanReply(reply)
      // 解析 TA 下的任务标记 → 生成对话内倒计时任务卡，并从正文移除标记
      const taskMsgs: Msg[] = []
      if (allowTasks && reply) {
        const { tasks: parsed, clean } = parseTasks(reply)
        if (parsed.length) {
          reply = clean
          for (const t of parsed) {
            const mins = Math.max(1, Math.min(180, Math.round(t.minutes) || 5))
            const startedAt = Date.now()
            taskMsgs.push({
              id: newId(),
              role: 'companion',
              text: '',
              at: now(),
              task: {
                text: t.text,
                minutes: mins,
                startedAt,
                deadline: startedAt + mins * 60000,
                status: 'active',
              },
            })
          }
        }
      }
      const replyId = newId()
      setMessages((prev) => [
        ...prev,
        ...(reply
          ? [
              {
                id: replyId,
                role: 'companion' as const,
                text: reply,
                at: now(),
                ...(tokens ? { tokens } : {}),
                ...(reasoning ? { reasoning } : {}),
              },
            ]
          : []),
        ...taskMsgs,
        ...(!reply && !taskMsgs.length
          ? [{ id: newId(), role: 'companion' as const, text: '……', at: now() }]
          : []),
      ])
      // 自动沉淀记忆：开了开关每轮判断；或用户明确说「记一下」时必存
      const lastUser = [...history].reverse().find((m) => m.role === 'me')
      const force = !!lastUser && /记住|记一下|记下来|记下|记录|存一下|帮我记|记到/.test(lastUser.text)
      if (reply && (autoMemory || force)) {
        void extractMemories([...history, { id: 'tmp', role: 'companion', text: reply, at: '' }], force)
      }
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
    <div className="relative isolate flex h-full flex-col overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* 聊天页背景：① 设了自定义背景图就只显示它(+变暗滑块)，不叠别的层(避免毛玻璃打架糊成灰)；
          ② 否则琉璃(粉)用雾化小猫；③ 其余主题跟随主题背景 + 一层柔白。 */}
      {chatBg ? (
        <>
          <div
            className="pointer-events-none absolute -inset-3 z-0 bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${chatBg})`,
              backgroundSize: chatBgFit === 'contain' ? 'contain' : 'cover',
              opacity: chatBgOpacity,
              filter: chatBgBlur ? `blur(${chatBgBlur}px)` : undefined,
            }}
          />
          {chatBgDim > 0 && (
            <div
              className="pointer-events-none absolute inset-0 z-0 bg-black"
              style={{ opacity: chatBgDim }}
            />
          )}
        </>
      ) : theme === 'aurora' ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${chatCat})` }}
          />
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              background: 'rgba(255, 255, 255, 0.36)',
            }}
          />
        </>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            background: 'rgba(255, 255, 255, 0.3)',
          }}
        />
      )}
      {/* 记忆提示（不进对话正文，飘一下就消失） */}
      {memToast && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center px-4">
          <div className="glass-strong rounded-full px-3.5 py-1.5 text-[12px] text-ink shadow">
            {memToast}
          </div>
        </div>
      )}
      {/* 滚动区：顶栏 sticky 贴顶，消息从其下方滚过（毛玻璃透出内容） */}
      <div ref={scrollRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto">
      {/* 角色头部（sticky 贴顶） */}
      {selectMode ? (
        <div className="glass-bar sticky top-0 z-20 flex items-center justify-between gap-2 rounded-b-2xl px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={exitSelect}
            className="text-[12px] text-muted hover:text-accent"
          >
            取消
          </button>
          <div className="text-[12px] text-ink">已选 {selected.size} 条</div>
          <button
            type="button"
            onClick={exportSelected}
            disabled={!selected.size || exporting}
            className="btn-primary rounded-full px-3 py-1 text-[12px] disabled:opacity-50"
          >
            {exporting ? '生成中…' : '生成长图'}
          </button>
        </div>
      ) : (
        <div className="glass-bar sticky top-0 z-20 flex items-center gap-2 rounded-b-2xl px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="对话列表"
              className="text-base text-muted hover:text-accent"
            >
              ☰
            </button>
          </div>
          <div className="min-w-0 max-w-[50%] text-center">
            <div className="headline truncate text-lg leading-none text-ink">{name}</div>
            <div className="mt-0.5 truncate text-[10px] text-muted">{active?.title ?? '新对话'}</div>
          </div>
          {/* 右侧：语音通话入口（开了语音输入才显示），同时给名字居中占位 */}
          <div className="flex min-w-0 flex-1 justify-end">
            {sttCfg.enabled && (
              <button
                type="button"
                onClick={() => {
                  spokenRef.current = ''
                  setCallMode(true)
                }}
                aria-label="语音通话"
                className="flex h-8 w-8 items-center justify-center rounded-full text-base text-muted hover:bg-white/40 hover:text-accent"
              >
                📞
              </button>
            )}
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="space-y-4 px-4 pb-2 pt-3">
        {messages.map((m) => {
          const me = m.role === 'me'
          const picked = selectMode && selected.has(m.id)

          // 任务卡：进行中的在右上角悬浮卡显示；完成/取消后落进对话成记录
          if (m.task) {
            const tk = m.task
            if (tk.status === 'active') return null
            const totalSec = tk.minutes * 60
            const startStr = new Date(tk.startedAt).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })
            const usedSec = tk.doneAt ? Math.round((tk.doneAt - tk.startedAt) / 1000) : 0
            const diffSec = tk.doneAt ? Math.round((tk.deadline - tk.doneAt) / 1000) : 0
            return (
              <div
                key={m.id}
                onClick={selectMode ? () => toggleSelect(m.id) : undefined}
                className={[
                  'flex',
                  selectMode ? 'cursor-pointer rounded-2xl p-1' : '',
                  picked ? 'bg-white/25 ring-2 ring-accent' : '',
                ].join(' ')}
              >
                <div className="glass w-full max-w-[88%] rounded-2xl p-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    指令
                  </div>
                  <div className="mt-1.5 text-[15px] leading-snug text-ink [overflow-wrap:anywhere]">
                    {tk.text}
                  </div>
                  {tk.status === 'done' ? (
                    <div className="mt-2 text-sm">
                      <span className="font-medium text-green-600">✓ 已完成</span>{' '}
                      <span className="text-muted">
                        用时 {mmss(usedSec)} · {diffSec >= 0 ? `提前 ${diffSec}″` : `超时 ${-diffSec}″`}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-muted">已取消</div>
                  )}
                  <div className="mt-2 text-[10px] text-muted">
                    {startStr} 起 · 限时 {mmss(totalSec)}
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div
              key={m.id}
              onClick={selectMode ? () => toggleSelect(m.id) : undefined}
              className={[
                flat ? 'flex flex-col' : 'flex items-start gap-2',
                !flat && me ? 'flex-row-reverse' : '',
                selectMode ? 'cursor-pointer rounded-2xl p-1' : '',
                picked ? 'bg-white/25 ring-2 ring-accent' : '',
              ].join(' ')}
            >
              {!flat && (
                <Avatar
                  img={me ? profile.avatarAImg : profile.avatarBImg}
                  emoji={me ? profile.avatarA : profile.avatarB}
                  className="h-7 w-7 shrink-0 rounded-full bg-white/50 text-sm"
                  textCls="text-sm"
                />
              )}
              <div
                className={
                  flat
                    ? `flex w-full min-w-0 flex-col ${me ? 'items-end' : ''}`
                    : `flex min-w-0 max-w-[78%] flex-col ${me ? 'items-end' : 'items-start'}`
                }
              >
                {flat && (
                  <div className={`mb-1 flex items-center gap-2 ${me ? 'flex-row-reverse' : ''}`}>
                    <Avatar
                      img={me ? profile.avatarAImg : profile.avatarBImg}
                      emoji={me ? profile.avatarA : profile.avatarB}
                      className="h-6 w-6 shrink-0 rounded-full bg-white/50 text-xs"
                      textCls="text-xs"
                    />
                    <span className="text-[12px] font-medium text-ink">
                      {me ? profile.nameA || '我' : name}
                    </span>
                  </div>
                )}
                {m.image && (
                  <img
                    src={m.image}
                    alt="图片"
                    onClick={() => {
                      if (!selectMode) setLightbox(m.image!)
                    }}
                    className="max-h-60 max-w-full cursor-pointer rounded-2xl object-cover"
                  />
                )}
                {m.file && (
                  <a
                    href={m.file.url}
                    download={m.file.name}
                    onClick={(e) => {
                      if (selectMode) e.preventDefault()
                    }}
                    className={`glass flex items-center gap-2 rounded-2xl px-3 py-2 ${m.image ? 'mt-1' : ''}`}
                  >
                    <span className="text-base">📄</span>
                    <span className="max-w-[180px] truncate text-[12px] text-ink">{m.file.name}</span>
                    <span className="text-[10px] text-muted">{humanSize(m.file.size)}</span>
                  </a>
                )}
                {editingId === m.id ? (
                  <div className="mt-1 w-[78vw] max-w-full">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      className="min-h-[72px] w-full rounded-2xl border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    />
                    <div className="mt-1 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId('')}
                        className="glass rounded-full px-3 py-1 text-[12px] text-ink"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(m.id)}
                        className="btn-primary rounded-full px-3 py-1 text-[12px]"
                      >
                        保存并重发
                      </button>
                    </div>
                  </div>
                ) : (
                  (m.text || (!me && (m.reasoning || streamingIds.has(m.id)))) && (
                    <div
                      className={[
                        'max-w-full overflow-hidden text-sm leading-relaxed [overflow-wrap:anywhere]',
                        m.image || m.file ? 'mt-1' : '',
                        flat
                          ? 'text-ink'
                          : me
                            ? 'btn-primary rounded-2xl rounded-br-md px-4 py-2.5'
                            : 'glass rounded-2xl rounded-bl-md px-4 py-2.5 text-ink',
                      ].join(' ')}
                    >
                      {!me && (m.reasoning || streamingIds.has(m.id)) && (() => {
                        const open = openReasoning.has(m.id)
                        const thinking = streamingIds.has(m.id) && m.thinkMs == null
                        const secs = thinking
                          ? Math.max(0, (nowTs - (thinkStartRef.current[m.id] ?? nowTs)) / 1000)
                          : m.thinkMs != null
                            ? m.thinkMs / 1000
                            : null
                        return (
                          <div className={m.text ? 'mb-2 border-b border-line/60 pb-2' : ''}>
                            <button
                              type="button"
                              onClick={() => toggleReasoning(m.id)}
                              className="flex w-full items-center gap-1.5 text-[11px] text-muted"
                            >
                              <span className={thinking ? 'animate-pulse' : ''}>💭</span>
                              <span>
                                {thinking ? '深度思考中' : '深度思考'}
                                {secs != null ? ` (${secs.toFixed(1)}s)` : ''}
                              </span>
                              <span className="ml-auto">{open ? '⌃' : '⌄'}</span>
                            </button>
                            <div className={`bw-collapse ${open ? 'open' : ''}`}>
                              <div>
                                <div
                                  ref={(el) => {
                                    if (el && streamingIds.has(m.id)) el.scrollTop = el.scrollHeight
                                  }}
                                  className="mt-1 max-h-44 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-muted [overflow-wrap:anywhere]"
                                >
                                  {m.reasoning}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      {m.text && <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{renderRichText(showLinks ? m.text : stripLinks(m.text))}</div>}
                    </div>
                  )
                )}

                {!selectMode && editingId !== m.id && !streamingIds.has(m.id) && (
                  <div className="mt-2 flex flex-wrap items-center gap-3.5 px-1 text-muted">
                    <span className="text-[10px]">{m.at}</span>
                    {!me && ttsEnabled && m.text.trim() && (
                      <button
                        type="button"
                        onClick={() => play(m.id, m.text)}
                        aria-label="朗读"
                        className="hover:text-accent disabled:opacity-50"
                      >
                        {loadingId === m.id ? (
                          <span className="text-[12px]">⏳</span>
                        ) : playingId === m.id ? (
                          <StopIcon />
                        ) : (
                          <SpeakerIcon />
                        )}
                      </button>
                    )}
                    {m.text.trim() && (
                      <button
                        type="button"
                        onClick={() => copyText(m.id, m.text)}
                        aria-label="复制"
                        className="hover:text-accent"
                      >
                        {copiedId === m.id ? <span className="text-[11px]">已复制</span> : <CopyIcon />}
                      </button>
                    )}
                    {me && m.text.trim() && (
                      <button type="button" onClick={() => startEdit(m)} aria-label="编辑" className="hover:text-accent">
                        <EditIcon />
                      </button>
                    )}
                    {!me && (
                      <button type="button" onClick={() => regenerate(m.id)} aria-label="重新生成" className="hover:text-accent">
                        <RegenIcon />
                      </button>
                    )}
                    {!me && m.tokens != null && (
                      <span className="text-[10px]">{m.tokens.toLocaleString()} tokens</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {((sending && streamingIds.size === 0) || generating) && (
          <div className="flex items-start gap-2">
            <Avatar
              img={profile.avatarBImg}
              emoji={profile.avatarB}
              className="h-7 w-7 shrink-0 rounded-full bg-white/50 text-sm"
              textCls="text-sm"
            />
            <div className="glass flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-muted">
              <span>{name} {generating ? '正在画' : persona.reasoning ? '思考中' : '正在输入'}</span>
              <span className="flex gap-0.5">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: '0ms' }} />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: '200ms' }} />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: '400ms' }} />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
        </div>
      </div>

      {/* 进行中的任务：固定在右上角的小窗 */}
      {!selectMode && messages.some((m) => m.task?.status === 'active') && (
        <div
          className="absolute right-2 z-20 w-52 max-w-[64%] space-y-2"
          style={{ top: 'calc(env(safe-area-inset-top) + 3.4rem)' }}
        >
          {messages
            .filter((m) => m.task?.status === 'active')
            .map((m) => {
              const tk = m.task!
              const remain = Math.max(0, tk.deadline - nowTs)
              const over = remain <= 0
              const pct = Math.max(0, Math.min(100, (remain / (tk.minutes * 60000)) * 100))
              return (
                <div key={m.id} className="glass-strong rounded-2xl p-2.5 shadow-lg">
                  <div className="flex items-center gap-1 text-[10px] text-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    指令
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink [overflow-wrap:anywhere]">
                    {tk.text}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1">
                    <span className="headline text-xl not-italic text-ink">
                      {over ? '时间到' : mmss(Math.ceil(remain / 1000))}
                    </span>
                    {!over && <span className="text-[10px] text-muted">还剩</span>}
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/40">
                    <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => completeTask(m.id)}
                      className="btn-primary flex-1 rounded-lg py-1 text-[12px]"
                    >
                      完成
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelTask(m.id)}
                      className="glass rounded-lg px-2.5 py-1 text-[12px] text-ink"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* 回顶部 / 回底部 悬浮按钮（平时隐藏，滚动时淡入） */}
      {!selectMode && (
        <div
          className={[
            'pointer-events-none absolute bottom-24 right-3 z-10 flex flex-col gap-1.5 transition-opacity duration-300',
            showScrollBtns ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="回到顶部"
            className={[
              'glass-strong flex h-9 w-9 items-center justify-center rounded-full text-sm text-ink',
              showScrollBtns ? 'pointer-events-auto' : 'pointer-events-none',
            ].join(' ')}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() =>
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth',
              })
            }
            aria-label="回到底部"
            className={[
              'glass-strong flex h-9 w-9 items-center justify-center rounded-full text-sm text-ink',
              showScrollBtns ? 'pointer-events-auto' : 'pointer-events-none',
            ].join(' ')}
          >
            ↓
          </button>
        </div>
      )}

      {/* 选择模式底部提示 */}
      {selectMode && (
        <div className="flex-none px-4 pt-2 pb-1 text-center text-[11px] text-muted">
          点选要导出的消息，再点右上「生成长图」
        </div>
      )}

      {/* 输入栏 + 模型条（钉在底部，不滚） */}
      {!selectMode && (
      <div className="relative z-10 flex-none px-4 pt-2">
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
        <div className="relative">
          {/* ＋ 菜单 */}
          {plusOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setPlusOpen(false)}
              />
              <div className="glass-strong absolute bottom-16 left-2 z-20 w-36 overflow-hidden rounded-2xl p-1 text-sm text-ink">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  <ImageIcon className="h-4 w-4 shrink-0 text-accent" />
                  图片
                </button>
                <button
                  type="button"
                  onClick={() => docRef.current?.click()}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  <FileIcon className="h-4 w-4 shrink-0 text-accent" />
                  文件
                </button>
                <button
                  type="button"
                  onClick={genImage}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  <ImageSparkIcon className="h-4 w-4 shrink-0 text-accent" />
                  生成图片
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlusOpen(false)
                    setSelectMode(true)
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  <CropIcon className="h-4 w-4 shrink-0 text-accent" />
                  截图
                </button>
                <button
                  type="button"
                  onClick={compress}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  <CompressIcon className="h-4 w-4 shrink-0 text-accent" />
                  压缩对话
                </button>
              </div>
            </>
          )}
          {/* 上面输入、下面 ＋ 和模型 pill、右侧发送 */}
          <div className="glass-strong flex flex-col gap-1.5 rounded-3xl px-3 py-2">
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => {
                // 点输入框/弹键盘时，滚到最新消息，避免被键盘遮住
                setTimeout(
                  () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
                  300,
                )
              }}
              onKeyDown={(e) => {
                // 手机：回车键=换行（用发送按钮发）；桌面：回车发送、Shift+回车换行
                if (e.key === 'Enter' && !e.shiftKey && !isTouch) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={`say something to ${name}…`}
              className="headline min-h-[24px] max-h-[120px] w-full resize-none bg-transparent px-1 py-0.5 text-sm not-italic leading-snug text-ink outline-none placeholder:italic placeholder:text-muted"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPlusOpen((o) => !o)}
                aria-label="添加"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl text-muted hover:bg-white/40 hover:text-ink"
              >
                ＋
              </button>
              {/* 模型 pill：直接点击切换（去掉了后面的小箭头） */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setModelOpen((o) => !o)}
                  className="block max-w-[160px] truncate rounded-full bg-white/50 px-3 py-1 text-[11px] text-muted hover:text-ink"
                >
                  {modelLabel}
                </button>
                {modelOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setModelOpen(false)} />
                    <div className="glass-strong absolute bottom-full left-0 z-20 mb-2 w-60 max-w-[72vw] rounded-2xl p-3 text-left shadow-lg">
                      <div className="text-[10px] text-muted">当前模型</div>
                      <div className="mt-1 break-all text-[12px] text-ink">{modelLabel}</div>
                      <Link
                        to="/settings/api"
                        onClick={() => setModelOpen(false)}
                        className="mt-2 block text-[11px] text-accent"
                      >
                        在 API 设置里切换 →
                      </Link>
                    </div>
                  </>
                )}
              </div>
              <div className="flex-1" />
              {sttCfg.enabled && (
                <button
                  type="button"
                  onClick={() => (recording ? stopRec() : startRec())}
                  disabled={transcribing}
                  aria-label={recording ? '停止录音' : '语音输入'}
                  className={[
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base disabled:opacity-50',
                    recording
                      ? 'animate-pulse bg-red-500/80 text-white'
                      : 'text-muted hover:bg-white/40 hover:text-ink',
                  ].join(' ')}
                >
                  {transcribing ? '⏳' : recording ? '⏹' : '🎤'}
                </button>
              )}
              <button
                type="button"
                onClick={() => send()}
                disabled={sending}
                aria-label="发送"
                className="btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
              >
                <SendIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* 实时语音通话（像打电话）：说话→转文字自动发→回复自动念 */}
      {callMode && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-[var(--bg-from)] to-[var(--bg-to)] px-6 pb-12 pt-[max(3rem,env(safe-area-inset-top))]">
          <div className="text-center">
            <div className="headline text-2xl text-ink">{name}</div>
            <div className="mt-1 text-[12px] text-muted">语音通话中</div>
          </div>

          <div className="flex flex-col items-center gap-5">
            <div
              className={[
                'flex h-32 w-32 items-center justify-center rounded-full',
                playingId || loadingId ? 'animate-pulse ring-4 ring-accent/40' : '',
              ].join(' ')}
            >
              <Avatar
                img={profile.avatarBImg}
                emoji={profile.avatarB}
                className="h-28 w-28 rounded-full bg-white/50 text-5xl"
                textCls="text-5xl"
              />
            </div>
            <div className="min-h-[1.5rem] text-center text-sm text-ink">
              {recording
                ? '在听你说…（点一下结束）'
                : transcribing
                  ? '识别中…'
                  : sending || streamingIds.size > 0
                    ? `${name} 思考中…`
                    : playingId || loadingId
                      ? `${name} 正在说…`
                      : '点麦克风，跟我说话'}
            </div>
            {!ttsEnabled && (
              <div className="px-6 text-center text-[11px] text-amber-600">
                还没开「语音朗读」，回复不会念出来。去 设置→语音朗读 打开～
              </div>
            )}
            {ttsError && <div className="px-6 text-center text-[11px] text-red-500">朗读失败：{ttsError}</div>}
          </div>

          <div className="flex items-center gap-10">
            {/* 麦克风：点说话 / 再点结束 */}
            <button
              type="button"
              onClick={() => (recording ? stopRec() : startRec())}
              disabled={transcribing}
              aria-label={recording ? '结束说话' : '开始说话'}
              className={[
                'flex h-16 w-16 items-center justify-center rounded-full text-2xl shadow-lg disabled:opacity-50',
                recording ? 'animate-pulse bg-red-500 text-white' : 'btn-primary',
              ].join(' ')}
            >
              {transcribing ? '⏳' : recording ? '⏹' : '🎤'}
            </button>
            {/* 挂断 */}
            <button
              type="button"
              onClick={() => {
                if (recording) mediaRecRef.current?.stop()
                stopTts()
                setCallMode(false)
              }}
              aria-label="挂断"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-2xl text-white shadow-lg"
            >
              📵
            </button>
          </div>
        </div>
      )}

      {/* 图片大图预览（长图导出后也走这里，iOS 长按可存相册） */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
          onClick={() => setLightbox('')}
        >
          <img src={lightbox} alt="大图" className="max-h-[85%] max-w-full rounded-xl" />
          <span className="text-[12px] text-white/80">长按图片可保存到相册 · 点击空白关闭</span>
        </div>
      )}

      {/* 会话侧栏（多对话窗口） */}
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
            <div className="flex items-center justify-end px-1">
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
                      className="px-1.5 text-lg leading-none text-muted hover:text-accent"
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
                      className="px-1.5 text-lg leading-none text-muted hover:text-accent"
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

      {/* 离屏导出容器：把选中消息渲染成长图（html2canvas 截这里） */}
      <div className="pointer-events-none fixed left-[-99999px] top-0" aria-hidden>
        <div
          ref={exportRef}
          style={{
            width: 380,
            padding: 20,
            background: 'var(--bg-to)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div className="headline text-center text-base text-accent">BW ♡ {name}</div>
          {selectedMsgs.map((m) => {
            const me = m.role === 'me'
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  gap: 8,
                  flexDirection: me ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                }}
              >
                <Avatar
                  img={me ? profile.avatarAImg : profile.avatarBImg}
                  emoji={me ? profile.avatarA : profile.avatarB}
                  className="h-7 w-7 shrink-0 rounded-full text-sm"
                  textCls="text-sm"
                  style={{ background: 'rgba(255,255,255,0.6)' }}
                />
                <div style={{ maxWidth: 280, display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start' }}>
                  {m.image && (
                    <img src={m.image} alt="" style={{ maxWidth: 240, borderRadius: 14 }} />
                  )}
                  {m.file && (
                    <div className="glass" style={{ borderRadius: 14, padding: '6px 10px', fontSize: 12, marginTop: m.image ? 4 : 0 }}>
                      📄 {m.file.name}
                    </div>
                  )}
                  {m.text && (
                    <div
                      className={me ? 'btn-primary' : 'glass text-ink'}
                      style={{
                        borderRadius: 16,
                        padding: '8px 14px',
                        fontSize: 14,
                        lineHeight: 1.6,
                        marginTop: m.image || m.file ? 4 : 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {m.text}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
