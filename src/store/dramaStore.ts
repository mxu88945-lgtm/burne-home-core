/**
 * 戏剧 🎭（多角色群聊 / 角色扮演）—— Zustand，本地持久化。
 * 多个「剧场」，每个剧场有自己的角色卡、对话、剧情摘要（独立记忆）。
 * 安全红线：不存任何 key；只存剧本内容，全在本设备。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS, CURRENT_WINDOW_ID } from '@/lib/constants'
import type { RegexScript } from '@/lib/regexScript'
import { divertAvatar } from '@/lib/imgRef'

/** 角色卡 */
export interface DramaChar {
  id: string
  name: string
  /** 头像 emoji */
  avatar: string
  /** 头像图片 dataURL（只存本地，优先于 emoji） */
  avatarImg?: string
  /** 人设 / 设定（系统提示用） */
  persona: string
  /** 开场白：作为出场第一条消息发出（可留空） */
  greeting?: string
  /** 所有开场白（可多个，开场时可选） */
  greetings?: string[]
  /** 气泡色 hex */
  color: string
  /** 是否是「我」（女主，用户本人，由你发言） */
  isMe?: boolean
  /** 独立 API 渠道 id（不填＝跟随当前激活渠道） */
  apiChannelId?: string
  /** 指定模型（覆盖所选渠道的默认模型；留空＝用渠道默认） */
  model?: string
  /** 专属 TTS 音色 voice_id（不填＝跟随全局语音朗读音色） */
  voiceId?: string
  /** NPC/旁白模式：每次轮到 TA 说话，代码在请求最末尾钉住边界（只演旁白与临时NPC，绝不代演其他成员） */
  npc?: boolean
  /** 私人记忆：以该角色第一人称记着自己知道/在意/想做的事（只在 TA 接话时注入） */
  memory?: string
  /** 已并入该角色私人记忆的消息条数（增量更新用） */
  memoryAt?: number
  /** 卡自带的正则脚本（展示时把输出美化成带样式 HTML） */
  regex?: RegexScript[]
}

/** 世界书条目（Lorebook entry，参考 Tavern 角色卡） */
export interface LoreEntry {
  id: string
  /** 条目名/备注 */
  name: string
  /** 触发关键词（命中才注入）；constant=true 时忽略，常驻注入 */
  keys: string[]
  /** 条目内容（设定正文） */
  content: string
  /** 常驻：每次都注入（📌）；否则按关键词触发（🔑） */
  constant: boolean
  /** 是否启用 */
  enabled: boolean
  /** 注入位置：不填/'before'＝角色设定前；'depth'＝插进对话末尾附近（越靠后越强势，适合状态栏这类格式指令） */
  position?: 'before' | 'depth'
  /** position='depth' 时：插在倒数第几条消息处（0＝最后一条之后，Tavern 常用 2） */
  depth?: number
}

export interface DramaMsg {
  id: string
  /** 发言者：角色卡 id（含「我」那张） */
  who: string
  text: string
  /** 图片 dataURL（只存本地） */
  image?: string
  at: string
}

export interface DramaScene {
  id: string
  title: string
  chars: DramaChar[]
  messages: DramaMsg[]
  /** 世界观 / 背景设定（注入给本剧场所有角色，统一认知） */
  world: string
  /** 剧情摘要（独立记忆，注入给角色防止跑久了忘剧情） */
  summary: string
  /** 已经并入摘要的消息条数（增量摘要用：下次只读这个数之后的新对话） */
  summaryAt?: number
  /** 世界书：常驻条目always注入、关键词条目命中才注入（省 token） */
  lore?: LoreEntry[]
  /** 发完消息自动回复（1v1 默认开；不填时按是否只有一个 AI 角色判断） */
  auto?: boolean
  createdAt: string
}

interface Persisted {
  scenes: DramaScene[]
  activeId: string
  /** 气泡式(false) / 平铺式(true) —— 全局显示样式 */
  flat: boolean
  /** 自动更新剧情摘要（后台静默） */
  autoSummary: boolean
  /** 每攒够几条 AI 回复自动更新一次摘要 */
  autoSummaryEvery: number
  /** 自动更新各角色「私人记忆」（默认关，省 token） */
  autoCharMemory: boolean
  /** 每次回复携带的最近对话条数（12/24/36） */
  histCount: number
  /** 摘要顶替旧对话（省 token）：已并入摘要的旧消息不再发，只带摘要之后的新对话（保底最近 8 条） */
  summaryTrim: boolean
  /** 文字小主题：字号 + 正文/对话/心理颜色（空字符串＝跟随主题） */
  textStyle: { size: number; text: string; quote: string; inner: string }
  /** 自动压缩：消息条数超过阈值时，自动把较早对话并进剧情摘要（留最近 24 条） */
  autoCompress: boolean
  /** 自动压缩的触发阈值（消息条数） */
  autoCompressOver: number
}

const DEFAULT_TEXT_STYLE = { size: 15, text: '', quote: '', inner: '' }
const DEFAULT: Persisted = { scenes: [], activeId: '', flat: false, autoSummary: true, autoSummaryEvery: 8, autoCharMemory: false, histCount: 24, summaryTrim: false, textStyle: DEFAULT_TEXT_STYLE, autoCompress: false, autoCompressOver: 80 }
const init = { ...DEFAULT, ...readJSON<Partial<Persisted>>(STORAGE_KEYS.drama, {}) }

function uid(): string {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `d-${Date.now()}-${Math.random()}`
}

/** 一组好看的角色气泡色，建卡时轮流取 */
const PALETTE = ['#7aa2f7', '#bb9af7', '#f7768e', '#73d39b', '#e0af68', '#ff9e64', '#2ac3de']

interface DramaState extends Persisted {
  createScene: (title: string) => DramaScene
  removeScene: (id: string) => void
  renameScene: (id: string, title: string) => void
  /** 把某剧场挪到列表最上面（置顶） */
  moveSceneTop: (id: string) => void
  /** 整体替换剧场列表（头像图迁 IndexedDB 用） */
  replaceScenes: (scenes: DramaScene[]) => void
  setActive: (id: string) => void
  addChar: (sceneId: string, char: Partial<DramaChar>) => void
  updateChar: (sceneId: string, charId: string, patch: Partial<DramaChar>) => void
  removeChar: (sceneId: string, charId: string) => void
  setMessages: (sceneId: string, messages: DramaMsg[]) => void
  /** 重启对话：清空消息与剧情摘要（角色/世界观/世界书保留） */
  clearMessages: (sceneId: string) => void
  addMessage: (sceneId: string, msg: DramaMsg) => void
  setSummary: (sceneId: string, summary: string) => void
  setSummaryAt: (sceneId: string, n: number) => void
  setSceneAuto: (sceneId: string, on: boolean) => void
  setWorld: (sceneId: string, world: string) => void
  setFlat: (flat: boolean) => void
  setAutoSummary: (on: boolean) => void
  setAutoSummaryEvery: (n: number) => void
  setAutoCharMemory: (on: boolean) => void
  setHistCount: (n: number) => void
  setSummaryTrim: (on: boolean) => void
  setTextStyle: (patch: Partial<Persisted['textStyle']>) => void
  setAutoCompress: (on: boolean) => void
  setAutoCompressOver: (n: number) => void
  /** 世界书：追加条目 / 改单条 / 删单条 */
  addLore: (sceneId: string, entries: LoreEntry[]) => void
  updateLoreEntry: (sceneId: string, entryId: string, patch: Partial<LoreEntry>) => void
  removeLoreEntry: (sceneId: string, entryId: string) => void
  /** 从导入的对话整本建一个新剧场（角色 + 消息一次性建好） */
  importScene: (input: {
    title: string
    speakers: { name: string; isMe?: boolean; color?: string; avatar?: string }[]
    turns: { name: string; text: string }[]
  }) => DramaScene
}

export const useDramaStore = create<DramaState>((set, get) => {
  const persist = (scenes: DramaScene[], activeId = get().activeId) =>
    writeJSON(STORAGE_KEYS.drama, {
      scenes,
      activeId,
      flat: get().flat,
      autoSummary: get().autoSummary,
      autoSummaryEvery: get().autoSummaryEvery,
      autoCharMemory: get().autoCharMemory,
      histCount: get().histCount,
      summaryTrim: get().summaryTrim,
      textStyle: get().textStyle,
      autoCompress: get().autoCompress,
      autoCompressOver: get().autoCompressOver,
    })

  const patchScene = (sceneId: string, fn: (s: DramaScene) => DramaScene) => {
    const scenes = get().scenes.map((s) => (s.id === sceneId ? fn(s) : s))
    persist(scenes)
    set({ scenes })
  }

  return {
    scenes: init.scenes,
    activeId: init.activeId,
    flat: init.flat,
    autoSummary: init.autoSummary,
    autoSummaryEvery: init.autoSummaryEvery,
    autoCharMemory: init.autoCharMemory,
    histCount: init.histCount,
    summaryTrim: init.summaryTrim,
    textStyle: { ...DEFAULT_TEXT_STYLE, ...init.textStyle },
    autoCompress: init.autoCompress,
    autoCompressOver: init.autoCompressOver,

    createScene: (title) => {
      const scene: DramaScene = {
        id: uid(),
        title: title.trim() || '新剧场',
        chars: [],
        messages: [],
        world: '',
        summary: '',
        summaryAt: 0,
        createdAt: new Date().toISOString(),
      }
      const scenes = [scene, ...get().scenes]
      persist(scenes, scene.id)
      set({ scenes, activeId: scene.id })
      return scene
    },

    removeScene: (id) => {
      const scenes = get().scenes.filter((s) => s.id !== id)
      const activeId = get().activeId === id ? scenes[0]?.id ?? '' : get().activeId
      persist(scenes, activeId)
      set({ scenes, activeId })
    },

    renameScene: (id, title) =>
      patchScene(id, (s) => ({ ...s, title: title.trim() || s.title })),

    moveSceneTop: (id) => {
      const scenes = [...get().scenes]
      const i = scenes.findIndex((s) => s.id === id)
      if (i <= 0) return
      const [s] = scenes.splice(i, 1)
      scenes.unshift(s)
      persist(scenes)
      set({ scenes })
    },

    setActive: (id) => {
      persist(get().scenes, id)
      set({ activeId: id })
    },

    replaceScenes: (scenes) => {
      persist(scenes)
      set({ scenes })
    },

    addChar: (sceneId, char) =>
      patchScene(sceneId, (s) => {
        const color = char.color || PALETTE[s.chars.length % PALETTE.length]
        const c: DramaChar = {
          id: uid(),
          name: char.name?.trim() || '新角色',
          avatar: char.avatar || '🎭',
          avatarImg: divertAvatar(char.avatarImg),
          persona: char.persona || '',
          greeting: char.greeting || '',
          greetings: char.greetings,
          color,
          isMe: char.isMe ?? false,
          apiChannelId: char.apiChannelId,
          model: char.model,
          voiceId: char.voiceId,
          npc: char.npc,
          regex: char.regex,
        }
        return { ...s, chars: [...s.chars, c] }
      }),

    updateChar: (sceneId, charId, patch) => {
      if (patch.avatarImg) patch = { ...patch, avatarImg: divertAvatar(patch.avatarImg) }
      patchScene(sceneId, (s) => ({
        ...s,
        chars: s.chars.map((c) => (c.id === charId ? { ...c, ...patch } : c)),
      }))
    },

    removeChar: (sceneId, charId) =>
      patchScene(sceneId, (s) => ({ ...s, chars: s.chars.filter((c) => c.id !== charId) })),

    setMessages: (sceneId, messages) => patchScene(sceneId, (s) => ({ ...s, messages })),

    clearMessages: (sceneId) => patchScene(sceneId, (s) => ({ ...s, messages: [], summary: '', summaryAt: 0 })),

    addMessage: (sceneId, msg) =>
      patchScene(sceneId, (s) => ({ ...s, messages: [...s.messages, msg] })),

    setSummary: (sceneId, summary) => patchScene(sceneId, (s) => ({ ...s, summary })),

    setSummaryAt: (sceneId, n) => patchScene(sceneId, (s) => ({ ...s, summaryAt: n })),

    setSceneAuto: (sceneId, on) => patchScene(sceneId, (s) => ({ ...s, auto: on })),

    setWorld: (sceneId, world) => patchScene(sceneId, (s) => ({ ...s, world })),

    setFlat: (flat) => {
      set({ flat })
      persist(get().scenes)
    },

    setAutoSummary: (on) => {
      set({ autoSummary: on })
      persist(get().scenes)
    },

    setAutoSummaryEvery: (n) => {
      set({ autoSummaryEvery: Math.max(2, Math.min(50, Math.round(n) || 8)) })
      persist(get().scenes)
    },

    setAutoCharMemory: (on) => {
      set({ autoCharMemory: on })
      persist(get().scenes)
    },

    setHistCount: (n) => {
      set({ histCount: Math.max(4, Math.min(48, Math.round(n) || 24)) })
      persist(get().scenes)
    },

    setSummaryTrim: (on) => {
      set({ summaryTrim: on })
      persist(get().scenes)
    },

    setTextStyle: (patch) => {
      set({ textStyle: { ...get().textStyle, ...patch } })
      persist(get().scenes)
    },

    setAutoCompress: (on) => {
      set({ autoCompress: on })
      persist(get().scenes)
    },

    setAutoCompressOver: (n) => {
      set({ autoCompressOver: Math.max(40, Math.min(200, Math.round(n) || 80)) })
      persist(get().scenes)
    },

    addLore: (sceneId, entries) =>
      patchScene(sceneId, (s) => ({ ...s, lore: [...(s.lore || []), ...entries] })),

    updateLoreEntry: (sceneId, entryId, patch) =>
      patchScene(sceneId, (s) => ({
        ...s,
        lore: (s.lore || []).map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
      })),

    removeLoreEntry: (sceneId, entryId) =>
      patchScene(sceneId, (s) => ({ ...s, lore: (s.lore || []).filter((e) => e.id !== entryId) })),

    importScene: (input) => {
      const idByName = new Map<string, string>()
      const chars: DramaChar[] = input.speakers.map((sp, i) => {
        const id = uid()
        idByName.set(sp.name, id)
        return {
          id,
          name: sp.name,
          avatar: sp.avatar || (sp.isMe ? '🙂' : '🎭'),
          persona: '',
          greeting: '',
          color: sp.color || PALETTE[i % PALETTE.length],
          isMe: sp.isMe ?? false,
        }
      })
      const messages: DramaMsg[] = input.turns.map((t) => ({
        id: uid(),
        who: idByName.get(t.name) ?? chars[0]?.id ?? '__me__',
        text: t.text,
        at: '',
      }))
      const scene: DramaScene = {
        id: uid(),
        title: input.title.trim() || '导入的剧场',
        chars,
        messages,
        world: '',
        summary: '',
        summaryAt: 0,
        createdAt: new Date().toISOString(),
      }
      const scenes = [scene, ...get().scenes]
      persist(scenes, scene.id)
      set({ scenes, activeId: scene.id })
      return scene
    },
  }
})

/** 生成消息 id（页面用） */
export function dramaMsgId(): string {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `dm-${Date.now()}-${CURRENT_WINDOW_ID}`
}
