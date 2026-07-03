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
import { parseTasks } from '@/store/taskStore'
import { cleanReply } from '@/lib/cleanReply'
import { chatComplete } from '@/api/llm'
import { sendChat, type ChatApiMessage } from '@/api/chat'
import { fileToDataUrl } from '@/lib/image'
import { useImgSrc } from '@/lib/useImgSrc'
import IdbImg from '@/components/ui/IdbImg'
import { putImgRef, resolveImgRef } from '@/lib/imgRef'
import Avatar from '@/components/ui/Avatar'

function newId() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `pm-${Date.now()}-${Math.random()}`
}
/** hex(#rgb/#rrggbb) → rgba，给气泡上半透明色（透视感） */
function hexToRgba(hex: string, a: number): string {
  let h = (hex || '').replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6) return `rgba(140,140,148,${a})`
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
const ME_COLOR_DEFAULT = '#d98caa'
const TA_COLOR_DEFAULT = '#86868c'
/** 按气泡底色亮度自动选字色：浅底用深字、深底用白字（避免浅粉上白字发虚） */
function textOn(hex: string): 'text-white' | 'text-ink' {
  let h = (hex || '').replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6) return 'text-ink'
  const n = parseInt(h, 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? 'text-ink' : 'text-white'
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

/** 共用记忆库：概述 + 所有标星★ + 最近 15 条，注入到 TA 的 system（与主聊天/读书一致，省 token） */
function memoryNote(): string {
  const mem = useMemoryStore.getState()
  const starred = mem.memories.filter((m) => m.starred)
  const recent = mem.memories.filter((m) => !m.starred).slice(0, 15)
  const picked = [...starred, ...recent]
  const lines = picked.map((m) => `· ${m.title ? `${m.title}：` : ''}${m.content}`).join('\n')
  let note = ''
  if (mem.overview?.trim()) note += `\n\n【你们的记忆概览】\n${mem.overview.trim()}`
  if (lines) note += `\n\n【长期记忆（请当作你真实记得的事，自然运用，别生硬复述）】\n${lines}`
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
  const bgImgSrc = useImgSrc(persona.bgImg)
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
  const meBg = hexToRgba(persona.meColor || ME_COLOR_DEFAULT, 0.82)
  const taBg = hexToRgba(persona.taColor || TA_COLOR_DEFAULT, 0.16)
  const meText = textOn(persona.meColor || ME_COLOR_DEFAULT)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [err, setErr] = useState('')
  const [pendingImage, setPendingImage] = useState('')
  const [lightbox, setLightbox] = useState('')
  const [stickerOpen, setStickerOpen] = useState(false)
  const [nowTs, setNowTs] = useState(Date.now())
  const [memToast, setMemToast] = useState('')
  const memToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showMemToast(msg: string) {
    setMemToast(msg)
    if (memToastTimer.current) clearTimeout(memToastTimer.current)
    memToastTimer.current = setTimeout(() => setMemToast(''), 2600)
  }
  const stickers = useStickerStore((s) => s.stickers)
  const addSticker = useStickerStore((s) => s.add)
  const removeSticker = useStickerStore((s) => s.remove)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const picRef = useRef<HTMLInputElement>(null)
  const stickerFileRef = useRef<HTMLInputElement>(null)
  const bgFileRef = useRef<HTMLInputElement>(null)
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

  // 有进行中的指令卡时每秒刷新倒计时；切回前台立刻按本地真实时间同步
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
  async function pickBg(file: File) {
    setErr('')
    try {
      setPersona({ bgImg: await fileToDataUrl(file, 1280, 0.82) })
    } catch (e) {
      setErr((e as Error).message)
    }
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
    const mid = newId()
    const mine: PhoneMsg = {
      id: mid,
      role: 'me',
      text,
      at: now(),
      // 图片本体进 IndexedDB，消息里只存引用（别撑爆 localStorage）
      ...(pendingImage ? { image: putImgRef('pimg', mid, pendingImage) } : {}),
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
      .map((m) => `${m.role === 'me' ? userName : name}：${m.text}`)
      .join('\n')
    const sys = '你是记忆管理助手，只输出 JSON，不要任何多余文字。'
    const ask =
      `判断下面对话里有没有【真正值得长期记住】的重要信息：${userName} 或角色的人物设定、重要背景、关键事实、长期偏好、郑重承诺、重大事件等。` +
      `⚠️ 极高门槛、宁缺毋滥：日常闲聊、寒暄、一时情绪、临时小事、普通互动一律【不要记】；只有那种特别、有长期意义、以后还想被记得的事才记。多数情况下应返回空。` +
      (force ? ` ${userName} 已明确要求记住，请务必提取其指向的内容。` : '') +
      `\n记忆内容里称呼她就用「${userName}」，不要写「用户」。` +
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
      if (added > 0) showMemToast(`🧠 已记到记忆库（${added} 条）`)
    } catch {
      // 静默失败，不打扰对话
    }
  }

  async function respond(history: PhoneMsg[]) {
    // idb: 图片引用先解析回 dataURL（喂 vision 用）
    const resolvedImgs = new Map<string, string>()
    await Promise.all(
      history
        .filter((m) => m.image && m.image.startsWith('idb:'))
        .map(async (m) => resolvedImgs.set(m.id, await resolveImgRef(m.image!))),
    )
    const apiMsgs: ChatApiMessage[] = history
      .filter((m) => m.text.trim() || m.image || m.sticker || m.task)
      .map((m) => {
        const role = m.role === 'me' ? ('user' as const) : ('assistant' as const)
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
        if (m.image) {
          const imgUrl = m.image.startsWith('idb:') ? resolvedImgs.get(m.id) || '' : m.image
          if (!imgUrl) return { role, content: m.text.trim() || '［图片］' }
          const parts: Exclude<ChatApiMessage['content'], string> = []
          if (m.text.trim()) parts.push({ type: 'text', text: m.text.trim() })
          parts.push({ type: 'image_url', image_url: { url: imgUrl } })
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
      `不要写长段落，不要括号里的动作/神态/旁白，表情符号适量就好。` +
      `⚠️ 只发你要对她说的话本身；绝不要输出你的思考过程、计划、自我提示、英文标签或任何代码/XML 标记。`
    const stickerNames = stickers.map((s) => s.name).filter(Boolean)
    const stickerNote = stickerNames.length
      ? `\n\n【表情贴纸 · 可选】聊到合适的时候你可以发一个表情贴纸表达情绪——发贴纸【必须】在回复里【单独一行】输出严格格式 [[sticker|名字]]（名字只能从这个清单里选：${stickerNames.join('、')}）。⚠️ 绝不要用文字描述自己在发表情（比如不要直接写「(发了一个表情贴纸：xx)」），那样不会显示成贴纸。别每条都发，偶尔点缀就好。`
      : ''
    const taskNote = persona.allowTasks
      ? `\n\n【倒计时指令卡 · 可选】你可以给 ${userName} 下带倒计时的小任务来关心/督促她（喝水、起身、早点睡、按时吃饭等）。用法：回复最后【另起一行】输出 [[task|分钟数|任务内容]]，例如 [[task|2|去倒杯温水喝]]。她屏幕上会出现一张倒计时卡，她点完成/取消后系统会以她的口吻告诉你结果，你据此自然回应。⚠️ 分寸：绝大多数回复都不要下任务，只在真有必要时下，别刷屏，一次最多一个。`
      : ''
    const localTime = new Date().toLocaleString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
    const system = `${base}${texting}${memoryNote()}${stickerNote}${taskNote}\n\n（当前时间：${localTime}，可自然参考。）`

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
      // 清掉思考/工具调用模型漏出来的标签（<think>/<arg_value> 等）
      reply = cleanReply(reply)
      // 解析 TA 下的倒计时指令卡 [[task|分钟|内容]]
      const taskMsgs: PhoneMsg[] = []
      if (persona.allowTasks && reply) {
        const { tasks: parsed, clean } = parseTasks(reply)
        if (parsed.length) {
          reply = clean
          for (const t of parsed) {
            const mins = Math.max(1, Math.min(180, Math.round(t.minutes) || 5))
            const startedAt = Date.now()
            taskMsgs.push({
              id: newId(),
              role: 'ta',
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
      // 解析 TA 挑的表情贴纸 [[sticker|名字]]，从正文移除标记
      const picked: string[] = []
      reply = reply.replace(/\[\[sticker\|([^\]|]+)\]\]/g, (_m, n) => {
        picked.push(String(n).trim())
        return '\n'
      })
      // 兜底：有的模型会照搬「（发了一个表情贴纸：X）」当文字，也转成真贴纸
      reply = reply.replace(
        /[（(]\s*发了?[一]?[张个]?表情贴纸[:：]\s*([^）)]+?)\s*[）)]/g,
        (_m, n) => {
          picked.push(String(n).trim())
          return '\n'
        },
      )
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
      const emptyFallback = stickerMsgs.length || taskMsgs.length ? [] : ['……']
      const taMsgs: PhoneMsg[] = (bubbles.length ? bubbles : emptyFallback).map((t) => ({
        id: newId(),
        role: 'ta' as const,
        text: t,
        at: now(),
      }))
      setMessages((p) => [...p, ...taMsgs, ...stickerMsgs, ...taskMsgs])
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
      {/* 小手机背景：自定义图优先（铺满+柔白让消息清楚）；否则在主题背景上盖柔白，像一块手机屏 */}
      {bgImgSrc ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center"
            style={{ backgroundImage: `url(${bgImgSrc})` }}
          />
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              background: 'rgba(255, 255, 255, 0.28)',
            }}
          />
        </>
      ) : (
        <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: 'rgba(255,255,255,0.5)' }} />
      )}

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
        <input
          ref={bgFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) pickBg(f)
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
                  onClick={() => setPersona({ allowTasks: !persona.allowTasks })}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  <span>允许下倒计时任务</span>
                  <span className={persona.allowTasks ? 'text-accent' : 'text-muted'}>
                    {persona.allowTasks ? '开' : '关'}
                  </span>
                </button>
                <div className="flex items-center justify-between rounded-xl px-3 py-2">
                  <span>我的气泡颜色</span>
                  <input
                    type="color"
                    value={persona.meColor || ME_COLOR_DEFAULT}
                    onChange={(e) => setPersona({ meColor: e.target.value })}
                    className="h-6 w-9 rounded border-0 bg-transparent p-0"
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl px-3 py-2">
                  <span>TA 气泡颜色</span>
                  <input
                    type="color"
                    value={persona.taColor || TA_COLOR_DEFAULT}
                    onChange={(e) => setPersona({ taColor: e.target.value })}
                    className="h-6 w-9 rounded border-0 bg-transparent p-0"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    bgFileRef.current?.click()
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/40"
                >
                  更换聊天背景图
                </button>
                {persona.bgImg && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setPersona({ bgImg: undefined })
                    }}
                    className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/40"
                  >
                    恢复默认背景
                  </button>
                )}
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

      {/* 记忆提示（不进对话正文，飘一下就消失） */}
      {memToast && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center px-4">
          <div className="glass-strong rounded-full px-3.5 py-1.5 text-[12px] text-ink shadow">
            {memToast}
          </div>
        </div>
      )}

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
            // 进行中的指令卡在右上角悬浮显示；完成/取消后落进对话成记录
            if (m.task) {
              const tk = m.task
              if (tk.status === 'active') return null
              const usedSec = tk.doneAt ? Math.round((tk.doneAt - tk.startedAt) / 1000) : 0
              const diffSec = tk.doneAt ? Math.round((tk.deadline - tk.doneAt) / 1000) : 0
              return (
                <div key={m.id} className="flex">
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
                  </div>
                </div>
              )
            }
            // 连发多条只在「这一串的第一条」显示头像，其余用占位对齐（两边都有头像）
            const firstOfRun = i === 0 || messages[i - 1].role !== m.role || !!messages[i - 1].task
            const canSpeak = !me && ttsEnabled && m.text.trim()
            return (
              <div key={m.id} className={`flex items-end gap-2 ${me ? 'flex-row-reverse' : ''}`}>
                {firstOfRun ? (
                  <Avatar
                    img={me ? profile.avatarAImg : persona.avatarImg}
                    emoji={me ? profile.avatarA || '🙂' : persona.avatar}
                    className="h-7 w-7 flex-none rounded-full bg-white/60 text-sm"
                    textCls="text-sm"
                  />
                ) : (
                  <div className="h-7 w-7 flex-none" aria-hidden />
                )}
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
                    <IdbImg
                      src={m.image}
                      alt="图片"
                      onClick={() => void resolveImgRef(m.image!).then((u) => u && setLightbox(u))}
                      className="max-h-56 max-w-full cursor-pointer rounded-2xl object-cover"
                    />
                  )}
                  {m.text.trim() && (
                    <div
                      onClick={canSpeak ? () => play(m.id, m.text) : undefined}
                      className={[
                        'max-w-full whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed shadow-sm [overflow-wrap:anywhere]',
                        me ? `rounded-br-md ${meText}` : 'rounded-bl-md text-ink',
                        canSpeak ? 'cursor-pointer' : '',
                      ].join(' ')}
                      style={{
                        background: me ? meBg : taBg,
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                      }}
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
                style={{ background: taBg }}
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

      {/* 进行中的指令卡：固定右上角小窗 */}
      {messages.some((m) => m.task?.status === 'active') && (
        <div
          className="absolute right-2 z-20 w-52 max-w-[64%] space-y-2"
          style={{ top: 'calc(env(safe-area-inset-top) + 3.8rem)' }}
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
