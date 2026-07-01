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
import { buildLoreText } from '@/lib/charCard'
import { DramaRich } from '@/lib/dramaRich'
import { applyMacros } from '@/lib/macros'
import { applyRegexScripts } from '@/lib/regexScript'
import { useCharLibStore } from '@/store/charLibStore'
import { useSttStore } from '@/store/sttStore'
import { transcribe } from '@/api/stt'
import { useTtsStore } from '@/store/ttsStore'
import { useTtsPlayback } from '@/lib/useTtsPlayback'
import Avatar from '@/components/ui/Avatar'
import BackBar from '@/components/layout/BackBar'
import DramaBg from '@/components/ui/DramaBg'
import { GearIcon } from '@/components/ui/navIcons'
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
  const addLore = useDramaStore((s) => s.addLore)
  const updateLoreEntry = useDramaStore((s) => s.updateLoreEntry)
  const removeLoreEntry = useDramaStore((s) => s.removeLoreEntry)
  const libChars = useCharLibStore((s) => s.chars)
  const setMessages = useDramaStore((s) => s.setMessages)
  const setSummary = useDramaStore((s) => s.setSummary)
  const setSummaryAt = useDramaStore((s) => s.setSummaryAt)
  const setSceneAuto = useDramaStore((s) => s.setSceneAuto)
  const setWorld = useDramaStore((s) => s.setWorld)
  const flat = useDramaStore((s) => s.flat)
  const setFlat = useDramaStore((s) => s.setFlat)
  const autoSummary = useDramaStore((s) => s.autoSummary)
  const autoSummaryEvery = useDramaStore((s) => s.autoSummaryEvery)
  const setAutoSummary = useDramaStore((s) => s.setAutoSummary)
  const setAutoSummaryEvery = useDramaStore((s) => s.setAutoSummaryEvery)
  const autoCharMemory = useDramaStore((s) => s.autoCharMemory)
  const setAutoCharMemory = useDramaStore((s) => s.setAutoCharMemory)

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
  const [loreOpen, setLoreOpen] = useState(false) // 世界书 折叠/展开
  const [regexOpen, setRegexOpen] = useState(false) // 正则 折叠/展开
  const [addMemberOpen, setAddMemberOpen] = useState(false) // 从角色库加成员
  const [greetPick, setGreetPick] = useState<{ char: DramaChar; list: string[] } | null>(null) // 多开场白选择
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
  const [memBusyId, setMemBusyId] = useState('') // 正在生成私人记忆的角色 id
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const charMemTurnRef = useRef<Record<string, number>>({}) // 各角色距上次私人记忆更新的发言数

  const messages = scene?.messages ?? []
  useEffect(() => {
    scrollToEnd() // 多次补滚到真底部，避免发完消息悬在半空
  }, [messages.length, busyChar])

  // 输入框自适应高度（随内容增高，最高 120px）
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(120, el.scrollHeight) + 'px'
  }, [draft])

  // 自动更新剧情摘要：累计未并入摘要的新消息够 N 条就后台增量刷新。
  // 基于持久化的 summaryAt 计数（退出/刷新都不丢），并跳过刚进入时的误触发。
  const prevLenRef = useRef<number | null>(null)
  useEffect(() => {
    const len = scene?.messages.length ?? 0
    if (prevLenRef.current === null) {
      prevLenRef.current = len
      return // 首次挂载不触发，避免一进剧场就烧 token
    }
    const grew = len > prevLenRef.current
    prevLenRef.current = len
    if (!grew || !autoSummary || summaryBusy || busyChar) return
    if (len - (scene?.summaryAt ?? 0) >= autoSummaryEvery) void genSummary(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.messages.length, autoSummary, autoSummaryEvery, summaryBusy, busyChar])

  /** 滚到最新消息底部。键盘弹出有动画 + 视口缩放，分几次补滚才稳。 */
  function scrollToEnd() {
    const jump = () => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
    requestAnimationFrame(jump)
    ;[120, 300, 500].forEach((t) => setTimeout(jump, t))
  }

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
  // 发完自动回复：1v1 默认开；老对话/群聊可在 ⚙ 手动开
  const effectiveAuto = sc.auto ?? (aiChars.length === 1)
  /** 自动回复的对象：最近说话的 AI 角色，没有就第一个 AI */
  function autoTarget(): DramaChar | undefined {
    if (!aiChars.length) return undefined
    for (let i = sc.messages.length - 1; i >= 0; i--) {
      const c = charById(sc.messages[i].who)
      if (c && !c.isMe) return c
    }
    return aiChars[0]
  }
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

  /** 发送：@角色名＝让该角色接话；1v1 发完自动让那个 AI 回；群聊照旧 */
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
    const had = !!(t || pendingImage)
    sendMine()
    // 自动回复（1v1 默认开 / ⚙ 可手动开）：让最近说话的 AI 角色回
    if (had && effectiveAuto && !busyChar) {
      const tgt = autoTarget()
      if (tgt) void respond(tgt)
    }
  }

  /** 点 @ 弹层里的角色：清掉输入框里的 @词，直接让 TA 接话 */
  function pickAt(c: DramaChar) {
    setDraft((d) => d.replace(/@(\S*)$/, ''))
    void respond(c)
  }

  /** 让某角色用开场白出场。多个开场白时弹出来选一个。 */
  function openWith(char: DramaChar) {
    const list = (char.greetings && char.greetings.length ? char.greetings : char.greeting ? [char.greeting] : [])
      .map((g) => g.trim())
      .filter(Boolean)
    if (!list.length) {
      setErr(`${char.name} 还没填开场白`)
      return
    }
    if (list.length === 1) {
      addMessage(sc.id, { id: dramaMsgId(), who: char.id, text: list[0], at: now() })
      return
    }
    setGreetPick({ char, list })
  }
  /** 选定某条开场白发出 */
  function sendGreeting(char: DramaChar, text: string) {
    addMessage(sc.id, { id: dramaMsgId(), who: char.id, text, at: now() })
    setGreetPick(null)
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
      // 读「最新」消息（自动回复紧跟在用户发送之后，闭包里的 sc.messages 是旧的）
      const freshMsgs = useDramaStore.getState().scenes.find((s) => s.id === sc.id)?.messages ?? sc.messages
      const world = (sc.world || '').trim()
      // 世界书：按最近对话挑出常驻 + 命中关键词的条目注入（省 token）
      const loreHay = freshMsgs.slice(-24).map((m) => m.text).join('\n') + '\n' + (draft || '')
      const loreText = buildLoreText(sc.lore, loreHay)
      // 卡里用 {{user}}/{{char}} 的地方，喂模型前也替换成真实名字
      const mac = { user: meChar?.name, char: char.name }
      const sys = applyMacros(
        `你在一个多人角色扮演群聊里，只扮演角色【${char.name}】。\n` +
        (world ? `【世界观 / 背景设定（所有角色共同遵守）】\n${world}\n\n` : '') +
        (loreText ? `【世界书 · 相关设定】\n${loreText}\n\n` : '') +
        `【${char.name}的人设】\n${char.persona || '（未填，请贴合名字与剧情合理发挥）'}\n` +
        ((char.memory || '').trim() ? `\n【你（${char.name}）自己记得 / 在意的（第一人称私人记忆）】\n${(char.memory || '').trim()}\n` : '') +
        (others ? `\n群里其他人：${others}。\n` : '') +
        (sc.summary.trim() ? `\n【到目前为止的剧情摘要】\n${sc.summary.trim()}\n` : '') +
        `\n规则：只输出【${char.name}】这一条的发言/动作，第一人称、贴合人设与当前剧情、自然推进剧情；` +
        `这是角色扮演，可以有动作/神态/对话描写。不要替别人说话、不要写成剧本去标注别人的台词、不要复述以上摘要。简洁自然，别太长。` +
        `全程用中文叙述，不要夹杂其它语言，也不要在括号里给翻译或注释。`,
        mac,
      )

      const recent = freshMsgs.slice(-24)
      const transcript =
        recent.map((m) => `${nameOf(m.who)}：${m.text}${m.image ? '［图片］' : ''}`).join('\n') ||
        '（还没人说话，由你开场）'
      const textPart = applyMacros(`【最近对话】\n${transcript}\n\n请现在以【${char.name}】的身份回复下一句。`, mac)
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
      // 剧情摘要的自动更新已改由上面的 useEffect（基于持久化 summaryAt）统一触发，这里不再计数。
      // 该角色私人记忆自动更新（默认关）：每攒够 N 条「自己的」发言，后台增量刷新
      if (autoCharMemory) {
        charMemTurnRef.current[char.id] = (charMemTurnRef.current[char.id] || 0) + 1
        if (charMemTurnRef.current[char.id] >= autoSummaryEvery) {
          charMemTurnRef.current[char.id] = 0
          void genCharMemory(char, true)
        }
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
        if (silent) flashToast('🪄 剧情摘要已更新')
        else setRightOpen(true)
      }
    } catch (e) {
      if (!silent) setErr(`生成摘要失败：${(e as Error).message}`)
    } finally {
      setSummaryBusy(false)
    }
  }

  /** 生成/更新某角色的「私人记忆」（第一人称视角；silent=自动增量，省 token） */
  async function genCharMemory(char: DramaChar, silent = false) {
    if (char.isMe) return // 「我」不需要 AI 私人记忆
    if (memBusyId) return
    if (!summaryChannel && !workerUrl) {
      if (!silent) setErr('请先在「设置 → API / 模型」配置渠道')
      return
    }
    const msgs = sc.messages
    if (!msgs.length) {
      if (!silent) setErr('还没有对话可以回顾')
      return
    }
    if (!silent) { setErr(''); setMemBusyId(char.id) }
    try {
      const total = msgs.length
      const at = Math.min(char.memoryAt ?? 0, total)
      const old = (char.memory || '').trim()
      const incremental = silent && !!old && at < total
      const slice = incremental ? msgs.slice(at) : msgs
      const transcript = slice
        .map((m) => `${nameOf(m.who)}：${m.text}${m.image ? '［图片］' : ''}`)
        .join('\n')
      const sys =
        `你在为角色【${char.name}】整理 TA 的「私人记忆」。用 ${char.name} 的第一人称，` +
        `把对话提炼成 TA 自己的【认知与心理状态】，而不是复述剧情。要点（有则写、无则略）：` +
        `我和谁是什么关系、我怎么看 TA；我现在的处境、想做的事/目标；我的心结、在意的事、情绪；我做过/决定过的重要的事。\n` +
        `硬性要求：① 必须是概括性的自述句（例如「我开始相信她是真心的」「我决定不再逼她」），` +
        `严禁照抄或引用任何对白台词原句、动作神态旁白；② 只写 ${char.name} 立场上会知道的，别写 TA 不可能知道的；` +
        `③ 150~200 字，可分点，只输出记忆正文，不要标题、不要解释。`
      const ask = incremental
        ? `这是【${char.name}】已有的私人记忆：\n${old}\n\n下面是新发生的对话，请把 ${char.name} 新形成的认知/情绪/决定合并进去（第一人称概括，不要照抄台词），输出更新后的完整私人记忆：\n\n${transcript}`
        : `请根据下面这段对话，提炼出【${char.name}】此刻的私人记忆（按要求第一人称概括，不要照抄台词）${old ? '。已有旧记忆，请在其基础上更新合并、保留仍成立的部分：\n旧记忆：' + old : '：'}\n\n对话：\n${transcript}`
      let text = ''
      if (summaryChannel) {
        text = (
          await chatComplete(summaryChannel, [{ role: 'user', content: ask }], sys, {
            workerUrl,
            syncKey: config.syncKey,
            maxTokens: 700,
          })
        ).text.trim()
      } else {
        text = (
          await sendChat({
            workerUrl: workerUrl!,
            syncKey: config.syncKey,
            messages: [{ role: 'user', content: ask }],
            system: sys,
            maxTokens: 700,
          })
        ).trim()
      }
      if (text) updateChar(sc.id, char.id, { memory: cleanReply(text).trim(), memoryAt: total })
    } catch (e) {
      if (!silent) setErr(`生成 ${char.name} 记忆失败：${(e as Error).message}`)
    } finally {
      if (!silent) setMemBusyId('')
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

  /** 从角色库把一个角色加进当前对话（变群聊）+ 并入其世界书 */
  function addMemberFromLib(lcId: string) {
    const lc = libChars.find((c) => c.id === lcId)
    if (!lc) return
    addChar(sc.id, {
      name: lc.name,
      avatar: lc.avatar,
      avatarImg: lc.avatarImg,
      persona: lc.persona,
      greeting: lc.greeting,
      greetings: lc.greetings,
      color: lc.color,
      apiChannelId: lc.apiChannelId,
      regex: lc.regex,
    })
    if (lc.lore?.length) {
      addLore(sc.id, lc.lore.map((e) => ({ ...e, id: dramaMsgId() })))
    }
    setAddMemberOpen(false)
    flashToast(`已加入「${lc.name}」`)
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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/40 hover:text-accent"
        >
          <GearIcon className="h-5 w-5" />
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
              {!c.isMe && (
                <button
                  onClick={() => genCharMemory(c)}
                  disabled={!!memBusyId}
                  title="让 TA 回顾、更新私人记忆"
                  className="px-1.5 text-[13px] text-muted hover:text-accent disabled:opacity-50"
                >
                  {memBusyId === c.id ? '⏳' : '🧠'}
                </button>
              )}
              <button onClick={() => setEditing(c)} className="px-1.5 text-[13px] text-muted hover:text-accent">编辑</button>
              <button onClick={() => removeChar(sc.id, c.id)} className="px-1.5 text-[13px] text-muted hover:text-red-500">删</button>
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setEditing('new')} className="btn-primary flex-1 rounded-xl py-2 text-[13px]">
              ＋ 新角色卡
            </button>
            <button onClick={() => setAddMemberOpen(true)} className="glass flex-1 rounded-xl py-2 text-[13px] text-ink">
              ＋ 从角色库加成员
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted">
            建一张勾「这是我」的女主卡（你来发言）；其余是 AI 角色。想加现成角色就「从角色库加成员」；导入角色卡请到 角色库（戏剧首页 → 角色库）。
          </p>
        </div>
      )}

      {/* 右侧面板：Tavo 风格分板块行式 —— 外观 / 剧情·记忆 */}
      {rightOpen && (
        <div className="mb-2 space-y-2.5">
          {/* 外观 */}
          <div className="glass-strong rounded-2xl p-1.5">
            <div className="label px-2.5 pb-0.5 pt-1.5">外观</div>
            <div className="flex items-center justify-between rounded-xl px-2.5 py-2.5">
              <span className="text-sm text-ink">显示样式</span>
              <div className="flex gap-1.5">
                <button onClick={() => setFlat(false)} className={`rounded-full px-3 py-1 text-[12px] ${!flat ? 'btn-primary' : 'glass text-muted'}`}>气泡</button>
                <button onClick={() => setFlat(true)} className={`rounded-full px-3 py-1 text-[12px] ${flat ? 'btn-primary' : 'glass text-muted'}`}>平铺</button>
              </div>
            </div>
            <div className="mx-2.5 border-t border-line/40" />
            <button onClick={() => nav('/settings/appearance')} className="flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-left hover:bg-white/40">
              <span className="text-sm text-ink">背景图</span>
              <span className="text-[12px] text-muted">去设置换图 ›</span>
            </button>
            <div className="mx-2.5 border-t border-line/40" />
            <div className="flex items-center justify-between rounded-xl px-2.5 py-2.5">
              <span className="text-sm text-ink">发完自动回复</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" checked={effectiveAuto} onChange={(e) => setSceneAuto(sc.id, e.target.checked)} className="peer sr-only" />
                <span className="h-5 w-9 rounded-full bg-black/15 transition peer-checked:bg-accent" />
                <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
              </label>
            </div>
            <p className="px-2.5 pb-1 text-[10px] leading-relaxed text-muted">
              开＝你发完，最近说话的 AI 角色自动回（1v1 默认开）；关＝群聊用「@角色」点名。
            </p>
          </div>

          {/* 剧情 · 记忆 */}
          <div className="glass-strong rounded-2xl p-1.5">
            <div className="label px-2.5 pb-0.5 pt-1.5">剧情 · 记忆</div>

            {/* 世界观 */}
            <button onClick={() => setWorldOpen((o) => !o)} className="flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-left hover:bg-white/40">
              <span className="text-sm text-ink">世界观 · 背景</span>
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                {(sc.world || '').trim() ? '已填' : '未填'}
                <span>{worldOpen ? '▴' : '›'}</span>
              </span>
            </button>
            {worldOpen && (
              <div className="px-2.5 pb-2.5">
                <textarea
                  value={sc.world || ''}
                  onChange={(e) => setWorld(sc.id, e.target.value)}
                  rows={5}
                  placeholder="整体世界观、背景、人物关系…"
                  className="w-full resize-none rounded-xl border border-line bg-white/40 px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus:border-accent"
                />
                <p className="mt-1 text-[10px] text-muted">注入给本剧场所有角色，统一认知。</p>
              </div>
            )}
            <div className="mx-2.5 border-t border-line/40" />

            {/* 剧情摘要 */}
            <button onClick={() => setSummaryOpen((o) => !o)} className="flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-left hover:bg-white/40">
              <span className="text-sm text-ink">剧情摘要</span>
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                {sc.summary.trim() ? '已有' : '空'}
                <span>{summaryOpen ? '▴' : '›'}</span>
              </span>
            </button>
            {summaryOpen && (
              <div className="space-y-2 px-2.5 pb-2.5">
                <div className="flex justify-end">
                  <button onClick={() => genSummary()} disabled={summaryBusy} className="text-[12px] text-accent disabled:opacity-50">
                    {summaryBusy ? '处理中…' : '✨ 让 AI 更新'}
                  </button>
                </div>
                <textarea
                  value={sc.summary}
                  onChange={(e) => setSummary(sc.id, e.target.value)}
                  rows={6}
                  placeholder="点「✨ 让 AI 更新」整理，或手写。会注入给角色，防止跑久了忘剧情。"
                  className="w-full resize-none rounded-xl border border-line bg-white/40 px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus:border-accent"
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted">
                  <label className="flex items-center gap-1.5 text-ink">
                    <input type="checkbox" checked={autoSummary} onChange={(e) => setAutoSummary(e.target.checked)} className="h-3.5 w-3.5 accent-accent" />
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
                <p className="text-[10px] leading-relaxed text-muted">
                  自动更新走「增量」——只读上次之后的新对话合并，省 token；保留人物/关系/关键剧情/悬念，帮角色不忘、不跑偏。
                </p>
              </div>
            )}
            <div className="mx-2.5 border-t border-line/40" />

            {/* 各角色私人记忆 */}
            <div className="flex items-center justify-between rounded-xl px-2.5 py-2.5">
              <span className="text-sm text-ink">各角色私人记忆</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" checked={autoCharMemory} onChange={(e) => setAutoCharMemory(e.target.checked)} className="peer sr-only" />
                <span className="h-5 w-9 rounded-full bg-black/15 transition peer-checked:bg-accent" />
                <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
              </label>
            </div>
            <p className="px-2.5 pb-1.5 text-[10px] leading-relaxed text-muted">
              每个 AI 角色以第一人称记着自己在意的事，只在 TA 接话时注入，更像自己、不串味。开＝按上面频率给刚发言角色增量更新（走记忆模型）；不开就到 ☰ 角色列表点 🧠 手动回顾。
            </p>
            <div className="mx-2.5 border-t border-line/40" />

            {/* 世界书 */}
            <button onClick={() => setLoreOpen((o) => !o)} className="flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-left hover:bg-white/40">
              <span className="text-sm text-ink">世界书</span>
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                {(sc.lore?.length ?? 0) > 0 ? `${sc.lore!.filter((e) => e.enabled).length}/${sc.lore!.length} 条` : '空'}
                <span>{loreOpen ? '▴' : '›'}</span>
              </span>
            </button>
            {loreOpen && (
              <div className="space-y-1.5 px-2.5 pb-2">
                {(sc.lore?.length ?? 0) === 0 ? (
                  <p className="text-[11px] text-muted">还没有世界书。导入角色卡（PNG/JSON）时会自动带进来。</p>
                ) : (
                  sc.lore!.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 rounded-xl bg-white/40 px-2.5 py-1.5">
                      <span className="shrink-0 text-[11px]">{e.constant ? '📌' : '🔑'}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{e.name}</span>
                      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                        <input type="checkbox" checked={e.enabled} onChange={(ev) => updateLoreEntry(sc.id, e.id, { enabled: ev.target.checked })} className="peer sr-only" />
                        <span className="h-4 w-7 rounded-full bg-black/15 transition peer-checked:bg-accent" />
                        <span className="absolute left-0.5 h-3 w-3 rounded-full bg-white shadow transition peer-checked:translate-x-3" />
                      </label>
                      <button onClick={() => removeLoreEntry(sc.id, e.id)} className="shrink-0 px-1 text-[13px] text-muted hover:text-red-500">✕</button>
                    </div>
                  ))
                )}
                <p className="text-[10px] leading-relaxed text-muted">📌常驻＝每次都注入；🔑关键词＝对话里出现关键词才注入（省 token）。</p>
              </div>
            )}

            {/* 正则（展示美化：把输出转成带样式 HTML） */}
            {(() => {
              const rx = aiChars.flatMap((c) => (c.regex || []).map((r) => ({ owner: c, r })))
              return (
                <>
                  <button onClick={() => setRegexOpen((o) => !o)} className="flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-left hover:bg-white/40">
                    <span className="text-sm text-ink">正则 · 美化</span>
                    <span className="flex items-center gap-1.5 text-[12px] text-muted">
                      {rx.length > 0 ? `${rx.filter((x) => !x.r.disabled).length}/${rx.length} 条` : '空'}
                      <span>{regexOpen ? '▴' : '›'}</span>
                    </span>
                  </button>
                  {regexOpen && (
                    <div className="space-y-1.5 px-2.5 pb-2">
                      {rx.length === 0 ? (
                        <p className="text-[11px] text-muted">还没有正则。导入带正则的角色卡（PNG/JSON）时会自动带进来。</p>
                      ) : (
                        rx.map(({ owner, r }) => (
                          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-white/40 px-2.5 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{r.name}</span>
                            <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                              <input
                                type="checkbox"
                                checked={!r.disabled}
                                onChange={(ev) =>
                                  updateChar(sc.id, owner.id, {
                                    regex: (owner.regex || []).map((x) => (x.id === r.id ? { ...x, disabled: !ev.target.checked } : x)),
                                  })
                                }
                                className="peer sr-only"
                              />
                              <span className="h-4 w-7 rounded-full bg-black/15 transition peer-checked:bg-accent" />
                              <span className="absolute left-0.5 h-3 w-3 rounded-full bg-white shadow transition peer-checked:translate-x-3" />
                            </label>
                            <button
                              onClick={() => updateChar(sc.id, owner.id, { regex: (owner.regex || []).filter((x) => x.id !== r.id) })}
                              className="shrink-0 px-1 text-[13px] text-muted hover:text-red-500"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                      <p className="text-[10px] leading-relaxed text-muted">正则把角色输出替换成带样式 HTML（对话上色、状态栏面板等）。产出的 HTML 会消毒后再显示。</p>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {err && <div className="mb-1 px-1 text-[11px] text-red-500">{err}</div>}

      {/* 群聊消息 */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-0.5 py-1">
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
                    <div className="text-[15px] leading-relaxed text-ink">
                      <DramaRich text={applyRegexScripts(m.text, mine ? aiChars[0]?.regex : c?.regex, { isUser: !!mine })} user={meChar?.name} char={c?.name} />
                    </div>
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
                      className="mt-0.5 rounded-2xl px-3.5 py-2 text-sm text-ink"
                      style={{ background: (c?.color || '#bb9af7') + (mine ? '40' : '22') }}
                    >
                      <DramaRich text={applyRegexScripts(m.text, mine ? aiChars[0]?.regex : c?.regex, { isUser: !!mine })} user={meChar?.name} char={c?.name} />
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
            ref={taRef}
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={scrollToEnd}
            placeholder={effectiveAuto ? (aiChars.length === 1 ? `和 ${aiChars[0].name} 说点什么…` : '说点什么…（自动回复）') : '@角色 回复'}
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

      {/* 多开场白选择 */}
      {greetPick && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" onClick={() => setGreetPick(null)}>
          <div className="glass-strong max-h-[72vh] w-full max-w-md space-y-2 overflow-y-auto rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="headline text-lg text-ink">{greetPick.char.name} · 选一个开场白（{greetPick.list.length}）</div>
            {greetPick.list.map((g, i) => (
              <button
                key={i}
                onClick={() => sendGreeting(greetPick.char, g)}
                className="block w-full rounded-2xl border border-line bg-white/50 px-3 py-2.5 text-left text-[13px] text-ink hover:border-accent"
              >
                <span className="mr-1 text-[11px] text-accent">开场 {i + 1}</span>
                {g.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || '（空）'}…
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 从角色库加成员 */}
      {addMemberOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" onClick={() => setAddMemberOpen(false)}>
          <div className="glass-strong max-h-[72vh] w-full max-w-md space-y-1.5 overflow-y-auto rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="headline text-lg text-ink">从角色库加成员</div>
            {libChars.length === 0 ? (
              <p className="py-2 text-[12px] text-muted">角色库还没角色。去「戏剧首页 → 角色库」导入或新建角色卡。</p>
            ) : (
              libChars.map((lc) => (
                <button key={lc.id} onClick={() => addMemberFromLib(lc.id)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white/40">
                  <Avatar img={lc.avatarImg} emoji={lc.avatar} className="h-10 w-10 shrink-0 rounded-full text-lg" textCls="text-lg" style={{ background: lc.color + '33' }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{lc.name}</div>
                    <div className="truncate text-[11px] text-muted">{(lc.persona || '').replace(/\s+/g, ' ').trim().slice(0, 24) || '（没填人设）'}</div>
                  </div>
                  <span className="shrink-0 text-[12px] text-accent">加入 ＋</span>
                </button>
              ))
            )}
            <button onClick={() => { setAddMemberOpen(false); nav('/characters') }} className="mt-1 w-full rounded-xl py-2 text-[12px] text-accent">去角色库管理 ›</button>
          </div>
        </div>
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
  const [memory, setMemory] = useState(base?.memory ?? '')
  const [chanOpen, setChanOpen] = useState(false)
  const channels = useApiStore((s) => s.channels)
  const chanName = channels.find((c) => c.id === apiChannelId)?.name
  const imgRef = useRef<HTMLInputElement>(null)
  const inputCls =
    'w-full rounded-xl border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent'

  function save() {
    const patch = { name, avatar, avatarImg, persona, greeting, color, isMe, apiChannelId, memory }
    if (isNew) onAdd(sceneId, patch)
    else onUpdate(sceneId, (target as DramaChar).id, patch)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-to, #f7f1f4)' }}>
      {/* 顶栏：取消 / 标题 / 保存（整页编辑，键盘弹出也能滚动到字段） */}
      <div className="glass-bar flex items-center justify-between gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="px-2 py-1.5 text-sm text-muted">取消</button>
        <div className="headline text-base text-ink">{isNew ? '新角色卡' : '编辑角色'}</div>
        <button onClick={save} className="btn-primary rounded-full px-5 py-1.5 text-sm">保存</button>
      </div>

      {/* 可滚动正文：每个资料都是大框，方便录入 */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-3">
          <Avatar img={avatarImg} emoji={avatar} className="h-16 w-16 rounded-full text-2xl" textCls="text-2xl" style={{ background: color + '33' }} />
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

        <div>
          <div className="mb-1 text-[12px] text-muted">角色名字</div>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="如 伯恩 / 旁白NPC" />
        </div>

        <div>
          <div className="mb-1 text-[12px] text-muted">角色设定 / 人设</div>
          <textarea
            className={inputCls + ' min-h-[220px] leading-relaxed'}
            rows={12}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="身份、性别、年龄、性格、说话风格、背景关系…（NPC 卡可写：负责扮演各路 NPC 与旁白）"
          />
        </div>

        <div>
          <div className="mb-1 text-[12px] text-muted">开场白（出场第一条 · 可留空）</div>
          <textarea
            className={inputCls + ' min-h-[120px] leading-relaxed'}
            rows={6}
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="角色出场说的第一句/一段，用来开启剧情（如男主推门而入）。建好后在角色列表点「▶开场」发出。"
          />
        </div>

        {!isMe && (
          <div>
            <div className="mb-1 text-[12px] text-muted">TA 的私人记忆（第一人称 · 可手写，或在列表点 🧠 让 TA 自己回顾）</div>
            <textarea
              className={inputCls + ' min-h-[120px] leading-relaxed'}
              rows={6}
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              placeholder="TA 自己知道/在意/想做的事（对别人的看法、心结、决定…）"
            />
          </div>
        )}

        <div>
          <div className="mb-1 text-[12px] text-muted">气泡颜色</div>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-accent ring-offset-1' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[12px] text-muted">独立 API（这个角色单独用哪个模型）</div>
          <button
            type="button"
            onClick={() => setChanOpen((o) => !o)}
            className={inputCls + ' flex items-center justify-between text-left'}
          >
            <span className="truncate">{chanName || '跟随当前激活渠道'}</span>
            <span className="shrink-0 text-muted">{chanOpen ? '▴' : '▾'}</span>
          </button>
          {/* 就地展开（在页面流里，跟着整页一起滚，不会掉到屏幕外） */}
          {chanOpen && (
            <div className="mt-1 max-h-60 overflow-y-auto rounded-2xl border border-line bg-white/70 p-1.5">
              <button
                type="button"
                onClick={() => { setApiChannelId(undefined); setChanOpen(false) }}
                className="block w-full rounded-xl px-3 py-2 text-left text-[13px] text-ink hover:bg-white/50"
              >
                跟随当前激活渠道{!apiChannelId ? ' ✓' : ''}
              </button>
              {channels.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setApiChannelId(c.id); setChanOpen(false) }}
                  className="block w-full truncate rounded-xl px-3 py-2 text-left text-[13px] text-ink hover:bg-white/50"
                >
                  {c.name || c.model}{apiChannelId === c.id ? ' ✓' : ''}
                </button>
              ))}
              {channels.length === 0 && (
                <div className="px-3 py-1.5 text-[11px] text-muted">还没渠道，去「设置 → API / 模型」加</div>
              )}
            </div>
          )}
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
      </div>
    </div>
  )
}
