import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDramaStore, dramaMsgId, type DramaChar, type DramaMsg, type LoreEntry } from '@/store/dramaStore'
import { useApiStore, type ApiChannel } from '@/store/apiStore'
import { useMemoryModelStore } from '@/store/memoryModelStore'
import { useSyncStore } from '@/store/syncStore'
import { useUsageStore } from '@/store/usageStore'
import { chatComplete, chatCompleteStream, listModels } from '@/api/llm'
import { sendChat, type ChatApiMessage } from '@/api/chat'
import { cleanReply } from '@/lib/cleanReply'
import { fileToDataUrl } from '@/lib/image'
import { buildLoreText, pickDepthLore } from '@/lib/charCard'
import { DramaRich } from '@/lib/dramaRich'
import { applyMacros } from '@/lib/macros'
import { applyRegexScripts } from '@/lib/regexScript'
import { useCharLibStore } from '@/store/charLibStore'
import { useSttStore } from '@/store/sttStore'
import { transcribe } from '@/api/stt'
import { useTtsStore, VOICE_PRESETS } from '@/store/ttsStore'
import { useTtsPlayback } from '@/lib/useTtsPlayback'
import Avatar from '@/components/ui/Avatar'
import IdbImg from '@/components/ui/IdbImg'
import { idbGet, idbSet } from '@/lib/idb'
import BackBar from '@/components/layout/BackBar'
import DramaBg from '@/components/ui/DramaBg'
import { useAppearanceStore } from '@/store/appearanceStore'
import { GearIcon, HeartIcon, UsersIcon, ChatIcon } from '@/components/ui/navIcons'
import { SendIcon, SpeakerIcon, StopIcon, MicIcon, EditIcon, TrashIcon, PlayIcon } from '@/components/ui/icons'

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const PRESET_COLORS = ['#7aa2f7', '#bb9af7', '#f7768e', '#73d39b', '#e0af68', '#ff9e64', '#2ac3de']

export default function DramaRoom() {
  const nav = useNavigate()
  const scenes = useDramaStore((s) => s.scenes)
  const activeId = useDramaStore((s) => s.activeId)
  const setActive = useDramaStore((s) => s.setActive)
  const createScene = useDramaStore((s) => s.createScene)
  const removeScene = useDramaStore((s) => s.removeScene)
  const clearMessages = useDramaStore((s) => s.clearMessages)
  const renameScene = useDramaStore((s) => s.renameScene)
  const moveSceneTop = useDramaStore((s) => s.moveSceneTop)
  const addChar = useDramaStore((s) => s.addChar)
  const updateChar = useDramaStore((s) => s.updateChar)
  const removeChar = useDramaStore((s) => s.removeChar)
  const addMessage = useDramaStore((s) => s.addMessage)
  const addLore = useDramaStore((s) => s.addLore)
  const updateLoreEntry = useDramaStore((s) => s.updateLoreEntry)
  const removeLoreEntry = useDramaStore((s) => s.removeLoreEntry)
  const libChars = useCharLibStore((s) => s.chars)
  const addLibChar = useCharLibStore((s) => s.addChar)
  const setMessages = useDramaStore((s) => s.setMessages)
  const patchSceneMessages = useDramaStore((s) => s.patchSceneMessages)
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
  const histCount = useDramaStore((s) => s.histCount)
  const setHistCount = useDramaStore((s) => s.setHistCount)
  const autoCompress = useDramaStore((s) => s.autoCompress)
  const setAutoCompress = useDramaStore((s) => s.setAutoCompress)
  const autoCompressOver = useDramaStore((s) => s.autoCompressOver)
  const setAutoCompressOver = useDramaStore((s) => s.setAutoCompressOver)
  const summaryTrim = useDramaStore((s) => s.summaryTrim)
  const setSummaryTrim = useDramaStore((s) => s.setSummaryTrim)
  const textStyle = useDramaStore((s) => s.textStyle)
  const setTextStyle = useDramaStore((s) => s.setTextStyle)
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

  // activeId 失效/为空时落到最新剧场，保证从主页直进 /drama/room 总有得聊
  const scene = scenes.find((s) => s.id === activeId) ?? scenes[0]

  const [draft, setDraft] = useState('')
  const [pendingImage, setPendingImage] = useState('')
  const [busyChar, setBusyChar] = useState('') // 正在生成回复的角色 id
  const [casting, setCasting] = useState(false) // 群聊自动接话：导演正在挑人
  const [streamText, setStreamText] = useState('') // 流式生成中的正文（边出边显示）
  // 流式节流：每来一段就 setState 会让整个消息列表高频重渲染（手机卡顿、点不动），攒 150ms 刷一次
  const streamBufRef = useRef('')
  const streamTimerRef = useRef<number | null>(null)
  function pushStream(delta: string) {
    streamBufRef.current += delta
    if (streamTimerRef.current == null) {
      streamTimerRef.current = window.setTimeout(() => {
        streamTimerRef.current = null
        setStreamText(streamBufRef.current)
      }, 150)
    }
  }
  function resetStream() {
    streamBufRef.current = ''
    if (streamTimerRef.current != null) {
      clearTimeout(streamTimerRef.current)
      streamTimerRef.current = null
    }
    setStreamText('')
  }
  const [menuSceneId, setMenuSceneId] = useState('') // 会话列表 ⋮ 菜单打开的剧场
  const [loreEdit, setLoreEdit] = useState<LoreEntry | 'new' | null>(null) // 世界书条目编辑器
  const dramaBgRef = useRef<HTMLInputElement>(null) // ⚙ 里就地换背景图
  // 全屏大编辑器（世界观/剧情摘要这类长文，别在小框里憋屈地写）
  const [bigEdit, setBigEdit] = useState<null | { title: string; value: string; placeholder?: string; onSave: (v: string) => void }>(null)
  // ⚙ 设置抽屉分区：一次只看一组，避免所有高级项堆成一条超长表单。
  const [settingsTab, setSettingsTab] = useState<'members' | 'look' | 'plot'>('members')
  const [err, setErr] = useState('')
  const [leftOpen, setLeftOpen] = useState(false) // 左☰：角色/剧场
  const [rightOpen, setRightOpen] = useState(false) // 右⚙：世界观/剧情摘要
  const [worldOpen, setWorldOpen] = useState(false) // 世界观框 折叠/展开
  const [summaryOpen, setSummaryOpen] = useState(false) // 剧情摘要框 折叠/展开
  const [loreOpen, setLoreOpen] = useState(false) // 世界书 折叠/展开
  const [regexOpen, setRegexOpen] = useState(false) // 正则 折叠/展开
  const [addMemberOpen, setAddMemberOpen] = useState(false) // 从角色库加成员
  const [greetPick, setGreetPick] = useState<{ char: DramaChar; list: string[]; replaceId?: string } | null>(null) // 多开场白选择（replaceId＝替换那条而不是追加）
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
  // 设了背景图时，给文字加一圈白色描边光晕，让字在图上更清楚（不改文字颜色本身）
  const hasBg = useAppearanceStore((s) => !!s.appearance.dramaBg)
  const updateAppearance = useAppearanceStore((s) => s.update)
  const bgTextGlow = hasBg
    ? { textShadow: '0 0 4px rgba(255,255,255,0.95), 0 1px 2px rgba(255,255,255,0.9)' }
    : undefined
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const charMemTurnRef = useRef<Record<string, number>>({}) // 各角色距上次私人记忆更新的发言数

  const messages = scene?.messages ?? []
  useEffect(() => {
    scrollToEnd() // 多次补滚到真底部，避免发完消息悬在半空
    return cancelScrollToEnd
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
  const prevSummarySceneRef = useRef('')
  const autoSummaryPendingRef = useRef(false)
  useEffect(() => {
    const len = scene?.messages.length ?? 0
    const sceneId = scene?.id ?? ''
    if (prevSummarySceneRef.current !== sceneId) {
      prevSummarySceneRef.current = sceneId
      prevLenRef.current = len
      autoSummaryPendingRef.current = false
      return // 首次进入这个剧场不触发，避免切场景就烧 token
    }
    const grew = prevLenRef.current !== null && len > prevLenRef.current
    prevLenRef.current = len
    // 注意：AI 回复入库时 busyChar 仍为真，所以这里不能因 busyChar 而跳过，
    // 否则新增长在 busy 期间被吞掉、busy 结束后又没增长 → 自动摘要永远不触发。
    // 摘要走独立记忆渠道、summaryBusy 防重入，与回复并发无妨。
    const due = len - (scene?.summaryAt ?? 0) >= autoSummaryEvery
    if (!autoSummary || !due) {
      if (!due) autoSummaryPendingRef.current = false
      return
    }
    if (summaryBusy) {
      // 摘要生成期间又长出新消息：记下来，当前轮结束后补跑，别把这次增长吞掉。
      if (grew) autoSummaryPendingRef.current = true
      return
    }
    if (grew || autoSummaryPendingRef.current) {
      autoSummaryPendingRef.current = false
      void genSummary(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.messages.length, autoSummary, autoSummaryEvery, summaryBusy])

  // 流式生成时跟着滚到底（轻量，不用 scrollToEnd 的多次补滚）
  useEffect(() => {
    const el = listRef.current
    if (streamText && el) el.scrollTop = el.scrollHeight
  }, [streamText])

  // 自动压缩：消息超过阈值就把较早对话并进摘要（留最近 24 条），省 token + 给存储减负
  useEffect(() => {
    const len = scene?.messages.length ?? 0
    if (!autoCompress || summaryBusy || busyChar) return
    if (len >= Math.max(40, autoCompressOver)) void compress(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.messages.length, autoCompress, autoCompressOver, summaryBusy, busyChar])

  // 一次性迁移：把历史消息里的 dataURL 图片搬进 IndexedDB，腾出 localStorage 配额
  // （5MB 配额写满会静默丢对话——这次事故的根因，别删这段）
  useEffect(() => {
    const MIG_KEY = 'burne-home-core:drama-img-mig'
    if (localStorage.getItem(MIG_KEY)) return
    void (async () => {
      try {
        const st = useDramaStore.getState()
        for (const s of st.scenes) {
          let changed = false
          const msgs = await Promise.all(
            s.messages.map(async (m) => {
              if (m.image && m.image.startsWith('data:')) {
                const key = `dmimg:${m.id}`
                await idbSet(key, m.image)
                changed = true
                return { ...m, image: `idb:${key}` }
              }
              return m
            }),
          )
          if (changed) st.setMessages(s.id, msgs)
        }
        localStorage.setItem(MIG_KEY, '1')
      } catch (e) {
        console.warn('[drama] 图片迁移失败，下次再试', e)
      }
    })()
  }, [])

  /** 滚到最新消息底部。键盘弹出有动画 + 视口缩放，分几次补滚才稳。 */
  function cancelScrollToEnd() {
    scrollTimersRef.current.forEach(clearTimeout)
    scrollTimersRef.current = []
  }

  function scrollToEnd() {
    // 新一轮滚动前取消旧任务，避免消息/生成状态连续变化时叠出一串延迟滚动。
    cancelScrollToEnd()
    const jump = () => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
    requestAnimationFrame(jump)
    scrollTimersRef.current = [120, 300, 500].map((t) => setTimeout(jump, t))
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

  /** 群聊自动接话：消息里点到谁的名字就是谁；没点名就让模型当「导演」挑一个最该接话的。
   *  导演走记忆模型（没开就主渠道），只输出一个名字，很省；失败回退「最近说话的 AI」。 */
  async function pickSpeaker(userText: string): Promise<DramaChar | undefined> {
    if (aiChars.length <= 1) return aiChars[0]
    // ① 消息里提到了角色名 → 直接是 TA（提到多个时取最后被提到的，更像在对 TA 说话）
    let hit: DramaChar | undefined
    let hitPos = -1
    for (const c of aiChars) {
      const p = userText.lastIndexOf(c.name)
      if (p > hitPos) {
        hitPos = p
        hit = c
      }
    }
    if (hit) return hit
    // ② 模型当导演挑人
    if (!summaryChannel && !workerUrl) return autoTarget()
    setCasting(true)
    try {
      const freshMsgs = useDramaStore.getState().scenes.find((s) => s.id === sc.id)?.messages ?? sc.messages
      const recent = freshMsgs.slice(-10).map((m) => `${nameOf(m.who)}：${m.text.slice(0, 120)}`).join('\n')
      const names = aiChars.map((c) => c.name).join('、')
      const sys = '你是角色扮演群聊的导演。根据最近对话判断下一句最应该由哪个角色接话（被叫到的、被问到的、剧情轮到的）。只输出一个角色名字，不要输出任何其它文字。'
      const q = `候选角色：${names}\n\n【最近对话】\n${recent}\n\n下一句最该谁接？只输出名字。`
      let out = ''
      if (summaryChannel) {
        const r = await chatComplete(summaryChannel, [{ role: 'user', content: q }], sys, {
          workerUrl,
          syncKey: config.syncKey,
          maxTokens: 48,
        })
        out = r.text
      } else {
        out = await sendChat({ workerUrl: workerUrl!, syncKey: config.syncKey, messages: [{ role: 'user', content: q }], system: sys, maxTokens: 48 })
      }
      out = cleanReply(out).trim()
      return aiChars.find((c) => out.includes(c.name)) || (out ? aiChars.find((c) => c.name.includes(out)) : undefined) || autoTarget()
    } catch {
      return autoTarget()
    } finally {
      setCasting(false)
    }
  }

  /** 发送我（女主）的一条。图片本体进 IndexedDB，消息里只存 `idb:` 引用（不占 localStorage 5MB 配额） */
  function sendMine() {
    const text = draft.trim()
    if (!text && !pendingImage) return
    const msgId = dramaMsgId()
    let imageRef: string | undefined
    if (pendingImage) {
      const key = `dmimg:${msgId}`
      void idbSet(key, pendingImage)
      imageRef = `idb:${key}`
    }
    addMessage(sc.id, {
      id: msgId,
      who: meChar?.id ?? '__me__',
      text,
      ...(imageRef ? { image: imageRef } : {}),
      at: now(),
    })
    setDraft('')
    setPendingImage('')
  }

  /** 把 `idb:` 图片引用解析回 dataURL（喂模型 vision 用） */
  async function resolveImgSrc(src: string): Promise<string> {
    if (!src.startsWith('idb:')) return src
    return (await idbGet<string>(src.slice(4))) || ''
  }

  /** 发一条指定文本的用户消息 + 触发自动回复（供开场白卡的 /say 快捷按钮调用） */
  function sendText(text: string) {
    const t = text.trim()
    if (!t || busyChar) return
    addMessage(sc.id, { id: dramaMsgId(), who: meChar?.id ?? '__me__', text: t, at: now() })
    if (effectiveAuto) {
      if (aiChars.length <= 1) {
        const tgt = autoTarget()
        if (tgt) void respond(tgt)
      } else {
        void pickSpeaker(t).then((tgt) => {
          if (tgt) void respond(tgt)
        })
      }
    }
  }
  // 用 ref 存最新的 sendText，避免 window 监听器闭包拿到旧的 scene/角色
  const sendTextRef = useRef(sendText)
  sendTextRef.current = sendText
  useEffect(() => {
    function onCardSay(e: MessageEvent) {
      const d = e.data as { __bwCardSay?: unknown }
      if (d && typeof d.__bwCardSay === 'string') sendTextRef.current(d.__bwCardSay)
    }
    window.addEventListener('message', onCardSay)
    return () => window.removeEventListener('message', onCardSay)
  }, [])

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
    // 自动回复（1v1 默认开 / ⚙ 可手动开）：1v1 让那个 AI 回；群聊自动判断该谁接话
    if (had && effectiveAuto && !busyChar) {
      if (aiChars.length <= 1) {
        const tgt = autoTarget()
        if (tgt) void respond(tgt)
      } else {
        void pickSpeaker(t).then((tgt) => {
          if (tgt) void respond(tgt)
        })
      }
    }
  }

  /** 点 @ 弹层里的角色：清掉输入框里的 @词，直接让 TA 接话 */
  function pickAt(c: DramaChar) {
    setDraft((d) => d.replace(/@(\S*)$/, ''))
    void respond(c)
  }

  /** 让某角色用开场白出场。多个开场白时弹出来选一个；传 replaceId＝替换那条消息（换开场白）。 */
  function openWith(char: DramaChar, replaceId?: string) {
    const list = (char.greetings && char.greetings.length ? char.greetings : char.greeting ? [char.greeting] : [])
      .map((g) => g.trim())
      .filter(Boolean)
    if (!list.length) {
      setErr(`${char.name} 还没填开场白`)
      return
    }
    if (list.length === 1 && !replaceId) {
      addMessage(sc.id, { id: dramaMsgId(), who: char.id, text: list[0], at: now() })
      return
    }
    setGreetPick({ char, list, replaceId })
  }
  /** 选定某条开场白：默认追加；换开场白模式则替换原来那条 */
  function sendGreeting(char: DramaChar, text: string) {
    const rid = greetPick?.replaceId
    if (rid) {
      setMessages(sc.id, sc.messages.map((m) => (m.id === rid ? { ...m, text } : m)))
    } else {
      addMessage(sc.id, { id: dramaMsgId(), who: char.id, text, at: now() })
    }
    setGreetPick(null)
  }

  /** 点名某角色，让 TA 接话。返回是否成功出了回复（重写/重新发送靠它决定要不要还原）。 */
  async function respond(char: DramaChar): Promise<boolean> {
    if (busyChar) return false
    // 该角色独立渠道（不填＝跟随当前激活渠道）；可再指定模型覆盖渠道默认
    const chBase = (char.apiChannelId && channels.find((c) => c.id === char.apiChannelId)) || activeChannel
    const ch = chBase && char.model?.trim() ? { ...chBase, model: char.model.trim() } : chBase
    if (!ch && !workerUrl) {
      setErr('还没配 API 哦～去「设置 → API / 模型」加一条渠道')
      return false
    }
    setErr('')
    setBusyChar(char.id)
    try {
      const isGroup = aiChars.length > 1
      const meName = meChar?.name || '用户'
      const others = sc.chars
        .filter((c) => c.id !== char.id)
        .map((c) => (c.isMe ? `${c.name}（用户本人/女主）` : c.name))
        .join('、')
      // 读「最新」消息（自动回复紧跟在用户发送之后，闭包里的 sc.messages 是旧的）
      const freshMsgs = useDramaStore.getState().scenes.find((s) => s.id === sc.id)?.messages ?? sc.messages
      // 携带的历史窗口：最多 histCount 条；开了「摘要顶替旧对话」且有摘要时，
      // 已并入摘要（summaryAt 之前）的旧消息不再发，只带之后的新对话（保底最近 8 条）
      const st = useDramaStore.getState()
      const histN = Math.max(4, Math.min(48, st.histCount || 24))
      let histStart = Math.max(0, freshMsgs.length - histN)
      if (st.summaryTrim && sc.summary.trim()) {
        histStart = Math.max(histStart, Math.min(sc.summaryAt ?? 0, Math.max(0, freshMsgs.length - 8)))
      }
      const recent = freshMsgs.slice(histStart)
      const world = (sc.world || '').trim()
      // 世界书：按携带的最近对话挑出常驻 + 命中关键词的条目注入（省 token）
      const loreHay = recent.map((m) => m.text).join('\n') + '\n' + (draft || '')
      const loreText = buildLoreText(sc.lore, loreHay)
      // 卡里用 {{user}}/{{char}} 的地方，喂模型前也替换成真实名字
      const mac = { user: meChar?.name, char: char.name }
      const meDesc = (meChar?.persona || '').trim()
      // 提示词结构对齐 Tavern 默认预设：主提示词只轻引导（不加"简洁别太长"这类束缚，
      // 长度/文风交给卡自己），并常驻注入「我」卡的人设（Tavo 的 Persona Description）
      const sys = applyMacros(
        (isGroup
          ? `这是一场虚构的多人角色扮演群聊，请写出角色【${char.name}】的下一条回复。\n`
          : `这是一场【${char.name}】与【${meName}】之间的虚构角色扮演聊天，请写出【${char.name}】的下一条回复。\n`) +
        (world ? `\n【世界观 / 背景设定（所有角色共同遵守）】\n${world}\n` : '') +
        (loreText ? `\n【世界书 · 相关设定】\n${loreText}\n` : '') +
        (meDesc ? `\n【${meName}（用户扮演的角色）的人设】\n${meDesc}\n` : '') +
        `\n【${char.name}的人设】\n${char.persona || '（未填，请贴合名字与剧情合理发挥）'}\n` +
        ((char.memory || '').trim() ? `\n【你（${char.name}）自己记得 / 在意的（第一人称私人记忆）】\n${(char.memory || '').trim()}\n` : '') +
        (others ? `\n群里其他人：${others}。\n` : '') +
        (sc.summary.trim() ? `\n【到目前为止的剧情摘要】\n${sc.summary.trim()}\n` : '') +
        `\n规则：始终以【${char.name}】的身份说话行动，保持 TA 的人设与文风；不要替${meName}或其他角色说话、做决定。` +
        `全程用中文叙述，不要夹杂其它语言，也不要在括号里给翻译或注释。`,
        mac,
      )

      // 对话历史喂成「真实多轮消息」（该角色＝assistant、其他人＝user），
      // 对齐 Tavern 的 Chat History——比拼成一段剧本文字更入戏、更贴人设。
      const imgOk = new Set(recent.filter((m) => m.image).slice(-2).map((m) => m.id))
      const items: { role: 'user' | 'assistant'; line: string; img?: string }[] = []
      for (const m of recent) {
        const role: 'user' | 'assistant' = m.who === char.id ? 'assistant' : 'user'
        const raw = m.text.trim() || (m.image ? '（发了一张图片）' : '')
        if (!raw) continue
        // 群聊里别人的消息带「名字：」前缀让模型分清谁在说；1v1 不用
        const line = applyMacros(isGroup && role === 'user' ? `${nameOf(m.who)}：${raw}` : raw, mac)
        const img = role === 'user' && m.image && imgOk.has(m.id) ? m.image : ''
        items.push({ role, line, ...(img ? { img } : {}) })
      }
      // @Depth 世界书条目（如「状态栏」格式指令）：插到倒数第 depth 条处——越靠后越强势，对齐 Tavo
      for (const dl of pickDepthLore(sc.lore, loreHay)) {
        const at = Math.max(0, items.length - dl.depth)
        items.splice(at, 0, { role: 'user', line: applyMacros(`[系统指令]\n${dl.content}`, mac) })
      }
      // 合并连续同角色（Anthropic 要求交替）
      const turns: { role: 'user' | 'assistant'; texts: string[]; images: string[] }[] = []
      for (const it of items) {
        const prev = turns[turns.length - 1]
        if (prev && prev.role === it.role) {
          prev.texts.push(it.line)
          if (it.img) prev.images.push(it.img)
        } else {
          turns.push({ role: it.role, texts: [it.line], images: it.img ? [it.img] : [] })
        }
      }
      // Anthropic 要求首条是 user；角色刚说完又被点接话时，补一句让 TA 接着说
      if (!turns.length || turns[0].role !== 'user')
        turns.unshift({ role: 'user', texts: [turns.length ? '（剧情开始）' : '（还没人说话，请由你开场）'], images: [] })
      if (turns[turns.length - 1].role === 'assistant')
        turns.push({ role: 'user', texts: [`（请以【${char.name}】的身份接着说下一条）`], images: [] })
      // NPC/旁白模式：把边界钉在请求最末尾（离生成点最近＝最强势），物理防代演
      if (char.npc) {
        const protectedNames = sc.chars.filter((c2) => c2.id !== char.id).map((c2) => c2.name).join('、')
        turns[turns.length - 1].texts.push(
          `[系统校验·最高优先级] 本条回复由「${char.name}」（旁白/NPC）输出，生成前自查：` +
          `只允许写环境/时间/氛围旁白、临时NPC的言行、外部事件；` +
          `全文禁止出现 ${protectedNames} 的台词、动作、表情或心理，他们只能作为被观察的存在被简短带过；` +
          `禁止出现「名字：」台词格式；旁白克制简短，写完即停，把舞台交还主角。`,
        )
      }
      // idb: 图片引用换回 dataURL 再喂 vision
      for (const t of turns) {
        if (t.images.length) t.images = (await Promise.all(t.images.map(resolveImgSrc))).filter(Boolean)
      }
      const apiMsgs: ChatApiMessage[] = turns.map((t) => {
        const text = t.texts.join('\n')
        if (!t.images.length) return { role: t.role, content: text }
        return {
          role: t.role,
          content: [
            ...(text ? [{ type: 'text' as const, text }] : []),
            ...t.images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        }
      })

      let reply = ''
      if (ch) {
        // 流式：字一出来就打到屏幕上（OpenAI 兼容直连；anthropic/Worker 自动回退非流式）
        resetStream()
        const r = await chatCompleteStream(
          ch,
          apiMsgs,
          sys,
          {
            workerUrl,
            syncKey: config.syncKey,
            maxTokens: 4096,
          },
          { onContent: pushStream },
        )
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
      // 群聊历史带「名字：」前缀，模型偶尔会照着也带上，剥掉
      const nameEsc = char.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      reply = reply.replace(new RegExp(`^【?${nameEsc}】?\\s*[:：]\\s*`), '')
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
      return true
    } catch (e) {
      setErr(`${char.name} 没接上话：${(e as Error).message}`)
      return false
    } finally {
      setBusyChar('')
      resetStream()
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

  /** 压缩对话：把较早的对话并进剧情摘要，省 token、防忘、给存储减负。
   *  手动＝留最近 6 条并弹确认；auto＝留最近 24 条、静默执行（超过阈值自动触发）。 */
  async function compress(auto = false) {
    if (busyChar || summaryBusy) return
    const keep = auto ? 24 : 6
    if (sc.messages.length <= keep + 2) {
      if (!auto) setErr('对话还短，先不用压缩～')
      return
    }
    if (!summaryChannel && !workerUrl) {
      if (!auto) setErr('请先在「设置 → API / 模型」配置渠道')
      return
    }
    if (!auto && !window.confirm('把较早的对话压缩进「剧情摘要」？只保留最近几条，不可恢复。')) return
    if (!auto) setErr('')
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
      if (!auto) setRightOpen(true)
      if (auto) flashToast('🗜 已自动压缩较早剧情进摘要')
    } catch (e) {
      if (auto) console.warn('[drama] 自动压缩失败，下次再试', e)
      else setErr(`压缩失败：${(e as Error).message}`)
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
      voiceId: lc.voiceId,
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
    setMenuMsgId('')
    if (!window.confirm('删除这条消息？')) return
    setMessages(sc.id, sc.messages.filter((m) => m.id !== id))
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
    // 改写走全屏大编辑器（保存时按最新消息列表改，避免编辑期间新消息被覆盖丢掉）
    setBigEdit({
      title: '改写这条消息',
      value: m.text,
      onSave: (v) => {
        const fresh = useDramaStore.getState().scenes.find((s) => s.id === sc.id)?.messages ?? sc.messages
        setMessages(sc.id, fresh.map((x) => (x.id === id ? { ...x, text: v } : x)))
      },
    })
  }
  /** 生成失败时把先删掉的消息放回去（重写/重新发送绝不"白删"） */
  function restoreMsgs(removed: DramaMsg[]) {
    if (!removed.length) return
    const fresh = useDramaStore.getState().scenes.find((s) => s.id === sc.id)?.messages ?? []
    setMessages(sc.id, [...fresh, ...removed])
  }
  /** 重新发送（我的消息）：回到这条为止，让 AI 重新接话（Load failed 之类的救场键） */
  async function resendMine(id: string) {
    const i = sc.messages.findIndex((m) => m.id === id)
    setMenuMsgId('')
    if (i < 0 || !aiChars.length) return
    const m = sc.messages[i]
    const removed = sc.messages.slice(i + 1)
    setMessages(sc.id, sc.messages.slice(0, i + 1))
    setSummaryAt(sc.id, Math.min(sc.summaryAt ?? 0, i + 1))
    let ok = false
    if (aiChars.length === 1) {
      ok = await respond(aiChars[0])
    } else {
      const tgt = await pickSpeaker(m.text)
      if (tgt) ok = await respond(tgt)
    }
    if (!ok) restoreMsgs(removed)
  }
  /** 重写：删掉这条 AI 回复（及之后的消息），让同一个角色当场重新生成；失败自动还原 */
  async function regenMsg(id: string) {
    const i = sc.messages.findIndex((m) => m.id === id)
    setMenuMsgId('')
    if (i < 0) return
    const c = charById(sc.messages[i].who)
    if (!c || c.isMe) return
    const removed = sc.messages.slice(i)
    // 原子化合并：删消息 + 调摘要位置，只触发一次磁盘保存，解决点击重写时的瞬间卡顿
    patchSceneMessages(sc.id, sc.messages.slice(0, i), Math.min(sc.summaryAt ?? 0, i))
    const ok = await respond(c)
    if (!ok) restoreMsgs(removed)
  }
  function saveEdit() {
    const t = editText
    setMessages(sc.id, sc.messages.map((m) => (m.id === editMsgId ? { ...m, text: t } : m)))
    setEditMsgId('')
    setEditText('')
  }

  return (
    <div className="relative flex h-full flex-col">
      <DramaBg />
      {/* 顶栏：Claude 式悬浮毛玻璃条（半透明+模糊，消息从底下滚过）。左 ☰ · 中标题 · 右 ⚙
          负边距顶出 main 的 px-5/pt 内边距，铺满整个屏宽和真正的顶端 */}
      <div className="glass-bar absolute -left-5 -right-5 top-[calc(-1*max(0.75rem,env(safe-area-inset-top)))] z-20 flex items-center gap-2 border-b border-line/30 px-4 pb-1.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
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

      {/* 左侧抽屉：会话列表（Tavo 式）——所有剧场随点随切 + 底部导航 */}
      {leftOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setLeftOpen(false)}>
          {/* 遮罩顶部渐浅：iOS 状态栏是系统画的压不暗（default 模式），渐变让上缘不生硬 */}
          <div className="drawer-backdrop absolute inset-0 cursor-pointer bg-gradient-to-b from-black/5 via-black/20 to-black/25" />
          <div
            className="drawer-left drawer-panel absolute left-0 top-0 flex h-full w-[82%] max-w-[320px] flex-col rounded-r-3xl pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.9rem,env(safe-area-inset-top))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 pb-2">
              <div className="headline text-base text-ink">全部剧场 · {scenes.length}</div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const t = window.prompt('新剧场名字')
                    if (t !== null) {
                      createScene(t)
                      setLeftOpen(false)
                    }
                  }}
                  aria-label="新建剧场"
                  className="glass flex h-8 w-8 items-center justify-center rounded-full text-base text-ink"
                >
                  ＋
                </button>
                <button onClick={() => setLeftOpen(false)} aria-label="关闭" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-black/5">
                  ✕
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
              {scenes.map((s) => {
                const lead = s.chars.find((c) => !c.isMe) || s.chars[0]
                const last = s.messages[s.messages.length - 1]
                // 预览去掉 HTML 标签/代码围栏/markdown 记号，别把 `<div style=…` 这种原始码露出来
                const preview = last
                  ? ((last.text || '')
                      .replace(/```[\s\S]*?```/g, ' ')
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/[*_`#>~]+/g, '')
                      .replace(/\s+/g, ' ')
                      .trim() || '［图片］').slice(0, 26)
                  : '（还没开场）'
                const active = s.id === sc.id
                return (
                  <div key={s.id} className={`flex items-center rounded-2xl ${active ? 'bg-accent/10' : 'hover:bg-white/40'}`}>
                    <button
                      onClick={() => {
                        setActive(s.id)
                        setLeftOpen(false)
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left"
                    >
                      <Avatar
                        img={lead?.avatarImg}
                        emoji={lead?.avatar || '🎭'}
                        className="h-11 w-11 shrink-0 rounded-full text-xl"
                        textCls="text-xl"
                        style={{ background: (lead?.color || '#bb9af7') + '33' }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${active ? 'font-medium text-accent' : 'text-ink'}`}>{s.title}</span>
                        <span className="block truncate text-[11px] text-muted">{preview}</span>
                      </span>
                    </button>
                    <button
                      onClick={() => setMenuSceneId(s.id)}
                      aria-label="更多操作"
                      className="flex h-9 w-8 shrink-0 items-center justify-center text-lg leading-none text-muted hover:text-accent"
                    >
                      ⋮
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="mx-3 mt-1 flex items-center justify-around border-t border-line/40 pt-1.5">
              <button onClick={() => nav('/')} className="flex flex-col items-center gap-0.5 rounded-2xl px-4 py-1.5 text-muted hover:text-accent">
                <HeartIcon className="h-5 w-5" />
                <span className="text-[10px]">主页</span>
              </button>
              <button onClick={() => nav('/characters')} className="flex flex-col items-center gap-0.5 rounded-2xl px-4 py-1.5 text-muted hover:text-accent">
                <UsersIcon className="h-5 w-5" />
                <span className="text-[10px]">角色库</span>
              </button>
              <button onClick={() => nav('/drama')} className="flex flex-col items-center gap-0.5 rounded-2xl px-4 py-1.5 text-muted hover:text-accent">
                <ChatIcon className="h-5 w-5" />
                <span className="text-[10px]">剧场管理</span>
              </button>
            </div>
          </div>

          {/* ⋮ 底部操作菜单（Tavo 式）：置顶 / 改名 / 删除 */}
          {menuSceneId && (() => {
            const ms = scenes.find((x) => x.id === menuSceneId)
            if (!ms) return null
            const close = () => setMenuSceneId('')
            return (
              <div
                className="fixed inset-0 z-50 flex items-end bg-black/30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                onClick={(e) => {
                  e.stopPropagation()
                  close()
                }}
              >
                <div className="w-full space-y-2" onClick={(e) => e.stopPropagation()}>
                  <div className="drawer-panel overflow-hidden rounded-3xl">
                    <div className="truncate px-4 pb-1 pt-3 text-center text-[11px] text-muted">{ms.title}</div>
                    <button
                      onClick={() => {
                        moveSceneTop(ms.id)
                        close()
                      }}
                      className="block w-full py-3 text-center text-[15px] text-ink active:bg-black/5"
                    >
                      置顶
                    </button>
                    <div className="mx-4 border-t border-line/50" />
                    <button
                      onClick={() => {
                        const t = window.prompt('改名', ms.title)
                        if (t !== null && t.trim()) renameScene(ms.id, t.trim())
                        close()
                      }}
                      className="block w-full py-3 text-center text-[15px] text-ink active:bg-black/5"
                    >
                      改名
                    </button>
                    <div className="mx-4 border-t border-line/50" />
                    <button
                      onClick={() => {
                        if (window.confirm(`重启「${ms.title}」？清空全部对话和剧情摘要，角色、世界观、世界书都保留。`)) {
                          clearMessages(ms.id)
                        }
                        close()
                      }}
                      className="block w-full py-3 text-center text-[15px] text-ink active:bg-black/5"
                    >
                      ♻️ 重启对话
                    </button>
                    <div className="mx-4 border-t border-line/50" />
                    <button
                      onClick={() => {
                        if (window.confirm(`删除剧场「${ms.title}」？角色和对话都会一起删除，不可恢复。`)) {
                          removeScene(ms.id)
                        }
                        close()
                      }}
                      className="block w-full py-3 text-center text-[15px] text-red-500 active:bg-black/5"
                    >
                      删除
                    </button>
                  </div>
                  <button onClick={close} className="drawer-panel block w-full rounded-3xl py-3 text-center text-[15px] text-muted active:bg-black/5">
                    取消
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* 右侧抽屉：本剧场设置 —— 外观 / 剧情·记忆（滑入浮层） */}
      {rightOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setRightOpen(false)}>
          {/* 遮罩顶部渐浅：iOS 状态栏是系统画的压不暗（default 模式），渐变让上缘不生硬 */}
          <div className="drawer-backdrop absolute inset-0 cursor-pointer bg-gradient-to-b from-black/5 via-black/20 to-black/25" />
          <div
            className="drawer-right drawer-panel absolute right-0 top-0 flex h-full w-[86%] max-w-[340px] flex-col gap-2.5 overflow-y-auto rounded-l-3xl px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.9rem,env(safe-area-inset-top))]"
            onClick={(e) => e.stopPropagation()}
          >
          <div className="sticky top-0 z-10 -mx-1 space-y-2 rounded-2xl bg-[rgba(250,248,245,0.94)] px-1 pb-2 pt-0.5 shadow-[0_8px_18px_rgba(80,60,45,0.06)]">
            <div className="flex items-center justify-between px-1">
              <div>
                <div className="headline text-base text-ink">本剧场设置</div>
                <div className="mt-0.5 max-w-[220px] truncate text-[10px] text-muted">{sc.title}</div>
              </div>
              <button onClick={() => setRightOpen(false)} aria-label="关闭" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-black/5">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-black/[0.035] p-1">
              {([
                ['members', `成员 ${sc.chars.length}`],
                ['look', '外观'],
                ['plot', '剧情记忆'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setSettingsTab(id)}
                  className={`rounded-xl px-1 py-2 text-[11px] transition ${settingsTab === id ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* 成员（从左抽屉并进来的：左边现在是会话列表） */}
          {settingsTab === 'members' && (<div className="shrink-0 rounded-2xl bg-white/45 p-1.5">
            <div className="flex w-full items-center justify-between px-2.5 pb-0.5 pt-1.5">
              <span className="label">成员 · {sc.chars.length}</span>
              <span className="text-[10px] text-muted">角色与独立记忆</span>
            </div>
            {sc.chars.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5 rounded-xl px-2 py-1.5">
                <Avatar img={c.avatarImg} emoji={c.avatar} className="h-8 w-8 shrink-0 rounded-full text-base" textCls="text-base" style={{ background: c.color + '33' }} />
                <span className="ml-0.5 min-w-0 flex-1 truncate text-sm text-ink">
                  {c.name}
                  {c.isMe && <span className="ml-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">我</span>}
                </span>
                {!c.isMe && (c.greeting || '').trim() && (
                  <button onClick={() => openWith(c)} title="用开场白出场" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-accent hover:bg-white/60">
                    <PlayIcon className="h-[15px] w-[15px]" />
                  </button>
                )}
                {!c.isMe && (
                  <button
                    onClick={() => genCharMemory(c)}
                    disabled={!!memBusyId}
                    title="让 TA 回顾、更新私人记忆"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] hover:bg-white/60 disabled:opacity-50"
                  >
                    {memBusyId === c.id ? '⏳' : '🧠'}
                  </button>
                )}
                <button onClick={() => setEditing(c)} title="编辑角色" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/60 hover:text-accent">
                  <EditIcon className="h-[15px] w-[15px]" />
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm(`把「${c.name}」移出这个剧场？${!c.isMe ? '（角色卡会自动备份到角色库，随时能再加回来）' : ''}`)) return
                    // 移出前自动备份到角色库（同名的不重复存），她不用再手动重建卡
                    if (!c.isMe && !libChars.some((lc) => lc.name === c.name)) {
                      addLibChar({
                        name: c.name,
                        avatar: c.avatar,
                        avatarImg: c.avatarImg,
                        persona: c.persona,
                        greeting: c.greeting,
                        greetings: c.greetings,
                        color: c.color,
                        apiChannelId: c.apiChannelId,
                        voiceId: c.voiceId,
                        regex: c.regex,
                      })
                    }
                    removeChar(sc.id, c.id)
                  }}
                  title="移出剧场（自动备份到角色库）"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/60 hover:text-red-500"
                >
                  <TrashIcon className="h-[15px] w-[15px]" />
                </button>
              </div>
            ))}
            <div className="space-y-1.5 px-1 pb-1 pt-1">
              <button onClick={() => setEditing('new')} className="btn-primary w-full rounded-xl py-2 text-[13px]">
                ＋ 新角色卡
              </button>
              <button onClick={() => setAddMemberOpen(true)} className="glass w-full rounded-xl py-2 text-[13px] text-ink">
                ＋ 从角色库加成员
              </button>
              <p className="text-[10px] leading-relaxed text-muted">
                勾「这是我」的卡由你发言，其余是 AI 角色；导入现成卡请到 角色库。
              </p>
            </div>
          </div>)}
          {/* 外观 */}
          {settingsTab === 'look' && (<div className="shrink-0 rounded-2xl bg-white/45 p-1.5">
            <div className="flex w-full items-center justify-between px-2.5 pb-0.5 pt-1.5">
              <span className="label">外观</span>
              <span className="text-[10px] text-muted">样式与自动回复</span>
            </div>
            <div className="flex items-center justify-between rounded-xl px-2.5 py-2.5">
              <span className="text-sm text-ink">显示样式</span>
              <div className="flex gap-1.5">
                <button onClick={() => setFlat(false)} className={`rounded-full px-3 py-1 text-[12px] ${!flat ? 'btn-primary' : 'glass text-muted'}`}>气泡</button>
                <button onClick={() => setFlat(true)} className={`rounded-full px-3 py-1 text-[12px] ${flat ? 'btn-primary' : 'glass text-muted'}`}>平铺</button>
              </div>
            </div>
            <div className="mx-2.5 border-t border-line/40" />
            <div className="flex items-center justify-between rounded-xl px-2.5 py-2.5">
              <span className="text-sm text-ink">背景图</span>
              <div className="flex items-center gap-1.5">
                <input
                  ref={dramaBgRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    try {
                      updateAppearance({ dramaBg: await fileToDataUrl(f, 1280, 0.8) })
                    } catch (er) {
                      setErr((er as Error).message)
                    }
                  }}
                />
                <button onClick={() => dramaBgRef.current?.click()} className="glass rounded-full px-3 py-1 text-[12px] text-ink">
                  换图
                </button>
                {hasBg && (
                  <button onClick={() => updateAppearance({ dramaBg: '' })} className="px-1.5 py-1 text-[12px] text-muted hover:text-red-500">
                    移除
                  </button>
                )}
              </div>
            </div>
            <div className="mx-2.5 border-t border-line/40" />
            {/* 文字样式（她要的小主题：字号 + 三个颜色） */}
            <div className="rounded-xl px-2.5 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink">字号</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setTextStyle({ size: Math.max(12, textStyle.size - 1) })} className="glass flex h-7 w-7 items-center justify-center rounded-full text-ink">
                    −
                  </button>
                  <span className="w-7 text-center text-[13px] tabular-nums text-ink">{textStyle.size}</span>
                  <button onClick={() => setTextStyle({ size: Math.min(20, textStyle.size + 1) })} className="glass flex h-7 w-7 items-center justify-center rounded-full text-ink">
                    ＋
                  </button>
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                {(
                  [
                    ['正文颜色', 'text', '#3a3a40'],
                    ['对话颜色', 'quote', '#d585a6'],
                    ['心理颜色', 'inner', '#8a8a93'],
                  ] as const
                ).map(([label, k, fallback]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-[13px] text-ink">{label}</span>
                    <div className="flex items-center gap-1.5">
                      {textStyle[k] && (
                        <button onClick={() => setTextStyle({ [k]: '' })} className="text-[11px] text-muted hover:text-accent">
                          跟随主题
                        </button>
                      )}
                      <input
                        type="color"
                        value={textStyle[k] || fallback}
                        onChange={(e) => setTextStyle({ [k]: e.target.value })}
                        className="h-7 w-9 cursor-pointer rounded-md border border-line bg-transparent"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted">对话＝“…”「…」的上色；心理＝`…`的灰字。不选＝跟随主题色。</p>
            </div>
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
              开＝你发完 TA 自动回，群聊会自动判断该谁接话（点到名就是谁）；关＝用「@角色」点名。
            </p>
          </div>)}

          {/* 剧情 · 记忆 */}
          {settingsTab === 'plot' && (<div className="shrink-0 rounded-2xl bg-white/45 p-1.5">
            <div className="flex w-full items-center justify-between px-2.5 pb-0.5 pt-1.5">
              <span className="label">剧情 · 记忆</span>
              <span className="text-[10px] text-muted">上下文与设定</span>
            </div>

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
                <div className="flex justify-end pb-1">
                  <button
                    onClick={() => setBigEdit({ title: '世界观 · 背景', value: sc.world || '', placeholder: '整体世界观、背景、人物关系…', onSave: (v) => setWorld(sc.id, v) })}
                    className="text-[12px] text-accent"
                  >
                    ⤢ 全屏编辑
                  </button>
                </div>
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
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setBigEdit({ title: '剧情摘要', value: sc.summary, placeholder: '手写或先「✨ 让 AI 更新」再修。会注入给角色，防止跑久了忘剧情。', onSave: (v) => setSummary(sc.id, v) })}
                    className="text-[12px] text-accent"
                  >
                    ⤢ 全屏编辑
                  </button>
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

            {/* 携带最近对话条数 */}
            <div className="flex items-center justify-between rounded-xl px-2.5 py-2.5">
              <span className="text-sm text-ink">携带最近对话</span>
              <div className="flex gap-1.5">
                {[12, 24, 36].map((n) => (
                  <button
                    key={n}
                    onClick={() => setHistCount(n)}
                    className={`rounded-full px-3 py-1 text-[12px] ${histCount === n ? 'btn-primary' : 'glass text-muted'}`}
                  >
                    {n} 条
                  </button>
                ))}
              </div>
            </div>
            <p className="px-2.5 pb-1 text-[10px] leading-relaxed text-muted">
              每次回复带给模型的历史条数。戏剧回复长，这里是 token 大头：越多越连贯、也越费。
            </p>
            <div className="mx-2.5 border-t border-line/40" />

            {/* 摘要顶替旧对话 */}
            <div className="flex items-center justify-between rounded-xl px-2.5 py-2.5">
              <span className="text-sm text-ink">摘要顶替旧对话（省 token）</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" checked={summaryTrim} onChange={(e) => setSummaryTrim(e.target.checked)} className="peer sr-only" />
                <span className="h-5 w-9 rounded-full bg-black/15 transition peer-checked:bg-accent" />
                <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
              </label>
            </div>
            <p className="px-2.5 pb-1 text-[10px] leading-relaxed text-muted">
              开＝已写进剧情摘要的旧对话不再重复发，只带摘要之后的新对话（保底最近 8 条）。前情靠摘要扛，长剧场省很多；建议配合「自动更新」一起开。
            </p>
            <div className="mx-2.5 border-t border-line/40" />

            {/* 自动压缩 */}
            <div className="flex items-center justify-between rounded-xl px-2.5 py-2.5">
              <span className="text-sm text-ink">自动压缩对话</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" checked={autoCompress} onChange={(e) => setAutoCompress(e.target.checked)} className="peer sr-only" />
                <span className="h-5 w-9 rounded-full bg-black/15 transition peer-checked:bg-accent" />
                <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
              </label>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 pb-1 text-[12px] text-muted">
              超过
              <input
                type="text"
                inputMode="numeric"
                value={autoCompressOver}
                disabled={!autoCompress}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 3)
                  if (v) setAutoCompressOver(Number(v))
                }}
                className="w-14 rounded-md border border-line bg-white/50 px-1.5 py-0.5 text-center text-ink outline-none focus:border-accent disabled:opacity-50"
              />
              条时自动把较早对话并进摘要（留最近 24 条 · 走{useMemModel ? '记忆模型' : '主渠道'}）
            </div>
            <p className="px-2.5 pb-1 text-[10px] leading-relaxed text-muted">
              和手动 🗜 一样但更温柔：留得多、不打断、完成飘个小提示。对话瘦身也顺便给手机存储减负。
            </p>
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
              每个角色第一人称记自己在意的事，只在 TA 接话时注入。开＝自动增量更新；不开可在 ☰ 成员列表点 🧠 手动回顾。
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
                  <p className="text-[11px] text-muted">还没有世界书。导入角色卡（PNG/JSON）会自动带进来，也可以手动加。</p>
                ) : (
                  sc.lore!.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 rounded-xl bg-white/40 px-2.5 py-1.5">
                      <span className="shrink-0 text-[11px]">{e.constant ? '📌' : '🔑'}</span>
                      <button onClick={() => setLoreEdit(e)} className="min-w-0 flex-1 truncate text-left text-[12px] text-ink hover:text-accent">
                        {e.name}
                      </button>
                      {e.position === 'depth' && <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[9px] leading-4 text-accent">@深{e.depth ?? 2}</span>}
                      <button onClick={() => setLoreEdit(e)} aria-label="编辑条目" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:text-accent">
                        <EditIcon className="h-[13px] w-[13px]" />
                      </button>
                      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                        <input type="checkbox" checked={e.enabled} onChange={(ev) => updateLoreEntry(sc.id, e.id, { enabled: ev.target.checked })} className="peer sr-only" />
                        <span className="h-4 w-7 rounded-full bg-black/15 transition peer-checked:bg-accent" />
                        <span className="absolute left-0.5 h-3 w-3 rounded-full bg-white shadow transition peer-checked:translate-x-3" />
                      </label>
                      <button onClick={() => removeLoreEntry(sc.id, e.id)} className="shrink-0 px-1 text-[13px] text-muted hover:text-red-500">✕</button>
                    </div>
                  ))
                )}
                <button onClick={() => setLoreEdit('new')} className="glass w-full rounded-xl py-1.5 text-[12px] text-ink">
                  ＋ 手动加一条
                </button>
                <p className="text-[10px] leading-relaxed text-muted">📌常驻＝每次都注入；🔑关键词＝最近对话出现关键词才注入（支持 /正则/ 写法，省 token）。点条目可编辑。</p>
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
          </div>)}
          </div>
        </div>
      )}

      {err && <div className="mb-1 px-1 pt-[3.2rem] text-[11px] text-red-500">{err}</div>}

      {/* 群聊消息（pt 给悬浮顶栏让位，滚动时文字从毛玻璃下穿过；--drama-* 是 ⚙「文字样式」的颜色变量） */}
      <div
        ref={listRef}
        className={`min-h-0 flex-1 space-y-3 overflow-y-auto px-0.5 pb-1 ${err ? 'pt-1' : 'pt-[3.2rem]'}`}
        style={{
          ...bgTextGlow,
          ...(textStyle.quote ? ({ '--drama-quote': textStyle.quote } as CSSProperties) : {}),
          ...(textStyle.inner ? ({ '--drama-inner': textStyle.inner } as CSSProperties) : {}),
        }}
      >
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
            // 刚开场只有这一条时，给「换开场白」入口（很多卡第一条是装饰菜单，点不动，靠这个换）
            const swapBtn =
              i === 0 && sc.messages.length === 1 && c && !c.isMe && (c.greetings?.length ?? 0) > 1 ? (
                <button
                  type="button"
                  onClick={() => openWith(c, m.id)}
                  className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent"
                >
                  🎬 换开场白（{c.greetings!.length}）
                </button>
              ) : null
            const ttsBtn =
              !mine && ttsEnabled && m.text.trim() ? (
                <button type="button" onClick={() => play(m.id, m.text, { voiceId: c?.voiceId })} aria-label="朗读" className="hover:text-accent">
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
                    {swapBtn}
                  </div>
                  {m.image && <IdbImg src={m.image} alt="" className={`mb-1 max-h-60 max-w-full rounded-xl object-cover ${mine ? 'ml-auto' : ''}`} />}
                  {editingThis ? editArea : m.text && (
                    // 「我」的消息贴右、宽度随内容自适应（短就缩右边、长撑到 ~82%）；对方仍铺满左侧
                    <div
                      className={`leading-relaxed ${mine ? 'ml-auto w-fit max-w-[82%] text-left' : ''}`}
                      style={{ fontSize: textStyle.size, color: textStyle.text || 'var(--text)' }}
                    >
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
                    <IdbImg src={m.image} alt="" className="mt-0.5 max-h-52 max-w-full rounded-2xl object-cover" />
                  )}
                  {editingThis ? editArea : m.text && (
                    <div
                      className="mt-0.5 rounded-2xl px-3.5 py-2"
                      style={{ background: (c?.color || '#bb9af7') + (mine ? '40' : '22'), fontSize: textStyle.size - 1, color: textStyle.text || 'var(--text)' }}
                    >
                      <DramaRich text={applyRegexScripts(m.text, mine ? aiChars[0]?.regex : c?.regex, { isUser: !!mine })} user={meChar?.name} char={c?.name} />
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-1 text-muted">
                    <span className="text-[9px]">{m.at}</span>
                    {ttsBtn}
                    {swapBtn}
                  </div>
                </div>
              </div>
            )
          })
        )}
        {casting && !busyChar && (
          <div className="flex items-center gap-2 px-1 text-[12px] text-muted">正在想谁接话…</div>
        )}
        {busyChar && (
          <div className="space-y-1.5 px-1">
            {streamText && (
              <div
                className="whitespace-pre-wrap leading-relaxed opacity-90 [overflow-wrap:anywhere]"
                style={{ fontSize: textStyle.size, color: textStyle.text || 'var(--text)' }}
              >
                {streamText}
              </div>
            )}
            <div className="flex items-center gap-2 text-[12px] text-muted">{nameOf(busyChar)} 正在输入…</div>
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
          {/* select-none：长按松手时手指常落在菜单上，别让 iOS 把菜单文字当可选文本弹"拷贝" */}
          <div
            className="glass-strong w-full select-none space-y-1 rounded-t-3xl p-3 pb-[max(1rem,env(safe-area-inset-bottom))] [-webkit-touch-callout:none] [-webkit-user-select:none]"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const m = sc.messages.find((x) => x.id === menuMsgId)
              if (!m) return null
              const c = charById(m.who)
              const notLast = sc.messages[sc.messages.length - 1]?.id !== menuMsgId
              if (c && !c.isMe)
                return (
                  <button onClick={() => void regenMsg(menuMsgId)} disabled={!!busyChar} className="block w-full rounded-xl px-4 py-3 text-left text-sm text-ink hover:bg-white/40 disabled:opacity-50">
                    🔄 重写（TA 重新说这条{notLast ? '，之后的一起回溯' : ''}）
                  </button>
                )
              return (
                <button onClick={() => void resendMine(menuMsgId)} disabled={!!busyChar || !aiChars.length} className="block w-full rounded-xl px-4 py-3 text-left text-sm text-ink hover:bg-white/40 disabled:opacity-50">
                  🔄 重新发送（让 TA 重新接话{notLast ? '，之后的一起回溯' : ''}）
                </button>
              )
            })()}
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

      {/* 全屏大编辑器（世界观/剧情摘要） */}
      {bigEdit && (
        <BigTextEditor
          title={bigEdit.title}
          value={bigEdit.value}
          placeholder={bigEdit.placeholder}
          onSave={bigEdit.onSave}
          onClose={() => setBigEdit(null)}
        />
      )}

      {/* 世界书条目编辑器 */}
      {loreEdit && (
        <LoreEditor
          target={loreEdit}
          onClose={() => setLoreEdit(null)}
          onSave={(patch, id) => {
            if (id) updateLoreEntry(sc.id, id, patch)
            else addLore(sc.id, [{ ...patch, id: dramaMsgId() }])
          }}
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
  const [voiceId, setVoiceId] = useState(base?.voiceId ?? '')
  const [npc, setNpc] = useState(base?.npc ?? false)
  const [memory, setMemory] = useState(base?.memory ?? '')
  const [chanOpen, setChanOpen] = useState(false)
  const channels = useApiStore((s) => s.channels)
  const activeApiId = useApiStore((s) => s.activeId)
  const syncCfg = useSyncStore((s) => s.config)
  const chanName = channels.find((c) => c.id === apiChannelId)?.name
  // 指定模型（覆盖渠道默认）+ 获取模型列表
  const [model, setModel] = useState(base?.model ?? '')
  const [modelList, setModelList] = useState<string[]>([])
  const [modelBusy, setModelBusy] = useState(false)
  const [modelErr, setModelErr] = useState('')
  // 三个长文本区的展开/收起 + 全屏编辑
  const [secOpen, setSecOpen] = useState({ persona: true, greeting: false, memory: false })
  const [full, setFull] = useState<null | { title: string; value: string; placeholder?: string; onSave: (v: string) => void }>(null)
  const effCh = channels.find((c) => c.id === apiChannelId) ?? channels.find((c) => c.id === activeApiId)
  async function fetchModels() {
    if (!effCh) {
      setModelErr('先选一个渠道（或去设置里配一个激活渠道）')
      return
    }
    setModelErr('')
    setModelBusy(true)
    try {
      setModelList(await listModels(effCh, { workerUrl: syncCfg.workerUrl, syncKey: syncCfg.syncKey }))
    } catch (e) {
      setModelErr(`获取失败：${(e as Error).message}`)
    } finally {
      setModelBusy(false)
    }
  }
  const imgRef = useRef<HTMLInputElement>(null)
  const inputCls =
    'w-full rounded-xl border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent'

  function save() {
    const patch = { name, avatar, avatarImg, persona, greeting, color, isMe, apiChannelId, model: model.trim(), voiceId: voiceId.trim(), npc, memory }
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
        {/* 档案头：点头像换图，名字居中大字 */}
        <div className="glass rounded-3xl p-4 text-center">
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
          <button type="button" onClick={() => imgRef.current?.click()} className="relative mx-auto block" aria-label="上传头像">
            <Avatar img={avatarImg} emoji={avatar} className="h-20 w-20 rounded-full text-3xl" textCls="text-3xl" style={{ background: color + '33' }} />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-white shadow">
              <EditIcon className="h-3 w-3" />
            </span>
          </button>
          {avatarImg && (
            <button onClick={() => setAvatarImg(undefined)} className="mt-1 text-[11px] text-muted hover:text-accent">
              移除头像
            </button>
          )}
          <input
            className="mt-2 w-full bg-transparent text-center text-lg font-medium text-ink outline-none placeholder:text-muted"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="角色名字"
          />
        </div>

        {(
          [
            ['persona', '角色设定 / 人设', persona, setPersona, '身份、性别、年龄、性格、说话风格、背景关系…（NPC 卡可写：负责扮演各路 NPC 与旁白）', 'min-h-[220px]', 12],
            ['greeting', '开场白（出场第一条 · 可留空）', greeting, setGreeting, '角色出场说的第一句/一段，用来开启剧情（如男主推门而入）。建好后在角色列表点「▶开场」发出。', 'min-h-[120px]', 6],
            ...(!isMe
              ? ([['memory', 'TA 的私人记忆（第一人称 · 可手写，或在列表点 🧠 让 TA 自己回顾）', memory, setMemory, 'TA 自己知道/在意/想做的事（对别人的看法、心结、决定…）', 'min-h-[120px]', 6]] as const)
              : []),
          ] as const
        ).map(([k, label, val, setVal, ph, minH, rows]) => (
          <div key={k}>
            {/* 标题行：点收起/展开 + ⤢ 全屏编辑 */}
            <div
              className="mb-1 flex cursor-pointer items-center justify-between"
              onClick={() => setSecOpen((o) => ({ ...o, [k]: !o[k] }))}
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{label}</span>
              <span className="flex shrink-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFull({ title: label, value: val, placeholder: ph, onSave: setVal })
                  }}
                  className="text-[12px] text-accent"
                >
                  ⤢ 全屏
                </button>
                <span className="text-[12px] text-muted">{secOpen[k] ? '▾' : '▸'}</span>
              </span>
            </div>
            {secOpen[k] ? (
              <textarea
                className={inputCls + ` ${minH} leading-relaxed`}
                rows={rows}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder={ph}
              />
            ) : (
              <p className="truncate rounded-xl bg-white/40 px-3 py-2 text-[12px] text-muted">
                {val.trim() ? val.replace(/\s+/g, ' ').slice(0, 42) + (val.length > 42 ? '…' : '') : '（空 · 点标题展开填写）'}
              </p>
            )}
          </div>
        ))}

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
          {/* 指定模型：不用回主页调，直接在这选/填（留空＝用渠道默认） */}
          <div className="mt-2">
            <div className="mb-1 text-[12px] text-muted">
              指定模型（留空＝用渠道默认{effCh?.model ? `：${effCh.model}` : ''}）
            </div>
            <div className="flex gap-1.5">
              <input
                className={inputCls + ' min-w-0 flex-1'}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="手填模型名，或点右边获取列表选"
              />
              <button
                type="button"
                onClick={() => void fetchModels()}
                disabled={modelBusy}
                className="glass shrink-0 rounded-xl px-3 text-[12px] text-ink disabled:opacity-50"
              >
                {modelBusy ? '获取中…' : '获取列表'}
              </button>
            </div>
            {modelErr && <p className="mt-1 text-[10px] text-red-500">{modelErr}</p>}
            {modelList.length > 0 && (
              <div className="mt-1 max-h-52 overflow-y-auto rounded-2xl border border-line bg-white/70 p-1.5">
                {modelList.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setModel(m)
                      setModelList([])
                    }}
                    className="block w-full truncate rounded-xl px-3 py-1.5 text-left text-[12px] text-ink hover:bg-white/50"
                  >
                    {m}
                    {model === m ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {!isMe && (
          <div>
            <div className="mb-1 text-[12px] text-muted">专属音色（TTS voice_id · 留空＝跟随全局音色）</div>
            <input
              className={inputCls}
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              placeholder="如 female-shaonv，或克隆出来的 voice_id"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {VOICE_PRESETS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVoiceId(voiceId === v.id ? '' : v.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${voiceId === v.id ? 'btn-primary' : 'glass text-ink'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isMe && (
          <label className="flex items-center justify-between text-[13px] text-ink">
            <span>
              NPC / 旁白模式
              <span className="block text-[10px] text-muted">开＝每次轮到 TA 说话，都在请求最末尾钉住边界：只演旁白与临时NPC，绝不代演其他成员（治乱演主角）</span>
            </span>
            <span className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" checked={npc} onChange={(e) => setNpc(e.target.checked)} className="peer sr-only" />
              <span className="h-5 w-9 rounded-full bg-black/15 transition peer-checked:bg-accent" />
              <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
            </span>
          </label>
        )}

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

      {/* 长文本的全屏编辑（保存写回对应字段，最终仍要点右上「保存」入库） */}
      {full && (
        <BigTextEditor
          title={full.title}
          value={full.value}
          placeholder={full.placeholder}
          onSave={full.onSave}
          onClose={() => setFull(null)}
        />
      )}
    </div>
  )
}

/** 全屏大编辑器：整页大 textarea 安心写长文（世界观/剧情摘要），保存才生效、取消不动原文 */
function BigTextEditor({
  title,
  value,
  placeholder,
  onSave,
  onClose,
}: {
  title: string
  value: string
  placeholder?: string
  onSave: (v: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState(value)
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-to, #f7f1f4)' }}>
      <div className="glass-bar flex items-center justify-between gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="px-2 py-1.5 text-sm text-muted">取消</button>
        <div className="headline text-base text-ink">{title}</div>
        <button
          onClick={() => {
            onSave(text)
            onClose()
          }}
          className="btn-primary rounded-full px-5 py-1.5 text-sm"
        >
          保存
        </button>
      </div>
      <div className="min-h-0 flex-1 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="h-full w-full resize-none rounded-2xl border border-line bg-white/60 px-3.5 py-3 text-[15px] leading-relaxed text-ink outline-none focus:border-accent"
        />
      </div>
    </div>
  )
}

/** 世界书条目编辑器（全屏整页，参考 Tavo 的「编辑条目」）：名字 / 内容 / 常驻 / 关键词 */
function LoreEditor({
  target,
  onSave,
  onClose,
}: {
  target: LoreEntry | 'new'
  onSave: (patch: Omit<LoreEntry, 'id'>, id?: string) => void
  onClose: () => void
}) {
  const isNew = target === 'new'
  const base = isNew ? null : (target as LoreEntry)
  const [name, setName] = useState(base?.name ?? '')
  const [content, setContent] = useState(base?.content ?? '')
  const [keysStr, setKeysStr] = useState((base?.keys ?? []).join(', '))
  const [constant, setConstant] = useState(base?.constant ?? false)
  const [atDepth, setAtDepth] = useState(base?.position === 'depth')
  // 用字符串存深度：iOS 的 number 输入框删空会被强行填回 0（"0 删不掉"），text+numeric 才乖
  const [depthStr, setDepthStr] = useState(String(base?.depth ?? 2))
  const inputCls =
    'w-full rounded-xl border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent'

  function save() {
    const keys = keysStr
      .split(/[,，]/)
      .map((k) => k.trim())
      .filter(Boolean)
    onSave(
      {
        name: name.trim() || keys[0] || '设定',
        content,
        keys,
        constant,
        enabled: base?.enabled ?? true,
        position: atDepth ? 'depth' : 'before',
        ...(atDepth ? { depth: depthStr === '' ? 2 : Math.max(0, Math.min(20, parseInt(depthStr, 10) || 0)) } : {}),
      },
      base?.id,
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-to, #f7f1f4)' }}>
      <div className="glass-bar flex items-center justify-between gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="px-2 py-1.5 text-sm text-muted">取消</button>
        <div className="headline text-base text-ink">{isNew ? '新增世界书条目' : '编辑条目'}</div>
        <button onClick={save} className="btn-primary rounded-full px-5 py-1.5 text-sm">保存</button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3">
        <div>
          <div className="mb-1 text-[12px] text-muted">名字 / 备注</div>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="如 『方玫』 / 城市设定" />
        </div>
        <div>
          <div className="mb-1 text-[12px] text-muted">内容（命中后注入给所有角色的设定正文）</div>
          <textarea
            className={inputCls + ' min-h-[260px] leading-relaxed'}
            rows={14}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="这个条目要交代的设定：人物背景、地点、规则、关系…"
          />
        </div>
        <label className="flex items-center justify-between text-sm text-ink">
          <span>
            📌 常驻注入
            <span className="block text-[10px] text-muted">开＝每次都注入；关＝对话里出现关键词才注入（省 token）</span>
          </span>
          <span className="relative inline-flex cursor-pointer items-center">
            <input type="checkbox" checked={constant} onChange={(e) => setConstant(e.target.checked)} className="peer sr-only" />
            <span className="h-5 w-9 rounded-full bg-black/15 transition peer-checked:bg-accent" />
            <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
          </span>
        </label>
        {!constant && (
          <div>
            <div className="mb-1 text-[12px] text-muted">触发关键词（逗号分隔 · 支持 /正则/ 写法）</div>
            <input className={inputCls} value={keysStr} onChange={(e) => setKeysStr(e.target.value)} placeholder="如 方玫, /方玫|小提琴/" />
            <p className="mt-1 text-[10px] leading-relaxed text-muted">最近对话或输入里出现任一关键词就注入这条；`/…/` 按正则匹配（和 Tavo 的写法一致）。</p>
          </div>
        )}
        <div>
          <div className="mb-1 text-[12px] text-muted">注入位置</div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setAtDepth(false)}
              className={`flex-1 rounded-xl py-2 text-[12px] ${!atDepth ? 'btn-primary' : 'glass text-muted'}`}
            >
              角色设定前（默认）
            </button>
            <button
              type="button"
              onClick={() => setAtDepth(true)}
              className={`flex-1 rounded-xl py-2 text-[12px] ${atDepth ? 'btn-primary' : 'glass text-muted'}`}
            >
              @深度（对话末尾附近）
            </button>
          </div>
          {atDepth && (
            <div className="mt-2 flex items-center gap-2 text-[12px] text-muted">
              插在倒数第
              <input
                type="text"
                inputMode="numeric"
                value={depthStr}
                onChange={(e) => setDepthStr(e.target.value.replace(/\D/g, '').slice(0, 2))}
                placeholder="2"
                className="w-14 rounded-md border border-line bg-white/50 px-1.5 py-1 text-center text-ink outline-none focus:border-accent"
              />
              条消息处（0＝最末尾 · 越靠后越强势，状态栏这类格式指令用 2 就很好）
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
